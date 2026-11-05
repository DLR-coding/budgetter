// Ticket de caisse : photo, envoi dans le stockage privé 'receipts', lecture par appel direct du téléphone
// à un service IA compatible OpenAI (réglé dans Réglages › Lecture des tickets).
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { loadAiSettings } from './ai-settings';
import type { CategoryRow, GroupRow } from './data';
import { buildReceiptMessages, parseReceiptCompletion, type AiSettings, type ParsedReceipt, type ReceiptKind } from './receipt';
import { supabase } from './supabase';

const MAX_SIDE = 1568; // assez pour lire un ticket, image légère à envoyer
const INVOICE_SIDE = 2200; // une page A4 : petits caractères, il faut plus de pixels

export type ReceiptPhoto = { uri: string; base64: string };
/** Appareil photo, image de la galerie (ticket), ou facture (PDF ou image) choisie dans les fichiers. */
export type ReceiptSource = 'camera' | 'library' | 'invoice';

/** Ouvre l'appareil photo, la galerie ou les fichiers. null si l'utilisateur annule ; erreur si l'appareil photo est refusé. */
export async function takeReceiptPhoto(source: ReceiptSource = 'camera'): Promise<ReceiptPhoto | null> {
  if (source === 'invoice') return pickInvoice();
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('L’accès à l’appareil photo est refusé. Autorise-le dans les réglages d’Android.');
  }
  // La galerie passe par le sélecteur de photos d'Android : pas de permission à demander.
  const shot = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (shot.canceled || !shot.assets?.[0]) return null;
  const { uri, width, height } = shot.assets[0];
  return toJpeg(uri, width, height, MAX_SIDE);
}

/** Facture choisie dans les fichiers : un PDF devient l'image de sa première page (lisible par tout modèle de vision). */
async function pickInvoice(): Promise<ReceiptPhoto | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  const file = res.canceled ? null : res.assets?.[0];
  if (!file) return null;
  if (file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    // shortcut: première page seulement (montant et date y sont), envoyer les suivantes si une facture le demande.
    try {
      // Import à la demande : module natif absent d'Expo Go, le reste de l'écran doit y fonctionner.
      const { default: PdfThumbnail } = await import('react-native-pdf-thumbnail');
      const page = await PdfThumbnail.generate(file.uri, 0, { maxWidth: INVOICE_SIDE, maxHeight: INVOICE_SIDE, quality: 90 });
      return toJpeg(page.uri, page.width, page.height, INVOICE_SIDE);
    } catch {
      throw new Error('Impossible de lire ce PDF (protégé par mot de passe ou abîmé ?). Essaie avec une capture d’écran.');
    }
  }
  const image = await ImageManipulator.manipulate(file.uri).renderAsync();
  return toJpeg(file.uri, image.width, image.height, INVOICE_SIDE);
}

/** JPEG réduit (côté max `maxSide`) en base64, prêt à envoyer. */
async function toJpeg(uri: string, width: number, height: number, maxSide: number): Promise<ReceiptPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > maxSide) {
    ctx.resize(width >= height ? { width: maxSide, height: null } : { width: null, height: maxSide });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!out.base64) throw new Error('Impossible de préparer l’image.');
  return { uri: out.uri, base64: out.base64 };
}

/** Envoie la photo (JPEG en base64) dans 'receipts/<uid>/<horodatage>.jpg' et renvoie le chemin. */
export async function uploadReceipt(base64: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Session expirée : reconnecte-toi.');
  const path = `${user.id}/${Date.now()}.jpg`;
  const body = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
  const { error } = await supabase.storage.from('receipts').upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
  return path;
}

export async function removeReceipt(path: string) {
  const { error } = await supabase.storage.from('receipts').remove([path]);
  if (error) throw error;
}

export const MISSING_AI_SETTINGS = 'Configure la lecture des tickets dans Réglages.';

/** Lit le ticket avec le modèle de vision du service IA réglé. Seules les catégories de dépense sont proposées. */
export async function parseReceipt(base64: string, groups: GroupRow[], cats: CategoryRow[], kind: ReceiptKind = 'ticket'): Promise<ParsedReceipt> {
  const ai = await loadAiSettings();
  if (!ai) throw new Error(MISSING_AI_SETTINGS);
  const groupName = new Map(groups.filter((g) => g.kind === 'depense').map((g) => [g.id, g.name]));
  const categories = cats.filter((c) => groupName.has(c.group_id))
    .map((c) => ({ id: c.id, name: c.name, group: groupName.get(c.group_id)! }));

  const res = await call(ai, '/chat/completions', 120_000, {
    method: 'POST',
    body: JSON.stringify({
      model: ai.model,
      temperature: 0,
      max_tokens: 8000, // large : un modèle qui « réfléchit » consomme des jetons avant le JSON
      messages: buildReceiptMessages(categories, 'image/jpeg', base64, kind),
    }),
  });
  const json: unknown = await res.json().catch(() => {
    throw new Error('Réponse du service IA illisible (JSON invalide).');
  });
  return parseReceiptCompletion(json, categories);
}

/** Vérifie l'URL et la clé (GET /models) et, si la liste le permet, la présence du modèle. */
export async function testAiSettings(s: AiSettings): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await call(s, '/models', 20_000, { method: 'GET' });
    const body: { data?: { id?: unknown }[] } = await res.json().catch(() => ({}));
    if (!Array.isArray(body.data)) return { ok: true, message: 'Connexion réussie.' };
    const n = body.data.length;
    return body.data.some((m) => m?.id === s.model)
      ? { ok: true, message: `Connexion réussie, modèle « ${s.model} » disponible.` }
      : { ok: false, message: `Connexion réussie, mais le modèle « ${s.model} » n’est pas dans la liste du service (${n} modèle${n > 1 ? 's' : ''}).` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Appel au service IA avec délai maximal ; toute erreur devient un message en français. */
async function call(ai: AiSettings, path: string, timeoutMs: number, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${ai.baseUrl}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.apiKey}` },
    });
  } catch {
    throw new Error(ctrl.signal.aborted
      ? `Le service IA n’a pas répondu à temps (${timeoutMs / 1000} s). Réessaie.`
      : 'Service IA injoignable : vérifie ta connexion et l’URL (ou le VPN, si le service est sur un réseau privé).');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) throw new Error('Clé API refusée par le service IA : vérifie-la dans Réglages.');
  if (res.status === 404) throw new Error('URL ou modèle introuvable (404) : vérifie-les dans Réglages (l’URL se termine en général par /v1).');
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  throw new Error(`Le service IA a répondu ${res.status}${detail ? ` : ${detail}` : ''}`);
}
