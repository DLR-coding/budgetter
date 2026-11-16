import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeMutable } from 'react-native-reanimated';
import { Skia } from 'react-native-skia';
import { DEFAULT_GLASS, type GlassSettings, parseGlass } from '../lib/glass-settings';

// Verre liquide : transposition en SkSL du modèle optique « V2 » de
// webgl-apple-liquid-glass (Oliver Nemo, licence MIT,
// https://github.com/Oliverrr2424/webgl-apple-liquid-glass, src/v2-shaders.js).
// Le shader lit `backdrop`, la capture de l'écran derrière la barre, et dessine trois
// surfaces : la barre (pilule), la lentille de l'onglet actif (deux pilules fusionnées
// par smooth min, comme dans la vidéo de W. Candillon) et le bouton « + » (cercle).
// Coordonnées en dp ; pd ne sert qu'aux largeurs d'anticrénelage et du liseré.
// Écarts avec l'original : pas de mipmaps (flous approchés par 5 lectures), pas de
// conversion sRGB, un seul jeu de formes fixe. L'appui (lentille tenue, bouton qui gonfle)
// reprend playground/main.js et src/controls.js de la même référence.

const GLASS_SKSL = `
uniform shader backdrop;
uniform float pd;
uniform float2 barC;
uniform float2 barH;
uniform float2 lead;
uniform float2 trail;
uniform float2 lensH;
uniform float2 fabC;
uniform float fabR;
uniform float2 lightDir;
uniform float4 barTint;   // rgb + opacité de teinte
uniform float4 lensTint;
uniform float4 fabTint;
uniform float lensPress;  // 0 au repos, 1 lentille tenue (appui sur un onglet)

// Matériau V2 (DEFAULT_MATERIAL_V2 par défaut), réglable dans l'écran « Verre liquide »
// (src/lib/glass-settings.ts). La bulle tenue a sa propre réfraction (référence : 17) et pas de
// dispersion ; mSquash < 1 pour ne pas replier l'image, mSquashAxes = 1 - retenue par axe.
uniform float mRefraction;
uniform float mRefractionHeld;
uniform float mDispersion;
uniform float mEdgeReach;
uniform float mEdgeWidth;
uniform float mSquash;
uniform float2 mSquashAxes;
uniform float mBody;
uniform float mAbsorption;
uniform float mRim;
uniform float mReflection;
uniform float mHighlight;
uniform float mEcho;
uniform float mHairline;
uniform float mHairWidth;

float sdRoundBox(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
float softMax(float a, float b, float k) {
  return 0.5 * (a + b + sqrt((a - b) * (a - b) + k * k)) - k * 0.5;
}
float sdRoundBoxSoft(float2 p, float2 b, float r, float k) {
  float2 q = abs(p) - b + r;
  return min(softMax(q.x, q.y, k), 0.0) + length(max(q, 0.0)) - r;
}
float smoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}
float pill(float2 p, float2 h) { return sdRoundBox(p, h, min(h.x, h.y)); }
float pillSoft(float2 p, float2 h) {
  float m = min(h.x, h.y);
  return sdRoundBoxSoft(p, h, m, clamp(m * 0.08, 1.5, 12.0));
}

// Goutte : tête et traîne fusionnées. Le smooth min de deux formes superposées les gonfle de
// k/4 ; on le retire là où elles se recouvrent, pour qu'au repos la bulle ait sa vraie taille.
float goutte(float a, float b) {
  return smoothUnion(a, b, 14.0) + 3.5 * pow(1.0 - min(abs(a - b) / 14.0, 1.0), 2.0);
}

// 0 = barre, 1 = lentille, 2 = bouton.
float shapeSdf(int s, float2 p) {
  if (s == 0) return pill(p - barC, barH);
  if (s == 1) return goutte(pill(p - lead, lensH), pill(p - trail, lensH));
  return length(p - fabC) - fabR;
}
// Champ à arête adoucie, pour les normales uniquement.
float shapeField(int s, float2 p) {
  if (s == 0) return pillSoft(p - barC, barH);
  if (s == 1) return goutte(pillSoft(p - lead, lensH), pillSoft(p - trail, lensH));
  return length(p - fabC) - fabR;
}
float2 shapeCenter(int s) {
  if (s == 0) return barC;
  if (s == 1) return (lead + trail) * 0.5;
  return fabC;
}
float2 shapeHalf(int s) {
  if (s == 0) return barH;
  if (s == 1) return lensH + float2(abs(lead.x - trail.x) * 0.5, 0.0);
  return float2(fabR);
}
float2 opticalNormal(int s, float2 point, float2 sdfNormal) {
  if (s == 0) {
    float2 p = point - barC;
    float seg = max(barH.x - barH.y, 0.0);
    return normalize(p - float2(clamp(p.x, -seg, seg), 0.0) + sdfNormal * 0.0001);
  }
  if (s == 2) return normalize(point - fabC + sdfNormal * 0.0001);
  return sdfNormal;
}
float4 shapeTint(int s) {
  if (s == 0) return barTint;
  if (s == 1) return lensTint;
  return fabTint;
}

float3 sharp(float2 p) { return backdrop.eval(p).rgb; }
// Flou doux de la référence (5 lectures sur mipmap) réduit à une lecture : chaque lecture de
// l'image ajoute du code au pipeline GPU, dont la compilation retardait l'affichage du verre de
// plusieurs secondes au démarrage. Ces flous ne touchent que de fines bandes du bord.
float3 softBackdrop(float2 p, float radius) { return sharp(p); }
float luminance(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }

float3 interfaceColor(float2 point, float2 normal) {
  float3 outsideColor = softBackdrop(point + normal * 1.8, 2.0);
  float3 insideColor = softBackdrop(point - normal * 1.8, 2.0);
  float outsideLight = max(luminance(outsideColor), max(outsideColor.r, max(outsideColor.g, outsideColor.b)) * 0.72);
  float insideLight = max(luminance(insideColor), max(insideColor.r, max(insideColor.g, insideColor.b)) * 0.72);
  float darkLine = smoothstep(0.40, 0.61, outsideLight * 0.68 + insideLight * 0.32);
  return mix(float3(0.92, 0.93, 0.96), float3(0.014, 0.013, 0.018), darkLine);
}

// Couleur prémultipliée d'une surface (chosen) au point, à la distance chosenD de son bord.
half4 shade(int chosen, float2 point, float chosenD) {
  float pressure = chosen == 1 ? clamp(lensPress, 0.0, 1.0) : 0.0;
  float refraction = mix(mRefraction, mRefractionHeld, pressure);
  float dispersion = mix(mDispersion, 0.0, pressure);
  float2 center = shapeCenter(chosen);
  float2 halfSize = shapeHalf(chosen);
  float minHalf = min(halfSize.x, halfSize.y);
  float e = 1.35;
  float dx = shapeField(chosen, point + float2(e, 0.0)) - shapeField(chosen, point - float2(e, 0.0));
  float dy = shapeField(chosen, point + float2(0.0, e)) - shapeField(chosen, point - float2(0.0, e));
  float2 normal = normalize(float2(dx, dy) + float2(0.0001));
  float depth = clamp(-chosenD / max(12.0, minHalf * 0.62), 0.0, 1.0);
  float refractionSupport = max(14.0, minHalf * 0.50);
  float edgeCurve = pow(1.0 - smoothstep(0.0, refractionSupport, -chosenD), 2.2);
  float2 local = (point - center) / max(halfSize, float2(1.0));

  float edgeDepth = max(-chosenD, 0.0);
  float causticSupport = max(8.0, minHalf * mEdgeWidth);
  float captureX = clamp(edgeDepth / causticSupport, 0.0, 1.0);
  float causticT = 1.0 - smoothstep(0.0, causticSupport, edgeDepth);
  float causticShade = causticT * causticT * (3.0 - 2.0 * causticT);
  float captureProfile = pow(1.0 - captureX, 1.64);
  float refractionProfile = pow(1.0 - clamp(edgeDepth / refractionSupport, 0.0, 1.0), 2.2);
  float opticalNormalMix = smoothstep(0.12, 0.55, captureX);
  float2 bendNormal = normalize(mix(normal, opticalNormal(chosen, point, normal), opticalNormalMix));
  float captureDistance = mEdgeReach * minHalf * 2.0 * 1.24 * captureProfile;
  float2 lensShift = -bendNormal * (refraction * refractionProfile * 0.32 + captureDistance);
  lensShift += -local * (refraction * 0.035) * smoothstep(0.16, 0.92, depth);
  // Lentille tenue : surface enfoncée qui écrase ce qu'on voit au travers ; le déplacement
  // suit la normale du contour, nul sur l'axe central et au bord.
  float pressDepth = clamp(edgeDepth / max(minHalf, 1.0), 0.0, 1.0);
  lensShift *= 1.0 - pressure * 0.35;
  lensShift += normal * mSquashAxes * (mSquash * minHalf * pressure * pressDepth * (1.0 - pressDepth));
  float2 chromaShift = bendNormal * dispersion * (0.32 + edgeCurve * 0.95);
  float2 pR = point + lensShift * (1.0 + dispersion * 0.009) + chromaShift;
  float2 pG = point + lensShift;
  float2 pB = point + lensShift * (1.0 - dispersion * 0.011) - chromaShift;

  float3 sr = sharp(pR);
  float3 sg = sharp(pG);
  float3 sb = sharp(pB);
  float causticMix = causticShade * 0.18;
  if (causticMix > 0.001) {
    float causticBlur = 0.7 + min(1.13 * pd, captureDistance * 0.026);
    sr = mix(sr, softBackdrop(pR, causticBlur), causticMix);
    sg = mix(sg, softBackdrop(pG, causticBlur), causticMix);
    sb = mix(sb, softBackdrop(pB, causticBlur), causticMix);
  }
  float3 transmitted = float3(sr.r, sg.g, sb.b);
  // Lentille tenue posée sur la barre : là où ce qu'elle réfracte est dans la barre, on voit le
  // voile de la barre (la référence dessine la barre, puis la lentille par-dessus).
  if (chosen == 1 && shapeSdf(0, pG) < 0.0) transmitted = mix(transmitted, barTint.rgb, barTint.a * 0.88);

  float3 bodyTarget = mix(float3(0.030, 0.031, 0.038), float3(0.94, 0.95, 0.97),
                          smoothstep(0.58, 0.82, luminance(transmitted)));
  transmitted = mix(transmitted, bodyTarget, clamp(mBody * (0.034 + edgeCurve * 0.012), 0.0, 0.11));
  transmitted = mix(float3(luminance(transmitted)), transmitted, 1.0 - mBody * 0.045);
  float opticalPath = 0.26 + sqrt(depth) * 0.74;
  transmitted *= exp(-float3(0.018, 0.011, 0.004) * opticalPath * 2.4 * mAbsorption);
  float4 tint = shapeTint(chosen);
  transmitted = mix(transmitted, tint.rgb, tint.a * (0.88 + depth * 0.12));

  float mask = 1.0 - smoothstep(0.0, 1.35 / pd, chosenD);
  float thinRim = exp(-pow((chosenD + 0.65) / 1.4, 2.0));
  float innerRim = exp(-pow((chosenD + 6.2) / 3.8, 2.0));
  float fresnel = pow(clamp(edgeCurve, 0.0, 1.0), 0.72);
  float key = pow(max(dot(normal, lightDir), 0.0), 7.0) * fresnel;
  float opposite = pow(max(dot(normal, -lightDir), 0.0), 5.0) * innerRim;
  float3 color = transmitted;
  float rimMix = clamp((thinRim * 0.42 + innerRim * 0.18 + fresnel * 0.10) * mRim * mReflection, 0.0, 0.72);
  if (rimMix > 0.0005) {
    float3 reflected = softBackdrop(point + normal * (8.0 + refraction * 0.17), 5.2);
    float3 adaptiveRim = reflected * 1.45 + float3(0.06, 0.035, 0.08);
    adaptiveRim = mix(adaptiveRim, float3(0.96, 0.97, 1.0), 0.24);
    adaptiveRim = mix(adaptiveRim, float3(0.035, 0.025, 0.045), smoothstep(0.78, 0.98, luminance(reflected)) * 0.48);
    color = mix(color, adaptiveRim, rimMix);
  }
  color += float3(1.0, 0.82, 0.92) * key * 0.30 * mRim * mHighlight;
  color *= 1.0 - opposite * 0.12 * mRim;
  float echoMix = exp(-pow((chosenD + 11.0) / 5.5, 2.0)) * 0.075 * mRim * mEcho;
  if (echoMix > 0.0005) color = mix(color, sharp(point - normal * 11.0) * 1.12, echoMix);

  // Liseré : clair sur fond sombre, sombre sur fond clair, blanc côté lumière.
  float lineWidth = mix(0.34, 1.08, mHairWidth) / pd * 1.5;
  float edgeAA = 1.0 / pd;
  float strokeDistance = abs(chosenD + 0.10) - lineWidth * 0.5;
  float hairline = 1.0 - smoothstep(-edgeAA * 0.72, edgeAA * 0.72, strokeDistance);
  float hairAlpha = clamp(hairline * mHairline * (0.22 + mRim * 0.20), 0.0, 1.0);
  float3 hairColor = float3(0.0);
  if (hairAlpha > 0.0) {
    hairColor = interfaceColor(point, normal);
    hairColor = mix(hairColor, float3(0.985, 0.99, 1.0), clamp(key * mHighlight * 2.5 * (0.65 + mRim * 0.60), 0.0, 0.96));
  }
  color = clamp(color, 0.0, 1.0);
  float alpha = hairAlpha + mask * (1.0 - hairAlpha);
  return half4(hairColor * hairAlpha + color * mask * (1.0 - hairAlpha), alpha);
}

half4 main(float2 point) {
  float dFab = shapeSdf(2, point);
  if (dFab <= 2.1) return shade(2, point, dFab);
  // Lentille composée par-dessus la barre : sur son bord adouci, c'est la barre qui transparaît
  // (et non le fond posé sous le canevas, qui faisait un liseré).
  half4 c = half4(0.0);
  float dBar = shapeSdf(0, point);
  if (dBar <= 2.1) c = shade(0, point, dBar);
  float dLens = shapeSdf(1, point);
  if (dLens <= 2.1) {
    half4 l = shade(1, point, dLens);
    c = l + c * (1.0 - l.a);
  }
  return c;
}
`;

