import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSave, linesTotal, matchesTotal, needsReview, receiptDate, receiptSubtitle, removeLine, setLineCategory, toSaveLines,
  type ReceiptLine,
} from './receipt.ts';

const line = (p: Partial<ReceiptLine> = {}): ReceiptLine => ({
  raw_label: 'OEUFS PA X30', label: 'Œufs ×30', quantity: 1, unit_price_cents: 499, category_id: 'c1', confident: true, ...p,
});

test('à vérifier : sans catégorie ou pas sûr', () => {
  assert.equal(needsReview(line()), false);
  assert.equal(needsReview(line({ confident: false })), true);
  assert.equal(needsReview(line({ category_id: null })), true);
});

test('total des lignes : quantités et remises négatives', () => {
  const lines = [line(), line({ quantity: 2, unit_price_cents: 87 }), line({ unit_price_cents: -50 })];
  assert.equal(linesTotal(lines), 499 + 174 - 50);
  assert.equal(linesTotal([]), 0);
});

test('correspondance au total du ticket, recalculée après retrait', () => {
  const lines = [line(), line({ unit_price_cents: 100 })];
  assert.equal(matchesTotal({ total_cents: 599, lines }), true);
  assert.equal(matchesTotal({ total_cents: 599, lines: removeLine(lines, 1) }), false);
  assert.equal(matchesTotal({ total_cents: null, lines }), null);
});

test('enregistrable seulement si chaque ligne a une catégorie', () => {
  const lines = [line(), line({ category_id: null, confident: false })];
  assert.equal(canSave(lines), false);
  assert.equal(canSave([]), false);
  const fixed = setLineCategory(lines, 1, 'c2');
  assert.equal(canSave(fixed), true);
  assert.equal(needsReview(fixed[1]), false);
  assert.equal(fixed[0], lines[0]); // les autres lignes ne bougent pas
});

test('lignes pour saveEntry', () => {
  assert.deepEqual(toSaveLines([line({ quantity: 2, unit_price_cents: 87, label: '' })]), [
    { quantity: 2, unitPriceCents: 87, categoryId: 'c1', label: 'OEUFS PA X30', rawLabel: 'OEUFS PA X30' },
  ]);
  assert.throws(() => toSaveLines([line({ category_id: null })]));
});

test('date : celle du ticket si valide, sinon aujourd’hui (locale)', () => {
  const today = new Date(2026, 10, 2, 23, 30);
  assert.equal(receiptDate('2026-11-12', today), '2026-11-12');
  assert.equal(receiptDate(null, today), '2026-11-02');
  assert.equal(receiptDate('2026-02-30', today), '2026-11-02');
  assert.equal(receiptDate('12/11/2026', today), '2026-11-02');
});

test('sous-titre de la carte commerçant', () => {
  assert.equal(receiptSubtitle('2026-11-12', 7), '12 nov. 2026 · 7 articles détectés');
  assert.equal(receiptSubtitle('2026-03-01', 1), '1 mars 2026 · 1 article détecté');
  assert.equal(receiptSubtitle(null, 0), '0 article détecté');
});
