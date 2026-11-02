import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryKind, entrySubtitle, entryTitle, entryTotalCents, groupByDay, linesByCategory, longDayLabel,
  matchesSearch, otherLinesNote, qtyLabel, signedCents, sourceLabel, type Ctx,
} from './entries.ts';
import type { EntryRow, LineRow } from './data.ts';

const ctx: Ctx = {
  groups: [
    { id: 'gb', name: 'Bouffe', kind: 'depense', position: 0 },
    { id: 'gf', name: 'Fixes', kind: 'depense', position: 1 },
    { id: 'gr', name: 'Revenus', kind: 'revenu', position: 2 },
  ],
  cats: [
    { id: 'nour', group_id: 'gb', name: 'Nourriture', icon: null, default_planned_cents: 4000, archived: false, position: 0 },
    { id: 'autre', group_id: 'gb', name: 'Autre groceries', icon: null, default_planned_cents: 0, archived: false, position: 1 },
    { id: 'mut', group_id: 'gf', name: 'Mutuelle', icon: null, default_planned_cents: 2142, archived: false, position: 0 },
    { id: 'pro', group_id: 'gr', name: 'Activités pro', icon: null, default_planned_cents: 0, archived: false, position: 0 },
  ],
};

let n = 0;
const line = (category_id: string, unit_price_cents: number, extra: Partial<LineRow> = {}): LineRow => ({
  id: `l${n++}`, entry_id: 'e', category_id, label: null, raw_label: null, quantity: 1, unit_price_cents, position: 0, ...extra,
});
const entry = (lines: LineRow[], extra: Partial<EntryRow> = {}): EntryRow => ({
  id: `e${n++}`, date: '2026-11-12', merchant: null, note: null, exceptional: false, source: 'manuel', formula: null,
  receipt_path: null, recurrence_id: null, created_at: '', entry_lines: lines, ...extra,
});

const auchan = entry([line('nour', 499, { label: 'Œufs ×30' }), line('nour', 87, { quantity: 2, label: 'Flocons d’avoine' }),
  line('autre', 127, { label: 'Éponges', raw_label: 'EPONGE X3' })], { merchant: 'Auchan', source: 'ticket' });
const mutuelle = entry([line('mut', 2142)], { merchant: 'Mutuelle', source: 'recurrence', date: '2026-11-10' });
const lidl = entry([line('nour', 300), line('nour', 341), line('nour', 300)], { merchant: 'Lidl', date: '2026-11-10' });
const pro = entry([line('pro', 110000)], { date: '2026-11-01' });

test('totaux, type et signe', () => {
  assert.equal(entryTotalCents(auchan), 499 + 174 + 127);
  assert.equal(entryKind(auchan, ctx), 'depense');
  assert.equal(entryKind(pro, ctx), 'revenu');
  assert.equal(signedCents(auchan, ctx), -800);
  assert.equal(signedCents(pro, ctx), 110000);
  assert.equal(entryKind(entry([line('inconnue', 1)]), ctx), 'depense');
});

test('lignes par catégorie, ordre de première apparition', () => {
  assert.deepEqual(linesByCategory(auchan.entry_lines).map((c) => [c.categoryId, c.cents, c.lines.length]),
    [['nour', 673, 2], ['autre', 127, 1]]);
});

test('titre et sous-titre (maquette 8)', () => {
  assert.equal(entryTitle(auchan, ctx), 'Auchan');
  assert.equal(entrySubtitle(auchan, ctx), 'Nourriture + 1 catégorie · ticket');
  assert.equal(entrySubtitle(mutuelle, ctx), 'Fixes · récurrente');
  assert.equal(entrySubtitle(lidl, ctx), 'Nourriture · 3 articles');
  assert.equal(entryTitle(pro, ctx), 'Activités pro');
  assert.equal(entrySubtitle(pro, ctx), 'Revenu · manuel');
  assert.equal(sourceLabel('formule'), 'formule');
});

test('libellé long du jour', () => {
  const today = new Date(2026, 10, 12, 9);
  assert.equal(longDayLabel('2026-11-12', today), 'Aujourd’hui');
  assert.equal(longDayLabel('2026-11-11', today), 'Hier');
  assert.equal(longDayLabel('2026-11-10', today), 'Mardi 10 nov.');
  assert.equal(longDayLabel('2026-11-01', today), 'Dimanche 1er nov.');
  assert.equal(longDayLabel('2026-11-30', new Date(2026, 11, 1)), 'Hier');
});

test('regroupement par jour avec total signé', () => {
  const days = groupByDay([auchan, mutuelle, lidl, pro], ctx);
  assert.deepEqual(days.map((d) => [d.date, d.totalCents, d.entries.length]),
    [['2026-11-12', -800, 1], ['2026-11-10', -2142 - 941, 2], ['2026-11-01', 110000, 1]]);
});

test('recherche sans accents ni casse', () => {
  assert.ok(matchesSearch(auchan, 'oeufs') === false); // « Œ » n'est pas « oe »
  assert.ok(matchesSearch(auchan, 'eponge'));
  assert.ok(matchesSearch(auchan, 'AUCH'));
  assert.ok(matchesSearch(auchan, 'avoine'));
  assert.ok(matchesSearch({ ...lidl, note: 'Café' }, 'cafe'));
  assert.ok(matchesSearch(lidl, '  '));
  assert.ok(!matchesSearch(lidl, 'auchan'));
});

test('quantité et pied de saisie dépliée', () => {
  assert.equal(qtyLabel({ quantity: 2, unit_price_cents: 87 }), '2 × 0,87');
  assert.equal(qtyLabel({ quantity: 1, unit_price_cents: 87 }), null);
  assert.equal(otherLinesNote(auchan, 'nour', ctx), '+ 1 article de ce ticket classé dans Autre groceries');
  assert.equal(otherLinesNote(lidl, 'nour', ctx), null);
});
