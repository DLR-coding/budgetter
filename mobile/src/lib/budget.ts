// Calculs du budget, indépendants de la base de données (faciles à tester).
// Règles validées ensemble :
//  - Chaque mois a son prévu par catégorie (prévu par défaut, ou valeur propre au mois).
//  - Un dépassement ou une économie ne se reporte jamais sur les mois suivants.
//  - Mois passés : on compte le réel. Mois en cours et futurs : chaque catégorie compte son prévu
//    (exactement) si elle est « comptée », sinon son réel. Comptée = interrupteur du mois (revenus
//    ou dépenses, activé par défaut) ET interrupteur de la catégorie pour ce mois. Celui de la
//    catégorie est automatique tant qu'on n'y a pas touché : activé, sauf si le réel dépasse le prévu.
//    Choisi à la main, il l'emporte (on peut recompter le prévu malgré un dépassement).
//  - Le solde de départ d'un mois = l'ajustement saisi pour ce mois s'il existe (solde en début
//    de mois, avant toute saisie), sinon le solde de fin du mois précédent.
// Tous les montants sont en centimes. Un mois est noté 'AAAA-MM'.

export type Month = string; // 'AAAA-MM'
export type GroupKind = 'depense' | 'revenu' | 'epargne';

export type Category = {
  id: string;
  kind: GroupKind;
  defaultPlannedCents: number;
  archived?: boolean; // archivée : son réel compte toujours, son prévu vaut 0
};

// Réglages d'une catégorie pour un mois. amountCents null = prévu par défaut ;
// counted null/absent = automatique (compté tant que le réel ne dépasse pas le prévu).
export type PlannedOverride = { categoryId: string; month: Month; amountCents: number | null; counted?: boolean | null };
// Interrupteur d'ensemble « Compter le prévu » d'un mois ; absent = activé.
export type MonthSetting = { month: Month; kind: 'revenu' | 'depense'; plannedCounted: boolean };
export type ActualLine = { categoryId: string; month: Month; amountCents: number; exceptional: boolean };
export type Adjustment = { month: Month; balanceCents: number };

export type MonthSummary = {
  month: Month;
  status: 'passe' | 'en_cours' | 'futur';
  startCents: number;
  incomeCents: number;          // compté dans le solde (« Revenu total » de l'Excel) : réel ou prévu par catégorie
  expenseCents: number;         // idem
  plannedIncomeCents: number;
  plannedExpenseCents: number;
  actualIncomeCents: number;
  actualExpenseCents: number;
  actualExpenseWithoutExceptionalCents: number;
  endCents: number;
};

