import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheet, Card, CategoryPill, Divider, EntryIcon, PrimaryButton, ScreenHeader, SectionTitle,
} from '../../src/components/ui';
import { isoDate } from '../../src/lib/articles';
import { formatEuros, tintFor } from '../../src/lib/budget';
import { deleteEntry, loadCategories, loadEntry, updateEntry, type EntryRow } from '../../src/lib/data';
import { dayMonth, entryKind, linesByCategory, signedCents, type Ctx } from '../../src/lib/entries';
import { supabase } from '../../src/lib/supabase';
import { colors, font, radius } from '../../src/theme';

type Draft = { merchant: string; date: string; note: string; exceptional: boolean };
const draftOf = (e: EntryRow): Draft =>
  ({ merchant: e.merchant ?? '', date: e.date, note: e.note ?? '', exceptional: e.exceptional });

// Détail d'une saisie (maquette 9) : infos modifiables, articles par catégorie, photo, suppression.
export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<EntryRow | null>(null);
  const [ctx, setCtx] = useState<Ctx>({ groups: [], cats: [] });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<'merchant' | 'note' | null>(null);
  const [text, setText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadEntry(id), loadCategories()])
      .then(([e, c]) => { setEntry(e); setDraft(draftOf(e)); setCtx(c); })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (!entry || !draft) {
    return (
      <View style={s.screen}>
        <ScreenHeader title="Saisie" left="back" />
        {error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const kind = entryKind(entry, ctx);
  const n = entry.entry_lines.length;
  const origin = entry.source === 'ticket' ? 'Ticket scanné' : entry.source === 'recurrence' ? 'Récurrente' : 'Saisie manuelle';
  const initial = draftOf(entry);
  const dirty = draft.merchant.trim() !== initial.merchant || draft.note.trim() !== initial.note
    || draft.date !== initial.date || draft.exceptional !== initial.exceptional;

  const pickDate = () => {
    const [y, m, d] = draft.date.split('-').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(y, m - 1, d), mode: 'date',
      onChange: (ev, picked) => { if (ev.type === 'set' && picked) setDraft({ ...draft, date: isoDate(picked) }); },
    });
  };

  const openEdit = (field: 'merchant' | 'note') => { setText(draft[field]); setEditing(field); };
  const closeEdit = () => {
    if (editing) setDraft({ ...draft, [editing]: text });
    setEditing(null);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const save = () => run(() => updateEntry(entry.id, {
    merchant: draft.merchant.trim() || null, note: draft.note.trim() || null, date: draft.date,
    exceptional: kind !== 'revenu' && draft.exceptional,
  }));

  const showPhoto = async () => {
    const { data, error: e } = await supabase.storage.from('receipts').createSignedUrl(entry.receipt_path!, 3600);
    if (e) setError(e.message);
    else setPhotoUrl(data.signedUrl);
  };

  return (
    <View style={s.screen}>
      <ScreenHeader title="Saisie" left="back" right={
        <Pressable style={s.deletePill} onPress={() => setConfirmDelete(true)} accessibilityRole="button" hitSlop={6}>
          <Text style={s.deleteText}>Supprimer</Text>
        </Pressable>
      } />

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <EntryIcon source={entry.source} kind={kind} size={54} />
          <Text style={[s.amount, kind === 'revenu' && { color: colors.income }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatEuros(signedCents(entry, ctx), true)}
          </Text>
          <Text style={s.origin}>{n > 1 ? `${origin} · ${n} articles` : origin}</Text>
        </View>

        <Card>
          <InfoRow label="Commerçant" onPress={() => openEdit('merchant')} chevron>
            <Text style={s.infoValue} numberOfLines={1}>{draft.merchant.trim() || '—'}</Text>
          </InfoRow>
          <Divider />
          <InfoRow label="Date" onPress={pickDate} chevron>
            <Text style={s.infoValue}>{dayMonth(draft.date, true)}</Text>
          </InfoRow>
          <Divider />
          <InfoRow label="Note" onPress={() => openEdit('note')}>
            {draft.note.trim()
              ? <Text style={s.infoValue} numberOfLines={1}>{draft.note.trim()}</Text>
              : <Text style={[s.infoValue, { color: colors.accentText }]}>Ajouter</Text>}
          </InfoRow>
          {kind !== 'revenu' && (
            <>
              <Divider />
              <InfoRow label="Exceptionnelle">
                <Switch value={draft.exceptional} onValueChange={(v) => setDraft({ ...draft, exceptional: v })}
                  accessibilityLabel="Dépense exceptionnelle"
                  trackColor={{ true: colors.accent, false: colors.borderStrong }} thumbColor={colors.textMuted} />
              </InfoRow>
            </>
          )}
        </Card>

        <SectionTitle title="Articles" right={{
          label: 'Modifier les articles',
          onPress: () => router.push({ pathname: '/saisie-articles', params: { entryId: entry.id } }),
        }} />
        <Card>
          {linesByCategory(entry.entry_lines).map((c, i) => {
            const cat = ctx.cats.find((x) => x.id === c.categoryId);
            const group = ctx.groups.find((g) => g.id === cat?.group_id);
            return (
              <Fragment key={c.categoryId}>
                {i > 0 && <Divider />}
                <View style={s.catRow}>
                  <CategoryPill label={cat?.name ?? 'Catégorie archivée'} tint={group ? tintFor(group) : 'accent'} />
                  <Text style={s.catDetail} numberOfLines={1}>
                    {c.lines.length > 1 ? `${c.lines.length} articles` : c.lines[0].label ?? c.lines[0].raw_label ?? ''}
                  </Text>
                  <Text style={s.catAmount}>{formatEuros(c.cents)}</Text>
                </View>
              </Fragment>
            );
          })}
        </Card>

        {entry.receipt_path && (
          <Card>
            <Pressable style={({ pressed }) => [s.photoRow, pressed && { backgroundColor: colors.surface2 }]}
              onPress={showPhoto} accessibilityRole="button">
              <View style={s.photoIcon}><Ionicons name="image-outline" size={20} color={colors.textMuted} /></View>
              <Text style={s.photoText}>Voir la photo du ticket</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </Card>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton label={busy ? 'Enregistrement…' : 'Enregistrer'} onPress={save} disabled={!dirty || busy} />
      </View>

      <BottomSheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer cette saisie ?">
        <Text style={s.sheetText}>
          {entry.receipt_path ? 'La saisie, ses articles et la photo du ticket seront effacés.' : 'La saisie et ses articles seront effacés.'}
        </Text>
        <View style={s.sheetButtons}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Annuler" variant="secondary" onPress={() => setConfirmDelete(false)} />
          </View>
          <Pressable style={[s.dangerButton, busy && { opacity: 0.4 }]} disabled={busy} accessibilityRole="button"
            onPress={() => { setConfirmDelete(false); run(() => deleteEntry(entry.id, entry.receipt_path)); }}>
            <Text style={s.dangerText}>Supprimer</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeEdit} statusBarTranslucent>
        <Pressable style={s.backdrop} onPress={closeEdit} accessibilityLabel="Fermer">
          <Pressable style={s.editBox}>
            <Text style={s.editTitle}>{editing === 'merchant' ? 'Commerçant' : 'Note'}</Text>
            <TextInput style={s.editInput} value={text} onChangeText={setText} autoFocus
              placeholder={editing === 'merchant' ? 'Auchan, Lidl…' : 'Une précision'} placeholderTextColor={colors.textFaint}
              returnKeyType="done" onSubmitEditing={closeEdit} />
            <PrimaryButton label="OK" onPress={closeEdit} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={photoUrl !== null} animationType="fade" onRequestClose={() => setPhotoUrl(null)} statusBarTranslucent>
        <View style={[s.photoScreen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={s.photoClose} onPress={() => setPhotoUrl(null)} accessibilityLabel="Fermer" hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          {photoUrl && <Image source={{ uri: photoUrl }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel="Photo du ticket" />}
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ label, onPress, chevron, children }: {
  label: string; onPress?: () => void; chevron?: boolean; children: ReactNode;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.infoRow, pressed && { backgroundColor: colors.surface2 }]}>
      <Text style={s.infoLabel}>{label}</Text>
      <View style={s.infoRight}>{children}</View>
      {chevron && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  content: { paddingBottom: 24, gap: 14 },
  error: { color: colors.warn, fontFamily: font.regular, textAlign: 'center', marginTop: 8 },

  deletePill: {
    height: 46, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, justifyContent: 'center',
  },
  deleteText: { color: colors.warn, fontFamily: font.medium, fontSize: 15 },

  hero: { alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 6 },
  amount: { color: colors.text, fontFamily: font.semibold, fontSize: 52, letterSpacing: -1.5, marginTop: 6 },
  origin: { color: colors.textSoft, fontFamily: font.regular, fontSize: 14 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 16 },
  infoLabel: { color: colors.textMuted, fontFamily: font.regular, fontSize: 16 },
  infoRight: { flex: 1, alignItems: 'flex-end' },
  infoValue: { color: colors.text, fontFamily: font.regular, fontSize: 16 },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16 },
  catDetail: { flex: 1, color: colors.textMuted, fontFamily: font.regular, fontSize: 15 },
  catAmount: { color: colors.text, fontFamily: font.medium, fontSize: 16 },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  photoIcon: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  photoText: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 16 },

  footer: { paddingTop: 8 },

  sheetText: { color: colors.textSoft, fontFamily: font.regular, fontSize: 14 },
  sheetButtons: { flexDirection: 'row', gap: 10 },
  dangerButton: {
    flex: 1, height: 56, borderRadius: radius.pill, backgroundColor: colors.warnBg, alignItems: 'center', justifyContent: 'center',
  },
  dangerText: { color: colors.warn, fontFamily: font.semibold, fontSize: 17 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  editBox: { gap: 12, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  editTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 15 },
  editInput: {
    height: 48, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    color: colors.text, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 15,
  },

  photoScreen: { flex: 1, backgroundColor: colors.bg, gap: 12 },
  photoClose: {
    alignSelf: 'flex-end', marginRight: 16, width: 46, height: 46, borderRadius: 23, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
});
