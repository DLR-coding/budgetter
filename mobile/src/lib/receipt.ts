// Lecture d'un ticket par un service IA compatible OpenAI (requête, réponse, réglages) et logique
// de l'écran « Vérifier le ticket ». Sans React ni réseau : l'appel lui-même est dans receipts.ts.
import { isoDate } from './articles.ts';

/** Une ligne lue par le modèle de vision (après garde-fous de parseReceiptCompletion). */
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

/** Pastille orange « À vérifier » : pas de catégorie, ou le modèle n'était pas sûr. */
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

const validDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
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

// ── Service IA (compatible OpenAI) ───────────────────────────────────────────────────────────────

/** Réglages saisis dans Réglages › Lecture des tickets. baseUrl inclut /v1 (ex. https://api.openai.com/v1). */
export type AiSettings = { baseUrl: string; apiKey: string; model: string };

/** Valide et normalise les réglages (espaces et slash final retirés). Lève une erreur lisible sinon. */
export function validateAiSettings(s: AiSettings): AiSettings {
  const baseUrl = s.baseUrl.trim().replace(/\/+$/, '');
  const apiKey = s.apiKey.trim();
  const model = s.model.trim();
  // http refusé : la clé API circulerait en clair.
  if (!/^https:\/\/[^/\s]+/i.test(baseUrl)) throw new Error('L’URL doit commencer par https://');
  if (!apiKey) throw new Error('Renseigne la clé API.');
  if (!model) throw new Error('Renseigne le modèle.');
  return { baseUrl, apiKey, model };
}

/** Sous-titre de la ligne « Service IA » : « litellm.exemple.fr · Qwen/… » ou « Non configuré ». */
export const aiSettingsSummary = (s: AiSettings | null) =>
  s ? `${s.baseUrl.replace(/^https?:\/\//i, '').split('/')[0]} · ${s.model}` : 'Non configuré';

export type ReceiptCategory = { id: string; name: string; group: string };

function systemPrompt(categories: ReceiptCategory[]) {
  const list = categories.map((c) => `- ${c.id} : ${c.group} / ${c.name}`).join('\n');
  return `Tu lis des tickets de caisse français et tu renvoies UNIQUEMENT un objet JSON, sans texte autour ni balises Markdown.

Format :
{"merchant": string|null, "date": "AAAA-MM-JJ"|null, "total_cents": int|null,
 "lines": [{"raw_label": string, "label": string, "quantity": int, "unit_price_cents": int,
            "category_id": string|null, "confident": boolean}]}

Règles :
- Une entrée par article acheté. raw_label = le texte exact du ticket ; label = un nom lisible en français (« OEUFS PA X30 » -> « Œufs ×30 »).
- Si le ticket indique une quantité (« 2 x 0,87 »), mets quantity = 2 et unit_price_cents = 87. Sinon quantity = 1.
- Les remises et bons de réduction sont des lignes à prix négatif, rattachées à la catégorie de l'article concerné.
- Ignore les lignes de paiement, TVA, rendu monnaie, sous-totaux, points fidélité.
- category_id : choisis parmi la liste ci-dessous. Si tu hésites vraiment, mets la plus probable et confident = false. Si aucune ne convient, null et confident = false.
- merchant = le nom de l'enseigne (« Auchan »), sans adresse. date = la date d'achat imprimée.
- total_cents = le total payé imprimé sur le ticket.

Catégories disponibles :
${list}`;
}

/** Messages chat/completions : consigne + photo du ticket en data URL. */
export function buildReceiptMessages(cats: ReceiptCategory[], mediaType: string, base64: string) {
  return [
    { role: 'system', content: systemPrompt(cats) },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
        { type: 'text', text: 'Voici le ticket.' },
      ],
    },
  ];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const toInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

/** Réponse JSON de chat/completions → ticket vérifié. Lève une erreur claire si elle est inexploitable. */
export function parseReceiptCompletion(response: unknown, cats: { id: string }[]): ParsedReceipt {
  const choice = isObject(response) && Array.isArray(response.choices) && isObject(response.choices[0])
    ? response.choices[0] : undefined;
  if (choice?.finish_reason === 'length') throw new Error('Ticket trop long : réponse du modèle tronquée.');
  const content = isObject(choice?.message) ? choice.message.content : undefined;
  const raw = typeof content === 'string' ? content
    : (Array.isArray(content) ? content : []).map((b) => (isObject(b) && typeof b.text === 'string' ? b.text : '')).join('');
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, ''); // modèles qui « réfléchissent » (Qwen3.5…)

  // Le modèle doit renvoyer un objet JSON seul ; on tolère du texte ou des balises autour.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new Error('Réponse du modèle illisible (JSON invalide).');
  }
  if (!isObject(parsed)) throw new Error('Réponse du modèle illisible (objet JSON attendu).');

  // Garde-fous : on ne fait pas confiance aveuglément à la sortie du modèle.
  const validIds = new Set(cats.map((c) => c.id));
  const lines: ReceiptLine[] = (Array.isArray(parsed.lines) ? parsed.lines : []).filter(isObject).map((l) => {
    const known = typeof l.category_id === 'string' && validIds.has(l.category_id);
    return {
      raw_label: String(l.raw_label ?? ''),
      label: String(l.label ?? l.raw_label ?? ''),
      quantity: Math.max(1, toInt(l.quantity) ?? 1),
      unit_price_cents: toInt(l.unit_price_cents) ?? 0,
      category_id: known ? l.category_id as string : null,
      confident: known && l.confident === true,
    };
  });
  const total_cents = toInt(parsed.total_cents);
  const merchant = typeof parsed.merchant === 'string' && parsed.merchant.trim() ? parsed.merchant.trim().slice(0, 80) : null;
  return {
    merchant,
    date: validDate(parsed.date) ? parsed.date : null,
    total_cents,
    matches_total: matchesTotal({ total_cents, lines }),
    lines,
  };
}
