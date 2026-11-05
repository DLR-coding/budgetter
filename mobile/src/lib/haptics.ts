// Vibrations de l'appli, réglées en un seul endroit. Jamais bloquantes : une erreur est ignorée.
// Android : retours haptiques natifs du système (nets, comme le clavier). Les vibrations simulées
// d'expo-haptics y sont trop faibles (amplitude 50/255 pour « succès ») : on ne les sentait pas.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const quiet = (p: Promise<void>) => { p.catch(() => {}); };
const android = (type: Haptics.AndroidHaptics) => () => quiet(Haptics.performAndroidHapticsAsync(type));
const ios = Platform.OS === 'ios';

export const haptics = {
  /** Bouton, ligne, onglet. */
  press: ios ? () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)) : android(Haptics.AndroidHaptics.Virtual_Key),
  /** Touche du pavé, choix d'une catégorie, changement de mois, seuil du glissement franchi. */
  tap: ios ? () => quiet(Haptics.selectionAsync()) : android(Haptics.AndroidHaptics.Segment_Tick),
  /** Interrupteur. */
  toggle: (on: boolean) => (ios
    ? quiet(Haptics.selectionAsync())
    : android(on ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off)()),
  /** Enregistrement réussi (saisie, ticket, réglage). */
  success: ios ? () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)) : android(Haptics.AndroidHaptics.Confirm),
  /** Suppression, retrait, erreur d'enregistrement. */
  warning: ios ? () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)) : android(Haptics.AndroidHaptics.Reject),
};
