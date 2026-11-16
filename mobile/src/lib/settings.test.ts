import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEuros } from './budget.ts';
import { clampDay, dayLabel, groupSummary, moveGroup, parsePlannedCents } from './settings.ts';

test('jour : « 1er » puis chiffres', () => {
  assert.equal(dayLabel(1), 'Le 1er du mois');
  assert.equal(dayLabel(5), 'Le 5 du mois');
});

test('groupe : toujours le nombre de catégories et le total des prévus', () => {
  assert.deepEqual(groupSummary([70926, 0]), { count: '2 catégories', planned: `${formatEuros(70926)} / mois` });
  assert.deepEqual(groupSummary([0]), { count: '1 catégorie', planned: `${formatEuros(0)} / mois` });
  assert.equal(groupSummary([]).count, '0 catégorie');
});

test('ordre des groupes : échange avec le voisin du même type, renumérote', () => {
  const groups = [
    { id: 'rev', kind: 'revenu' as const, position: 0 },
    { id: 'fix', kind: 'depense' as const, position: 1 },
    { id: 'ep', kind: 'epargne' as const, position: 2 },
    { id: 'bouffe', kind: 'depense' as const, position: 3 },
  ];
  // Bouffe monte au-dessus de Fixes en sautant Épargne (autre type).
  assert.deepEqual(moveGroup(groups, 'bouffe', -1), [{ id: 'bouffe', position: 1 }, { id: 'fix', position: 3 }]);
  assert.deepEqual(moveGroup(groups, 'fix', -1), []); // déjà premier des dépenses
  assert.deepEqual(moveGroup(groups, 'rev', 1), []); // seul revenu
  // Positions en double (anciennes données) : renumérotées.
  const dup = [{ id: 'a', kind: 'depense' as const, position: 0 }, { id: 'b', kind: 'depense' as const, position: 0 }];
  assert.deepEqual(moveGroup(dup, 'b', -1), [{ id: 'a', position: 1 }]); // b est déjà à 0
});

test('prévu : vide = 0, négatif ou illisible refusé', () => {
  assert.equal(parsePlannedCents(''), 0);
  assert.equal(parsePlannedCents('40'), 4000);
  assert.equal(parsePlannedCents('12,5 €'), 1250);
  assert.equal(parsePlannedCents('-3'), null);
  assert.equal(parsePlannedCents('abc'), null);
});

test('jour borné à 1..28', () => {
  assert.equal(clampDay(0), 1);
  assert.equal(clampDay(31), 28);
  assert.equal(clampDay(10), 10);
});
