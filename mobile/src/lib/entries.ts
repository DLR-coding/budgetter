// Logique des écrans Saisies, Détail d'une saisie et Détail catégorie (sans React ni Supabase).
import { formatAmount, type GroupKind } from './budget.ts';
import type { CategoryRow, EntryRow, GroupRow, LineRow } from './data.ts';

/** Groupes et catégories, pour retrouver nom et type d'une ligne. */
export type Ctx = { groups: GroupRow[]; cats: CategoryRow[] };

const lineCents = (l: Pick<LineRow, 'quantity' | 'unit_price_cents'>) => l.quantity * l.unit_price_cents;

export const entryTotalCents = (e: Pick<EntryRow, 'entry_lines'>) =>
  e.entry_lines.reduce((s, l) => s + lineCents(l), 0);

const catOf = (ctx: Ctx, id: string) => ctx.cats.find((c) => c.id === id);
const groupOf = (ctx: Ctx, catId: string) => {
  const c = catOf(ctx, catId);
  return c && ctx.groups.find((g) => g.id === c.group_id);
};

/** Revenu si la catégorie de la 1re ligne appartient à un groupe « revenu ». */
export function entryKind(e: Pick<EntryRow, 'entry_lines'>, ctx: Ctx): GroupKind {
  const first = e.entry_lines[0];
  return (first && groupOf(ctx, first.category_id)?.kind) || 'depense';
}

/** Montant signé : positif pour un revenu, négatif sinon. */
export const signedCents = (e: Pick<EntryRow, 'entry_lines'>, ctx: Ctx) =>
  entryKind(e, ctx) === 'revenu' ? entryTotalCents(e) : -entryTotalCents(e);

/** Lignes regroupées par catégorie, dans l'ordre de première apparition. */
export function linesByCategory(lines: LineRow[]): { categoryId: string; cents: number; lines: LineRow[] }[] {
  const m = new Map<string, LineRow[]>();
  for (const l of lines) m.set(l.category_id, [...(m.get(l.category_id) ?? []), l]);
  return [...m].map(([categoryId, ls]) => ({ categoryId, lines: ls, cents: ls.reduce((s, l) => s + lineCents(l), 0) }));
}

/** Catégorie principale : celle qui pèse le plus (la première en cas d'égalité). */
const mainCategory = (e: Pick<EntryRow, 'entry_lines'>) =>
  linesByCategory(e.entry_lines).reduce<ReturnType<typeof linesByCategory>[number] | undefined>(
    (best, c) => (!best || c.cents > best.cents ? c : best), undefined);

const same = (a: string, b: string) => normalize(a) === normalize(b);

/** Titre d'une saisie : le commerçant, sinon le nom de sa catégorie principale. */
export function entryTitle(e: Pick<EntryRow, 'merchant' | 'entry_lines'>, ctx: Ctx): string {
  const main = mainCategory(e);
  return e.merchant?.trim() || (main && catOf(ctx, main.categoryId)?.name) || 'Saisie';
}

/** « manuel », « formule », « ticket », « récurrente ». */
export const sourceLabel = (source: EntryRow['source']) => (source === 'recurrence' ? 'récurrente' : source);

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Sous-titre de la liste des saisies (maquette 8) :
 * « Nourriture + 1 catégorie · ticket », « Fixes · récurrente », « Nourriture · 3 articles », « Revenu · manuel ».
 */
export function entrySubtitle(e: Pick<EntryRow, 'merchant' | 'source' | 'entry_lines'>, ctx: Ctx): string {
  const main = mainCategory(e);
  const cat = main && catOf(ctx, main.categoryId);
  let head: string;
  if (entryKind(e, ctx) === 'revenu') head = 'Revenu';
  else if (cat && same(entryTitle(e, ctx), cat.name)) head = groupOf(ctx, cat.id)?.name ?? cat.name;
  else {
    const others = linesByCategory(e.entry_lines).length - 1;
    head = (cat?.name ?? '') + (others > 0 ? ` + ${plural(others, 'catégorie')}` : '');
  }
  const n = e.entry_lines.length;
  const tail = n > 1 && e.source !== 'ticket' ? `${n} articles` : sourceLabel(e.source);
  return head ? `${head} · ${tail}` : tail;
}

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** « 12 nov. », « 1er nov. », « 12 nov. 2026 » avec l'année. */
export function dayMonth(isoDay: string, withYear = false): string {
  const d = parseIso(isoDay);
  const day = d.getDate() === 1 ? '1er' : String(d.getDate());
  return `${day} ${MONTHS_SHORT[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

/** En-tête d'une journée : « Aujourd’hui », « Hier », « Lundi 10 nov. », « Samedi 1er nov. ». */
export function longDayLabel(isoDay: string, today = new Date()): string {
  if (isoDay === iso(today)) return 'Aujourd’hui';
  if (isoDay === iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))) return 'Hier';
  return `${WEEKDAYS[parseIso(isoDay).getDay()]} ${dayMonth(isoDay)}`;
}

/** Saisies regroupées par jour (ordre conservé), avec le total signé de la journée. */
export function groupByDay(entries: EntryRow[], ctx: Ctx): { date: string; totalCents: number; entries: EntryRow[] }[] {
  const days: { date: string; totalCents: number; entries: EntryRow[] }[] = [];
  for (const e of entries) {
    let day = days.find((d) => d.date === e.date);
    if (!day) days.push((day = { date: e.date, totalCents: 0, entries: [] }));
    day.entries.push(e);
    day.totalCents += signedCents(e, ctx);
  }
  return days;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Recherche sans accents ni casse dans le commerçant, la note et les libellés des lignes. */
export function matchesSearch(e: Pick<EntryRow, 'merchant' | 'note' | 'entry_lines'>, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return [e.merchant, e.note, ...e.entry_lines.flatMap((l) => [l.label, l.raw_label])]
    .some((s) => s != null && normalize(s).includes(q));
}

/** « 2 × 0,87 » si la quantité dépasse 1, sinon null. */
export const qtyLabel = (l: Pick<LineRow, 'quantity' | 'unit_price_cents'>) =>
  l.quantity > 1 ? `${l.quantity} × ${formatAmount(l.unit_price_cents)}` : null;

/** Libellé affiché d'une ligne. */
export const lineLabel = (l: Pick<LineRow, 'label' | 'raw_label'>) => l.label?.trim() || l.raw_label?.trim() || 'Article';

/** Pied d'une saisie dépliée : « + 1 article de ce ticket classé dans Autre groceries ». null si rien ailleurs. */
export function otherLinesNote(e: Pick<EntryRow, 'source' | 'entry_lines'>, categoryId: string, ctx: Ctx): string | null {
  const others = e.entry_lines.filter((l) => l.category_id !== categoryId);
  if (others.length === 0) return null;
  const names = [...new Set(others.map((l) => catOf(ctx, l.category_id)?.name ?? '?'))].join(', ');
  const what = e.source === 'ticket' ? 'ce ticket' : 'cette saisie';
  return `+ ${plural(others.length, 'article')} de ${what} ${others.length > 1 ? 'classés' : 'classé'} dans ${names}`;
}
