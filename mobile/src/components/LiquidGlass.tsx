import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { PixelRatio, StyleSheet } from 'react-native';
import { glass } from '../theme';

// Verre liquide en Skia (d'après « Liquid Glass with React Native Skia », W. Candillon) :
// formes en SDF fusionnées par smooth min, réfraction écrite comme image filter (RuntimeShader).
// Limite : Skia ne voit que ce qu'il dessine lui-même ; le flou des vues natives derrière
// reste assuré par BlurView (expo-blur).

const SDF = `
float sdBox(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// Reflet : fort côté lumière (haut gauche), plus discret à l'opposé, nul au cœur du verre.
float rimLight(float d, float2 n, float width) {
  float l = dot(n, normalize(float2(-0.5, -1.0)));
  return (1.0 - smoothstep(0.0, width, -d)) * (0.2 + 0.8 * max(l, 0.0) + 0.35 * max(-l, 0.0));
}
`;

function compile(src: string) {
  const effect = Skia.RuntimeEffect.Make(SDF + src);
  if (!effect) throw new Error('Shader verre liquide invalide');
  return effect;
}

// Reflet de bord + léger voile clair en haut, posé sur une surface en verre (coordonnées locales).
const RIM = compile(`
uniform float2 size;
uniform float radius;
uniform float4 rimColor;
float sdf(float2 p) { return sdBox(p - size * 0.5, size * 0.5, radius); }
half4 main(float2 p) {
  float d = sdf(p);
  float2 e = float2(0.5, 0.0);
  float2 n = normalize(float2(sdf(p + e.xy) - sdf(p - e.xy), sdf(p + e.yx) - sdf(p - e.yx)) + 1e-4);
  float inside = clamp(0.5 - d, 0.0, 1.0);
  float a = inside * rimColor.a * (0.75 * rimLight(d, n, 2.5) + 0.07 * (1.0 - p.y / size.y));
  return half4(rimColor.rgb * a, a);
}
`);

// Lentille liquide : deux pilules (tête et traîne) fusionnées par smooth min, qui grossissent et
// réfractent ce qui est dessiné dessous dans le canevas. xy arrive en pixels physiques : le
// filtre doit être posé dans un Group à l’échelle 1/pd (sinon rendu en dp, pixellisé).
export const LENS = compile(`
uniform shader image;
uniform float pd;
uniform float2 lead;
uniform float2 trail;
uniform float2 halfSize;
uniform float radius;
uniform float4 tint;
uniform float4 rimColor;
float sdf(float2 p) {
  return smin(sdBox(p - lead, halfSize, radius), sdBox(p - trail, halfSize, radius), 14.0);
}
half4 main(float2 xy) {
  float2 p = xy / pd;
  half4 base = image.eval(xy);
  float d = sdf(p);
  if (d > 1.0) return base;
  float2 e = float2(0.5, 0.0);
  float2 n = normalize(float2(sdf(p + e.xy) - sdf(p - e.xy), sdf(p + e.yx) - sdf(p - e.yx)) + 1e-4);
  // Profil de goutte circulaire : déviation maximale au bord, nulle à 12 px vers l'intérieur.
  float depth = clamp(-d / 12.0, 0.0, 1.0);
  float bend = 1.0 - sqrt(1.0 - (1.0 - depth) * (1.0 - depth));
  float2 q = lead + (p - lead) / 1.15 + n * bend * 9.0;
  // Aberration chromatique : chaque canal est dévié un peu différemment.
  float2 off = n * bend * 1.5;
  half4 sr = image.eval((q + off) * pd);
  half4 sg = image.eval(q * pd);
  half4 sb = image.eval((q - off) * pd);
  half4 col = half4(sr.r, sg.g, sb.b, max(max(sr.a, sg.a), sb.a));
  col += half4(tint.rgb * tint.a, tint.a) * (1.0 - col.a);
  float rim = rimLight(d, n, 2.5) * rimColor.a;
  col = col * (1.0 - rim) + half4(rimColor.rgb, 1.0) * rim;
  return mix(base, col, clamp(0.5 - d * pd, 0.0, 1.0));
}
`);

export const PIXEL_RATIO = PixelRatio.get();
export const colorUniform = (c: string) => Array.from(Skia.Color(c));
export const RIM_COLOR = colorUniform(glass.rim);

// Reflet de bord à superposer (pointerEvents none) sur une surface en verre de taille connue.
export function GlassRim({ width, height, radius }: { width: number; height: number; radius: number }) {
  if (!width || !height) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={RIM} uniforms={{ size: [width, height], radius, rimColor: RIM_COLOR }} />
      </Fill>
    </Canvas>
  );
}
