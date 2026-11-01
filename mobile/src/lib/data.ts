import { supabase } from './supabase';
import {
  addMonths, monthOf, summarizeMonths,
  type ActualLine, type Adjustment, type Category, type GroupKind, type Month, type PlannedOverride,
} from './budget';
import type { FormulaLine } from './formula';

export type GroupRow = { id: string; name: string; kind: GroupKind; position: number };
export type CategoryRow = {
  id: string; group_id: string; name: string; icon: string | null;
  default_planned_cents: number; archived: boolean; position: number;
};

const toMonth = (d: string): Month => d.slice(0, 7);
const toDate = (m: Month) => `${m}-01`;

/** Au premier lancement : crée les catégories de l'Excel, puis les charges récurrentes du mois. */
export async function bootstrap() {
  await supabase.rpc('seed_default_categories');
  await supabase.rpc('generate_recurrences');
}

/** Tout ce qu'il faut pour l'écran Mois et la projection, de `from` à `to` inclus. */
export async function loadBudget(from: Month, to: Month) {
  const [g, c, o, l, a] = await Promise.all([
    supabase.from('groups').select('*').order('position'),
    supabase.from('categories').select('*').eq('archived', false).order('position'),
    supabase.from('planned_overrides').select('*').gte('month', toDate(from)).lte('month', toDate(to)),
    supabase.from('line_amounts').select('*').gte('month', toDate(from)).lte('month', toDate(to)),
    supabase.from('balance_adjustments').select('*').lte('month', toDate(to)).order('month'),
  ]);
  for (const r of [g, c, o, l, a]) if (r.error) throw r.error;

  const groups = g.data as GroupRow[];
  const cats = c.data as CategoryRow[];
  const kindOf = new Map(groups.map((x) => [x.id, x.kind]));

  const categories: Category[] = cats.map((x) => ({
    id: x.id, kind: kindOf.get(x.group_id)!, defaultPlannedCents: x.default_planned_cents,
  }));
  const overrides: PlannedOverride[] = o.data!.map((x) => ({
    categoryId: x.category_id, month: toMonth(x.month), amountCents: x.amount_cents,
  }));
  const actuals: ActualLine[] = l.data!.map((x) => ({
    categoryId: x.category_id, month: toMonth(x.month), amountCents: x.amount_cents, exceptional: x.exceptional,
  }));
  const adjustments: Adjustment[] = a.data!.map((x) => ({ month: toMonth(x.month), balanceCents: x.balance_cents }));

  const months: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);

  const summaries = summarizeMonths({
    months, currentMonth: monthOf(new Date()), categories, overrides, actuals, adjustments,
  });
  return { groups, cats, categories, overrides, actuals, summaries };
}

/** Enregistre une saisie et ses lignes (une seule ligne pour un montant simple). */
export async function saveEntry(input: {
  date: string; merchant?: string; note?: string; exceptional?: boolean;
  source: 'manuel' | 'formule' | 'ticket'; formula?: string; receiptPath?: string;
  lines: (FormulaLine & { categoryId: string; label?: string; rawLabel?: string })[];
}) {
  const { data: entry, error } = await supabase.from('entries').insert({
    date: input.date, merchant: input.merchant ?? null, note: input.note ?? null,
    exceptional: input.exceptional ?? false, source: input.source,
    formula: input.formula ?? null, receipt_path: input.receiptPath ?? null,
  }).select('id').single();
  if (error) throw error;

  const { error: e2 } = await supabase.from('entry_lines').insert(
    input.lines.map((l, i) => ({
      entry_id: entry.id, category_id: l.categoryId, label: l.label ?? null, raw_label: l.rawLabel ?? null,
      quantity: l.quantity, unit_price_cents: l.unitPriceCents, position: i,
    })),
  );
  if (e2) {
    await supabase.from('entries').delete().eq('id', entry.id); // pas de saisie orpheline
    throw e2;
  }
  return entry.id as string;
}
