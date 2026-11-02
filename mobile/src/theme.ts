// Jetons de design repris des maquettes (Claude Design).
// Neutres noirs d'origine, accent bleu nuit profond,
// revenus en vert calme, alertes en orange.
export const colors = {
  bg: '#0B0C0E',
  surface: '#16181B',
  surface2: '#1F2226',
  border: '#26292E',
  borderStrong: '#2C3035',
  divider: '#222529',
  text: '#F4F5F6',
  textSoft: '#C9CDD2',
  textMuted: '#9BA1A8',
  textFaint: '#7A8088',

  accent: '#2F52AE',      // bleu nuit : boutons, « + », barres de progression
  accentInk: '#F4F5F6',   // texte posé sur l'accent
  accentText: '#6F8FDB',  // liens, icônes et textes accent sur fond sombre
  accentTint: '#1A2A44',  // fonds teintés (puces de catégorie, bandeaux)

  income: '#8CCBA5',      // revenus : vert calme
  incomeBg: '#1A2E25',
  info: '#6F8FDB',        // options, confirmations
  infoBg: '#1A2A44',
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
