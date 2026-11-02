import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryEditSheet } from '../../src/components/CategoryEditSheet';
import { Card, Divider, ListRow, SectionTitle } from '../../src/components/ui';
import { formatEuros } from '../../src/lib/budget';
import { loadCategories, loadRecurrences, type CategoryRow, type GroupRow, type RecurrenceRow } from '../../src/lib/data';
import { dayLabel, groupValue } from '../../src/lib/settings';
import { colors, font } from '../../src/theme';

const SHOWN = 3;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [recs, setRecs] = useState<RecurrenceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([loadCategories(), loadRecurrences()]);
      setGroups(c.groups);
      setCats(c.cats);
      setRecs(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Les plus grosses charges actives d'abord, comme sur la maquette.
  const top = recs.filter((r) => r.active).sort((a, b) => b.amount_cents - a.amount_cents).slice(0, SHOWN);
  const others = recs.length - top.length;

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 40 }]}>
      <Text style={s.title} accessibilityRole="header">Réglages</Text>
      {error && <Text style={s.error}>Impossible de charger les réglages : {error}</Text>}

      <SectionTitle title="Catégories et prévus" right={{ label: 'Ajouter', onPress: () => setAdding(true) }} />
      <Card>
        {groups.map((g, i) => (
          <Fragment key={g.id}>
            {i > 0 && <Divider />}
            <ListRow label={g.name} chevron valueTone="muted"
              value={groupValue(cats.filter((c) => c.group_id === g.id).map((c) => c.default_planned_cents))}
              onPress={() => router.push({ pathname: '/groupe/[id]', params: { id: g.id } })} />
          </Fragment>
        ))}
      </Card>

      <SectionTitle title="Charges récurrentes" right="Ajoutées chaque mois" />
      <Card>
        {top.map((r) => (
          <Fragment key={r.id}>
            <ListRow label={r.label} sublabel={dayLabel(r.day_of_month)} value={formatEuros(r.amount_cents)}
              onPress={() => router.push('/recurrences')} />
            <Divider />
          </Fragment>
        ))}
        <Pressable accessibilityRole="button" onPress={() => router.push('/recurrences')}
          style={({ pressed }) => [s.more, pressed && { backgroundColor: colors.surface2 }]}>
          <Text style={s.moreText}>{others > 0 ? `+ ${others} autre${others > 1 ? 's' : ''}` : 'Toutes les charges'}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </Card>

      <SectionTitle title="Données" />
      <Card style={{ opacity: 0.6 }}>
        <ListRow label="Exporter en Excel" value="Bientôt" valueTone="muted" chevron />
      </Card>

      <CategoryEditSheet visible={adding} groups={groups} category={null} onClose={() => setAdding(false)} onSaved={load} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 140, gap: 8 },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 32, letterSpacing: -0.5, marginBottom: 12 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
  more: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 12, paddingHorizontal: 16 },
  moreText: { flex: 1, color: colors.textMuted, fontFamily: font.regular, fontSize: 16 },
});
