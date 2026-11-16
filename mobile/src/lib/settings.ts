// Logique pure de l'écran Réglages (sans React ni Supabase).
import { formatEuros, parseSignedCents, type GroupKind } from './budget.ts';

/** « Le 1er du mois », « Le 5 du mois ». */
export const dayLabel = (day: number) => `Le ${day === 1 ? '1er' : day} du mois`;

/** Les trois types, dans l'ordre des Réglages. Un type contient des groupes, un groupe des catégories. */
export const KINDS: { kind: GroupKind; label: string }[] = [
  { kind: 'revenu', label: 'Revenus' }, { kind: 'depense', label: 'Dépenses' }, { kind: 'epargne', label: 'Épargne' },
];

/** Ligne d'un groupe : « 4 catégories » et « 210,00 € / mois » (total des prévus par défaut). */
export function groupSummary(plannedCents: number[]): { count: string; planned: string } {
  const n = plannedCents.length;
  return {
    count: `${n} catégorie${n > 1 ? 's' : ''}`,
    planned: `${formatEuros(plannedCents.reduce((s, c) => s + c, 0))} / mois`,
  };
}

type Positioned = { id: string; kind: GroupKind; position: number };

/**
 * Monte (-1) ou descend (+1) un groupe parmi ceux de son type, puis renumérote tous les groupes 0, 1, 2…
 * Renvoie seulement les groupes dont la position change (vide si le groupe est déjà au bout).
 */
export function moveGroup(groups: Positioned[], id: string, dir: -1 | 1): { id: string; position: number }[] {
  const order = [...groups].sort((a, b) => a.position - b.position);
  const g = order.find((x) => x.id === id);
  if (!g) return [];
  const same = order.filter((x) => x.kind === g.kind);
  const neighbour = same[same.indexOf(g) + dir];
  if (!neighbour) return [];
  const i = order.indexOf(g), j = order.indexOf(neighbour);
  [order[i], order[j]] = [order[j], order[i]];
  return order.map((x, position) => ({ id: x.id, position })).filter((x) => groups.find((y) => y.id === x.id)!.position !== x.position);
}

/** Montant saisi en euros → centimes ≥ 0 ; vide = 0 ; null si illisible ou négatif. */
export function parsePlannedCents(text: string): number | null {
  if (text.trim() === '') return 0;
  const cents = parseSignedCents(text);
  return cents == null || cents < 0 ? null : cents;
}

/** Jour du mois borné à 1..28 (contrainte de la base : pas de 29, 30, 31). */
export const clampDay = (day: number) => Math.min(28, Math.max(1, Math.round(day)));
