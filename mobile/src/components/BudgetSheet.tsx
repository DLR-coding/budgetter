// Budgets « comme des comptes » : changer de budget et en créer un (écran Mois),
// renommer ou supprimer (Réglages).
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createBudget, deleteBudget, loadBudgets, renameBudget, switchBudget, type BudgetRow } from '../lib/data';
import { haptics } from '../lib/haptics';
import { colors, font, radius } from '../theme';
import { ActionTile, BottomSheet, PrimaryButton } from './ui';

/** Pastille ronde avec l'initiale du budget. */
export function BudgetAvatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.46 }]}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
}

/** Point vert vif avec halo : budget actif. */
export function ActiveDot() {
  return (
    <View style={s.dotGlow} accessibilityLabel="Budget actif">
      <View style={s.dot} />
    </View>
  );
}

/**
 * Liste des budgets : toucher pour basculer, « Nouveau budget » pour en créer un (vide, puis actif).
 * `createOnly` : ouvre directement le formulaire de création, sans la liste (Réglages).
 */
export function BudgetSheet({ visible, onClose, onChanged, createOnly = false }: {
  visible: boolean; onClose: () => void; onChanged: () => void; createOnly?: boolean;
}) {
  const [data, setData] = useState<{ budgets: BudgetRow[]; currentId: string | null } | null>(null);
  const [newName, setNewName] = useState<string | null>(null); // null : formulaire fermé
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNewName(createOnly ? '' : null); setError(null);
    if (!createOnly) loadBudgets().then(setData, (e: Error) => setError(e.message));
  }, [visible, createOnly]);

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
    <BottomSheet visible={visible} onClose={onClose} title={createOnly ? 'Nouveau budget' : 'Budgets'}>
      <View style={{ gap: 6 }}>
        {!createOnly && !data && !error && <ActivityIndicator color={colors.accent} />}
        {data?.budgets.map((b) => {
          const current = b.id === data.currentId;
          return (
            <Pressable key={b.id} style={s.option} accessibilityRole="button" accessibilityState={{ selected: current }}
              disabled={busy} onPress={() => (current ? onClose() : run(() => switchBudget(b.id)))}>
              <BudgetAvatar name={b.name} />
              <Text style={s.optionText} numberOfLines={1}>{b.name}</Text>
              {current && <ActiveDot />}
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

/**
 * Fiche d'un budget : en-tête (pastille, nom, état), puis trois actions sur une ligne :
 * ouvrir, renommer (le nom devient modifiable sur place), supprimer (rouge, confirmé en retapant le nom).
 */
export function BudgetEditSheet({ budget, isLast, isCurrent, onClose, onSaved }: {
  budget: BudgetRow | null; isLast: boolean; isCurrent: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null); // null : pas en train de supprimer
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (budget) { setName(budget.name); setRenaming(false); setConfirm(null); setError(null); }
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
  const canRename = !!name.trim() && name.trim() !== budget?.name && !busy;

  return (
    <BottomSheet visible={budget != null} onClose={onClose} title={confirm == null ? '' : 'Supprimer ce budget ?'}>
      {budget && (confirm == null ? (
        <View style={{ gap: 18 }}>
          <View style={s.identity}>
            <BudgetAvatar name={name || budget.name} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              {renaming ? (
                <View style={s.renameRow}>
                  <TextInput style={[s.input, { flex: 1 }]} value={name} onChangeText={setName} maxLength={60} autoFocus
                    returnKeyType="done" onSubmitEditing={() => canRename && run(() => renameBudget(budget.id, name))}
                    accessibilityLabel="Nouveau nom du budget" />
                  <Pressable style={[s.confirmBtn, !canRename && { opacity: 0.4 }]} disabled={!canRename}
                    onPress={() => { haptics.press(); run(() => renameBudget(budget.id, name)); }}
                    accessibilityRole="button" accessibilityLabel="Enregistrer le nom">
                    <Ionicons name="checkmark" size={22} color={colors.accentInk} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={s.identityName} numberOfLines={1}>{budget.name}</Text>
                  {isCurrent
                    ? <View style={s.state}><ActiveDot /><Text style={s.stateLive}>Budget actif</Text></View>
                    : <Text style={s.muted}>Pas ouvert en ce moment</Text>}
                </>
              )}
            </View>
          </View>

          <View style={s.tiles}>
            <ActionTile icon={isCurrent ? 'checkmark-circle' : 'enter-outline'} label={isCurrent ? 'Ouvert' : 'Ouvrir'}
              tone={isCurrent ? 'default' : 'accent'} disabled={isCurrent || busy}
              onPress={() => run(() => switchBudget(budget.id))} />
            <ActionTile icon="pencil" label="Renommer" active={renaming} disabled={busy}
              onPress={() => { setName(budget.name); setRenaming(!renaming); }} />
            <ActionTile icon="trash-outline" label="Supprimer" tone="danger" disabled={isLast || busy}
              onPress={() => setConfirm('')} />
          </View>
          {isLast && <Text style={s.muted}>C’est ton seul budget : crée-en un autre pour pouvoir supprimer celui-ci.</Text>}
          {error && <Text style={s.error}>{error}</Text>}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={s.dangerBox}>
            <Ionicons name="warning-outline" size={20} color={colors.danger} />
            <Text style={s.dangerText}>
              Toutes les saisies, catégories, prévus, récurrences et photos de tickets de « {budget.name} » seront
              supprimés définitivement.
            </Text>
          </View>
          <Text style={s.muted}>Tape « {budget.name} » pour confirmer.</Text>
          <TextInput style={s.input} value={confirm} onChangeText={setConfirm} autoFocus autoCapitalize="none"
            accessibilityLabel={`Tape ${budget.name} pour confirmer`} />
          <View style={s.buttons}>
            <View style={{ flex: 1 }}><PrimaryButton label="Annuler" variant="secondary" onPress={() => setConfirm(null)} /></View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label={busy ? 'Suppression…' : 'Supprimer'} variant="danger"
                disabled={confirm.trim() !== budget.name || busy}
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
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 },
  identityName: { color: colors.text, fontFamily: font.semibold, fontSize: 22, letterSpacing: -0.3 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginLeft: -6 },
  stateLive: { color: colors.live, fontFamily: font.medium, fontSize: 14 },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 10 },
  dangerBox: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.key, backgroundColor: colors.dangerBg },
  dangerText: { flex: 1, color: colors.danger, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
  buttons: { flexDirection: 'row', gap: 10 },
  currentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 40 },
  dotGlow: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.liveGlow, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live },
});
