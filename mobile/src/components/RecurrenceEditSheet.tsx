import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { formatAmount, type GroupKind } from '../lib/budget';
import { saveRecurrence, type CategoryRow, type GroupRow, type RecurrenceRow } from '../lib/data';
import { clampDay, dayLabel, parsePlannedCents } from '../lib/settings';
import { colors, font, radius } from '../theme';
import { CategorySheet } from './CategorySheet';
import { BottomSheet, CircleButton, PrimaryButton } from './ui';

type Props = {
  visible: boolean;
  groups: GroupRow[];
  cats: CategoryRow[];
  recurrence: RecurrenceRow | null;   // null = création
  onClose: () => void;
  onSaved: () => void;
};

// Panneau du bas : créer ou modifier une charge récurrente (libellé, montant, jour, catégorie, active).
export function RecurrenceEditSheet({ visible, groups, cats, recurrence, onClose, onSaved }: Props) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(1);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [kind, setKind] = useState<GroupKind>('depense');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLabel(recurrence?.label ?? '');
    setAmount(recurrence ? formatAmount(recurrence.amount_cents) : '');
    setDay(recurrence?.day_of_month ?? 1);
    setCategoryId(recurrence?.category_id ?? null);
    setActive(recurrence?.active ?? true);
    const cat = cats.find((c) => c.id === recurrence?.category_id);
    setKind(groups.find((g) => g.id === cat?.group_id)?.kind ?? 'depense');
    setError(null);
  }, [visible, recurrence, cats, groups]);

  const category = cats.find((c) => c.id === categoryId);
  const switchKind = (k: GroupKind) => {
    if (k === kind) return;
    setKind(k);
    setCategoryId(null); // la catégorie choisie appartient à l'autre type
  };

  const save = async () => {
    const cents = parsePlannedCents(amount);
    if (!label.trim()) return setError('Donne un libellé à la charge.');
    if (!cents) return setError('Montant illisible, négatif ou nul.');
    if (!categoryId) return setError('Choisis une catégorie.');
    setBusy(true);
    try {
      await saveRecurrence({ id: recurrence?.id, categoryId, label: label.trim(), amountCents: cents, dayOfMonth: day, active });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={recurrence ? 'Modifier la charge' : 'Nouvelle charge récurrente'}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.segment}>
          {(['depense', 'revenu'] as const).map((k) => (
            <Pressable key={k} onPress={() => switchKind(k)} style={[s.segItem, kind === k && s.segActive]}
              accessibilityRole="button" accessibilityState={{ selected: kind === k }}>
              <Text style={[s.segText, kind === k && s.segTextActive]}>{k === 'depense' ? 'Dépense' : 'Revenu'}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>Libellé</Text>
        <TextInput style={s.input} value={label} onChangeText={setLabel} placeholder="Ex. Loyer"
          placeholderTextColor={colors.textFaint} autoFocus={!recurrence} />

        <Text style={s.label}>Montant</Text>
        <View style={s.inline}>
          <TextInput style={[s.input, { flex: 1 }]} value={amount} onChangeText={setAmount} placeholder="0,00"
            placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" />
          <Text style={s.euro}>€</Text>
        </View>

        <Text style={s.label}>Jour</Text>
        <View style={s.inline}>
          <CircleButton icon="remove" accessibilityLabel="Jour précédent" onPress={() => setDay(clampDay(day - 1))} />
          <Text style={s.day}>{dayLabel(day)}</Text>
          <CircleButton icon="add" accessibilityLabel="Jour suivant" onPress={() => setDay(clampDay(day + 1))} />
        </View>

        <Text style={s.label}>Catégorie</Text>
        <Pressable style={s.field} accessibilityRole="button" onPress={() => setPicking(true)}>
          <Text style={[s.fieldText, !category && { color: colors.textFaint }]}>{category?.name ?? 'Choisir'}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={s.switchRow}>
          <Text style={s.fieldText}>Active</Text>
          <Switch value={active} onValueChange={setActive}
            trackColor={{ false: colors.surface2, true: colors.accent }} thumbColor={colors.text} />
        </View>

        <Text style={s.note}>Les saisies sont créées automatiquement chaque mois.</Text>
        {error && <Text style={s.error}>{error}</Text>}
        <PrimaryButton label="Enregistrer" onPress={save} disabled={busy} />
      </ScrollView>

      <CategorySheet visible={picking} kind={kind} groups={groups} cats={cats} selectedId={categoryId}
        onSelect={setCategoryId} onClose={() => setPicking(false)} />
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: { gap: 10, paddingBottom: 4 },
  // Bascule Dépense / Revenu, même rendu que la saisie rapide.
  segment: {
    flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface2,
  },
  segItem: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, justifyContent: 'center' },
  segActive: { backgroundColor: colors.text },
  segText: { color: colors.textMuted, fontFamily: font.medium, fontSize: 15 },
  segTextActive: { color: colors.bg, fontFamily: font.semibold },
  label: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 4 },
  input: {
    height: 50, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    paddingHorizontal: 14, color: colors.text, fontFamily: font.regular, fontSize: 16,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  euro: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 17 },
  day: { flex: 1, textAlign: 'center', color: colors.text, fontFamily: font.medium, fontSize: 16 },
  field: {
    height: 50, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  fieldText: { color: colors.text, fontFamily: font.regular, fontSize: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 },
  note: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
});
