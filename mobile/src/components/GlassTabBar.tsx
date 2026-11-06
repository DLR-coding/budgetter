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
import { GLASS, glassSettings, loadGlassSettings, materialUniforms, tintUniform } from './LiquidGlass';

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
// Couleurs des voiles ; leur opacité vient des réglages du verre (écran « Verre liquide »).
const BAR_TINT = tintUniform(colors.bg, 0);
const LENS_TINT = tintUniform(colors.text, 0);
const FAB_TINT = tintUniform(colors.accent, 0);

// Appui (press-effects.js, DEFAULT_NAVIGATION_LENS) : la bulle tenue perd son voile, devient
// plus large et plus haute que la barre (elle en déborde), et écrase ce qu'on voit au travers.
// Sa taille (heldHeight, heldRatio : nos onglets étroits la rendraient sinon ronde) et les
// ressorts de position viennent des réglages du verre (src/lib/glass-settings.ts).
const PRESS_IN = { stiffness: 520, damping: 28 };
const PRESS_OUT = { stiffness: 540, damping: 31 };
const LENS_GROW_X = 0.13;
// Position le long de la barre (0 = premier onglet, 1 = dernier). Ressorts un peu sous-amortis :
// la bulle dépasse légèrement puis revient (rebond). La traîne, plus souple, étire la goutte en
// route puis la recolle. Au-delà du premier ou du dernier onglet, le dépassement est amorti
// comme un élastique et plafonné à edgeGive.
const FOLLOW = { stiffness: 520, damping: 34 };
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
  useEffect(() => { loadGlassSettings(); }, []);

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

  // Onglets affichés : les routes cachées (écran « Verre liquide ») n'ont pas de place dans la
  // barre ; sur elles, la bulle reste sous « Réglages », d'où on les ouvre.
  const focused = state.routes[state.index];
  const visible = state.routes.filter((r) => r.name in LABELS);
  const active = Math.max(0, visible.findIndex((r) => r.name === (focused.name in LABELS ? focused.name : 'reglages')));
  const n = visible.length;
  const last = Math.max(1, n - 1);
  const barW = width - FAB_GAP - BAR_H;
  const thumbW = (barW - 2 * INSET) / n;
  const left = placement?.left ?? 0;
  const tabX = (i: number) => left + INSET + thumbW * (i + 0.5); // centre d'un onglet, dans le canevas

  // progress : position de la bulle entre le premier (0) et le dernier onglet (1).
  const progress = useSharedValue(active / last);
  const lag = useSharedValue(active / last); // traîne de la goutte
  const press = useSharedValue(0);   // gonflement de la bulle tenue
  const fabPress = useSharedValue(0);
  const moveTo = (t: number, held: boolean) => {
    const g = glassSettings.value;
    progress.value = withSpring(t, held ? FOLLOW : { stiffness: g.snapStiffness, damping: g.snapDamping });
    lag.value = withSpring(t, { stiffness: g.lagStiffness, damping: g.lagDamping });
  };
  useEffect(() => { moveTo(active / last, false); }, [active, last]); // eslint-disable-line react-hooks/exhaustive-deps

  const pressIn = (v: SharedValue<number>) => { v.value = withSpring(1, PRESS_IN); };
  const pressOut = (v: SharedValue<number>) => { v.value = withSpring(0, PRESS_OUT); };
  const navigate = (i: number) => {
    if (visible[i].key === focused.key) return;
    haptics.tap();
    navigateToTab(visible[i].key);
  };
  const fingerProgress = (pageX: number) =>
    Math.min(1, Math.max(0, (pageX - (placement?.winX ?? 0) + left - tabX(0)) / (tabX(last) - tabX(0) || 1)));
  const hold = (pageX: number) => moveTo(fingerProgress(pageX), true);
  const release = (i: number) => {
    moveTo(i / last, false);
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
    onPanResponderTerminate: () => release(active),
  });

  const cy = MARGIN + BAR_H / 2;
  // Nombres calculés ici : le worklet ci-dessous tourne sur le thread UI et ne peut pas appeler tabX.
  const firstX = tabX(0);
  const lastX = tabX(last);
  const span = lastX - firstX || 1;
  const uniforms = useDerivedValue(() => {
    const g = glassSettings.value;
    const heldHalfH = (BAR_H * g.heldHeight) / 2;
    const heldHalfW = Math.max((thumbW / 2) * (1 + LENS_GROW_X), heldHalfH * g.heldRatio);
    const give = Math.max(0.0001, g.edgeGive / span);
    // Borné à [0, 1] : le ressort qui dépasse ne doit ni gonfler ni rétrécir la bulle.
    const p = Math.min(1, Math.max(0, press.value));
    const fp = Math.min(1, Math.max(0, fabPress.value));
    // Dépassement élastique aux bouts : quasi libre au début, plafonné à edgeGive (le ressort
    // relâché en plein glissement repart avec la vitesse du doigt et sortirait de la barre).
    const soft = (v: number) => (v < 0 ? (-give * -v) / (give - v) : v > 1 ? 1 + (give * (v - 1)) / (give + v - 1) : v);
    // Bulle centrée sur sa position, même tenue (elle peut alors déborder un peu de la barre).
    const x = firstX + soft(progress.value) * span;
    const xLag = firstX + soft(lag.value) * span;
    return {
      pd: PD,
      barC: [left + barW / 2, cy],
      barH: [barW / 2, BAR_H / 2],
      lead: [x, cy],
      trail: [xLag, cy],
      lensH: [thumbW / 2 + (heldHalfW - thumbW / 2) * p, THUMB_H / 2 + (heldHalfH - THUMB_H / 2) * p],
      fabC: [left + barW + FAB_GAP + BAR_H / 2, cy],
      fabR: (BAR_H / 2) * (1 + FAB_GROW * fp),
      ...materialUniforms(g),
      barTint: [BAR_TINT[0], BAR_TINT[1], BAR_TINT[2], g.barTint],
      lensTint: [LENS_TINT[0], LENS_TINT[1], LENS_TINT[2], g.lensTint * (1 - p)],
      fabTint: [
        FAB_TINT[0] + (1 - FAB_TINT[0]) * FAB_BLOOM * fp,
        FAB_TINT[1] + (1 - FAB_TINT[1]) * FAB_BLOOM * fp,
        FAB_TINT[2] + (1 - FAB_TINT[2]) * FAB_BLOOM * fp,
        g.fabTint,
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
          {visible.map((route, i) => (
            <View
              key={route.key}
              accessible
              accessibilityRole="tab"
              accessibilityLabel={LABELS[route.name] ?? route.name}
              accessibilityState={{ selected: active === i }}
              accessibilityActions={[{ name: 'activate' }]}
              onAccessibilityAction={() => navigate(i)}
              style={styles.tab}
            >
              <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={20} color={active === i ? glass.activeInk : colors.textMuted} />
              <Text style={[styles.label, { color: active === i ? glass.activeInk : colors.textMuted }]}>{LABELS[route.name] ?? route.name}</Text>
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
