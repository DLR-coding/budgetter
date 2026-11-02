// Supabase Edge Function : lit une photo de ticket avec Claude et renvoie
// les lignes catégorisées. La clé API reste ici, jamais dans l'appli.
// Appelée uniquement par l'appli mobile (pas de CORS) ; le JWT Supabase est vérifié par défaut.
//
// Entrée  (POST JSON) : { image_base64, media_type, categories: [{ id, name, group }] }
// Sortie  (JSON)      : { merchant, date, total_cents, matches_total, lines: [{ raw_label, label,
//                         quantity, unit_price_cents, category_id, confident }] }
// Erreurs (JSON)      : { error } avec 400 (requête), 413 (image trop lourde), 500 (configuration), 502 (Claude).

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-sonnet-5-5';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // limite de l'API Claude par image
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Cat = { id: string; name: string; group: string };

const fail = (status: number, error: string, detail?: string) => Response.json({ error, detail }, { status });

function systemPrompt(categories: Cat[]) {
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

const isDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejette 2026-02-30
};

const toInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'POST attendu');
  if (!ANTHROPIC_API_KEY) return fail(500, 'Secret ANTHROPIC_API_KEY manquant');

  let body: { image_base64?: unknown; media_type?: unknown; categories?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Corps JSON invalide');
  }
  const { image_base64, media_type, categories } = body;
  if (typeof image_base64 !== 'string' || !image_base64 || typeof media_type !== 'string' || !Array.isArray(categories)) {
    return fail(400, 'image_base64, media_type et categories sont requis');
  }
  if (!MEDIA_TYPES.has(media_type)) return fail(400, `media_type non pris en charge : ${media_type}`);
  if (Math.floor(image_base64.length * 3 / 4) > MAX_IMAGE_BYTES) return fail(413, 'Image trop lourde (5 Mo maximum)');
  const cats: Cat[] = categories
    .filter((c): c is Cat => typeof c?.id === 'string' && typeof c?.name === 'string')
    .map((c) => ({ id: c.id, name: c.name, group: String(c.group ?? '') }));

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: systemPrompt(cats),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'Voici le ticket.' },
          ],
        }],
      }),
    });
  } catch (e) {
    return fail(502, 'API Claude injoignable', (e as Error).message);
  }
  if (!res.ok) return fail(502, `API Claude ${res.status}`, await res.text());

  const data = await res.json();
  if (data.stop_reason === 'max_tokens') return fail(502, 'Ticket trop long : réponse de Claude tronquée');
  const text: string = (data.content ?? []).filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text).join('');

  // Le modèle doit renvoyer un objet JSON seul ; on tolère du texte ou des balises autour.
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    return fail(502, 'Réponse de Claude illisible (JSON invalide)', text.slice(0, 500));
  }

  // Garde-fous : on ne fait pas confiance aveuglément à la sortie du modèle.
  const validIds = new Set(cats.map((c) => c.id));
  const lines = (Array.isArray(parsed.lines) ? parsed.lines : []).map((l: Record<string, unknown>) => {
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
  const sum = lines.reduce((s, l) => s + l.quantity * l.unit_price_cents, 0);
  const total_cents = toInt(parsed.total_cents);
  const merchant = typeof parsed.merchant === 'string' && parsed.merchant.trim() ? parsed.merchant.trim().slice(0, 80) : null;

  return Response.json({
    merchant,
    date: isDate(parsed.date) ? parsed.date : null,
    total_cents,
    matches_total: total_cents == null ? null : sum === total_cents,
    lines,
  });
});
