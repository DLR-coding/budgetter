import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, monthOf, plannedFor, summarizeMonths, runway, formatEuros,
  formatAmount, splitEuros, monthLabel, parseSignedCents, tintFor, computedStartCents, groupBreakdown,
  collapseRows, shortMonthLabel, endOfMonthLabel, projectionLabels, runwayHeadline, balanceStartMonth,
  isPlannedCounted, categoryCounted } from './budget.ts';
import type { ActualLine, Adjustment, MonthSetting, PlannedOverride } from './budget.ts';
import type { Category, MonthSummary } from './budget.ts';

describe('addMonths', () => {
  test('passage d’année dans les deux sens', () => {
    assert.equal(addMonths('2026-11', 3), '2027-02');
    assert.equal(addMonths('2026-02', -3), '2025-11');
  });
});

describe('monthOf', () => {
  test('Date et chaîne ISO', () => {
    assert.equal(monthOf(new Date(2026, 2, 15)), '2026-03');
    assert.equal(monthOf('2026-03-15'), '2026-03');
  });

  test('date seule (colonne Postgres `date`) hors fuseau UTC+', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      assert.equal(monthOf('2026-03-01'), '2026-03');
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});

const salaire: Category = { id: 'salaire', kind: 'revenu', defaultPlannedCents: 200000 };
const courses: Category = { id: 'courses', kind: 'depense', defaultPlannedCents: 40000 };
const livret: Category = { id: 'livret', kind: 'epargne', defaultPlannedCents: 10000 };

describe('plannedFor', () => {
  const overrides = [{ categoryId: 'courses', month: '2026-03', amountCents: 60000 }];
  test('prévu par défaut, sinon override du mois', () => {
    assert.equal(plannedFor(courses, '2026-02', overrides), 40000);
    assert.equal(plannedFor(courses, '2026-03', overrides), 60000);
    assert.equal(plannedFor(salaire, '2026-03', overrides), 200000);
  });
});

describe('summarizeMonths', () => {
  const [jan, feb, mar, apr] = summarizeMonths({
    months: ['2026-01', '2026-02', '2026-03', '2026-04'],
    currentMonth: '2026-02',
    categories: [salaire, courses, livret],
    overrides: [{ categoryId: 'courses', month: '2026-03', amountCents: 60000 }],
    actuals: [
      { categoryId: 'salaire', month: '2026-01', amountCents: 210000, exceptional: false },
      { categoryId: 'courses', month: '2026-01', amountCents: 35000, exceptional: false },
      { categoryId: 'courses', month: '2026-01', amountCents: 15000, exceptional: true },
      { categoryId: 'courses', month: '2026-02', amountCents: 30000, exceptional: false },
    ],
    adjustments: [{ month: '2026-03', balanceCents: 5000 }],
    initialStartCents: 100000,
  });

  test('statuts passé / en cours / futur', () => {
    assert.deepEqual([jan, feb, mar, apr].map((m) => m.status), ['passe', 'en_cours', 'futur', 'futur']);
  });

  test('mois passé : compte le réel', () => {
    assert.equal(jan.startCents, 100000);
    assert.equal(jan.incomeCents, 210000);
    assert.equal(jan.expenseCents, 50000);
    assert.equal(jan.endCents, 260000);
  });

  test('exceptionnelles exclues du total « sans imprévus »', () => {
    assert.equal(jan.actualExpenseCents, 50000);
    assert.equal(jan.actualExpenseWithoutExceptionalCents, 35000);
  });

  test('mois en cours : compte le prévu, sans report du dépassement de janvier', () => {
    assert.equal(feb.startCents, jan.endCents);
    assert.equal(feb.actualExpenseCents, 30000);
    assert.equal(feb.expenseCents, 40000);
    assert.equal(feb.incomeCents, 200000);
    assert.equal(feb.endCents, 260000 + 200000 - 40000);
  });

  test('mois futur : prévu propre au mois, départ = ajustement s’il existe', () => {
    assert.equal(mar.startCents, 5000);
    assert.equal(mar.expenseCents, 60000);
    assert.equal(mar.endCents, 5000 + 200000 - 60000);
  });

  test('sans ajustement : départ = solde final du mois précédent', () => {
    assert.equal(apr.startCents, mar.endCents);
  });
});

describe('catégorie archivée', () => {
  const ancienne: Category = { id: 'ancienne', kind: 'depense', defaultPlannedCents: 30000, archived: true };

  test('prévu 0, même avec un prévu propre au mois', () => {
    assert.equal(plannedFor(ancienne, '2026-03', [{ categoryId: 'ancienne', month: '2026-03', amountCents: 5000 }]), 0);
  });

  test('son réel passé compte toujours dans le solde', () => {
    const [jan, feb] = summarizeMonths({
      months: ['2026-01', '2026-02'], currentMonth: '2026-02', categories: [ancienne], overrides: [],
      actuals: [{ categoryId: 'ancienne', month: '2026-01', amountCents: 12000, exceptional: false }],
      adjustments: [], initialStartCents: 100000,
    });
    assert.equal(jan.expenseCents, 12000);
    assert.equal(jan.endCents, 88000);
    assert.equal(feb.plannedExpenseCents, 0);
    assert.equal(feb.endCents, 88000);
  });
});

describe('interrupteurs « Compter le prévu »', () => {
  // Départ 1 300 € en début de novembre, revenus prévus 1 000 €, dépenses prévues 781,26 € dont 709,26 € déjà réels.
  const paie: Category = { id: 'paie', kind: 'revenu', defaultPlannedCents: 100000 };
  const fixes: Category = { id: 'fixes', kind: 'depense', defaultPlannedCents: 70926 };
  const bouffe: Category = { id: 'bouffe', kind: 'depense', defaultPlannedCents: 7200 };
  const run = (opts: { currentMonth?: string; monthSettings?: MonthSetting[]; overrides?: PlannedOverride[] } = {}) =>
    summarizeMonths({
      months: ['2026-11'], currentMonth: opts.currentMonth ?? '2026-11', categories: [paie, fixes, bouffe, livret],
      overrides: opts.overrides ?? [], monthSettings: opts.monthSettings,
      actuals: [{ categoryId: 'fixes', month: '2026-11', amountCents: 70926, exceptional: false }],
      adjustments: [{ month: '2026-11', balanceCents: 130000 }],
    })[0];

  test('tout compté : 1 518,74 €', () => {
    assert.equal(run().endCents, 151874);
  });

  test('revenus non comptés : 518,74 €', () => {
    assert.equal(run({ monthSettings: [{ month: '2026-11', kind: 'revenu', plannedCounted: false }] }).endCents, 51874);
  });

  test('dépenses non comptées : 1 590,74 €', () => {
    const nov = run({ monthSettings: [{ month: '2026-11', kind: 'depense', plannedCounted: false }] });
    assert.equal(nov.endCents, 159074);
    assert.equal(nov.plannedExpenseCents, 78126); // le prévu affiché ne change pas
  });

  test('une seule catégorie non comptée : son réel (0 €) remplace son prévu', () => {
    const overrides = [{ categoryId: 'bouffe', month: '2026-11', amountCents: null, counted: false }];
    assert.equal(run({ overrides }).endCents, 151874 + 7200);
  });

  test('interrupteur d’un autre mois ou d’un autre type : sans effet', () => {
    assert.equal(run({ monthSettings: [{ month: '2026-12', kind: 'revenu', plannedCounted: false }] }).endCents, 151874);
  });

  test('mois passé : toujours le réel, interrupteurs ignorés', () => {
    const monthSettings: MonthSetting[] = [{ month: '2026-11', kind: 'depense', plannedCounted: true }];
    assert.equal(run({ currentMonth: '2026-12', monthSettings }).endCents, 130000 - 70926);
  });

  test('isPlannedCounted : interrupteur du mois ET de la catégorie', () => {
    const off: MonthSetting[] = [{ month: '2026-11', kind: 'depense', plannedCounted: false }];
    const catOff = [{ categoryId: 'bouffe', month: '2026-11', amountCents: 5000, counted: false }];
    assert.equal(isPlannedCounted(bouffe, '2026-11', [], [], 0), true);
    assert.equal(isPlannedCounted(bouffe, '2026-11', [], off, 0), false);
    assert.equal(isPlannedCounted(bouffe, '2026-11', catOff, [], 0), false);
    assert.equal(isPlannedCounted(paie, '2026-11', catOff, off, 0), true);
  });

  test('dépassement : désactivé automatiquement, le réel compte', () => {
    assert.deepEqual(categoryCounted(bouffe, '2026-11', [], 7200), { on: true, auto: true });
    assert.deepEqual(categoryCounted(bouffe, '2026-11', [], 7201), { on: false, auto: true });
    const nov = summarizeMonths({
      months: ['2026-11'], currentMonth: '2026-11', categories: [bouffe], overrides: [],
      actuals: [{ categoryId: 'bouffe', month: '2026-11', amountCents: 9000, exceptional: false }],
      adjustments: [{ month: '2026-11', balanceCents: 130000 }],
    })[0];
    assert.equal(nov.expenseCents, 9000);
  });

  test('réactivé à la main malgré le dépassement : le prévu compte', () => {
    const overrides = [{ categoryId: 'bouffe', month: '2026-11', amountCents: null, counted: true }];
    assert.deepEqual(categoryCounted(bouffe, '2026-11', overrides, 9000), { on: true, auto: false });
    const nov = summarizeMonths({
      months: ['2026-11'], currentMonth: '2026-11', categories: [bouffe], overrides,
      actuals: [{ categoryId: 'bouffe', month: '2026-11', amountCents: 9000, exceptional: false }],
      adjustments: [],
    })[0];
    assert.equal(nov.expenseCents, 7200);
  });

  test('octobre 2026 de l’Excel : 819,74 € de dépenses comptées', () => {
    const c = (id: string, euros: number): Category => ({ id, kind: 'depense', defaultPlannedCents: Math.round(euros * 100) });
    const categories = [c('loyer', 565), c('elec', 65), c('tel', 20), c('cts', 28), c('mutuelle', 21.42), c('sogessur', 6.34),
      c('sobrio', 3.5), c('nourriture', 40), c('laverie', 12), c('eglise', 10), c('groceries', 5), c('selfcare', 5),
      c('autre', 0), c('loisirs', 0)];
    const reel: [string, number][] = [['loyer', 56500], ['elec', 6522], ['tel', 2000], ['cts', 2800], ['mutuelle', 2142],
      ['sogessur', 1296], ['sobrio', 350], ['nourriture', 2743], ['groceries', 2664], ['autre', 2000], ['loisirs', 1200]];
    const [oct] = summarizeMonths({
      months: ['2026-10'], currentMonth: '2026-10', categories,
      // Laverie et Église effacées dans l'Excel : interrupteur coupé (réel 0).
      overrides: ['laverie', 'eglise'].map((id) => ({ categoryId: id, month: '2026-10', amountCents: null, counted: false })),
      actuals: reel.map(([id, cents]) => ({ categoryId: id, month: '2026-10', amountCents: cents, exceptional: false })),
      adjustments: [],
    });
    assert.equal(oct.expenseCents, 81974);
  });

  test('prévu du mois null : prévu par défaut', () => {
    assert.equal(plannedFor(bouffe, '2026-11', [{ categoryId: 'bouffe', month: '2026-11', amountCents: null, counted: false }]), 7200);
  });
});

describe('balanceStartMonth', () => {
  const actuals: ActualLine[] = [
    { categoryId: 'salaire', month: '2024-05', amountCents: 150000, exceptional: false },
    { categoryId: 'courses', month: '2024-09', amountCents: 30000, exceptional: false },
    { categoryId: 'courses', month: '2025-06', amountCents: 45000, exceptional: false },
  ];
  const adjustments: Adjustment[] = [{ month: '2024-08', balanceCents: 50000 }, { month: '2025-03', balanceCents: 70000 }];
  // Ce que fait loadBudget : calcul depuis balanceStartMonth jusqu'à `to`.
  const endOf = (month: string, from: string, adj: Adjustment[]) => {
    const start = balanceStartMonth(from, adj.map((a) => a.month), '2024-05');
    const months: string[] = [];
    for (let m = start; m <= '2026-06'; m = addMonths(m, 1)) months.push(m);
    return summarizeMonths({ months, currentMonth: '2026-01', categories: [salaire, courses], overrides: [], actuals, adjustments: adj })
      .find((x) => x.month === month)!.endCents;
  };

  test('dernier ajustement ≤ from, sinon premier mois avec du réel, sinon from', () => {
    assert.equal(balanceStartMonth('2025-01', ['2024-08', '2025-03'], '2024-05'), '2024-08');
    assert.equal(balanceStartMonth('2024-07', ['2024-08'], '2024-05'), '2024-05');
    assert.equal(balanceStartMonth('2024-07', [], null), '2024-07');
    assert.equal(balanceStartMonth('2024-01', [], '2024-05'), '2024-01');
  });

  test('même solde de fin pour un mois donné, quel que soit le mois affiché', () => {
    for (const adj of [adjustments, []]) {
      const ref = endOf('2025-07', '2024-01', adj);
      for (const from of ['2024-06', '2024-12', '2025-04', '2025-07']) assert.equal(endOf('2025-07', from, adj), ref, from);
    }
    assert.equal(endOf('2025-07', '2025-07', adjustments), 70000 - 45000);
  });
});

describe('runway', () => {
  const s = (month: string, status: MonthSummary['status'], endCents: number) =>
    ({ month, status, endCents }) as MonthSummary;

  test('dernier mois ≥ 0 et premier négatif, mois passés ignorés', () => {
    const neg = s('2026-04', 'futur', -1);
    assert.deepEqual(
      runway([s('2026-01', 'passe', -500), s('2026-02', 'en_cours', 100), s('2026-03', 'futur', 0), neg]),
      { lastOkMonth: '2026-03', firstNegative: neg },
    );
  });

  test('aucun mois négatif', () => {
    assert.deepEqual(runway([s('2026-02', 'en_cours', 100), s('2026-03', 'futur', 50)]), {
      lastOkMonth: null,
      firstNegative: null,
    });
  });

  test('négatif dès le mois en cours', () => {
    const neg = s('2026-02', 'en_cours', -1);
    assert.deepEqual(runway([neg, s('2026-03', 'futur', 10)]), { lastOkMonth: null, firstNegative: neg });
  });
});

// fr-FR : espace fine insécable (U+202F) pour les milliers, insécable (U+00A0) avant €.
describe('formatAmount', () => {
  test('sans €, signe moins typographique, + forcé si withSign', () => {
    assert.equal(formatAmount(110000), '1 100,00');
    assert.equal(formatAmount(-78126), '−781,26');
    assert.equal(formatAmount(78126, true), '+781,26');
    assert.equal(formatAmount(0, true), '+0,00');
    assert.equal(formatAmount(0), '0,00');
  });
});

describe('splitEuros', () => {
  test('partie entière / centimes et €', () => {
    assert.deepEqual(splitEuros(184217), { units: '1 842', rest: ',17 €' });
    assert.deepEqual(splitEuros(-50161), { units: '−501', rest: ',61 €' });
  });
});

describe('monthLabel', () => {
  test('avec et sans année', () => {
    assert.equal(monthLabel('2026-11'), 'Novembre 2026');
    assert.equal(monthLabel('2027-02', false), 'Février');
  });
});

describe('parseSignedCents', () => {
  test('virgule, point, espaces, €, signe', () => {
    assert.equal(parseSignedCents('1 523,43 €'), 152343);
    assert.equal(parseSignedCents(' 1 523.4 '), 152340);
    assert.equal(parseSignedCents('-12,5'), -1250);
    assert.equal(parseSignedCents('−0,07'), -7);
    assert.equal(parseSignedCents('+8'), 800);
    assert.equal(parseSignedCents('12,'), 1200);
    assert.equal(parseSignedCents('-0'), 0);
  });
  test('refuse le reste', () => {
    for (const t of ['', '-', 'abc', '1,234', '1.2.3', ',5', '12-']) assert.equal(parseSignedCents(t), null, t);
  });
});

describe('tintFor', () => {
  test('revenu en vert, dépenses en alternance selon la position', () => {
    assert.equal(tintFor({ kind: 'revenu', position: 0 }), 'income');
    assert.equal(tintFor({ kind: 'depense', position: 2 }), 'accent');
    assert.equal(tintFor({ kind: 'depense', position: 3 }), 'income');
    assert.equal(tintFor({ kind: 'epargne', position: 4 }), 'accent');
  });
});

describe('computedStartCents', () => {
  const sums = summarizeMonths({
    months: ['2026-10', '2026-11'], currentMonth: '2026-10', categories: [salaire],
    overrides: [], actuals: [], adjustments: [{ month: '2026-11', balanceCents: 123 }], initialStartCents: 1000,
  });
  test('fin du mois précédent, ajustement du mois ignoré', () => {
    assert.equal(sums[1].startCents, 123);
    assert.equal(computedStartCents(sums, '2026-11'), 1000 + 200000);
  });
  test('premier mois chargé : 0 ; mois absent : erreur', () => {
    assert.equal(computedStartCents(sums, '2026-10'), 0);
    assert.throws(() => computedStartCents(sums, '2027-01'));
  });
});

describe('groupBreakdown', () => {
  const loyer: Category = { id: 'loyer', kind: 'depense', defaultPlannedCents: 56500 };
  const vide: Category = { id: 'vide', kind: 'depense', defaultPlannedCents: 0 };
  const res = groupBreakdown({
    month: '2026-11',
    groups: [
      { id: 'rev', name: 'Revenus', kind: 'revenu', position: 0 },
      { id: 'fix', name: 'Fixes', kind: 'depense', position: 1 },
      { id: 'bouffe', name: 'Bouffe', kind: 'depense', position: 2 },
      { id: 'rien', name: 'Variables', kind: 'depense', position: 3 },
    ],
    cats: [
      { id: 'salaire', group_id: 'rev', name: 'Salaire' },
      { id: 'loyer', group_id: 'fix', name: 'Loyer' },
      { id: 'courses', group_id: 'bouffe', name: 'Nourriture' },
      { id: 'vide', group_id: 'rien', name: 'Vide' },
    ],
    categories: [salaire, loyer, courses, vide],
    overrides: [{ categoryId: 'courses', month: '2026-11', amountCents: 4000 }],
    actuals: [
      { categoryId: 'loyer', month: '2026-11', amountCents: 56500, exceptional: false },
      { categoryId: 'courses', month: '2026-11', amountCents: 2000, exceptional: false },
      { categoryId: 'courses', month: '2026-11', amountCents: 743, exceptional: true },
      { categoryId: 'courses', month: '2026-10', amountCents: 9999, exceptional: false },
    ],
  });
  test('dépenses seulement, groupes vides omis, réel du mois avec exceptionnelles', () => {
    assert.deepEqual(res.map((g) => g.id), ['fix', 'bouffe']);
    assert.deepEqual(res[1], {
      id: 'bouffe', name: 'Bouffe', position: 2, plannedCents: 4000, actualCents: 2743,
      categories: [{ id: 'courses', name: 'Nourriture', plannedCents: 4000, actualCents: 2743 }],
    });
  });
});

describe('collapseRows', () => {
  const r = (id: string, p: number, a: number) => ({ id, name: id, plannedCents: p, actualCents: a });
  test('rien à replier', () => {
    const rows = [r('a', 1, 1), r('b', 2, 2)];
    assert.deepEqual(collapseRows(rows, 2), { shown: rows, rest: null });
  });
  test('« + N autres » avec totaux', () => {
    const { shown, rest } = collapseRows([r('a', 1, 1), r('b', 2, 2), r('c', 30, 10), r('d', 40, 40)], 2);
    assert.deepEqual(shown.map((x) => x.id), ['a', 'b']);
    assert.deepEqual(rest, { count: 2, plannedCents: 70, actualCents: 50 });
  });
});

describe('libellés de la projection', () => {
  test('mois court, fin de mois, année seulement quand elle change', () => {
    assert.equal(shortMonthLabel('2027-02'), 'Fév');
    assert.equal(endOfMonthLabel('2027-01'), 'fin janvier 2027');
    assert.deepEqual(projectionLabels(['2026-11', '2026-12', '2027-01', '2027-02']),
      ['Novembre', 'Décembre', 'Janvier 2027', 'Février']);
  });

  const s = (month: string, endCents: number) => ({ month, status: 'futur', endCents }) as MonthSummary;
  test('runwayHeadline : jusqu’à, au-delà (élision), négatif dès le premier mois', () => {
    const feb = s('2027-02', -50161);
    assert.deepEqual(runwayHeadline([s('2026-12', 1), s('2027-01', 0), feb, s('2027-03', -9)]),
      { lead: 'Avec tes prévus, tu tiens jusqu’à', title: 'fin janvier 2027', firstNegative: feb });
    assert.equal(runwayHeadline([s('2026-11', 1), s('2027-04', 1)]).title, 'd’avril 2027');
    assert.equal(runwayHeadline([s('2027-05', 1)]).title, 'de mai 2027');
    assert.equal(runwayHeadline([s('2027-05', -1)]).title, 'fin mai 2027');
  });
});

describe('formatEuros', () => {
  // fr-FR : espace fine insécable (U+202F) pour les milliers, insécable (U+00A0) avant €.
  test('format français et signe', () => {
    assert.equal(formatEuros(123450), '1 234,50 €');
    assert.equal(formatEuros(-1250), '−12,50 €');
    assert.equal(formatEuros(1250, true), '+12,50 €');
    assert.equal(formatEuros(0, true), '0,00 €');
  });
});
