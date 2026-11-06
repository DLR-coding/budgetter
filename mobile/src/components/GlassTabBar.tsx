import { Canvas, Fill, Group, ImageShader, Shader, type SkFont, Text as SkText, useFont } from 'react-native-skia';
import { router } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import { type SharedValue, useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
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
// Appui, d'après la référence (press-effects.js, DEFAULT_NAVIGATION_LENS) : arrivée ferme,
// relâchement un peu plus souple.
const PRESS_IN = { stiffness: 520, damping: 28 };
const PRESS_OUT = { stiffness: 540, damping: 31 };
const LENS_GROW_X = 0.13;  // lentille tenue : 13 % plus large
const LENS_HELD_H = 1.24;  // … et 1,24 fois la hauteur de la barre (elle en dépasse)
// … en restant une capsule allongée comme dans la référence (nos onglets étroits la
// rendaient ronde) : largeur au moins 1,6 fois la hauteur.
const LENS_HELD_RATIO = 1.6;
// Position de la goutte, ressorts presque critiques (pas de rebond qui sorte de la barre) :
// suivi du doigt, calage sur un onglet, traîne un peu plus lente pour l'étirement.
const FOLLOW = { stiffness: 420, damping: 36 };
const SNAP = { stiffness: 360, damping: 36 };
const TRAIL = { stiffness: 200, damping: 28 };
const FAB_GROW = 0.075;    // bouton : gonfle de 7,5 %
const FAB_BLOOM = 0.35;    // … et sa teinte s'éclaircit vers le blanc

// left : x de la barre dans la scène ; winX : x de la barre dans la fenêtre (position du doigt).
type Placement = { strip: Strip; left: number; winX: number };

// Barre de navigation flottante en verre liquide, bouton « + » séparé.
// Le verre (shader V2, voir LiquidGlass.tsx) réfracte une capture en direct de l'écran
// derrière la barre ; la lentille de l'onglet actif glisse en goutte (tête rapide + traîne).
export function GlassTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const wrap = useRef<ComponentRef<typeof View>>(null);
  const [width, setWidth] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const { scene, version } = useGlassScene(state.routes[state.index].key);
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
        if (sw > 0 && height > 0) setPlacement({ strip: { x: 0, y: top, width: sw, height }, left: wx - sx, winX: wx });
      });
    });
  }, [scene]);
  useEffect(() => { requestAnimationFrame(measure); }, [measure, width, version]);

  const barW = width - FAB_GAP - BAR_H;
  const n = state.routes.length;
  const tabW = (barW - 2 * PAD - GAP * (n - 1)) / n;
  const left = placement?.left ?? 0;
  const tabX = (i: number) => left + PAD + i * (tabW + GAP) + tabW / 2; // en coordonnées du canevas

  const lead = useSharedValue(0);
  const trail = useSharedValue(0);
  const placed = useRef(false);
  // Position de la goutte : la tête suit, la traîne arrive un peu après (étirement liquide).
  const lensTo = (x: number, held: boolean) => {
    lead.value = withSpring(x, held ? FOLLOW : SNAP);
    trail.value = withSpring(x, TRAIL);
  };
  useEffect(() => {
    if (!width || !placement) return;
    if (!placed.current) { const x = tabX(state.index); lead.value = x; trail.value = x; placed.current = true; return; }
    lensTo(tabX(state.index), false);
  }, [state.index, width, placement]); // eslint-disable-line react-hooks/exhaustive-deps

  // Appui (comme la référence) : la lentille tenue s'élargit, dépasse de la barre, devient
  // claire et écrase ce qu'on voit au travers ; le « + » gonfle et s'éclaircit.
  const lensPress = useSharedValue(0);
  const fabPress = useSharedValue(0);
  const pressIn = (v: SharedValue<number>) => { v.value = withSpring(1, PRESS_IN); };
  const pressOut = (v: SharedValue<number>) => { v.value = withSpring(0, PRESS_OUT); };

  const navigate = (i: number) => {
    if (i === state.index) return;
    haptics.tap();
    navigateToTab(state.routes[i].key);
  };
  // Doigt (pageX) → x de la goutte dans le canevas, borné aux onglets extrêmes ; la goutte tenue
  // peut dépasser des bouts de la barre d'autant qu'en haut et en bas (comme la référence).
  const overtravel = (BAR_H * LENS_HELD_H - BAR_H) / 2;
  const fingerX = (pageX: number) =>
    Math.min(tabX(n - 1) + overtravel, Math.max(tabX(0) - overtravel, pageX - (placement?.winX ?? 0) + left));
  const nearest = (x: number) => Math.min(n - 1, Math.max(0, Math.round((x - tabX(0)) / (tabW + GAP))));
  // Geste de la barre : appui = la goutte gonfle et vient sous le doigt ; glisser = elle suit ;
  // relâcher = elle se cale sur l'onglet le plus proche, qui s'ouvre.
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { pressIn(lensPress); lensTo(fingerX(e.nativeEvent.pageX), true); },
    onPanResponderMove: (e) => lensTo(fingerX(e.nativeEvent.pageX), true),
    onPanResponderRelease: (e) => {
      const i = nearest(fingerX(e.nativeEvent.pageX));
      pressOut(lensPress);
      lensTo(tabX(i), false);
      navigate(i);
    },
    onPanResponderTerminate: () => { pressOut(lensPress); lensTo(tabX(state.index), false); },
  });

  const cy = MARGIN + BAR_H / 2;
  const heldHalfH = (BAR_H * LENS_HELD_H) / 2;
  const heldHalfW = Math.max((tabW / 2) * (1 + LENS_GROW_X), heldHalfH * LENS_HELD_RATIO);
  const uniforms = useDerivedValue(() => {
    // Borné à [0, 1] : le ressort qui dépasse ne doit ni gonfler ni rétrécir la goutte.
    const lp = Math.min(1, Math.max(0, lensPress.value));
    const fp = Math.min(1, Math.max(0, fabPress.value));
    return {
      pd: PD,
      barC: [left + barW / 2, cy],
      barH: [barW / 2, BAR_H / 2],
      lead: [lead.value, cy],
      trail: [trail.value, cy],
      lensH: [tabW / 2 + (heldHalfW - tabW / 2) * lp, LENS_H / 2 + (heldHalfH - LENS_H / 2) * lp],
      fabC: [left + barW + FAB_GAP + BAR_H / 2, cy],
      fabR: (BAR_H / 2) * (1 + FAB_GROW * fp),
      lightDir: LIGHT_DIR,
      barTint: BAR_TINT,
      lensTint: [LENS_TINT[0], LENS_TINT[1], LENS_TINT[2], LENS_TINT[3] * (1 - lp)],
      fabTint: [
        FAB_TINT[0] + (1 - FAB_TINT[0]) * FAB_BLOOM * fp,
        FAB_TINT[1] + (1 - FAB_TINT[1]) * FAB_BLOOM * fp,
        FAB_TINT[2] + (1 - FAB_TINT[2]) * FAB_BLOOM * fp,
        FAB_TINT[3],
      ],
      lensPress: lp,
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
        <View style={styles.tabs} {...pan.panHandlers}>
          {/* Le toucher passe par le geste de la barre ; ces vues servent au lecteur d'écran. */}
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
            />
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

// Texte Skia centré sur (cx, cy) d'après ses bornes mesurées (y est la ligne de base).
function Centered({ font, text, color, cx, cy }: { font: SkFont; text: string; color: string; cx: number; cy: number }) {
  const b = font.measureText(text);
  return <SkText font={font} text={text} color={color} x={cx - b.x - b.width / 2} y={cy - b.y - b.height / 2} />;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, height: BAR_H, flexDirection: 'row', gap: FAB_GAP },
  bar: { flex: 1, borderRadius: BAR_H / 2 },
  fab: { width: BAR_H, borderRadius: BAR_H / 2 },
  // Rentré d'1 dp : caché sous le bord adouci du verre (sinon liseré bleuté autour).
  fallback: { backgroundColor: glass.fill, margin: 1 },
  fabFallback: { backgroundColor: colors.accent, margin: 1 },
  row: { flexDirection: 'row', gap: FAB_GAP },
  tabs: { flex: 1, flexDirection: 'row', padding: PAD, gap: GAP },
  tab: { flex: 1 },
  fabTouch: { width: BAR_H, height: BAR_H, alignItems: 'center', justifyContent: 'center' },
});
