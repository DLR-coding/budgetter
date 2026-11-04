// Ticket de caisse : photo, envoi dans le stockage privé 'receipts', lecture par l'Edge Function parse-receipt.
import { FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { CategoryRow, GroupRow } from './data';
import type { ParsedReceipt } from './receipt';
import { supabase } from './supabase';

const MAX_SIDE = 1568; // assez pour lire un ticket, image légère à envoyer

export type ReceiptPhoto = { uri: string; base64: string };

/** Ouvre l'appareil photo. null si l'utilisateur annule ; erreur si la permission est refusée. */
export async function takeReceiptPhoto(): Promise<ReceiptPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('L’accès à l’appareil photo est refusé. Autorise-le dans les réglages d’Android.');

  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (shot.canceled || !shot.assets?.[0]) return null;
  const { uri, width, height } = shot.assets[0];

  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SIDE) {
    ctx.resize(width >= height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!out.base64) throw new Error('Impossible de préparer la photo du ticket.');
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

/** Lit le ticket avec le modèle de vision (Edge Function, LiteLLM). Seules les catégories de dépense sont proposées. */
export async function parseReceipt(base64: string, groups: GroupRow[], cats: CategoryRow[]): Promise<ParsedReceipt> {
  const groupName = new Map(groups.filter((g) => g.kind === 'depense').map((g) => [g.id, g.name]));
  const categories = cats.filter((c) => groupName.has(c.group_id))
    .map((c) => ({ id: c.id, name: c.name, group: groupName.get(c.group_id)! }));

  const { data, error } = await supabase.functions.invoke<ParsedReceipt>('parse-receipt', {
    body: { image_base64: base64, media_type: 'image/jpeg', categories },
  });
  if (error) throw new Error(await explain(error));
  if (!data || !Array.isArray(data.lines)) throw new Error('Réponse illisible de la fonction parse-receipt.');
  return data;
}

async function explain(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const msg = await res.json().then((b: { error?: string }) => b.error ?? '', () => '');
    if (res.status === 404) return 'La fonction parse-receipt n’est pas déployée sur Supabase.';
    if (msg.includes('LLM_')) return 'Les secrets LLM_BASE_URL / LLM_API_KEY ne sont pas configurés côté Supabase.';
    return `Lecture du ticket impossible (${res.status})${msg ? ` : ${msg}` : ''}.`;
  }
  if (error instanceof FunctionsRelayError) return 'La fonction parse-receipt est injoignable (pas déployée ?).';
  return 'Pas de connexion au serveur : vérifie ta connexion et réessaie.';
}
