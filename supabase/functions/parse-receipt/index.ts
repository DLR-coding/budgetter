// Supabase Edge Function : lit une photo de ticket avec Claude et renvoie
// les lignes catégorisées. La clé API reste ici, jamais dans l'appli.
//
// Entrée  (POST JSON) : { image_base64, media_type, categories: [{ id, name, group }] }
// Sortie  (JSON)      : { merchant, date, total_cents, lines: [{ raw_label, label,
//                         quantity, unit_price_cents, category_id, confident }] }

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-sonnet-5-5';

type Cat = { id: string; name: string; group: string };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
- total_cents = le total payé imprimé sur le ticket.

Catégories disponibles :
${list}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { image_base64, media_type, categories } = await req.json();
    if (!image_base64 || !media_type || !Array.isArray(categories)) {
      return Response.json({ error: 'image_base64, media_type et categories sont requis' }, { status: 400, headers: cors });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: systemPrompt(categories),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'Voici le ticket.' },
          ],
        }],
      }),
    });

    if (!res.ok) {
      return Response.json({ error: `Claude API ${res.status}`, detail: await res.text() }, { status: 502, headers: cors });
    }
    const data = await res.json();
    const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text).join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    // Garde-fous : on ne fait pas confiance aveuglément à la sortie du modèle.
    const validIds = new Set(categories.map((c: Cat) => c.id));
    parsed.lines = (parsed.lines ?? []).map((l: Record<string, unknown>) => ({
      raw_label: String(l.raw_label ?? ''),
      label: String(l.label ?? l.raw_label ?? ''),
      quantity: Math.max(1, Math.round(Number(l.quantity) || 1)),
      unit_price_cents: Math.round(Number(l.unit_price_cents) || 0),
      category_id: validIds.has(l.category_id as string) ? l.category_id : null,
      confident: Boolean(l.confident) && validIds.has(l.category_id as string),
    }));
    const sum = parsed.lines.reduce((s: number, l: { quantity: number; unit_price_cents: number }) =>
      s + l.quantity * l.unit_price_cents, 0);
    parsed.matches_total = parsed.total_cents == null ? null : sum === parsed.total_cents;

    return Response.json(parsed, { headers: cors });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: cors });
  }
});
