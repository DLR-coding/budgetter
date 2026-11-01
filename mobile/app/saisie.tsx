import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { formatEuros } from '../src/lib/budget';
import { saveEntry, type CategoryRow, type GroupRow } from '../src/lib/data';
import { isFormula, parseFormula } from '../src/lib/formula';
import { supabase } from '../src/lib/supabase';
import { colors, font, radius } from '../src/theme';

// Saisie rapide — version de base de l'étape 1.
// Montant simple par défaut ; une formule « (12+2+5*2,99) » est acceptée et
// enregistrée comme plusieurs articles. Mode « plusieurs articles » et scan : étapes suivantes.
export default function Saisie() {
  const [input, setInput] = useState('');
  const [kind, setKind] = useState<'depense' | 'revenu'>('depense');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState('');
  const [exceptional, setExceptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('groups').select('*').order('position'),
      supabase.from('categories').select('*').eq('archived', false).order('position'),
    ]).then(([g, c]) => { setGroups(g.data ?? []); setCats(c.data ?? []); });
  }, []);

  const parsed = useMemo(() => parseFormula(input), [input]);
  const visibleCats = useMemo(() => {
    const ids = new Set(groups.filter((g) => (kind === 'revenu' ? g.kind === 'revenu' : g.kind === 'depense')).map((g) => g.id));
    return cats.filter((c) => ids.has(c.group_id));
  }, [groups, cats, kind]);

  const canSave = parsed.ok && parsed.totalCents !== 0 && categoryId && !saving;

  const save = async () => {
    if (!parsed.ok || !categoryId) return;
    setSaving(true);
    setError(null);
    try {
      await saveEntry({
        date: new Date().toISOString().slice(0, 10),
        merchant: merchant.trim() || undefined,
        exceptional,
        source: isFormula(input) ? 'formule' : 'manuel',
        formula: isFormula(input) ? input : undefined,
        lines: parsed.lines.map((l) => ({ ...l, categoryId })),
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Pressable accessibilityLabel="Fermer" style={s.circle} onPress={() => router.back()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <View style={s.segment}>
            {(['depense', 'revenu'] as const).map((k) => (
              <Pressable key={k} onPress={() => { setKind(k); setCategoryId(null); }}
                style={[s.segItem, kind === k && s.segActive]}>
                <Text style={[s.segText, kind === k && s.segTextActive]}>{k === 'depense' ? 'Dépense' : 'Revenu'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={s.amountBox}>
          <TextInput
            style={s.amount} value={input} onChangeText={setInput}
            placeholder="0,00" placeholderTextColor={colors.textFaint}
            keyboardType="numbers-and-punctuation" autoFocus
          />
          <Text style={s.muted}>
            {input && parsed.ok
              ? isFormula(input) ? `${formatEuros(parsed.totalCents)} · ${parsed.lines.length} articles` : formatEuros(parsed.totalCents)
              : input ? (parsed as { error: string }).error : 'Montant, ou formule comme (12+2+5*2,99)'}
          </Text>
        </View>

        <TextInput style={s.input} value={merchant} onChangeText={setMerchant}
          placeholder="Commerçant ou note (facultatif)" placeholderTextColor={colors.textFaint} />

        <View style={s.chips}>
          {visibleCats.map((c) => (
            <Pressable key={c.id} onPress={() => setCategoryId(c.id)} style={[s.chip, categoryId === c.id && s.chipActive]}>
              <Text style={[s.chipText, categoryId === c.id && s.chipTextActive]}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        {kind === 'depense' && (
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleTitle}>Dépense exceptionnelle</Text>
              <Text style={s.muted}>Exclue du total « sans imprévus »</Text>
            </View>
            <Switch value={exceptional} onValueChange={setExceptional}
              trackColor={{ true: colors.accent, false: colors.borderStrong }} thumbColor={colors.text} />
          </View>
        )}

        {error && <Text style={{ color: colors.warn, fontFamily: font.regular }}>{error}</Text>}

        <Pressable style={[s.save, !canSave && { opacity: 0.4 }]} disabled={!canSave} onPress={save}>
          <Text style={s.saveText}>{saving ? 'Enregistrement…' : 'Valider'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 40, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  circle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segItem: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center' },
  segActive: { backgroundColor: colors.text },
  segText: { color: colors.textMuted, fontFamily: font.medium, fontSize: 14 },
  segTextActive: { color: colors.bg, fontFamily: font.semibold },
  amountBox: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  amount: { color: colors.text, fontFamily: font.semibold, fontSize: 56, letterSpacing: -2, textAlign: 'center', minWidth: 200 },
  muted: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13 },
  input: { height: 48, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontFamily: font.regular, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontFamily: font.regular, fontSize: 14 },
  chipTextActive: { color: colors.accentInk, fontFamily: font.semibold },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  toggleTitle: { color: colors.text, fontFamily: font.medium, fontSize: 14 },
  save: { height: 58, borderRadius: 29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.accentInk, fontFamily: font.semibold, fontSize: 16 },
});
