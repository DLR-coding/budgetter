import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryEditSheet } from '../../src/components/CategoryEditSheet';
import { Card, CircleButton, Divider, ListRow, ScreenHeader, SectionTitle } from '../../src/components/ui';
import { formatEuros } from '../../src/lib/budget';
import { loadCategories, type CategoryRow, type GroupRow } from '../../src/lib/data';
import { colors, font } from '../../src/theme';

// Catégories d'un groupe (actives puis archivées) ; appui → modifier, archiver ou désarchiver.
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null | undefined>(undefined); // undefined = fermé, null = création

  const load = useCallback(async () => {
    try {
      const c = await loadCategories({ includeArchived: true });
      setGroups(c.groups);
      setCats(c.cats.filter((x) => x.group_id === id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const group = groups.find((g) => g.id === id);
  const active = cats.filter((c) => !c.archived);
  const archived = cats.filter((c) => c.archived);

  const rows = (list: CategoryRow[]) => list.map((c, i) => (
    <Fragment key={c.id}>
      {i > 0 && <Divider />}
      <ListRow label={c.name} value={`${formatEuros(c.default_planned_cents)} / mois`} valueTone="muted" chevron
        onPress={() => setEditing(c)} />
    </Fragment>
  ));

  return (
    <View style={s.screen}>
      <ScreenHeader title={group?.name ?? ''} left="back"
        right={<CircleButton icon="add" accessibilityLabel="Ajouter une catégorie" onPress={() => setEditing(null)} />} />
      <ScrollView contentContainerStyle={s.content}>
        {error && <Text style={s.error}>Impossible de charger les catégories : {error}</Text>}

        <SectionTitle title="Catégories" right="Prévu par défaut" />
        <Card>
          {active.length ? rows(active) : <ListRow label="Aucune catégorie" />}
        </Card>

        {archived.length > 0 && (
          <>
            <SectionTitle title={`Archivées (${archived.length})`}
              right={{ label: showArchived ? 'Masquer' : 'Afficher', onPress: () => setShowArchived(!showArchived) }} />
            {showArchived && <Card style={{ opacity: 0.6 }}>{rows(archived)}</Card>}
          </>
        )}
      </ScrollView>

      <CategoryEditSheet visible={editing !== undefined} groups={groups} category={editing ?? null} defaultGroupId={id}
        onClose={() => setEditing(undefined)} onSaved={load} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  content: { paddingTop: 8, paddingBottom: 40, gap: 8 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
});
