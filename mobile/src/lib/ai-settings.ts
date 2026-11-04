// Réglages du service IA de lecture des tickets : stockés chiffrés sur le téléphone (expo-secure-store,
// Android Keystore), jamais en base ni dans le code.
import * as SecureStore from 'expo-secure-store';
import { validateAiSettings, type AiSettings } from './receipt';

const KEY = 'ai_settings';

/** Réglages enregistrés, ou null s'ils manquent (ou sont devenus invalides). */
export async function loadAiSettings(): Promise<AiSettings | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return validateAiSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Valide (erreur lisible sinon), enregistre et renvoie les réglages normalisés. */
export async function saveAiSettings(s: AiSettings): Promise<AiSettings> {
  const valid = validateAiSettings(s);
  await SecureStore.setItemAsync(KEY, JSON.stringify(valid));
  return valid;
}

export const clearAiSettings = () => SecureStore.deleteItemAsync(KEY);
