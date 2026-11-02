import { useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RecurrenceEditSheet } from '../src/components/RecurrenceEditSheet';
import { Card, CircleButton, Divider, ListRow, ScreenHeader, SectionTitle } from '../src/components/ui';
import { formatEuros } from '../src/lib/budget';
import { loadCategories, loadRecurrences, type CategoryRow, type GroupRow, type RecurrenceRow } from '../src/lib/data';
import { dayLabel } from '../src/lib/settings';
import { colors, font } from '../src/theme';

// Toutes les charges récurrentes : actives, puis inactives grisées.
export default function RecurrencesScreen() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [recs, setRecs] = useState<RecurrenceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecurrenceRow | null | undefined>(undefined); // undefined = fermé, null = création

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

  const sorted = [...recs.filter((r) => r.active), ...recs.filter((r) => !r.active)];
  const catName = (id: string) => cats.find((c) => c.id === id)?.name;

  return (
    <View style={s.screen}>
      <ScreenHeader title="Charges récurrentes" left="back"
        right={<CircleButton icon="add" accessibilityLabel="Ajouter une charge" onPress={() => setEditing(null)} />} />
      <ScrollView contentContainerStyle={s.content}>
        {error && <Text style={s.error}>Impossible de charger les charges : {error}</Text>}
        <SectionTitle title={`${recs.length} charge${recs.length > 1 ? 's' : ''}`} right="Ajoutées chaque mois" />
        <Card>
          {sorted.length === 0 && <ListRow label="Aucune charge récurrente" />}
          {sorted.map((r, i) => (
            <Fragment key={r.id}>
              {i > 0 && <Divider />}
              <View style={!r.active && { opacity: 0.45 }}>
                <ListRow label={r.label} value={formatEuros(r.amount_cents)} onPress={() => setEditing(r)}
                  sublabel={[dayLabel(r.day_of_month), catName(r.category_id), !r.active && 'inactive'].filter(Boolean).join(' · ')} />
              </View>
            </Fragment>
          ))}
        </Card>
      </ScrollView>

      <RecurrenceEditSheet visible={editing !== undefined} groups={groups} cats={cats} recurrence={editing ?? null}
        onClose={() => setEditing(undefined)} onSaved={load} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  content: { paddingTop: 8, paddingBottom: 40, gap: 8 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
});