const effect = Skia.RuntimeEffect.Make(GLASS_SKSL);
if (!effect) throw new Error('Shader verre liquide invalide');
export const GLASS = effect;

// Réglages du verre, partagés avec le thread UI : la navbar les lit à chaque image, l'écran
// « Verre liquide » les modifie en direct. Sauvegardés (avec un délai) dans AsyncStorage.
export const glassSettings = makeMutable<GlassSettings>(DEFAULT_GLASS);
const STORAGE_KEY = 'glass-settings';
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadGlassSettings() {
  try {
    glassSettings.value = parseGlass(await AsyncStorage.getItem(STORAGE_KEY));
  } catch (e) {
    console.warn('Réglages du verre illisibles, valeurs par défaut', e);
  }
}

export function setGlassSettings(next: GlassSettings) {
  glassSettings.value = next;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((e) => console.warn('Réglages du verre non enregistrés', e));
  }, 400);
}

// Uniformes du matériau (worklet : appelé par la navbar sur le thread UI). La lumière vient de
// lightAngle (136° = en haut à gauche, axe y vers le bas).
export function materialUniforms(s: GlassSettings) {
  'worklet';
  const a = (s.lightAngle * Math.PI) / 180;
  return {
    mRefraction: s.refraction,
    mRefractionHeld: s.refractionHeld,
    mDispersion: s.dispersion,
    mEdgeReach: s.edgeReach,
    mEdgeWidth: s.edgeWidth,
    mSquash: s.squash,
    mSquashAxes: [1 - s.squashLength, 1 - s.squashHeight],
    mBody: s.body,
    mAbsorption: s.absorption,
    mRim: s.rim,
    mReflection: s.reflection,
    mHighlight: s.highlight,
    mEcho: s.echo,
    mHairline: s.hairline,
    mHairWidth: s.hairWidth,
    lightDir: [Math.cos(a), -Math.sin(a)],
  };
}

// Teinte d'une surface pour le shader : couleur (#RRGGBB) et opacité de teinte.
export function tintUniform(hex: string, amount: number) {
  const [r, g, b] = Array.from(Skia.Color(hex));
  return [r, g, b, amount];
}

