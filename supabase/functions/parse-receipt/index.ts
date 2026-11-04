// Supabase Edge Function : lit une photo de ticket avec un modèle de vision servi par LiteLLM
// (API compatible OpenAI) et renvoie les lignes catégorisées. La clé API reste ici, jamais dans l'appli.
// Appelée uniquement par l'appli mobile (pas de CORS) ; le JWT Supabase est vérifié par défaut.
//
// Entrée  (POST JSON) : { image_base64, media_type, categories: [{ id, name, group }] }
// Sortie  (JSON)      : { merchant, date, total_cents, matches_total, lines: [{ raw_label, label,
//                         quantity, unit_price_cents, category_id, confident }] }
// Erreurs (JSON)      : { error } avec 400 (requête), 413 (image trop lourde), 500 (configuration), 502 (modèle).

// Secrets Supabase : LLM_BASE_URL (ex. https://litellm.exemple.fr, sans /v1), LLM_API_KEY, LLM_MODEL.
const LLM_BASE_URL = Deno.env.get('LLM_BASE_URL')?.replace(/\/+$/, '').replace(/\/v1$/, '');
const LLM_API_KEY = Deno.env.get('LLM_API_KEY');
const MODEL = Deno.env.get('LLM_MODEL') ?? 'Qwen/Qwen3.5-35B-A3B';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // garde-fou : l'appli envoie ~1568 px en JPEG, bien en dessous
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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const toInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

// Toute erreur imprévue devient une réponse JSON 500 lisible par l'appli.
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    return fail(500, 'Erreur interne de lecture du ticket', (e as Error)?.message);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'POST attendu');
  if (!LLM_BASE_URL || !LLM_API_KEY) return fail(500, 'Secrets LLM_BASE_URL et LLM_API_KEY requis');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Corps JSON invalide');
  }
  if (!isObject(body)) return fail(400, 'Corps JSON invalide : objet attendu');
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
    res = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000, // large : un modèle qui « réfléchit » consomme des jetons avant le JSON
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt(cats) },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${media_type};base64,${image_base64}` } },
              { type: 'text', text: 'Voici le ticket.' },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    return fail(502, 'Serveur LiteLLM injoignable', (e as Error).message);
  }
  if (!res.ok) return fail(502, `LiteLLM ${res.status}`, (await res.text()).slice(0, 500));

  let data: { choices?: { finish_reason?: string; message?: { content?: unknown } }[] };
  try {
    data = await res.json();
  } catch {
    return fail(502, 'Réponse de LiteLLM illisible (JSON invalide)');
  }
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') return fail(502, 'Ticket trop long : réponse du modèle tronquée');
  const content = choice?.message?.content;
  const raw = typeof content === 'string' ? content
    : (Array.isArray(content) ? content : []).map((b: { text?: string }) => b?.text ?? '').join('');
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, ''); // modèles qui « réfléchissent » (Qwen3.5…)

  // Le modèle doit renvoyer un objet JSON seul ; on tolère du texte ou des balises autour.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    return fail(502, 'Réponse du modèle illisible (JSON invalide)', text.slice(0, 500));
  }
  if (!isObject(parsed)) return fail(502, 'Réponse du modèle illisible (objet JSON attendu)', text.slice(0, 500));

  // Garde-fous : on ne fait pas confiance aveuglément à la sortie du modèle.
  const validIds = new Set(cats.map((c) => c.id));
  const lines = (Array.isArray(parsed.lines) ? parsed.lines : []).filter(isObject).map((l) => {
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
}
