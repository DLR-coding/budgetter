import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pressKey, typeKeys, type Key } from './keypad.ts';
import { parseFormula } from './formula.ts';

const keys = (s: string) => [...s].map((c) => (c === '<' ? 'del' : c) as Key);
const type = (s: string, start = '') => typeKeys(keys(s), start);

test('montant simple', () => {
  assert.equal(type('12,49'), '12,49');
});

test('2 décimales maximum, une seule virgule', () => {
  assert.equal(type('12,499'), '12,49');
  assert.equal(type('12,4,9'), '12,49');
});

test('virgule en premier → « 0, »', () => {
  assert.equal(type(',5'), '0,5');
  assert.equal(type('1+,5'), '1+0,5');
});

test('pas de zéro de tête', () => {
  assert.equal(type('007'), '7');
  assert.equal(type('0,07'), '0,07');
});

test('6 chiffres entiers maximum', () => {
  assert.equal(type('12345678'), '123456');
});

test('opérateurs : pas en tête, le dernier remplace le précédent', () => {
  assert.equal(type('+×'), '');
  assert.equal(type('12+×3'), '12×3');
});

test('un seul « × » par article', () => {
  assert.equal(type('5×2×3'), '5×23');
  assert.equal(type('5×2+3×4'), '5×2+3×4');
});

test('effacer', () => {
  assert.equal(type('12,4<'), '12,');
  assert.equal(pressKey('', 'del'), '');
});

test('la formule tapée au pavé est lue par parseFormula', () => {
  const r = parseFormula(type('12+2+5×2,99'));
  assert.ok(r.ok);
  assert.equal(r.totalCents, 1200 + 200 + 5 * 299);
  assert.deepEqual(r.lines[2], { quantity: 5, unitPriceCents: 299 });
});
