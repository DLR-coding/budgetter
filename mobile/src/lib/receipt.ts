// Logique de l'écran « Vérifier le ticket » : sortie de la fonction parse-receipt → lignes à enregistrer.
import { isoDate } from './articles.ts';

/** Une ligne lue par Claude (format renvoyé par supabase/functions/parse-receipt). */
export type ReceiptLine = {
  raw_label: string;
  label: string;
  quantity: number;
  unit_price_cents: number;
  category_id: string | null;
  confident: boolean;
};

export type ParsedReceipt = {
  merchant: string | null;
  date: string | null;          // AAAA-MM-JJ
  total_cents: number | null;
  lines: ReceiptLine[];
  matches_total: boolean | null;
};

/** Pastille orange « À vérifier » : pas de catégorie, ou Claude n'était pas sûr. */
export const needsReview = (l: ReceiptLine) => l.category_id == null || !l.confident;

export const lineCents = (l: ReceiptLine) => l.quantity * l.unit_price_cents;

export const linesTotal = (lines: ReceiptLine[]) => lines.reduce((s, l) => s + lineCents(l), 0);

/** Enregistrable : au moins une ligne, et chaque ligne a une catégorie. */
export const canSave = (lines: ReceiptLine[]) => lines.length > 0 && lines.every((l) => l.category_id != null);

/** La somme des lignes (après corrections) correspond-elle au total imprimé ? null si total inconnu. */
export const matchesTotal = (r: { total_cents: number | null; lines: ReceiptLine[] }) =>
  r.total_cents == null ? null : linesTotal(r.lines) === r.total_cents;

/** Choix d'une catégorie par l'utilisateur : la ligne devient confirmée. */
export const setLineCategory = (lines: ReceiptLine[], index: number, categoryId: string): ReceiptLine[] =>
  lines.map((l, i) => (i === index ? { ...l, category_id: categoryId, confident: true } : l));

export const removeLine = (lines: ReceiptLine[], index: number): ReceiptLine[] => lines.filter((_, i) => i !== index);

/** Lignes au format de saveEntry. Lève une erreur si une ligne n'a pas de catégorie. */
export function toSaveLines(lines: ReceiptLine[]) {
  return lines.map((l) => {
    if (l.category_id == null) throw new Error(`Catégorie manquante : ${l.label || l.raw_label}`);
    return {
      quantity: l.quantity, unitPriceCents: l.unit_price_cents, categoryId: l.category_id,
      label: l.label || l.raw_label, rawLabel: l.raw_label || undefined,
    };
  });
}

const validDate = (s: string | null): s is string => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Date de la saisie : celle du ticket si elle est valide, sinon aujourd'hui (date locale). */
export const receiptDate = (date: string | null, today = new Date()) => (validDate(date) ? date : isoDate(today));

const SHORT_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 12 nov. 2026 · 7 articles détectés » (sans date si le ticket n'en a pas de lisible). */
export function receiptSubtitle(date: string | null, count: number) {
  const articles = `${count} article${count > 1 ? 's' : ''} détecté${count > 1 ? 's' : ''}`;
  if (!validDate(date)) return articles;
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${y} · ${articles}`;
}
