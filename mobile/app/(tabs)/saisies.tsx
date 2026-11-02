import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, Card, Divider, EntryIcon } from '../../src/components/ui';
import { addMonths, formatEuros, monthLabel, monthOf, type Month } from '../../src/lib/budget';
import { loadCategories, loadEntries, topCategoryIds, type EntryRow } from '../../src/lib/data';
import {
  entryKind, entrySubtitle, entryTitle, groupByDay, longDayLabel, matchesSearch, signedCents, type Ctx,
} from '../../src/lib/entries';
import { colors, font, radius } from '../../src/theme';

// Puce de filtre : « Toutes », une catégorie ou un groupe.
type Filter = { type: 'cat' | 'group'; id: string } | null;

// Saisies du mois (maquette 8) : recherche, filtres, sections par jour.
export default function SaisiesScreen() {
  const insets = useSafeAreaInsets();
  const current = monthOf(new Date());
  const [month, setMonth] = useState<Month>(current);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [ctx, setCtx] = useState<Ctx>({ groups: [], cats: [] });
  const [top, setTop] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(null);
  const [monthSheet, setMonthSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, c, t] = await Promise.all([loadEntries(month), loadCategories({ includeArchived: true }), topCategoryIds().catch(() => [] as string[])]);
      setEntries(e); setCtx(c); setTop(t); setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const chips = useMemo(() => [
    ...top.map((id) => ctx.cats.find((c) => c.id === id)).filter((c) => !!c)
      .map((c) => ({ type: 'cat' as const, id: c.id, name: c.name })),
    ...ctx.groups.map((g) => ({ type: 'group' as const, id: g.id, name: g.name })),
  ], [top, ctx]);

  const days = useMemo(() => {
    const catIds = !filter ? null : filter.type === 'cat' ? new Set([filter.id])
      : new Set(ctx.cats.filter((c) => c.group_id === filter.id).map((c) => c.id));
    const shown = entries.filter((e) => matchesSearch(e, query)
      && (!catIds || e.entry_lines.some((l) => catIds.has(l.category_id))));
    return groupByDay(shown, ctx);
  }, [entries, query, filter, ctx]);

  const months = Array.from({ length: 12 }, (_, i) => addMonths(current, -i));
  const otherYear = (m: Month) => m.slice(0, 4) !== current.slice(0, 4);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}>
        <View style={s.top}>
          <Text style={s.title} accessibilityRole="header">Saisies</Text>
          <Pressable style={s.monthPill} onPress={() => setMonthSheet(true)} accessibilityRole="button"
            accessibilityLabel={`Mois : ${monthLabel(month)}. Changer`}>
            <Text style={s.monthText}>{monthLabel(month, otherYear(month))}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={s.search}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder="Commerçant, article, note..."
            placeholderTextColor={colors.textFaint} returnKeyType="search" accessibilityLabel="Rechercher une saisie" />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Effacer la recherche">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chips}>
          {[{ type: null, id: '', name: 'Toutes' }, ...chips].map((c) => {
            const selected = c.type === null ? !filter : filter?.type === c.type && filter.id === c.id;
            return (
              <Pressable key={`${c.type}:${c.id}`} style={[s.chip, selected && s.chipOn]}
                accessibilityRole="button" accessibilityState={{ selected }}
                onPress={() => setFilter(c.type === null ? null : { type: c.type, id: c.id })}>
                <Text style={[s.chipText, selected && s.chipTextOn]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error && <Text style={s.error}>Impossible de charger les saisies : {error}</Text>}
        {!error && !loading && days.length === 0 && (
          <Text style={s.empty}>{entries.length ? 'Aucune saisie ne correspond.' : 'Aucune saisie ce mois-ci.'}</Text>
        )}

        {days.map((d) => (
          <View key={d.date} style={s.day}>
            <View style={s.dayHead}>
              <Text style={s.dayLabel}>{longDayLabel(d.date)}</Text>
              <Text style={s.dayTotal}>{formatEuros(d.totalCents, true)}</Text>
            </View>
            <Card>
              {d.entries.map((e, i) => {
                const kind = entryKind(e, ctx);
                const cents = signedCents(e, ctx);
                return (
                  <Fragment key={e.id}>
                    {i > 0 && <Divider />}
                    <Pressable style={({ pressed }) => [s.row, pressed && s.pressed]} accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/entree/[id]', params: { id: e.id } })}>
                      <EntryIcon source={e.source} kind={kind} size={42} />
                      <View style={s.rowText}>
                        <Text style={s.rowTitle} numberOfLines={1}>{entryTitle(e, ctx)}</Text>
                        <Text style={s.rowSub} numberOfLines={1}>{entrySubtitle(e, ctx)}</Text>
                      </View>
                      <Text style={[s.rowAmount, kind === 'revenu' && { color: colors.income }]}>
                        {formatEuros(cents, true)}
                      </Text>
                    </Pressable>
                  </Fragment>
                );
              })}
            </Card>
          </View>
        ))}
      </ScrollView>

      <BottomSheet visible={monthSheet} onClose={() => setMonthSheet(false)} title="Mois">
        <ScrollView contentContainerStyle={{ gap: 6 }}>
          {months.map((m) => {
            const selected = m === month;
            return (
              <Pressable key={m} style={[s.sheetRow, selected && s.sheetRowOn]} accessibilityRole="button"
                accessibilityState={{ selected }} onPress={() => { setMonth(m); setMonthSheet(false); }}>
                <Text style={[s.sheetText, selected && { color: colors.accentText }]}>{monthLabel(m)}</Text>
                {selected && <Ionicons name="checkmark" size={18} color={colors.accentText} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Marge basse : la navbar flottante passe par-dessus.
  content: { paddingHorizontal: 20, paddingBottom: 140, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 34, letterSpacing: -0.8 },
  monthPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 16,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  monthText: { color: colors.text, fontFamily: font.medium, fontSize: 15 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 16,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 16, paddingVertical: 0 },

  chipsScroll: { marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: {
    height: 36, paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.textSoft, fontFamily: font.regular, fontSize: 15 },
  chipTextOn: { color: colors.bg, fontFamily: font.semibold },

  error: { color: colors.warn, fontFamily: font.regular },
  empty: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14, textAlign: 'center', marginTop: 24 },

  day: { gap: 8 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  dayLabel: { color: colors.text, fontFamily: font.semibold, fontSize: 14 },
  dayTotal: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  pressed: { backgroundColor: colors.surface2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontFamily: font.medium, fontSize: 16 },
  rowSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  rowAmount: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },

  sheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 46,
    paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface2,
  },
  sheetRowOn: { backgroundColor: colors.accentTint },
  sheetText: { color: colors.text, fontFamily: font.regular, fontSize: 15 },
});
