import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampParam, DEFAULT_GLASS, GLASS_SECTIONS, parseGlass, sanitizeGlass } from './glass-settings.ts';

test('chaque réglage a un curseur, et sa valeur par défaut est dans ses bornes', () => {
  const params = GLASS_SECTIONS.flatMap((s) => s.params);
  assert.deepEqual(new Set(params.map((p) => p.key)), new Set(Object.keys(DEFAULT_GLASS)));
  for (const p of params) {
    assert.ok(DEFAULT_GLASS[p.key] >= p.min && DEFAULT_GLASS[p.key] <= p.max, p.key);
    assert.equal(clampParam(p.key, DEFAULT_GLASS[p.key]), DEFAULT_GLASS[p.key], p.key);
  }
});

test('valeur bornée et ramenée sur le pas du curseur', () => {
  assert.equal(clampParam('refraction', 500), 110);
  assert.equal(clampParam('refraction', -3), 0);
  assert.equal(clampParam('dispersion', 2.04), 2);
  assert.equal(clampParam('lightAngle', -200), -180);
  assert.equal(clampParam('edgeReach', Number.NaN), DEFAULT_GLASS.edgeReach);
});

test('stockage : clés inconnues ignorées, manquantes par défaut, valeurs bornées', () => {
  const s = sanitizeGlass({ refraction: 999, inconnu: 3, body: '0.5' });
  assert.equal(s.refraction, 110);
  assert.equal(s.body, DEFAULT_GLASS.body);
  assert.equal((s as Record<string, unknown>).inconnu, undefined);
  assert.equal(s.snapDamping, DEFAULT_GLASS.snapDamping);
});

test('stockage absent ou abîmé : réglages par défaut', () => {
  assert.deepEqual(parseGlass(null), DEFAULT_GLASS);
  assert.deepEqual(parseGlass('{pas du json'), DEFAULT_GLASS);
  assert.deepEqual(parseGlass('[1, 2]'), DEFAULT_GLASS);
  assert.equal(parseGlass('{"dispersion": 0.5}').dispersion, 0.5);
});
