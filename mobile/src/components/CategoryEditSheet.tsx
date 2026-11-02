import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatAmount } from '../lib/budget';
import { createCategory, updateCategory, type CategoryRow, type GroupRow } from '../lib/data';
import { parsePlannedCents } from '../lib/settings';
import { colors, font, radius } from '../theme';
import { BottomSheet, CategoryPill, PrimaryButton } from './ui';

type Props = {
  visible: boolean;
  groups: GroupRow[];
  category: CategoryRow | null;   // null = création
  defaultGroupId?: string;
  onClose: () => void;
  onSaved: () => void;
};

// Panneau du bas : créer ou modifier une catégorie (nom, groupe, prévu par défaut, archiver).
export function CategoryEditSheet({ visible, groups, category, defaultGroupId, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [planned, setPlanned] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(category?.name ?? '');
    setGroupId(category?.group_id ?? defaultGroupId ?? groups[0]?.id ?? null);
    setPlanned(category && category.default_planned_cents > 0 ? formatAmount(category.default_planned_cents) : '');
    setError(null);
  }, [visible, category, defaultGroupId, groups]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const cents = parsePlannedCents(planned);
    if (!name.trim()) return setError('Donne un nom à la catégorie.');
    if (!groupId) return setError('Choisis un groupe.');
    if (cents == null) return setError('Prévu illisible ou négatif.');
    run(() => category
      ? updateCategory(category.id, { name: name.trim(), groupId, defaultPlannedCents: cents })
      : createCategory({ groupId, name: name.trim(), defaultPlannedCents: cents }));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Nom</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Ex. Courses"
          placeholderTextColor={colors.textFaint} autoFocus={!category} />

        <Text style={s.label}>Groupe</Text>
        <View style={s.pills}>
          {groups.map((g) => (
            <CategoryPill key={g.id} label={g.name} tint="accent" outlined={g.id !== groupId} onPress={() => setGroupId(g.id)} />
          ))}
        </View>

        <Text style={s.label}>Prévu par défaut, chaque mois</Text>
        <View style={s.amountRow}>
          <TextInput style={[s.input, { flex: 1 }]} value={planned} onChangeText={setPlanned} placeholder="0,00"
            placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" />
          <Text style={s.euro}>€</Text>
        </View>

        {error && <Text style={s.error}>{error}</Text>}

        <PrimaryButton label="Enregistrer" onPress={save} disabled={busy} />
        {category && (
          <PrimaryButton variant="secondary" disabled={busy}
            label={category.archived ? 'Désarchiver' : 'Archiver'}
            onPress={() => run(() => updateCategory(category.id, { archived: !category.archived }))} />
        )}
        {category && !category.archived && (
          <Text style={s.note}>Une catégorie archivée disparaît de la saisie ; ses saisies passées restent.</Text>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: { gap: 10, paddingBottom: 4 },
  label: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 4 },
  input: {
    height: 50, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    paddingHorizontal: 14, color: colors.text, fontFamily: font.regular, fontSize: 16,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  euro: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 17 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
  note: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, textAlign: 'center' },
});
