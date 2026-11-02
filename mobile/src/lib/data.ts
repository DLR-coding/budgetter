import { supabase } from './supabase';
import {
  addMonths, balanceStartMonth, monthOf, summarizeMonths,
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
  const { error } = await supabase.rpc('seed_default_categories');
  if (error) throw error;
  const { error: e2 } = await supabase.rpc('generate_recurrences');
  if (e2) throw e2;
}

/**
 * Tout ce qu'il faut pour l'écran Mois et la projection, de `from` à `to` inclus.
 * Le calcul démarre plus tôt (voir balanceStartMonth) : `summaries` peut commencer avant `from`.
 * `cats` contient aussi les archivées : leur réel compte toujours, leur prévu vaut 0.
 */
export async function loadBudget(from: Month, to: Month) {
  const [g, c, a, f] = await Promise.all([
    supabase.from('groups').select('*').order('position'),
    supabase.from('categories').select('*').order('position'),
    supabase.from('balance_adjustments').select('*').lte('month', toDate(to)).order('month'),
    supabase.from('line_amounts').select('month').order('month').limit(1),
  ]);
  for (const r of [g, c, a, f]) if (r.error) throw r.error;
  const adjustments: Adjustment[] = a.data!.map((x) => ({
    month: toMonth(x.month), balanceCents: x.balance_cents, adjustedOn: x.adjusted_on,
  }));
  const start = balanceStartMonth(from, adjustments.map((x) => x.month), f.data!.length ? toMonth(f.data![0].month) : null);

  const [o, l] = await Promise.all([
    supabase.from('planned_overrides').select('*').gte('month', toDate(start)).lte('month', toDate(to)),
    supabase.from('line_amounts').select('*').gte('month', toDate(start)).lte('month', toDate(to)),
  ]);
  for (const r of [o, l]) if (r.error) throw r.error;

  const groups = g.data as GroupRow[];
  const cats = c.data as CategoryRow[];
  const kindOf = new Map(groups.map((x) => [x.id, x.kind]));

  const categories: Category[] = cats.map((x) => ({
    id: x.id, kind: kindOf.get(x.group_id)!, defaultPlannedCents: x.default_planned_cents, archived: x.archived,
  }));
  const overrides: PlannedOverride[] = o.data!.map((x) => ({
    categoryId: x.category_id, month: toMonth(x.month), amountCents: x.amount_cents,
  }));
  const actuals: ActualLine[] = l.data!.map((x) => ({
    categoryId: x.category_id, month: toMonth(x.month), amountCents: x.amount_cents, exceptional: x.exceptional, date: x.date,
  }));

  const months: Month[] = [];
  for (let m = start; m <= to; m = addMonths(m, 1)) months.push(m);

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
  id: string, patch: { merchant?: string | null; date?: string; note?: string | null; exceptional?: boolean; formula?: null },
) {
  const { error } = await supabase.from('entries').update(patch).eq('id', id);
  if (error) throw error;
}

/** Supprime la saisie (ses lignes suivent en cascade), puis la photo du ticket s'il y en a une. */
export async function deleteEntry(id: string, receiptPath?: string | null) {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
  if (receiptPath) {
    // La saisie est déjà supprimée : une photo restée orpheline ne doit pas faire croire à un échec.
    const { error: e2 } = await supabase.storage.from('receipts').remove([receiptPath]);
    if (e2) console.warn('Photo du ticket non supprimée', receiptPath, e2.message);
  }
}

/** Remplace les lignes d'une saisie en une seule transaction (fonction replace_entry_lines, migration 0004). */
export async function replaceEntryLines(entryId: string, lines: EntryLineInput[]) {
  const { error } = await supabase.rpc('replace_entry_lines', {
    p_entry_id: entryId,
    p_lines: lines.map((l, i) => ({
      category_id: l.categoryId, label: l.label ?? null, raw_label: l.rawLabel ?? null,
      quantity: l.quantity, unit_price_cents: l.unitPriceCents, position: i,
    })),
  });
  if (error) throw error;
}

/** Recale le solde d'un mois sur le solde bancaire réel, au jour `adjustedOn` ('AAAA-MM-JJ', inclus) ou en début de mois. */
export async function setBalanceAdjustment(month: Month, cents: number, adjustedOn: string | null = null) {
  const { error } = await supabase.from('balance_adjustments')
    .upsert({ month: toDate(month), balance_cents: cents, adjusted_on: adjustedOn }, { onConflict: 'user_id,month' });
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
  if (r.id && r.active) await skipMissedMonths(r.id);
  const { error } = r.id
    ? await supabase.from('recurrences').update(row).eq('id', r.id)
    : await supabase.from('recurrences').insert(row);
  if (error) throw error;
  const { error: e2 } = await supabase.rpc('generate_recurrences');
  if (e2) throw e2;
}

/**
 * Avant de réactiver une récurrence en pause : les mois de pause ne sont pas rattrapés,
 * la génération reprend au mois courant. Sans effet si elle est déjà active ou à jour.
 */
async function skipMissedMonths(id: string) {
  const previous = toDate(addMonths(monthOf(new Date()), -1));
  const { error } = await supabase.from('recurrences').update({ last_generated_month: previous })
    .eq('id', id).eq('active', false).lt('last_generated_month', previous);
  if (error) throw error;
}

export async function setRecurrenceActive(id: string, active: boolean) {
  if (active) await skipMissedMonths(id);
  const { error } = await supabase.from('recurrences').update({ active }).eq('id', id);
  if (error) throw error;
}
