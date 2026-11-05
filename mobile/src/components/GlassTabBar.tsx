import { Canvas, Fill, Group, ImageShader, Shader, type SkFont, Text as SkText, useFont } from 'react-native-skia';
import { router } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import { useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';
import { colors, glass } from '../theme';
import { type Strip, useGlassScene, useLiveBackdrop } from './GlassBackdrop';
import { GLASS, LIGHT_DIR, tintUniform } from './LiquidGlass';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  saisies: 'list-outline',
  reglages: 'options-outline',
};
const LABELS: Record<string, string> = { index: 'Mois', saisies: 'Saisies', reglages: 'Réglages' };

const BAR_H = 64;
const PAD = 6;
const GAP = 4;
const FAB_GAP = 10;
const LENS_H = BAR_H - 2 * PAD;
const MARGIN = 16; // bande capturée au-dessus et au-dessous de la barre (reflets du bord)
const PD = PixelRatio.get();
const BAR_TINT = tintUniform(colors.bg, glass.barTint);
const LENS_TINT = tintUniform(colors.text, glass.lensTint);
const FAB_TINT = tintUniform(colors.accent, glass.fabTint);

type Placement = { strip: Strip; left: number }; // left : x de la barre dans la scène

// Barre de navigation flottante en verre liquide, bouton « + » séparé.
// Le verre (shader V2, voir LiquidGlass.tsx) réfracte une capture en direct de l'écran
// derrière la barre ; la lentille de l'onglet actif glisse en goutte (tête rapide + traîne).
export function GlassTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const wrap = useRef<ComponentRef<typeof View>>(null);
  const [width, setWidth] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const scene = useGlassScene(state.routes[state.index].key);
  const { image, ready } = useLiveBackdrop(scene, placement?.strip ?? null);
  const iconFont = useFont(require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'), 20);
  const labelFont = useFont(require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'), 11);

  // Position de la barre dans la scène affichée, pour savoir quelle bande capturer.
  const measure = useCallback(() => {
    const target = scene?.current;
    if (!target || !wrap.current) return;
    target.measureInWindow((sx, sy, sw, sh) => {
      wrap.current?.measureInWindow((wx, wy) => {
        const top = Math.max(0, wy - sy - MARGIN);
        const height = Math.min(BAR_H + 2 * MARGIN, sh - top);
        if (sw > 0 && height > 0) setPlacement({ strip: { x: 0, y: top, width: sw, height }, left: wx - sx });
      });
    });
  }, [scene]);
  useEffect(() => { requestAnimationFrame(measure); }, [measure, width]);

  const barW = width - FAB_GAP - BAR_H;
  const n = state.routes.length;
  const tabW = (barW - 2 * PAD - GAP * (n - 1)) / n;
  const left = placement?.left ?? 0;
  const tabX = (i: number) => left + PAD + i * (tabW + GAP) + tabW / 2; // en coordonnées du canevas

  const lead = useSharedValue(0);
  const trail = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (!width || !placement) return;
    const x = tabX(state.index);
    if (!placed.current) { lead.value = x; trail.value = x; placed.current = true; return; }
    // Ressorts presque critiques : la goutte s'étire puis se pose, sans rebond.
    lead.value = withSpring(x, { damping: 34, stiffness: 320 });
    trail.value = withSpring(x, { damping: 27, stiffness: 180 });
  }, [state.index, width, placement]); // eslint-disable-line react-hooks/exhaustive-deps

  const cy = MARGIN + BAR_H / 2;
  const uniforms = useDerivedValue(() => ({
    pd: PD,
    barC: [left + barW / 2, cy],
    barH: [barW / 2, BAR_H / 2],
    lead: [lead.value, cy],
    trail: [trail.value, cy],
    lensH: [tabW / 2, LENS_H / 2],
    fabC: [left + barW + FAB_GAP + BAR_H / 2, cy],
    fabR: BAR_H / 2,
    lightDir: LIGHT_DIR,
    barTint: BAR_TINT,
    lensTint: LENS_TINT,
    fabTint: FAB_TINT,
  }), [left, barW, tabW]);

  return (
    <View
      ref={wrap}
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 12 }]}
      pointerEvents="box-none"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/* Repli tant qu'aucune capture n'est prête (premier rendu, GPU indisponible). */}
      <View style={[styles.bar, !ready && styles.fallback]} />
      <View style={[styles.fab, !ready && styles.fabFallback]} />
      {placement && width > 0 && (
        <Canvas
          pointerEvents="none"
          style={{ position: 'absolute', left: -left, top: -MARGIN, width: placement.strip.width, height: placement.strip.height }}
        >
          {ready && (
            <Fill>
              <Shader source={GLASS} uniforms={uniforms}>
                <ImageShader image={image} fit="fill" rect={{ x: 0, y: 0, width: placement.strip.width, height: placement.strip.height }} />
              </Shader>
            </Fill>
          )}
          {state.routes.map((route, i) => {
            const color = state.index === i ? glass.activeInk : colors.textMuted;
            const glyph = String.fromCodePoint(Number(Ionicons.glyphMap[ICONS[route.name] ?? 'ellipse-outline']));
            const label = LABELS[route.name] ?? route.name;
            return (
              <Group key={route.key}>
                {iconFont && <Centered font={iconFont} text={glyph} color={color} cx={tabX(i)} cy={MARGIN + 25} />}
                {labelFont && <Centered font={labelFont} text={label} color={color} cx={tabX(i)} cy={MARGIN + 44} />}
              </Group>
            );
          })}
        </Canvas>
      )}
      <View style={[StyleSheet.absoluteFill, styles.row]} pointerEvents="box-none">
        <View style={styles.tabs}>
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={LABELS[route.name] ?? route.name}
                accessibilityState={{ selected: focused }}
                onPress={() => { if (!focused) { haptics.tap(); navigateToTab(route.key); } }}
                style={styles.tab}
              />
            );
          })}
        </View>
        <Pressable accessibilityLabel="Nouvelle saisie" onPress={() => { haptics.press(); router.push('/saisie'); }} style={styles.fabTouch}>
          <Ionicons name="add" size={28} color={colors.accentInk} />
        </Pressable>
      </View>
    </View>
  );
}

// Texte Skia centré sur (cx, cy) d'après ses bornes mesurées (y est la ligne de base).
function Centered({ font, text, color, cx, cy }: { font: SkFont; text: string; color: string; cx: number; cy: number }) {
  const b = font.measureText(text);
  return <SkText font={font} text={text} color={color} x={cx - b.x - b.width / 2} y={cy - b.y - b.height / 2} />;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, height: BAR_H, flexDirection: 'row', gap: FAB_GAP },
  bar: { flex: 1, borderRadius: BAR_H / 2 },
  fab: { width: BAR_H, borderRadius: BAR_H / 2 },
  fallback: { backgroundColor: glass.fill, borderWidth: 1, borderColor: colors.borderStrong },
  fabFallback: { backgroundColor: colors.accent },
  row: { flexDirection: 'row', gap: FAB_GAP },
  tabs: { flex: 1, flexDirection: 'row', padding: PAD, gap: GAP },
  tab: { flex: 1 },
  fabTouch: { width: BAR_H, height: BAR_H, alignItems: 'center', justifyContent: 'center' },
});
