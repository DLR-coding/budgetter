// Jetons de design repris des maquettes (Claude Design).
// Palette « bleu calme » : fonds bleu nuit, accent bleu doux, vert calme pour les revenus.
export const colors = {
  bg: '#0A0F18',
  surface: '#131A26',
  surface2: '#1A2331',
  surfaceSunken: '#0F1520',
  border: '#222C3B',
  borderStrong: '#283447',
  divider: '#1D2633',
  text: '#F2F5F9',
  textSoft: '#C8D0DB',
  textMuted: '#98A3B3',
  textFaint: '#7A8699',
  accent: '#7DB0F5',      // actions principales, progression dans le budget
  accentBg: '#1A2A44',    // fond teinté de l'accent (puces de catégorie)
  accentInk: '#0A0F18',   // texte posé sur l'accent
  positive: '#8CCBA5',    // revenus, confirmations
  positiveBg: '#1A2E25',
  warn: '#FF9E57',        // dépassements, lignes à vérifier
  warnBg: '#2E2216',
};

export const radius = { card: 22, pill: 999, key: 18 };
export const space = { screen: 20, gap: 10 };

export const font = {
  // Inter, chargée dans app/_layout.tsx
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};
