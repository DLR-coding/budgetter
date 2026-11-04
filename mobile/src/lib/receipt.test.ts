import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aiSettingsSummary, buildReceiptMessages, parseReceiptCompletion, validateAiSettings,
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

const cats = [{ id: 'c1', name: 'Courses', group: 'Vie courante' }];
const completion = (content: unknown, finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { content } }] });
const ticket = {
  merchant: '  Auchan  ', date: '2026-11-12', total_cents: 673,
  lines: [
    { raw_label: 'OEUFS PA X30', label: 'Œufs ×30', quantity: 1, unit_price_cents: 499, category_id: 'c1', confident: true },
    { raw_label: 'LAIT', label: 'Lait', quantity: 2, unit_price_cents: 87, category_id: 'c1', confident: true },
  ],
};

test('messages : consigne avec les catégories, photo en data URL', () => {
  const [sys, user] = buildReceiptMessages(cats, 'image/jpeg', 'QUJD');
  assert.equal(sys.role, 'system');
  assert.match(sys.content as string, /- c1 : Vie courante \/ Courses$/);
  assert.deepEqual((user.content as unknown[])[0], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
});

test('réponse normale', () => {
  const r = parseReceiptCompletion(completion(JSON.stringify(ticket)), cats);
  assert.equal(r.merchant, 'Auchan');
  assert.equal(r.date, '2026-11-12');
  assert.equal(r.matches_total, true);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.lines[1], ticket.lines[1]);
});

test('réponse avec <think> et texte autour (contenu en blocs)', () => {
  const text = `<think>Le total {peut-être} 6,73</think>Voici :\n\`\`\`json\n${JSON.stringify(ticket)}\n\`\`\` fin.`;
  const r = parseReceiptCompletion(completion([{ type: 'text', text }]), cats);
  assert.equal(r.lines.length, 2);
  assert.equal(r.total_cents, 673);
});

test('garde-fous : catégorie inconnue, quantité, date, commerçant', () => {
  const r = parseReceiptCompletion(completion(JSON.stringify({
    merchant: 'x'.repeat(100), date: '2026-02-30', total_cents: 100,
    lines: [{ raw_label: 'A', quantity: 0, unit_price_cents: 12.4, category_id: 'inconnue', confident: true }, 'pas un objet'],
  })), cats);
  assert.deepEqual(r.lines, [{ raw_label: 'A', label: 'A', quantity: 1, unit_price_cents: 12, category_id: null, confident: false }]);
  assert.equal(r.date, null);
  assert.equal(r.merchant?.length, 80);
  assert.equal(r.matches_total, false);
});

test('réponse inexploitable : JSON invalide, tronquée', () => {
  assert.throws(() => parseReceiptCompletion(completion('Je ne peux pas lire ce ticket.'), cats), /JSON invalide/);
  assert.throws(() => parseReceiptCompletion(completion('{"lines": [}'), cats), /JSON invalide/);
  assert.throws(() => parseReceiptCompletion(completion('{"lines": [', 'length'), cats), /trop long/);
});

test('réglages IA : https obligatoire, slash final retiré, champs requis', () => {
  assert.deepEqual(validateAiSettings({ baseUrl: ' https://litellm.exemple.fr/v1/ ', apiKey: ' sk-1 ', model: 'Qwen' }),
    { baseUrl: 'https://litellm.exemple.fr/v1', apiKey: 'sk-1', model: 'Qwen' });
  assert.throws(() => validateAiSettings({ baseUrl: 'http://litellm.exemple.fr/v1', apiKey: 'k', model: 'm' }), /https/);
  assert.throws(() => validateAiSettings({ baseUrl: 'https://', apiKey: 'k', model: 'm' }), /https/);
  assert.throws(() => validateAiSettings({ baseUrl: 'https://a.fr/v1', apiKey: ' ', model: 'm' }), /clé/);
  assert.throws(() => validateAiSettings({ baseUrl: 'https://a.fr/v1', apiKey: 'k', model: '' }), /modèle/);
});

test('sous-titre « Service IA »', () => {
  assert.equal(aiSettingsSummary({ baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o' }), 'api.openai.com · gpt-4o');
  assert.equal(aiSettingsSummary(null), 'Non configuré');
});
