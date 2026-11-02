import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategorySheet } from '../src/components/CategorySheet';
import { dayLabel, isoDate, parsePriceCents, subtotalsByCategory } from '../src/lib/articles';
import { formatEuros, tintFor, type GroupKind } from '../src/lib/budget';
import {
  loadCategories, loadEntry, replaceEntryLines, saveEntry, updateEntry, type CategoryRow, type GroupRow,
} from '../src/lib/data';
import { parseFormula } from '../src/lib/formula';
import { colors, font, radius } from '../src/theme';

type Params = { entryId?: string; kind?: string; date?: string; merchant?: string; exceptional?: string; categoryId?: string; amount?: string };
type Item = { key: number; label: string; rawLabel?: string; quantity: number; unitPriceCents: number; categoryId: string };

// Teintes des pastilles, selon tintFor du groupe.
const TINTS = {
  accent: { color: colors.accentText, backgroundColor: colors.accentTint },
  income: { color: colors.income, backgroundColor: colors.incomeBg },
};

export default function SaisieArticles() {
  const p = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const editId = p.entryId; // présent : on modifie les articles d'une saisie existante
  const [kind, setKind] = useState<GroupKind>(p.kind === 'revenu' ? 'revenu' : 'depense');
  const [date, setDate] = useState(p.date ?? isoDate(new Date()));
  const [exceptional, setExceptional] = useState(p.exceptional === '1');
  const nextKey = useRef(0);

  const [merchant, setMerchant] = useState(p.merchant ?? '');
  const [editingMerchant, setEditingMerchant] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [categoryId, setCategoryId] = useState(p.categoryId ?? '');
  const [items, setItems] = useState<Item[]>(() => {
    const r = p.amount ? parseFormula(p.amount) : null;
    return r?.ok ? r.lines.map((l) => ({ ...l, key: nextKey.current++, label: '', categoryId: p.categoryId ?? '' })) : [];
  });
  const [label, setLabel] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [priceFocus, setPriceFocus] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [removedOnce, setRemovedOnce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Archivées incluses pour nommer les lignes existantes ; CategorySheet ne propose que les actives.
    Promise.all([loadCategories({ includeArchived: true }), editId ? loadEntry(editId) : null])
      .then(([{ groups, cats }, e]) => {
        setGroups(groups); setCats(cats);
        if (!e) return;
        const first = cats.find((c) => c.id === e.entry_lines[0]?.category_id);
        setKind(groups.find((g) => g.id === first?.group_id)?.kind ?? 'depense');
        setMerchant(e.merchant ?? '');
        setDate(e.date);
        setExceptional(e.exceptional);
        setCategoryId(e.entry_lines[0]?.category_id ?? '');
        setItems(e.entry_lines.map((l) => ({
          key: nextKey.current++, label: l.label ?? l.raw_label ?? '', rawLabel: l.raw_label ?? undefined, quantity: l.quantity,
          unitPriceCents: l.unit_price_cents, categoryId: l.category_id,
        })));
      })
      .catch((e: Error) => setError(e.message));
  }, [editId]);

  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? 'Choisir';
  const tint = (id: string) => {
    const g = groups.find((x) => x.id === cats.find((c) => c.id === id)?.group_id);
    return TINTS[g ? tintFor(g) : 'accent'];
  };

  const priceCents = parsePriceCents(price);
  const quantity = /^\d+$/.test(qty) && Number(qty) >= 1 ? Number(qty) : null;
  const canAdd = !!priceCents && !!quantity && !!categoryId;
  const subtotals = useMemo(() => subtotalsByCategory(items), [items]);
  const total = subtotals.reduce((s, x) => s + x.cents, 0);
  // Les articles issus de la saisie rapide peuvent arriver sans catégorie.
  const canSave = items.length > 0 && items.every((i) => i.categoryId) && !saving;

  const add = () => {
    if (!priceCents || !quantity || !categoryId) return;
    setItems((xs) => [...xs, { key: nextKey.current++, label: label.trim(), quantity, unitPriceCents: priceCents, categoryId }]);
    setLabel(''); setQty('1'); setPrice('');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const lines = items.map((i) => ({ quantity: i.quantity, unitPriceCents: i.unitPriceCents, categoryId: i.categoryId, label: i.label || undefined, rawLabel: i.rawLabel }));
      if (editId) {
        // formula à null : la formule d'origine ne décrit plus les articles modifiés.
        await updateEntry(editId, { merchant: merchant.trim() || null, exceptional: kind === 'depense' && exceptional, formula: null });
        await replaceEntryLines(editId, lines);
        router.back();
        return;
      }
      await saveEntry({
        date, merchant: merchant.trim() || undefined, exceptional: kind === 'depense' && exceptional, source: 'manuel', lines,
      });
      // Ferme aussi la saisie rapide restée dessous.
      router.dismissTo('/');
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const n = items.length;
  return (
    <KeyboardAvoidingView style={[s.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Retour" style={s.circle} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={s.headerText}>
            <Text style={s.title} numberOfLines={1}>{editId ? 'Modifier les articles' : merchant.trim() || 'Plusieurs articles'}</Text>
            <Text style={s.subtitle}>{dayLabel(date)} · {n} article{n > 1 ? 's' : ''}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Modifier le commerçant" style={s.circle} onPress={() => setEditingMerchant(true)}>
            <Ionicons name="pencil-outline" size={18} color={colors.text} />
          </Pressable>
        </View>

        {n > 0 && (
          <View style={s.card}>
            {items.map((i, idx) => (
              <Pressable key={i.key} style={[s.item, idx > 0 && s.itemDivider]}
                accessibilityHint="Appui long pour retirer l’article"
                onLongPress={() => { setItems((xs) => xs.filter((x) => x.key !== i.key)); setRemovedOnce(true); }}>
                <View style={s.itemMain}>
                  <Text style={s.itemLabel} numberOfLines={1}>
                    {i.label || 'Article'}
                    {i.quantity > 1 && <Text style={s.itemQty}> {i.quantity} × {(i.unitPriceCents / 100).toFixed(2).replace('.', ',')}</Text>}
                  </Text>
                  <Text style={[s.pill, tint(i.categoryId)]}>{i.categoryId ? catName(i.categoryId) : 'Sans catégorie'}</Text>
                </View>
                <Text style={s.itemAmount}>{formatEuros(i.quantity * i.unitPriceCents)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {n > 0 && !removedOnce && <Text style={s.hint}>Appui long sur un article pour le retirer.</Text>}

        <View style={s.addCard}>
          <View style={s.fields}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Article (facultatif)</Text>
              <TextInput style={s.input} value={label} onChangeText={setLabel} placeholder="Ex. Carottes"
                placeholderTextColor={colors.textFaint} returnKeyType="next" />
            </View>
            <View style={{ width: 56 }}>
              <Text style={s.fieldLabel}>Qté</Text>
              <TextInput style={[s.input, s.center]} value={qty} onChangeText={(t) => setQty(t.replace(/\D/g, ''))}
                keyboardType="number-pad" accessibilityLabel="Quantité" selectTextOnFocus />
            </View>
            <View style={{ width: 84 }}>
              <Text style={s.fieldLabel}>Prix</Text>
              <TextInput style={[s.input, priceFocus && s.inputFocus]} value={price} onChangeText={setPrice}
                placeholder="0,00 €" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad"
                onFocus={() => setPriceFocus(true)} onBlur={() => setPriceFocus(false)} onSubmitEditing={add} />
            </View>
          </View>
          <View style={s.addRow}>
            <Pressable style={{ flex: 1 }} accessibilityRole="button" onPress={() => setSheetOpen(true)}>
              <Text style={s.catLine}>Catégorie : <Text style={{ color: colors.text }}>{catName(categoryId)}</Text></Text>
            </Pressable>
            <Pressable style={[s.addBtn, !canAdd && s.disabled]} disabled={!canAdd} onPress={add} accessibilityRole="button">
              <Text style={s.addText}>Ajouter</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {subtotals.length > 0 && (
          <View style={s.subCard}>
            {subtotals.map((x) => (
              <View key={x.categoryId} style={s.subRow}>
                <Text style={s.subName}>{x.categoryId ? catName(x.categoryId) : 'Sans catégorie'}</Text>
                <Text style={s.subAmount}>{formatEuros(x.cents)}</Text>
              </View>
            ))}
          </View>
        )}
        {error && <Text style={s.error}>{error}</Text>}
        <Pressable style={[s.validate, !canSave && s.disabled]} disabled={!canSave} onPress={save} accessibilityRole="button">
          <Text style={s.validateText}>{saving ? 'Enregistrement…' : 'Valider'}</Text>
          <Text style={s.validateText}>{formatEuros(total)}</Text>
        </Pressable>
      </View>

      <CategorySheet visible={sheetOpen} kind={kind} groups={groups} cats={cats} selectedId={categoryId || null}
        onSelect={setCategoryId} onClose={() => setSheetOpen(false)} />

      <Modal visible={editingMerchant} transparent animationType="fade" onRequestClose={() => setEditingMerchant(false)}
        statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Pressable style={s.backdrop} accessibilityLabel="Fermer" onPress={() => setEditingMerchant(false)}>
            <Pressable style={s.dialog}>
              <Text style={s.dialogTitle}>Commerçant</Text>
              <TextInput style={s.input} value={merchant} onChangeText={setMerchant} placeholder="Ex. Auchan"
                placeholderTextColor={colors.textFaint} autoFocus onSubmitEditing={() => setEditingMerchant(false)} />
              <Pressable style={[s.addBtn, { alignSelf: 'flex-end' }]} onPress={() => setEditingMerchant(false)} accessibilityRole="button">
                <Text style={s.addText}>OK</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  headerText: { flex: 1, alignItems: 'center' },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 17 },
  subtitle: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  circle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  itemDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  itemMain: { flex: 1, alignItems: 'flex-start', gap: 6 },
  itemLabel: { color: colors.text, fontFamily: font.regular, fontSize: 16 },
  itemQty: { color: colors.textMuted },
  pill: { fontFamily: font.regular, fontSize: 13, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  itemAmount: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },
  hint: { color: colors.textFaint, fontFamily: font.regular, fontSize: 12, textAlign: 'center', marginTop: -8 },
  addCard: { borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, padding: 16, gap: 14 },
  fields: { flexDirection: 'row', gap: 10 },
  fieldLabel: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginBottom: 6 },
  input: { height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 15 },
  inputFocus: { borderColor: colors.accentText },
  center: { textAlign: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catLine: { color: colors.textMuted, fontFamily: font.regular, fontSize: 15 },
  addBtn: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.text, justifyContent: 'center' },
  addText: { color: colors.bg, fontFamily: font.semibold, fontSize: 15 },
  disabled: { opacity: 0.4 },
  footer: { paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  subCard: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  subName: { color: colors.textSoft, fontFamily: font.regular, fontSize: 14 },
  subAmount: { color: colors.text, fontFamily: font.regular, fontSize: 14 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 13 },
  validate: { height: 56, borderRadius: radius.pill, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  validateText: { color: colors.accentInk, fontFamily: font.semibold, fontSize: 17 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
  dialogTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 17 },
});
