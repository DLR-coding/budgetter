import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { glassSettings, setGlassSettings } from '../../src/components/LiquidGlass';
import { Slider } from '../../src/components/Slider';
import { Card, CircleButton, Divider, ScreenHeader, SectionTitle } from '../../src/components/ui';
import { clampParam, DEFAULT_GLASS, GLASS_SECTIONS, type GlassParam, type GlassSettings } from '../../src/lib/glass-settings';
import { colors, font } from '../../src/theme';

// Réglages du verre liquide de la navbar, appliqués en direct. Onglet caché (ouvert depuis
// Réglages) pour que la barre reste visible : elle réfracte cet écran pendant qu'on règle.
export default function GlassLabScreen() {
  const [settings, setSettings] = useState<GlassSettings>(() => glassSettings.value);
  const update = (next: GlassSettings) => {
    setSettings(next);
    setGlassSettings(next);
  };

  return (
    <View style={s.screen}>
      <ScreenHeader title="Verre liquide" subtitle="Réglages en direct de la barre" left="back"
        onLeft={() => router.navigate('/reglages')}
        right={<CircleButton icon="refresh" accessibilityLabel="Réinitialiser" onPress={() => update({ ...DEFAULT_GLASS })} />} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.hint}>
          La barre en bas réfracte cet écran : fais défiler pour voir le verre sur du contenu.
          Tiens la bulle pour régler l’appui, change d’onglet pour le mouvement.
        </Text>
        {GLASS_SECTIONS.map((section) => (
          <View key={section.title} style={s.section}>
            <SectionTitle title={section.title} />
            <Card>
              {section.params.map((p, i) => (
                <View key={p.key}>
                  {i > 0 && <Divider />}
                  <ParamRow param={p} value={settings[p.key]}
                    onChange={(v) => update({ ...settings, [p.key]: clampParam(p.key, v) })} />
                </View>
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function ParamRow({ param, value, onChange }: { param: GlassParam; value: number; onChange: (v: number) => void }) {
  const decimals = param.step >= 1 ? 0 : String(param.step).split('.')[1]?.length ?? 2;
  const changed = value !== DEFAULT_GLASS[param.key];
  return (
    <View style={s.row}>
      <View style={s.rowHead}>
        <Text style={s.label}>{param.label}</Text>
        <Text style={[s.value, changed && { color: colors.accentText }]}>{value.toFixed(decimals)}</Text>
      </View>
      <Slider value={value} min={param.min} max={param.max} onChange={onChange} accessibilityLabel={param.label} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  content: { paddingTop: 8, paddingBottom: 140, gap: 8 },
  hint: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  section: { gap: 8 },
  row: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15 },
  value: { color: colors.textMuted, fontFamily: font.medium, fontSize: 14, fontVariant: ['tabular-nums'] },
});
