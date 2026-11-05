// Vibrations de l'appli, réglées en un seul endroit. Jamais bloquantes : une erreur est ignorée.
import * as Haptics from 'expo-haptics';

const quiet = (p: Promise<void>) => { p.catch(() => {}); };

export const haptics = {
  /** Touche, interrupteur, changement de mois, choix d'une catégorie. */
  tap: () => quiet(Haptics.selectionAsync()),
  /** Enregistrement réussi. */
  success: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Suppression, retrait, erreur d'enregistrement. */
  warning: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
