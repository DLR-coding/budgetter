import { BackdropFilter, Canvas, Group, RuntimeShader, type SkFont, Text as SkText, useFont } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';
import { colors, glass } from '../theme';
import { colorUniform, GlassRim, LENS, PIXEL_RATIO, RIM_COLOR } from './LiquidGlass';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  saisies: 'list-outline',
  reglages: 'options-outline',
};
const LABELS: Record<string, string> = { index: 'Mois', saisies: 'Saisies', reglages: 'Réglages' };

const BAR_H = 64;
const PAD = 6;
const GAP = 4;
const LENS_H = BAR_H - 2 * PAD;
const LENS_TINT = colorUniform(glass.lens);

// Barre de navigation flottante en verre liquide, bouton « + » séparé.
// BlurView floute l'écran derrière ; Skia dessine icônes et libellés, puis une lentille liquide
// (tête rapide + traîne lente fusionnées) qui les grossit et les réfracte en glissant d'onglet en onglet.
export function GlassTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const iconFont = useFont(require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'), 20);
  const labelFont = useFont(require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'), 11);

  const n = state.routes.length;
  const tabW = (width - 2 * PAD - GAP * (n - 1)) / n;
  const centerX = (i: number) => PAD + i * (tabW + GAP) + tabW / 2;

  const lead = useSharedValue(0);
  const trail = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (!width) return;
    const x = centerX(state.index);
    if (!placed.current) { lead.value = x; trail.value = x; placed.current = true; return; }
    lead.value = withSpring(x, { damping: 16, stiffness: 240 });
    trail.value = withSpring(x, { damping: 18, stiffness: 110 });
  }, [state.index, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const lensUniforms = useDerivedValue(() => ({
    pd: PIXEL_RATIO,
    lead: [lead.value, BAR_H / 2],
    trail: [trail.value, BAR_H / 2],
    halfSize: [tabW / 2, LENS_H / 2],
    radius: LENS_H / 2,
    tint: LENS_TINT,
    rimColor: RIM_COLOR,
  }), [tabW]);

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 12 }]} pointerEvents="box-none">
      <View style={styles.barShell} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        {width > 0 && (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            {state.routes.map((route, i) => {
              const color = state.index === i ? glass.activeInk : colors.textMuted;
              const glyph = String.fromCodePoint(Number(Ionicons.glyphMap[ICONS[route.name] ?? 'ellipse-outline']));
              const label = LABELS[route.name] ?? route.name;
              return (
                <Group key={route.key}>
                  {iconFont && <Centered font={iconFont} text={glyph} color={color} cx={centerX(i)} cy={25} />}
                  {labelFont && <Centered font={labelFont} text={label} color={color} cx={centerX(i)} cy={44} />}
                </Group>
              );
            })}
            <BackdropFilter filter={<RuntimeShader source={LENS} uniforms={lensUniforms} />} />
          </Canvas>
        )}
        <GlassRim width={width} height={BAR_H} radius={BAR_H / 2} />
        <View style={styles.bar}>
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
      </View>
      <Pressable accessibilityLabel="Nouvelle saisie" onPress={() => { haptics.press(); router.push('/saisie'); }} style={styles.fab}>
        <GlassRim width={BAR_H} height={BAR_H} radius={BAR_H / 2} />
        <Ionicons name="add" size={28} color={colors.accentInk} />
      </Pressable>
    </View>
  );
}

// Texte Skia centré sur (cx, cy) d'après ses bornes mesurées (y est la ligne de base).
function Centered({ font, text, color, cx, cy }: { font: SkFont; text: string; color: string; cx: number; cy: number }) {
  const b = font.measureText(text);
  return <SkText font={font} text={text} color={color} x={cx - b.x - b.width / 2} y={cy - b.y - b.height / 2} />;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  barShell: { flex: 1, height: BAR_H, borderRadius: BAR_H / 2, overflow: 'hidden', backgroundColor: glass.fill },
  bar: { flex: 1, flexDirection: 'row', padding: PAD, gap: GAP },
  tab: { flex: 1 },
  fab: {
    width: BAR_H, height: BAR_H, borderRadius: BAR_H / 2, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
});
