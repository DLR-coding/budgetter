// Panneau du bas : créer un groupe (nom, type) ou le modifier (renommer, monter / descendre, supprimer).
// Supprimer un groupe qui a des catégories les déplace d'abord dans un autre groupe du même type.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GroupKind } from '../lib/budget';
import {
  createGroup, deleteGroup, renameGroup, setGroupPositions, type CategoryRow, type GroupRow,
} from '../lib/data';
import { haptics } from '../lib/haptics';
import { KINDS, moveGroup } from '../lib/settings';
import { colors, font, radius } from '../theme';
import { ActionTile, BottomSheet, CategoryPill, PrimaryButton } from './ui';

type Props = {
  visible: boolean;
  group: GroupRow | null;   // null = création
  defaultKind?: GroupKind;
  groups: GroupRow[];
  cats: CategoryRow[];      // toutes, archivées comprises : elles partent avec le groupe
  onClose: () => void;
  onSaved: () => void;      // après une suppression aussi : l'écran appelant décide où aller
};

export function GroupEditSheet({ visible, group, defaultKind = 'depense', groups, cats, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>(defaultKind);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(group?.name ?? '');
    setKind(group?.kind ?? defaultKind);
    setDeleting(false);
    setMoveTo(null);
    setError(null);
  }, [visible, group, defaultKind]);

  const run = async (action: () => Promise<void>, close = true) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      haptics.success();
      onSaved();
      if (close) onClose();
    } catch (e) {
      haptics.warning();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!name.trim()) return setError('Donne un nom au groupe.');
    run(() => (group ? renameGroup(group.id, name) : createGroup(name, kind)));
  };

  const ownCats = group ? cats.filter((c) => c.group_id === group.id) : [];
  const siblings = group ? groups.filter((g) => g.kind === group.kind && g.id !== group.id) : [];
  const moves = group ? { up: moveGroup(groups, group.id, -1), down: moveGroup(groups, group.id, 1) } : null;
  const kindLabel = KINDS.find((k) => k.kind === (group?.kind ?? kind))!.label;

  return (
    <BottomSheet visible={visible} onClose={onClose}
      title={!group ? 'Nouveau groupe' : deleting ? 'Supprimer ce groupe ?' : 'Modifier le groupe'}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {group && deleting ? (
          <>
            {ownCats.length === 0 ? (
              <Text style={s.text}>« {group.name} » est vide : il sera simplement retiré.</Text>
            ) : siblings.length === 0 ? (
              <Text style={s.warn}>
                « {group.name} » contient {ownCats.length} catégorie{ownCats.length > 1 ? 's' : ''}. Crée d’abord un autre
                groupe dans {kindLabel} pour les y déplacer.
              </Text>
            ) : (
              <>
                <Text style={s.text}>
                  Ses {ownCats.length} catégorie{ownCats.length > 1 ? 's' : ''} et leurs saisies passent dans :
                </Text>
                <View style={s.pills}>
                  {siblings.map((g) => (
                    <CategoryPill key={g.id} label={g.name} tint="accent" outlined={g.id !== moveTo} onPress={() => setMoveTo(g.id)} />
                  ))}
                </View>
              </>
            )}
            {error && <Text style={s.error}>{error}</Text>}
            <View style={s.buttons}>
              <View style={{ flex: 1 }}><PrimaryButton label="Annuler" variant="secondary" onPress={() => setDeleting(false)} /></View>
              <View style={{ flex: 1 }}>
                <PrimaryButton label={busy ? 'Suppression…' : 'Supprimer'} variant="danger"
                  disabled={busy || (ownCats.length > 0 && !moveTo)}
                  onPress={() => run(() => deleteGroup(group.id, moveTo ?? undefined))} />
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={s.label}>Nom</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Ex. Transport" maxLength={60}
              placeholderTextColor={colors.textFaint} autoFocus={!group} accessibilityLabel="Nom du groupe" />

            {!group && (
              <>
                <Text style={s.label}>Type</Text>
                <View style={s.pills}>
                  {KINDS.map((k) => (
                    <CategoryPill key={k.kind} label={k.label} tint={k.kind === 'revenu' ? 'income' : 'accent'}
                      outlined={k.kind !== kind} onPress={() => setKind(k.kind)} />
                  ))}
                </View>
              </>
            )}

            {error && <Text style={s.error}>{error}</Text>}
            <PrimaryButton label={group ? 'Enregistrer' : 'Créer'} onPress={save}
              disabled={busy || !name.trim() || name.trim() === group?.name} />

            {group && moves && (
              <>
                <Text style={s.label}>Place dans {kindLabel}</Text>
                <View style={s.buttons}>
                  <ActionTile icon="arrow-up" label="Monter" disabled={busy || !moves.up.length}
                    onPress={() => run(() => setGroupPositions(moves.up), false)} />
                  <ActionTile icon="arrow-down" label="Descendre" disabled={busy || !moves.down.length}
                    onPress={() => run(() => setGroupPositions(moves.down), false)} />
                  <ActionTile icon="trash-outline" label="Supprimer" tone="danger" disabled={busy} onPress={() => setDeleting(true)} />
                </View>
              </>
            )}
          </>
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
  buttons: { flexDirection: 'row', gap: 10 },
  text: { color: colors.text, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  warn: { color: colors.danger, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
});
