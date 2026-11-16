// Réglages du verre liquide de la navbar (écran app/(tabs)/verre.tsx). Logique pure : les
// paramètres, leurs bornes (curseurs de webgl-apple-liquid-glass quand ils existent) et le
// nettoyage de ce qui est relu du stockage.

export type GlassSettings = {
  // Transmission (matériau V2 de la référence)
  refraction: number;
  refractionHeld: number;
  edgeReach: number;
  edgeWidth: number;
  dispersion: number;
  // Matière
  body: number;
  absorption: number;
  barTint: number;
  lensTint: number;
  fabTint: number;
  // Lumière
  rim: number;
  reflection: number;
  highlight: number;
  lightAngle: number;
  echo: number;
  hairline: number;
  hairWidth: number;
  // Bulle tenue
  heldHeight: number;
  heldRatio: number;
  squash: number;
  squashLength: number;
  squashHeight: number;
  // Mouvement
  snapStiffness: number;
  snapDamping: number;
  lagStiffness: number;
  lagDamping: number;
  edgeGive: number;
};

export type GlassKey = keyof GlassSettings;
export type GlassParam = { key: GlassKey; label: string; min: number; max: number; step: number };

export const DEFAULT_GLASS: GlassSettings = {
  refraction: 84,
  refractionHeld: 17,
  edgeReach: 0.14,
  edgeWidth: 0.21,
  dispersion: 2,
  body: 0.72,
  absorption: 0.58,
  barTint: 0.35,
  lensTint: 0.16,
  fabTint: 0.75,
  rim: 0.24,
  reflection: 0.31,
  highlight: 0.34,
  lightAngle: 136,
  echo: 0.28,
  hairline: 0.92,
  hairWidth: 0.52,
  heldHeight: 1.125,
  heldRatio: 1.35,
  squash: 0.85,
  squashLength: 0,
  squashHeight: 0.24,
  snapStiffness: 320,
  snapDamping: 22,
  lagStiffness: 200,
  lagDamping: 20,
  edgeGive: 6,
};

export const GLASS_SECTIONS: { title: string; params: GlassParam[] }[] = [
  {
    title: 'Transmission',
    params: [
      { key: 'refraction', label: 'Réfraction', min: 0, max: 110, step: 1 },
      { key: 'refractionHeld', label: 'Réfraction (bulle tenue)', min: 0, max: 110, step: 1 },
      { key: 'edgeReach', label: 'Portée de la capture de bord', min: 0, max: 1.6, step: 0.01 },
      { key: 'edgeWidth', label: 'Largeur de la capture de bord', min: 0, max: 0.55, step: 0.01 },
      { key: 'dispersion', label: 'Dispersion (franges colorées)', min: 0, max: 7, step: 0.1 },
    ],
  },
  {
    title: 'Matière',
    params: [
      { key: 'body', label: 'Corps', min: 0, max: 1.5, step: 0.01 },
      { key: 'absorption', label: 'Absorption', min: 0, max: 2, step: 0.01 },
      { key: 'barTint', label: 'Voile sombre de la barre', min: 0, max: 1, step: 0.01 },
      { key: 'lensTint', label: 'Voile clair de la bulle', min: 0, max: 1, step: 0.01 },
      { key: 'fabTint', label: 'Teinte bleue du « + »', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Lumière',
    params: [
      { key: 'rim', label: 'Reflet de bord', min: 0, max: 1, step: 0.01 },
      { key: 'reflection', label: 'Réflexion', min: 0, max: 1.5, step: 0.01 },
      { key: 'highlight', label: 'Reflet principal', min: 0, max: 1.5, step: 0.01 },
      { key: 'lightAngle', label: 'Angle de la lumière (°)', min: -180, max: 180, step: 1 },
      { key: 'echo', label: 'Écho', min: 0, max: 1.5, step: 0.01 },
      { key: 'hairline', label: 'Liseré', min: 0, max: 1.5, step: 0.01 },
      { key: 'hairWidth', label: 'Épaisseur du liseré', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Bulle tenue',
    params: [
      { key: 'heldHeight', label: 'Hauteur (× barre)', min: 1, max: 1.5, step: 0.005 },
      { key: 'heldRatio', label: 'Largeur min. (× hauteur)', min: 1, max: 2.2, step: 0.01 },
      { key: 'squash', label: 'Écrasement', min: 0, max: 0.95, step: 0.01 },
      { key: 'squashLength', label: 'Écrasement retenu en longueur', min: 0, max: 1, step: 0.01 },
      { key: 'squashHeight', label: 'Écrasement retenu en hauteur', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Mouvement',
    params: [
      { key: 'snapStiffness', label: 'Raideur', min: 50, max: 900, step: 10 },
      { key: 'snapDamping', label: 'Amortissement (moins = plus de rebond)', min: 4, max: 70, step: 1 },
      { key: 'lagStiffness', label: 'Raideur de la traîne', min: 50, max: 900, step: 10 },
      { key: 'lagDamping', label: 'Amortissement de la traîne', min: 4, max: 70, step: 1 },
      { key: 'edgeGive', label: 'Élastique aux bords (dp)', min: 0, max: 20, step: 1 },
    ],
  },
];

const PARAMS = new Map(GLASS_SECTIONS.flatMap((s) => s.params).map((p) => [p.key, p]));

// Valeur ramenée dans les bornes du paramètre et sur son pas.
export function clampParam(key: GlassKey, value: number): number {
  const p = PARAMS.get(key);
  if (!p || !Number.isFinite(value)) return DEFAULT_GLASS[key];
  const stepped = Math.round((value - p.min) / p.step) * p.step + p.min;
  return Number(Math.min(p.max, Math.max(p.min, stepped)).toFixed(4));
}

// Réglages relus du stockage (JSON d'une version précédente, abîmé ou absent) : les clés
// connues sont bornées, les autres ignorées, les manquantes prennent leur valeur par défaut.
export function sanitizeGlass(raw: unknown): GlassSettings {
  const out = { ...DEFAULT_GLASS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(DEFAULT_GLASS) as GlassKey[]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'number') out[key] = clampParam(key, v);
  }
  return out;
}

export function parseGlass(json: string | null): GlassSettings {
  if (!json) return { ...DEFAULT_GLASS };
  try {
    return sanitizeGlass(JSON.parse(json));
  } catch {
    return { ...DEFAULT_GLASS };
  }
}
