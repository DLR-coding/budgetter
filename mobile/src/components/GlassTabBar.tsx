import { Canvas, Fill, ImageShader, Shader } from 'react-native-skia';
import { router } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { type SharedValue, useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';
import { colors, font, glass } from '../theme';
import { type Strip, useGlassScene, useLiveBackdrop } from './GlassBackdrop';
import { GLASS, LIGHT_DIR, tintUniform } from './LiquidGlass';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  saisies: 'list-outline',
  reglages: 'options-outline',
};
const LABELS: Record<string, string> = { index: 'Mois', saisies: 'Saisies', reglages: 'Réglages' };

// Géométrie de la navbar « Press » de la référence (playground/scenes.js, pressEffects) :
// bulle en retrait de 8 % de la hauteur de la barre, haute de 84 %.
const BAR_H = 64;
const INSET = BAR_H * 0.08;
const THUMB_H = BAR_H * 0.84;
const FAB_GAP = 10;
const MARGIN = 16; // bande capturée au-dessus et au-dessous de la barre (reflets, débordement)
const PD = PixelRatio.get();
const BAR_TINT = tintUniform(colors.bg, glass.barTint);
const LENS_TINT = tintUniform(colors.text, glass.lensTint);
const FAB_TINT = tintUniform(colors.accent, glass.fabTint);

// Appui (press-effects.js, DEFAULT_NAVIGATION_LENS) : la bulle tenue perd son voile, devient
// 13 % plus large et 1,24 fois plus haute que la barre, et écrase ce qu'on voit au travers.
const PRESS_IN = { stiffness: 520, damping: 28 };
const PRESS_OUT = { stiffness: 540, damping: 31 };
const LENS_GROW_X = 0.13;
const LENS_HELD_H = 1.24;
// Nos onglets sont étroits : sans ce minimum, la lentille tenue serait ronde au lieu de suivre
// la forme de la barre (capsule au moins 1,6 fois plus large que haute).
const LENS_HELD_RATIO = 1.6;
// Position le long de la barre (0 = premier onglet, 1 = dernier) : ressorts à amortissement
// critique, la goutte se pose sans rebond.
const FOLLOW = { stiffness: 420, damping: 41 };
const SNAP = { stiffness: 360, damping: 38 };
const FAB_GROW = 0.075;    // bouton : gonfle de 7,5 %
const FAB_BLOOM = 0.35;    // … et sa teinte s'éclaircit vers le blanc

// left : x de la barre dans la scène ; winX : x de la barre dans la fenêtre (position du doigt).
type Placement = { strip: Strip; left: number; winX: number };

