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

// Verre liquide (src/components/LiquidGlass.tsx), style de la navbar « Press » de
// webgl-apple-liquid-glass : barre en verre clair laiteux, pouce gris dépoli, encre sombre.
export const glass = {
  fill: 'rgba(214,215,219,0.92)',  // repli de la barre tant que le verre n'est pas affiché
  barTone: '#F9F7F4',              // ton « light » de la référence (0.975, 0.970, 0.955)
  barTint: 0.86,                   // réglage « tint » de la barre dans la référence (0 à 1,5)
  fabTint: 0.75,                   // bouton « + » : opacité de la teinte colors.accent
  ink: 'rgba(22,25,31,0.88)',      // icônes et libellés sur le verre clair
  inkGlow: 'rgba(255,255,255,0.65)',
};

export const radius = { card: 22, pill: 999, key: 18 };
export const space = { screen: 20, gap: 10 };

export const font = {
  // Inter, chargée dans app/_layout.tsx
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};
