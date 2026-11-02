// Logique pure de l'écran Réglages (sans React ni Supabase).
import { formatEuros, parseSignedCents } from './budget.ts';

/** « Le 1er du mois », « Le 5 du mois ». */
export const dayLabel = (day: number) => `Le ${day === 1 ? '1er' : day} du mois`;

/** Valeur d'une ligne de groupe : total des prévus s'il y en a, sinon le nombre de catégories. */
export function groupValue(plannedCents: number[]): string {
  const total = plannedCents.reduce((s, c) => s + c, 0);
  if (total > 0) return `${formatEuros(total)} / mois`;
  const n = plannedCents.length;
  return `${n} catégorie${n > 1 ? 's' : ''}`;
}

/** Montant saisi en euros → centimes ≥ 0 ; vide = 0 ; null si illisible ou négatif. */
export function parsePlannedCents(text: string): number | null {
  if (text.trim() === '') return 0;
  const cents = parseSignedCents(text);
  return cents == null || cents < 0 ? null : cents;
}

/** Jour du mois borné à 1..28 (contrainte de la base : pas de 29, 30, 31). */
export const clampDay = (day: number) => Math.min(28, Math.max(1, Math.round(day)));
