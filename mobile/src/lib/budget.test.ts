import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, monthOf, plannedFor, summarizeMonths, runway, formatEuros,
  formatAmount, splitEuros, monthLabel, parseSignedCents, tintFor } from './budget.ts';
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
      { categoryId: 'courses', month: '2026-02', amountCents: 99999, exceptional: false },
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
    assert.equal(feb.actualExpenseCents, 99999);
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

describe('formatEuros', () => {
  // fr-FR : espace fine insécable (U+202F) pour les milliers, insécable (U+00A0) avant €.
  test('format français et signe', () => {
    assert.equal(formatEuros(123450), '1 234,50 €');
    assert.equal(formatEuros(-1250), '−12,50 €');
    assert.equal(formatEuros(1250, true), '+12,50 €');
    assert.equal(formatEuros(0, true), '0,00 €');
  });
});
