// Calculs du budget, indépendants de la base de données (faciles à tester).
// Règles validées ensemble :
//  - Chaque mois a son prévu par catégorie (prévu par défaut, ou valeur propre au mois).
//  - Un dépassement ou une économie ne se reporte jamais sur les mois suivants.
//  - Mois passés : on compte le réel. Mois en cours et futurs : on compte le prévu.
//  - Le solde de départ d'un mois = l'ajustement saisi pour ce mois s'il existe,
//    sinon le solde de fin du mois précédent.
// Tous les montants sont en centimes. Un mois est noté 'AAAA-MM'.

export type Month = string; // 'AAAA-MM'
export type GroupKind = 'depense' | 'revenu' | 'epargne';

export type Category = {
  id: string;
  kind: GroupKind;
  defaultPlannedCents: number;
};

export type PlannedOverride = { categoryId: string; month: Month; amountCents: number };
export type ActualLine = { categoryId: string; month: Month; amountCents: number; exceptional: boolean };
export type Adjustment = { month: Month; balanceCents: number };

export type MonthSummary = {
  month: Month;
  status: 'passe' | 'en_cours' | 'futur';
  startCents: number;
  incomeCents: number;          // compté dans le solde (réel ou prévu selon le statut)
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
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function plannedFor(cat: Category, month: Month, overrides: PlannedOverride[]): number {
  const o = overrides.find((x) => x.categoryId === cat.id && x.month === month);
  return o ? o.amountCents : cat.defaultPlannedCents;
}

export function summarizeMonths(params: {
  months: Month[];               // dans l'ordre chronologique, sans trou
  currentMonth: Month;
  categories: Category[];
  overrides: PlannedOverride[];
  actuals: ActualLine[];
  adjustments: Adjustment[];
  initialStartCents?: number;    // solde de départ du premier mois, si pas d'ajustement
}): MonthSummary[] {
  const { months, currentMonth, categories, overrides, actuals, adjustments } = params;
  const out: MonthSummary[] = [];
  let previousEnd = params.initialStartCents ?? 0;

  for (const month of months) {
    const status = month < currentMonth ? 'passe' : month === currentMonth ? 'en_cours' : 'futur';
    const adj = adjustments.find((a) => a.month === month);
    const startCents = adj ? adj.balanceCents : previousEnd;

    let plannedIncome = 0, plannedExpense = 0, actualIncome = 0, actualExpense = 0, actualExpenseNoExc = 0;
    for (const cat of categories) {
      if (cat.kind === 'epargne') continue;
      const planned = plannedFor(cat, month, overrides);
      const lines = actuals.filter((a) => a.categoryId === cat.id && a.month === month);
      const actual = lines.reduce((s, l) => s + l.amountCents, 0);
      const actualNoExc = lines.filter((l) => !l.exceptional).reduce((s, l) => s + l.amountCents, 0);
      if (cat.kind === 'revenu') { plannedIncome += planned; actualIncome += actual; }
      else { plannedExpense += planned; actualExpense += actual; actualExpenseNoExc += actualNoExc; }
    }

    const useActual = status === 'passe';
    const incomeCents = useActual ? actualIncome : plannedIncome;
    const expenseCents = useActual ? actualExpense : plannedExpense;
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
