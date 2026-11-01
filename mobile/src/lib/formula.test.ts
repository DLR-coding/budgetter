import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, isFormula } from './formula.ts';

describe('parseFormula', () => {
  test('montant simple, virgule ou point', () => {
    for (const input of ['12,49', '12.49']) {
      assert.deepEqual(parseFormula(input), {
        ok: true,
        lines: [{ quantity: 1, unitPriceCents: 1249 }],
        totalCents: 1249,
      });
    }
  });

  test('formule imbriquée : 4 lignes dont 5 × 2,99', () => {
    assert.deepEqual(parseFormula('(12+2+1.55+(5*2.99))'), {
      ok: true,
      lines: [
        { quantity: 1, unitPriceCents: 1200 },
        { quantity: 1, unitPriceCents: 200 },
        { quantity: 1, unitPriceCents: 155 },
        { quantity: 5, unitPriceCents: 299 },
      ],
      totalCents: 3050,
    });
  });

  test('soustraction d’un groupe : lignes négatives', () => {
    assert.deepEqual(parseFormula('5-(1.29+2.27)'), {
      ok: true,
      lines: [
        { quantity: 1, unitPriceCents: 500 },
        { quantity: 1, unitPriceCents: -129 },
        { quantity: 1, unitPriceCents: -227 },
      ],
      totalCents: 144,
    });
  });

  test('total exact en centimes (pas d’erreur flottante)', () => {
    // 0.1 + 0.2 = 0.30000000000000004 et 1.15 * 100 = 114.99999999999999 en flottant.
    const r = parseFormula('0.1+0.2+1.15');
    assert.equal(r.ok && r.totalCents, 145);
  });

  test('entrées invalides : ok:false', () => {
    for (const input of ['', '   ', '(12+2', 'douze', '12+', '1.2.3']) {
      assert.equal(parseFormula(input).ok, false, input);
    }
  });
});

describe('isFormula', () => {
  test('vrai pour une formule', () => {
    for (const input of ['12+2', '5*2.99', '5x2.99', '(12)', '5-1']) assert.equal(isFormula(input), true, input);
  });

  test('faux pour un montant simple, y compris négatif', () => {
    for (const input of ['12,49', ' 12.49 ', '-12,49']) assert.equal(isFormula(input), false, input);
  });
});
