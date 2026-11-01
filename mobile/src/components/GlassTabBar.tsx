import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '../theme';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  saisies: 'list-outline',
  reglages: 'options-outline',
};
const LABELS: Record<string, string> = { index: 'Mois', saisies: 'Saisies', reglages: 'Réglages' };

// Barre de navigation flottante en verre (flou + translucide), bouton « + » séparé.
export function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 12 }]} pointerEvents="box-none">
      <View style={styles.barShell}>
        <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={styles.bar}>
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                onPress={() => !focused && navigation.navigate(route.name)}
                style={[styles.tab, focused && styles.tabActive]}
              >
                <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={20} color={focused ? '#fff' : colors.textMuted} />
                <Text style={[styles.label, { color: focused ? '#fff' : colors.textMuted }]}>{LABELS[route.name] ?? route.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pressable accessibilityLabel="Nouvelle saisie" onPress={() => router.push('/saisie')} style={styles.fab}>
        <Ionicons name="add" size={28} color={colors.accentInk} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  barShell: {
    flex: 1, height: 64, borderRadius: 32, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(32,44,62,0.45)',
  },
  bar: { flex: 1, flexDirection: 'row', padding: 6, gap: 4 },
  tab: { flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  label: { fontSize: 11, fontFamily: font.medium },
  fab: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
});