export const addMonths = (m: Month, n: number): Month => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const monthOf = (date: Date | string): Month => {
  // Une date 'AAAA-MM-JJ' (colonne Postgres) donne son mois tel quel : new Date() la lirait en UTC.
  if (typeof date === 'string' && /^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function plannedFor(cat: Category, month: Month, overrides: PlannedOverride[]): number {
  // shortcut: prévu 0 pour tous les mois d'une catégorie archivée (passés compris), faute de date d'archivage.
  if (cat.archived) return 0;
  const o = overrides.find((x) => x.categoryId === cat.id && x.month === month);
  return o?.amountCents ?? cat.defaultPlannedCents;
}

/** Interrupteur de la catégorie pour ce mois : choix manuel, sinon automatique (activé tant que réel ≤ prévu). */
export function categoryCounted(cat: Category, month: Month, overrides: PlannedOverride[], actualCents: number) {
  const manual = overrides.find((x) => x.categoryId === cat.id && x.month === month)?.counted ?? null;
  return { on: manual ?? actualCents <= plannedFor(cat, month, overrides), auto: manual === null };
}

/** Le prévu de la catégorie compte-t-il dans le solde de ce mois (hors règle des mois passés) ? */
export function isPlannedCounted(
  cat: Category, month: Month, overrides: PlannedOverride[], monthSettings: MonthSetting[], actualCents: number,
): boolean {
  const all = monthSettings.find((x) => x.month === month && x.kind === cat.kind)?.plannedCounted ?? true;
  return all && categoryCounted(cat, month, overrides, actualCents).on;
}

export function summarizeMonths(params: {
  months: Month[];               // dans l'ordre chronologique, sans trou
  currentMonth: Month;
  categories: Category[];
  overrides: PlannedOverride[];
  monthSettings?: MonthSetting[];
  actuals: ActualLine[];
  adjustments: Adjustment[];
  initialStartCents?: number;    // solde de départ du premier mois, si pas d'ajustement
}): MonthSummary[] {
  const { months, currentMonth, categories, overrides, actuals, adjustments, monthSettings = [] } = params;
  const out: MonthSummary[] = [];
  let previousEnd = params.initialStartCents ?? 0;

  for (const month of months) {
    const status = month < currentMonth ? 'passe' : month === currentMonth ? 'en_cours' : 'futur';
    const adj = adjustments.find((a) => a.month === month);
    const startCents = adj ? adj.balanceCents : previousEnd;

    let incomeCents = 0, expenseCents = 0;
    let plannedIncome = 0, plannedExpense = 0, actualIncome = 0, actualExpense = 0, actualExpenseNoExc = 0;
    for (const cat of categories) {
      if (cat.kind === 'epargne') continue;
      const planned = plannedFor(cat, month, overrides);
      const lines = actuals.filter((a) => a.categoryId === cat.id && a.month === month);
      const actual = lines.reduce((s, l) => s + l.amountCents, 0);
      const actualNoExc = lines.filter((l) => !l.exceptional).reduce((s, l) => s + l.amountCents, 0);
      const counted = status !== 'passe' && isPlannedCounted(cat, month, overrides, monthSettings, actual) ? planned : actual;
      if (cat.kind === 'revenu') { plannedIncome += planned; actualIncome += actual; incomeCents += counted; }
      else { plannedExpense += planned; actualExpense += actual; actualExpenseNoExc += actualNoExc; expenseCents += counted; }
    }

    const endCents = startCents + incomeCents - expenseCents;

    out.push({
      month, status, startCents, incomeCents, expenseCents,
      plannedIncomeCents: plannedIncome, plannedExpenseCents: plannedExpense,
      actualIncomeCents: actualIncome, actualExpenseCents: actualExpense,
      actualExpenseWithoutExceptionalCents: actualExpenseNoExc,
      endCents,
    });
    previousEnd = endCents;
  }
  return out;
}

/**
 * « Jusqu'à quand je tiens » : dernier mois (à partir du mois en cours) qui finit
 * avec un solde positif ou nul. null si tout l'horizon reste positif.
 */
/**
 * Premier mois à calculer pour que les soldes ne dépendent pas de la fenêtre affichée :
 * le dernier ajustement ≤ from, sinon le premier mois avec du réel (départ à 0), sinon from.
 */
export function balanceStartMonth(from: Month, adjustmentMonths: Month[], firstActualMonth: Month | null): Month {
  const adj = adjustmentMonths.filter((m) => m <= from).sort().pop();
  if (adj) return adj;
  return firstActualMonth && firstActualMonth < from ? firstActualMonth : from;
}

export function runway(summaries: MonthSummary[]): { lastOkMonth: Month | null; firstNegative: MonthSummary | null } {
  const upcoming = summaries.filter((s) => s.status !== 'passe');
  const idx = upcoming.findIndex((s) => s.endCents < 0);
  if (idx === -1) return { lastOkMonth: null, firstNegative: null };
  return { lastOkMonth: idx > 0 ? upcoming[idx - 1].month : null, firstNegative: upcoming[idx] };
}

export const formatEuros = (cents: number, withSign = false) => {
  const s = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Math.abs(cents) / 100);
  if (cents < 0) return `−${s}`;
  return withSign && cents > 0 ? `+${s}` : s;
};

const amountFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Montant sans « € » (listes de lignes) : « 1 100,00 », « −781,26 », « +0,00 » si withSign. */
export const formatAmount = (cents: number, withSign = false) => {
  const s = amountFormat.format(Math.abs(cents) / 100);
  if (cents < 0) return `−${s}`;
  return withSign ? `+${s}` : s;
};

/** Pour l'affichage en gros : « 1 842 » + « ,17 € ». */
export const splitEuros = (cents: number) => {
  const s = formatEuros(cents);
  const i = s.lastIndexOf(',');
  return { units: s.slice(0, i), rest: s.slice(i) };
};

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** « Novembre 2026 », ou « Novembre » sans l'année. */
export const monthLabel = (month: Month, withYear = true) => {
  const name = MONTHS[Number(month.slice(5, 7)) - 1];
  return withYear ? `${name} ${month.slice(0, 4)}` : name;
};

/** Texte saisi (« -12,4 », « 1 523.43 € ») → centimes, ou null si illisible. */
export function parseSignedCents(text: string): number | null {
  const m = /^([+\-−])?(\d+)(?:[.,](\d{0,2}))?$/.exec(text.replace(/[\s€]/g, ''));
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' || m[1] === '−' ? -cents || 0 : cents; // || 0 : pas de « −0 »
}

/** Teinte d'une pastille de catégorie : revenus en vert, groupes de dépense en alternance bleu / vert. */
export const tintFor = (group: { kind: GroupKind; position: number }): 'accent' | 'income' =>
  group.kind === 'revenu' || group.position % 2 === 1 ? 'income' : 'accent';

// ——— Écran Mois et Projection ———

/** Solde de départ calculé par l'appli : fin du mois précédent, sans tenir compte de l'ajustement du mois. */
export function computedStartCents(summaries: MonthSummary[], month: Month): number {
  const i = summaries.findIndex((s) => s.month === month);
  if (i === -1) throw new Error(`Mois ${month} absent des soldes calculés`);
  return i > 0 ? summaries[i - 1].endCents : 0; // premier mois chargé : départ à 0, comme summarizeMonths
}

export type CategoryLine = { id: string; name: string; plannedCents: number; actualCents: number };
export type GroupBreakdown = {
  id: string; name: string; position: number; plannedCents: number; actualCents: number; categories: CategoryLine[];
};

/** Groupes de dépense du mois : prévu et réel par catégorie (celles à 0 / 0 sont omises), puis totaux du groupe. */
export function groupBreakdown(params: {
  month: Month;
  groups: { id: string; name: string; kind: GroupKind; position: number }[];
  cats: { id: string; group_id: string; name: string }[]; // dans l'ordre d'affichage
  categories: Category[];
  overrides: PlannedOverride[];
  actuals: ActualLine[];
}): GroupBreakdown[] {
  const { month, groups, cats, categories, overrides, actuals } = params;
  return groups.filter((g) => g.kind === 'depense').map((g) => {
    const lines = cats.filter((c) => c.group_id === g.id).flatMap((c) => {
      const cat = categories.find((x) => x.id === c.id);
      if (!cat) return [];
      const plannedCents = plannedFor(cat, month, overrides);
      const actualCents = actuals.filter((a) => a.categoryId === c.id && a.month === month)
        .reduce((s, a) => s + a.amountCents, 0);
      return plannedCents > 0 || actualCents > 0 ? [{ id: c.id, name: c.name, plannedCents, actualCents }] : [];
    });
    return {
      id: g.id, name: g.name, position: g.position, categories: lines,
      plannedCents: lines.reduce((s, c) => s + c.plannedCents, 0),
      actualCents: lines.reduce((s, c) => s + c.actualCents, 0),
    };
  }).filter((g) => g.categories.length > 0);
}

/** Garde les `keep` premières lignes et résume les autres (« + 5 autres charges »). rest null si rien à replier. */
export function collapseRows(rows: CategoryLine[], keep: number) {
  if (rows.length <= keep) return { shown: rows, rest: null };
  const hidden = rows.slice(keep);
  return {
    shown: rows.slice(0, keep),
    rest: {
      count: hidden.length,
      plannedCents: hidden.reduce((s, c) => s + c.plannedCents, 0),
      actualCents: hidden.reduce((s, c) => s + c.actualCents, 0),
    },
  };
}

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

/** « Nov », « Fév » : libellés du mini-graphe. */
export const shortMonthLabel = (month: Month) => MONTHS_SHORT[Number(month.slice(5, 7)) - 1];

/** Nom du mois en minuscules, sans l'année : « novembre ». */
export const monthName = (month: Month) => monthLabel(month, false).toLowerCase();

/** « fin janvier 2027 ». */
export const endOfMonthLabel = (month: Month) => `fin ${monthName(month)} ${month.slice(0, 4)}`;

/** Libellés des lignes de la projection : l'année n'apparaît que lorsqu'elle change (« Janvier 2027 »). */
export const projectionLabels = (months: Month[]) =>
  months.map((m, i) => monthLabel(m, i > 0 && m.slice(0, 4) !== months[i - 1].slice(0, 4)));

/**
 * « Jusqu'où je tiens » sur la fenêtre affichée (mois en cours → +5).
 * lead : petite ligne ; title : gros texte ; firstNegative : premier mois sous zéro, s'il y en a un.
 */
export function runwayHeadline(window: MonthSummary[]) {
  const { lastOkMonth, firstNegative } = runway(window);
  if (!firstNegative) {
    const last = window[window.length - 1].month;
    const name = monthName(last);
    return {
      lead: 'Avec tes prévus, tu tiens au-delà',
      title: `${/^[aeiouyéâ]/.test(name) ? 'd’' : 'de '}${name} ${last.slice(0, 4)}`,
      firstNegative: null,
    };
  }
  if (lastOkMonth) return { lead: 'Avec tes prévus, tu tiens jusqu’à', title: endOfMonthLabel(lastOkMonth), firstNegative };
  return { lead: 'Avec tes prévus, ton solde passe sous zéro', title: endOfMonthLabel(firstNegative.month), firstNegative };
}
