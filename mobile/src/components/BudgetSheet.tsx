// Budgets « comme des comptes » : changer de budget et en créer un (écran Mois),
// renommer ou supprimer (Réglages).
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createBudget, deleteBudget, loadBudgets, renameBudget, switchBudget, type BudgetRow } from '../lib/data';
import { haptics } from '../lib/haptics';
import { colors, font, radius } from '../theme';
import { BottomSheet, PrimaryButton } from './ui';

/** Pastille ronde avec l'initiale du budget. */
export function BudgetAvatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.46 }]}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
}

/** Liste des budgets : toucher pour basculer, « Nouveau budget » pour en créer un (vide, puis actif). */
export function BudgetSheet({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ budgets: BudgetRow[]; currentId: string | null } | null>(null);
  const [newName, setNewName] = useState<string | null>(null); // null : formulaire fermé
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNewName(null); setError(null);
    loadBudgets().then(setData, (e: Error) => setError(e.message));
  }, [visible]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      haptics.success();
      onChanged();
      onClose();
    } catch (e) {
      haptics.warning();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Budgets">
      <View style={{ gap: 6 }}>
        {!data && !error && <ActivityIndicator color={colors.accent} />}
        {data?.budgets.map((b) => {
          const current = b.id === data.currentId;
          return (
            <Pressable key={b.id} style={s.option} accessibilityRole="button" accessibilityState={{ selected: current }}
              disabled={busy} onPress={() => (current ? onClose() : run(() => switchBudget(b.id)))}>
              <BudgetAvatar name={b.name} />
              <Text style={s.optionText} numberOfLines={1}>{b.name}</Text>
              {current && <Ionicons name="checkmark" size={20} color={colors.accentText} />}
            </Pressable>
          );
        })}

        {newName == null ? (
          <Pressable style={s.option} accessibilityRole="button" onPress={() => setNewName('')} disabled={busy}>
            <Ionicons name="add" size={20} color={colors.accentText} />
            <Text style={[s.optionText, { color: colors.accentText }]}>Nouveau budget</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 10, marginTop: 6 }}>
            <TextInput style={s.input} value={newName} onChangeText={setNewName} autoFocus maxLength={60}
              placeholder="Nom du budget (ex. Vacances)" placeholderTextColor={colors.textFaint}
              accessibilityLabel="Nom du nouveau budget" />
            <Text style={s.muted}>Il démarre vide, avec les groupes Revenus, Dépenses et Épargne. Tes autres budgets ne changent pas.</Text>
            <PrimaryButton label={busy ? 'Création…' : 'Créer et ouvrir'} disabled={!newName.trim() || busy}
              onPress={() => run(() => createBudget(newName))} />
          </View>
        )}
        {error && <Text style={s.error}>{error}</Text>}
      </View>
    </BottomSheet>
  );
}

/** Renommer ou supprimer un budget. La suppression se confirme en retapant le nom. */
export function BudgetEditSheet({ budget, isLast, onClose, onSaved }: {
  budget: BudgetRow | null; isLast: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null); // null : pas en train de supprimer
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (budget) { setName(budget.name); setConfirm(null); setError(null); }
  }, [budget]);

  const run = async (action: () => Promise<void>, deleting = false) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      (deleting ? haptics.warning : haptics.success)();
      onSaved();
      onClose();
    } catch (e) {
      haptics.warning();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={budget != null} onClose={onClose} title={confirm == null ? 'Budget' : 'Supprimer ce budget ?'}>
      {budget && (confirm == null ? (
        <View style={{ gap: 12 }}>
          <TextInput style={s.input} value={name} onChangeText={setName} maxLength={60}
            accessibilityLabel="Nom du budget" />
          <PrimaryButton label="Enregistrer" disabled={!name.trim() || name.trim() === budget.name || busy}
            onPress={() => run(() => renameBudget(budget.id, name))} />
          {isLast
            ? <Text style={s.muted}>C’est ton seul budget : crée-en un autre pour pouvoir supprimer celui-ci.</Text>
            : <PrimaryButton label="Supprimer ce budget" variant="secondary" onPress={() => setConfirm('')} />}
          {error && <Text style={s.error}>{error}</Text>}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={s.warn}>
            Toutes les saisies, catégories, prévus, récurrences et photos de tickets de « {budget.name} » seront
            supprimés définitivement.
          </Text>
          <Text style={s.muted}>Tape « {budget.name} » pour confirmer.</Text>
          <TextInput style={s.input} value={confirm} onChangeText={setConfirm} autoFocus autoCapitalize="none"
            accessibilityLabel={`Tape ${budget.name} pour confirmer`} />
          <View style={s.buttons}>
            <View style={{ flex: 1 }}><PrimaryButton label="Annuler" variant="secondary" onPress={() => setConfirm(null)} /></View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label={busy ? 'Suppression…' : 'Supprimer'} disabled={confirm.trim() !== budget.name || busy}
                onPress={() => run(() => deleteBudget(budget.id), true)} />
            </View>
          </View>
          {error && <Text style={s.error}>{error}</Text>}
        </View>
      ))}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  avatar: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accentInk, fontFamily: font.semibold },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: colors.surface2,
  },
  optionText: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 16 },
  input: {
    height: 52, paddingHorizontal: 14, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2, color: colors.text, fontFamily: font.regular, fontSize: 17,
  },
  muted: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  warn: { color: colors.warn, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
  buttons: { flexDirection: 'row', gap: 10 },
});
