import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategorySheet } from '../src/components/CategorySheet';
import { formatEuros } from '../src/lib/budget';
import { loadCategories, saveEntry, topCategoryIds, type CategoryRow, type GroupRow } from '../src/lib/data';
import { isFormula, parseFormula } from '../src/lib/formula';
import { pressKey, type Key } from '../src/lib/keypad';
import { colors, font, radius } from '../src/theme';

type Kind = 'depense' | 'revenu';

const KEYS: Key[][] = [['7', '8', '9', 'del'], ['4', '5', '6', '×'], ['1', '2', '3', '+'], [',', '0']];

// Date locale AAAA-MM-JJ : toISOString décalerait en UTC (veille après minuit).
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (isoDay(d) === isoDay(today)) return 'Aujourd’hui';
  if (isoDay(d) === isoDay(yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Saisie rapide (maquette 3a) : pavé numérique, montant simple ou formule « 12+2+5×2,99 ».
export default function Saisie() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [kind, setKind] = useState<Kind>('depense');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [top, setTop] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [merchant, setMerchant] = useState('');
  const [exceptional, setExceptional] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catégories du type, les plus utilisées d'abord, puis l'ordre des réglages.
  const ranked = (k: Kind, g = groups, c = cats, t = top) => {
    const ids = new Set(g.filter((x) => x.kind === k).map((x) => x.id));
    const ofKind = c.filter((x) => ids.has(x.group_id));
    const known = new Set(ofKind.map((x) => x.id));
    return [...new Set([...t.filter((id) => known.has(id)), ...ofKind.map((x) => x.id)])];
  };

  useEffect(() => {
    Promise.all([loadCategories(), topCategoryIds().catch(() => [] as string[])])
      .then(([{ groups: g, cats: c }, t]) => {
        setGroups(g); setCats(c); setTop(t);
        setCategoryId(ranked('depense', g, c, t)[0] ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Un « + » ou « × » final est une frappe en cours, pas une erreur : on l'ignore.
  const parsed = useMemo(() => parseFormula(input.replace(/[+×]$/, '')), [input]);
  const formula = isFormula(input);
  const category = cats.find((c) => c.id === categoryId);
  const suggestions = ranked(kind).filter((id) => id !== categoryId).slice(0, 3)
    .map((id) => cats.find((c) => c.id === id)!);
  const canSave = parsed.ok && parsed.totalCents > 0 && !!categoryId && !saving;

  const switchKind = (k: Kind) => {
    setKind(k);
    setCategoryId(ranked(k)[0] ?? null);
  };

  const pickDate = () => DateTimePickerAndroid.open({
    value: date, mode: 'date', maximumDate: new Date(),
    onChange: (e, d) => { if (e.type === 'set' && d) setDate(d); },
  });

  const openArticles = () => router.push({
    pathname: '/saisie-articles',
    params: { kind, date: isoDay(date), merchant, exceptional: exceptional ? '1' : '0', categoryId: categoryId ?? '', amount: input },
  });

  const save = async () => {
    if (!parsed.ok || !categoryId) return;
    setSaving(true);
    setError(null);
    try {
      await saveEntry({
        date: isoDay(date),
        merchant: merchant.trim() || undefined,
        exceptional: kind === 'depense' && exceptional,
        source: formula ? 'formule' : 'manuel',
        formula: formula ? input : undefined,
        lines: parsed.lines.map((l) => ({ ...l, categoryId })),
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <View style={s.header}>
        <Pressable accessibilityLabel="Fermer" style={s.circle} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={s.segment}>
          {(['depense', 'revenu'] as const).map((k) => (
            <Pressable key={k} onPress={() => switchKind(k)} style={[s.segItem, kind === k && s.segActive]}
              accessibilityRole="button" accessibilityState={{ selected: kind === k }}>
              <Text style={[s.segText, kind === k && s.segTextActive]}>{k === 'depense' ? 'Dépense' : 'Revenu'}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Scanner un ticket"
          onPress={() => router.push('/ticket')} style={s.circle}>
          <Ionicons name="scan-outline" size={22} color={colors.accentText} />
        </Pressable>
      </View>

      <View style={s.middle}>
        <Text style={[s.amount, !input && s.faint]} numberOfLines={1} adjustsFontSizeToFit>
          {input || '0'}<Text style={s.faint}> €</Text>
        </Text>
        {formula && (
          <Text style={[s.hint, !parsed.ok && { color: colors.warn }]}>
            {parsed.ok
              ? `= ${formatEuros(parsed.totalCents)} · ${parsed.lines.length} article${parsed.lines.length > 1 ? 's' : ''}`
              : parsed.error}
          </Text>
        )}

        <Pressable style={s.catChip} onPress={() => setSheetOpen(true)} accessibilityLabel="Choisir la catégorie">
          <View style={s.catIcon}>
            <Ionicons name="bag-handle-outline" size={17} color={colors.accentText} />
          </View>
          <Text style={s.catText} numberOfLines={1}>{category?.name ?? 'Choisir une catégorie'}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>

        <View style={s.suggestions}>
          {suggestions.map((c) => (
            <Pressable key={c.id} style={s.suggestion} onPress={() => setCategoryId(c.id)}>
              <Text style={s.suggestionText}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        {error && <Text style={[s.hint, { color: colors.warn }]}>{error}</Text>}
      </View>

      {kind === 'depense' && (
        <View style={s.card}>
          <View style={s.helpIcon}>
            <Ionicons name="help-circle-outline" size={20} color={colors.income} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Dépense exceptionnelle ?</Text>
            <Text style={s.cardSub}>Exclue du total « sans imprévus »</Text>
          </View>
          <Switch value={exceptional} onValueChange={setExceptional} accessibilityLabel="Dépense exceptionnelle"
            trackColor={{ true: colors.accent, false: colors.borderStrong }} thumbColor={colors.textMuted} />
        </View>
      )}

      <View style={s.pills}>
        <Pressable style={s.pill} onPress={pickDate} accessibilityLabel="Choisir la date">
          <Ionicons name="calendar-outline" size={18} color={colors.text} />
          <Text style={s.pillText}>{dayLabel(date)}</Text>
        </Pressable>
        <Pressable style={[s.pill, s.shrink]} onPress={() => setNoteOpen(true)} accessibilityLabel="Note">
          <Ionicons name="create-outline" size={18} color={colors.text} />
          <Text style={[s.pillText, s.shrink]} numberOfLines={1}>{merchant.trim() || 'Note'}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={s.pill} onPress={openArticles} accessibilityLabel="Ajouter un article">
          <Ionicons name="add" size={20} color={colors.text} />
          <Text style={s.pillText}>Article</Text>
        </Pressable>
      </View>

      <View style={s.keypad}>
        {KEYS.map((row, i) => (
          <View key={i} style={s.keyRow}>
            {row.map((k) => {
              const op = k === 'del' || k === '×' || k === '+';
              return (
                <Pressable key={k} style={[s.key, op && s.opKey]} onPress={() => setInput((v) => pressKey(v, k))}
                  onLongPress={k === 'del' ? () => setInput('') : undefined}
                  accessibilityLabel={k === 'del' ? 'Effacer (appui long : tout effacer)' : k}>
                  {k === 'del'
                    ? <Ionicons name="backspace-outline" size={26} color={colors.textMuted} />
                    : <Text style={[s.keyText, op && s.opText]}>{k}</Text>}
                </Pressable>
              );
            })}
            {i === 3 && (
              <Pressable style={[s.key, s.validate, !canSave && s.disabled]} disabled={!canSave} onPress={save}
                accessibilityRole="button" accessibilityState={{ disabled: !canSave }}>
                <Text style={s.validateText}>{saving ? 'Enregistrement…' : 'Valider'}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <CategorySheet visible={sheetOpen} kind={kind} groups={groups} cats={cats} selectedId={categoryId}
        onSelect={setCategoryId} onClose={() => setSheetOpen(false)} />

      <Modal visible={noteOpen} transparent animationType="fade" onRequestClose={() => setNoteOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Pressable style={s.backdrop} onPress={() => setNoteOpen(false)} accessibilityLabel="Fermer">
            <Pressable style={s.noteBox}>
              <Text style={s.cardTitle}>Note</Text>
              <TextInput style={s.noteInput} value={merchant} onChangeText={setMerchant} autoFocus
                placeholder="Commerçant ou note" placeholderTextColor={colors.textFaint}
                returnKeyType="done" onSubmitEditing={() => setNoteOpen(false)} />
              <Pressable style={s.noteOk} onPress={() => setNoteOpen(false)}>
                <Text style={s.validateText}>OK</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  circle: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segItem: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, justifyContent: 'center' },
  segActive: { backgroundColor: colors.text },
  segText: { color: colors.textMuted, fontFamily: font.medium, fontSize: 15 },
  segTextActive: { color: colors.bg, fontFamily: font.semibold },

  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  amount: { color: colors.text, fontFamily: font.semibold, fontSize: 72, letterSpacing: -2 },
  faint: { color: colors.textFaint },
  hint: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: -8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingLeft: 6, paddingRight: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, maxWidth: '100%' },
  catIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  catText: { color: colors.text, fontFamily: font.semibold, fontSize: 16, flexShrink: 1 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  suggestion: { height: 29, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  suggestionText: { color: colors.textSoft, fontFamily: font.regular, fontSize: 13 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  helpIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.incomeBg, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 15 },
  cardSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 12, marginTop: 2 },

  pills: { flexDirection: 'row', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pillText: { color: colors.text, fontFamily: font.regular, fontSize: 15 },
  shrink: { flexShrink: 1 },

  keypad: { gap: 8 },
  keyRow: { flexDirection: 'row', gap: 8 },
  key: { flex: 1, height: 58, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  opKey: { backgroundColor: colors.bg, borderColor: colors.divider },
  keyText: { color: colors.text, fontFamily: font.regular, fontSize: 28 },
  opText: { color: colors.textMuted, fontSize: 24 },
  // Base de 8 = l'écart absorbé : Valider fait exactement deux touches + un espace.
  validate: { flexGrow: 2, flexBasis: 8, backgroundColor: colors.accent, borderColor: colors.accent },
  validateText: { color: colors.accentInk, fontFamily: font.semibold, fontSize: 17 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  noteBox: { gap: 12, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  noteInput: { height: 48, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, color: colors.text, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 15 },
  noteOk: { height: 46, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
