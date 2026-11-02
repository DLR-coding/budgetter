import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEuros } from './budget.ts';
import { clampDay, dayLabel, groupValue, parsePlannedCents } from './settings.ts';

test('jour : « 1er » puis chiffres', () => {
  assert.equal(dayLabel(1), 'Le 1er du mois');
  assert.equal(dayLabel(5), 'Le 5 du mois');
});

test('groupe : total des prévus, sinon nombre de catégories', () => {
  assert.equal(groupValue([70926, 0]), `${formatEuros(70926)} / mois`);
  assert.equal(groupValue([0, 0, 0]), '3 catégories');
  assert.equal(groupValue([0]), '1 catégorie');
  assert.equal(groupValue([]), '0 catégorie');
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
