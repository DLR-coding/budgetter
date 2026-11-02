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

/** Groupes et catégories actives, pour la saisie. `includeArchived` : aussi les archivées (affichage de l'existant). */
export async function loadCategories({ includeArchived = false } = {}) {
  const cq = supabase.from('categories').select('*');
  const [g, c] = await Promise.all([
    supabase.from('groups').select('*').order('position'),
    (includeArchived ? cq : cq.eq('archived', false)).order('position'),
  ]);
  if (g.error) throw g.error;
  if (c.error) throw c.error;
  return { groups: (g.data ?? []) as GroupRow[], cats: (c.data ?? []) as CategoryRow[] };
}

/** Catégories classées par nombre d'articles saisis sur environ 90 jours (3 mois pleins). */
export async function topCategoryIds(): Promise<string[]> {
  const since = toDate(addMonths(monthOf(new Date()), -3));
  const { data, error } = await supabase.from('line_amounts').select('category_id').gte('month', since);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
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

// ——— Saisies, prévus, catégories et récurrences (écrans Saisies, Détail, Réglages) ———

export type LineRow = {
  id: string; entry_id: string; category_id: string; label: string | null; raw_label: string | null;
  quantity: number; unit_price_cents: number; position: number;
};
export type EntryRow = {
  id: string; date: string; merchant: string | null; note: string | null; exceptional: boolean;
  source: 'manuel' | 'formule' | 'ticket' | 'recurrence'; formula: string | null;
  receipt_path: string | null; recurrence_id: string | null; created_at: string;
  entry_lines: LineRow[];
};
export type RecurrenceRow = {
  id: string; category_id: string; label: string; amount_cents: number;
  day_of_month: number; active: boolean; last_generated_month: string | null;
};
export type EntryLineInput = FormulaLine & { categoryId: string; label?: string; rawLabel?: string };

/** Saisies du mois avec leurs lignes (dans l'ordre), les plus récentes d'abord. */
export async function loadEntries(month: Month): Promise<EntryRow[]> {
  const { data, error } = await supabase.from('entries').select('*, entry_lines(*)')
    .gte('date', toDate(month)).lt('date', toDate(addMonths(month, 1)))
    .order('date', { ascending: false }).order('created_at', { ascending: false })
    .order('position', { referencedTable: 'entry_lines' });
  if (error) throw error;
  return data as EntryRow[];
}

export async function loadEntry(id: string): Promise<EntryRow> {
  const { data, error } = await supabase.from('entries').select('*, entry_lines(*)').eq('id', id)
    .order('position', { referencedTable: 'entry_lines' }).single();
  if (error) throw error;
  return data as EntryRow;
}

export async function updateEntry(
  id: string, patch: { merchant?: string | null; date?: string; note?: string | null; exceptional?: boolean },
) {
  const { error } = await supabase.from('entries').update(patch).eq('id', id);
  if (error) throw error;
}

/** Supprime la saisie (ses lignes suivent en cascade), puis la photo du ticket s'il y en a une. */
export async function deleteEntry(id: string, receiptPath?: string | null) {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
  if (receiptPath) {
    const { error: e2 } = await supabase.storage.from('receipts').remove([receiptPath]);
    if (e2) throw e2;
  }
}

/** Remplace les lignes d'une saisie : les nouvelles sont insérées avant d'effacer les anciennes (jamais de perte). */
export async function replaceEntryLines(entryId: string, lines: EntryLineInput[]) {
  const { data: old, error: e1 } = await supabase.from('entry_lines').select('id').eq('entry_id', entryId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('entry_lines').insert(
    lines.map((l, i) => ({
      entry_id: entryId, category_id: l.categoryId, label: l.label ?? null, raw_label: l.rawLabel ?? null,
      quantity: l.quantity, unit_price_cents: l.unitPriceCents, position: i,
    })),
  );
  if (e2) throw e2;
  if (old.length === 0) return;
  const { error: e3 } = await supabase.from('entry_lines').delete().in('id', old.map((x) => x.id));
  if (e3) throw e3;
}

/** Recale le solde de départ d'un mois sur le solde bancaire réel. */
export async function setBalanceAdjustment(month: Month, cents: number) {
  const { error } = await supabase.from('balance_adjustments')
    .upsert({ month: toDate(month), balance_cents: cents }, { onConflict: 'user_id,month' });
  if (error) throw error;
}

export async function setPlannedOverride(categoryId: string, month: Month, cents: number) {
  const { error } = await supabase.from('planned_overrides')
    .upsert({ category_id: categoryId, month: toDate(month), amount_cents: cents }, { onConflict: 'category_id,month' });
  if (error) throw error;
}

/** Le mois revient au prévu par défaut de la catégorie. */
export async function clearPlannedOverride(categoryId: string, month: Month) {
  const { error } = await supabase.from('planned_overrides').delete()
    .eq('category_id', categoryId).eq('month', toDate(month));
  if (error) throw error;
}

/** Nouvelle catégorie, placée en fin de groupe. */
export async function createCategory(input: { groupId: string; name: string; defaultPlannedCents: number }) {
  const { data: last, error: e1 } = await supabase.from('categories').select('position')
    .eq('group_id', input.groupId).order('position', { ascending: false }).limit(1);
  if (e1) throw e1;
  const { data, error } = await supabase.from('categories').insert({
    group_id: input.groupId, name: input.name, default_planned_cents: input.defaultPlannedCents,
    position: last.length ? last[0].position + 1 : 0,
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/** Pas de suppression (les lignes de saisie y sont liées) : on archive avec `archived: true`. */
export async function updateCategory(
  id: string, patch: { name?: string; groupId?: string; defaultPlannedCents?: number; archived?: boolean },
) {
  // Les clés undefined disparaissent au JSON.stringify : seuls les champs fournis changent.
  const { error } = await supabase.from('categories').update({
    name: patch.name, group_id: patch.groupId, default_planned_cents: patch.defaultPlannedCents, archived: patch.archived,
  }).eq('id', id);
  if (error) throw error;
}

export async function loadRecurrences(): Promise<RecurrenceRow[]> {
  const { data, error } = await supabase.from('recurrences').select('*').order('day_of_month').order('label');
  if (error) throw error;
  return data as RecurrenceRow[];
}

/** Crée (sans id) ou modifie une charge récurrente, puis génère les saisies manquantes. */
export async function saveRecurrence(r: {
  id?: string; categoryId: string; label: string; amountCents: number; dayOfMonth: number; active?: boolean;
}) {
  const row = {
    category_id: r.categoryId, label: r.label, amount_cents: r.amountCents, day_of_month: r.dayOfMonth, active: r.active,
  };
  const { error } = r.id
    ? await supabase.from('recurrences').update(row).eq('id', r.id)
    : await supabase.from('recurrences').insert(row);
  if (error) throw error;
  const { error: e2 } = await supabase.rpc('generate_recurrences');
  if (e2) throw e2;
}

export async function setRecurrenceActive(id: string, active: boolean) {
  const { error } = await supabase.from('recurrences').update({ active }).eq('id', id);
  if (error) throw error;
}