// Barre de navigation flottante en verre liquide, bouton « + » séparé.
// Le verre (shader V2, voir LiquidGlass.tsx) réfracte une capture en direct de l'écran
// derrière la barre. On peut toucher un onglet, ou tenir la bulle et la faire glisser.
export function GlassTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const wrap = useRef<ComponentRef<typeof View>>(null);
  const [width, setWidth] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const { scene, version } = useGlassScene(state.routes[state.index].key);
  const { image, ready } = useLiveBackdrop(scene, placement?.strip ?? null);

  // Position de la barre dans la scène affichée, pour savoir quelle bande capturer.
  const measure = useCallback(() => {
    const target = scene?.current;
    if (!target || !wrap.current) return;
    target.measureInWindow((sx, sy, sw, sh) => {
      wrap.current?.measureInWindow((wx, wy) => {
        const top = Math.max(0, wy - sy - MARGIN);
        const height = Math.min(BAR_H + 2 * MARGIN, sh - top);
        if (sw > 0 && height > 0) setPlacement({ strip: { x: 0, y: top, width: sw, height }, left: wx - sx, winX: wx });
      });
    });
  }, [scene]);
  useEffect(() => { requestAnimationFrame(measure); }, [measure, width, version]);

  const n = state.routes.length;
  const last = Math.max(1, n - 1);
  const barW = width - FAB_GAP - BAR_H;
  const thumbW = (barW - 2 * INSET) / n;
  const left = placement?.left ?? 0;
  const tabX = (i: number) => left + INSET + thumbW * (i + 0.5); // centre d'un onglet, dans le canevas

  // progress : position de la bulle entre le premier (0) et le dernier onglet (1).
  const progress = useSharedValue(state.index / last);
  const press = useSharedValue(0);   // gonflement de la bulle tenue
  const fabPress = useSharedValue(0);
  useEffect(() => { progress.value = withSpring(state.index / last, SNAP); }, [state.index, last]); // eslint-disable-line react-hooks/exhaustive-deps

  const pressIn = (v: SharedValue<number>) => { v.value = withSpring(1, PRESS_IN); };
  const pressOut = (v: SharedValue<number>) => { v.value = withSpring(0, PRESS_OUT); };
  const navigate = (i: number) => {
    if (i === state.index) return;
    haptics.tap();
    navigateToTab(state.routes[i].key);
  };
  const fingerProgress = (pageX: number) =>
    Math.min(1, Math.max(0, (pageX - (placement?.winX ?? 0) + left - tabX(0)) / (tabX(last) - tabX(0) || 1)));
  const hold = (pageX: number) => { progress.value = withSpring(fingerProgress(pageX), FOLLOW); };
  const release = (i: number) => {
    progress.value = withSpring(i / last, SNAP);
    pressOut(press);
  };
  // Toucher un onglet ou tenir la bulle : elle gonfle sous le doigt et le suit ;
  // au relâchement, elle se cale sur l'onglet le plus proche, qui s'ouvre.
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { pressIn(press); hold(e.nativeEvent.pageX); },
    onPanResponderMove: (e) => hold(e.nativeEvent.pageX),
    onPanResponderRelease: (e) => {
      const i = Math.round(fingerProgress(e.nativeEvent.pageX) * last);
      release(i);
      navigate(i);
    },
    onPanResponderTerminate: () => release(state.index),
  });

  const cy = MARGIN + BAR_H / 2;
  const heldHalfH = (BAR_H * LENS_HELD_H) / 2;
  const heldHalfW = Math.max((thumbW / 2) * (1 + LENS_GROW_X), heldHalfH * LENS_HELD_RATIO);
  // Nombres calculés ici : le worklet ci-dessous tourne sur le thread UI et ne peut pas appeler tabX.
  const firstX = tabX(0);
  const lastX = tabX(last);
  const uniforms = useDerivedValue(() => {
    // Borné à [0, 1] : le ressort qui dépasse ne doit ni gonfler ni rétrécir la lentille.
    const p = Math.min(1, Math.max(0, press.value));
    const fp = Math.min(1, Math.max(0, fabPress.value));
    // Bornée à [0, 1] : relâché en plein glissement, le ressort repart avec la vitesse du doigt
    // et peut dépasser sa cible ; la bulle sortirait alors de la barre (sur le « + » ou le bord).
    const t = Math.min(1, Math.max(0, progress.value));
    // Au repos la bulle va d'un centre d'onglet à l'autre ; gonflé, il déborde en hauteur comme
    // la référence, mais ses bords restent dans la longueur de la barre (le « + » est à côté).
    const rest = firstX + t * (lastX - firstX);
    const heldLo = left + heldHalfW;
    const heldHi = left + barW - heldHalfW;
    const x = rest + (heldLo + t * (heldHi - heldLo) - rest) * p;
    return {
      pd: PD,
      barC: [left + barW / 2, cy],
      barH: [barW / 2, BAR_H / 2],
      lead: [x, cy],
      trail: [x, cy],
      lensH: [thumbW / 2 + (heldHalfW - thumbW / 2) * p, THUMB_H / 2 + (heldHalfH - THUMB_H / 2) * p],
      fabC: [left + barW + FAB_GAP + BAR_H / 2, cy],
      fabR: (BAR_H / 2) * (1 + FAB_GROW * fp),
      lightDir: LIGHT_DIR,
      barTint: BAR_TINT,
      lensTint: [LENS_TINT[0], LENS_TINT[1], LENS_TINT[2], LENS_TINT[3] * (1 - p)],
      fabTint: [
        FAB_TINT[0] + (1 - FAB_TINT[0]) * FAB_BLOOM * fp,
        FAB_TINT[1] + (1 - FAB_TINT[1]) * FAB_BLOOM * fp,
        FAB_TINT[2] + (1 - FAB_TINT[2]) * FAB_BLOOM * fp,
        FAB_TINT[3],
      ],
      lensPress: p,
    };
  });

  return (
    <View
      ref={wrap}
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 12 }]}
      pointerEvents="box-none"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/* Repli toujours présent sous le verre (opaque dans ses formes) : visible tant que le canevas
          n'a pas affiché sa première image, ou si le GPU est indisponible. */}
      <View style={[styles.bar, styles.fallback]} />
      <View style={[styles.fab, styles.fabFallback]} />
      {placement && width > 0 && ready && (
        <Canvas
          pointerEvents="none"
          style={{ position: 'absolute', left: -left, top: -MARGIN, width: placement.strip.width, height: placement.strip.height }}
        >
          <Fill>
            <Shader source={GLASS} uniforms={uniforms}>
              <ImageShader image={image} fit="fill" rect={{ x: 0, y: 0, width: placement.strip.width, height: placement.strip.height }} />
            </Shader>
          </Fill>
        </Canvas>
      )}
      <View style={[StyleSheet.absoluteFill, styles.row]} pointerEvents="box-none">
        {/* Le toucher passe par le geste de la barre ; chaque onglet reste accessible au lecteur d'écran. */}
        <View style={styles.tabs} {...pan.panHandlers}>
          {state.routes.map((route, i) => (
            <View
              key={route.key}
              accessible
              accessibilityRole="tab"
              accessibilityLabel={LABELS[route.name] ?? route.name}
              accessibilityState={{ selected: state.index === i }}
              accessibilityActions={[{ name: 'activate' }]}
              onAccessibilityAction={() => navigate(i)}
              style={styles.tab}
            >
              <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={20} color={state.index === i ? glass.activeInk : colors.textMuted} />
              <Text style={[styles.label, { color: state.index === i ? glass.activeInk : colors.textMuted }]}>{LABELS[route.name] ?? route.name}</Text>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityLabel="Nouvelle saisie"
          onPressIn={() => pressIn(fabPress)}
          onPressOut={() => pressOut(fabPress)}
          onPress={() => { haptics.press(); router.push('/saisie'); }}
          style={styles.fabTouch}
        >
          <Ionicons name="add" size={28} color={colors.accentInk} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, height: BAR_H, flexDirection: 'row', gap: FAB_GAP },
  bar: { flex: 1, borderRadius: BAR_H / 2 },
  fab: { width: BAR_H, borderRadius: BAR_H / 2 },
  // Rentré d'1 dp : caché sous le bord adouci du verre (sinon liseré autour).
  fallback: { backgroundColor: glass.fill, margin: 1 },
  fabFallback: { backgroundColor: colors.accent, margin: 1 },
  row: { flexDirection: 'row', gap: FAB_GAP },
  tabs: { flex: 1, flexDirection: 'row', padding: INSET },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, fontFamily: font.medium },
  fabTouch: { width: BAR_H, height: BAR_H, alignItems: 'center', justifyContent: 'center' },
});
