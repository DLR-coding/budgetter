import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, isoDate, parsePriceCents, subtotalsByCategory } from './articles.ts';

test('prix : virgule, point, euro', () => {
  assert.equal(parsePriceCents('2,65'), 265);
  assert.equal(parsePriceCents('2.6'), 260);
  assert.equal(parsePriceCents('3 €'), 300);
  assert.equal(parsePriceCents(',5'), 50);
  assert.equal(parsePriceCents('0,29'), 29);
});

test('prix invalide', () => {
  for (const s of ['', ',', '1,234', '-2', '1,2,3', 'abc', '2+3']) assert.equal(parsePriceCents(s), null, s);
});

test('sous-totaux par catégorie, quantité comprise', () => {
  assert.deepEqual(subtotalsByCategory([
    { categoryId: 'n', quantity: 1, unitPriceCents: 78 },
    { categoryId: 'g', quantity: 1, unitPriceCents: 127 },
    { categoryId: 'n', quantity: 2, unitPriceCents: 265 },
  ]), [{ categoryId: 'n', cents: 608 }, { categoryId: 'g', cents: 127 }]);
});

test('libellé du jour', () => {
  const today = new Date(2026, 10, 3, 15);
  assert.equal(isoDate(today), '2026-11-03');
  assert.equal(dayLabel('2026-11-03', today), 'Aujourd’hui');
  assert.equal(dayLabel('2026-11-02', today), 'Hier');
  assert.equal(dayLabel('2026-11-01', today), 'dim. 1 nov.');
  assert.equal(dayLabel('2026-10-31', new Date(2026, 10, 1)), 'Hier');
});
