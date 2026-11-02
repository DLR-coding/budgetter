// Logique de l'écran « plusieurs articles » : prix saisi, sous-totaux, date affichée.

export type Article = { quantity: number; unitPriceCents: number; categoryId: string };

/** « 2,65 », « 2.65 », « 3 € » → centimes. null si invalide (2 décimales max, pas de négatif). */
export function parsePriceCents(input: string): number | null {
  const s = input.replace(/€|\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Total par catégorie, dans l'ordre de première apparition. */
export function subtotalsByCategory(articles: Article[]): { categoryId: string; cents: number }[] {
  const m = new Map<string, number>();
  for (const a of articles) m.set(a.categoryId, (m.get(a.categoryId) ?? 0) + a.quantity * a.unitPriceCents);
  return [...m].map(([categoryId, cents]) => ({ categoryId, cents }));
}

/** Date locale au format AAAA-MM-JJ. */
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** « Aujourd’hui », « Hier » ou « lun. 3 nov. ». */
export function dayLabel(iso: string, today = new Date()): string {
  if (iso === isoDate(today)) return 'Aujourd’hui';
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (iso === isoDate(y)) return 'Hier';
  const [yy, mm, dd] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(yy, mm - 1, dd));
}
