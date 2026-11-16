// Dépenses ou revenus d'un mois (depuis les cards de l'écran Mois) : ce qui compte dans le solde,
// catégorie par catégorie, puis toutes les saisies du type, par jour.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EntryDays } from '../../src/components/EntryDays';
import { Card, Divider, ScreenHeader, SectionTitle } from '../../src/components/ui';
import { formatAmount, formatEuros, kindBreakdown, monthLabel, monthOf, type KindCategoryLine, type Month } from '../../src/lib/budget';
import { loadBudget, loadEntries, type EntryRow } from '../../src/lib/data';
import { entryKind, groupByDay } from '../../src/lib/entries';
import { colors, font } from '../../src/theme';

type Data = Awaited<ReturnType<typeof loadBudget>> & { entries: EntryRow[] };

export default function FluxScreen() {
  const params = useLocalSearchParams<{ kind: string; month?: string }>();
  const kind = params.kind === 'revenu' ? 'revenu' : 'depense';
  const month: Month = params.month ?? monthOf(new Date());
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, entries] = await Promise.all([loadBudget(month, month), loadEntries(month)]);
      setData({ ...b, entries });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const view = useMemo(() => {
    if (!data) return null;
    const ctx = { groups: data.groups, cats: data.cats };
    return {
      ctx,
      summary: data.summaries.find((x) => x.month === month),
      groups: kindBreakdown({ month, currentMonth: monthOf(new Date()), kind, ...data }),
      days: groupByDay(data.entries.filter((e) => entryKind(e, ctx) === kind), ctx),
    };
  }, [data, month, kind]);

  const income = kind === 'revenu';
  const title = income ? 'Revenus' : 'Dépenses';
  const summary = view?.summary;

  return (
    <View style={s.screen}>
      <ScreenHeader title={title} subtitle={monthLabel(month).toLowerCase()} left="back" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}>
        {error && <Text style={s.error}>Impossible de charger les {title.toLowerCase()} : {error}</Text>}
        {!view && !error && <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />}

        {summary && (
          <Card style={s.summary}>
            <Text style={s.muted}>Compté dans le solde</Text>
            <Text style={[s.big, income && { color: colors.income }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatEuros(income ? summary.incomeCents : -summary.expenseCents, income)}
            </Text>
            <Text style={s.muted}>
              {income
                ? `${formatAmount(summary.actualIncomeCents)} reçus · ${formatAmount(summary.plannedIncomeCents)} prévus`
                : `${formatAmount(summary.actualExpenseCents)} dépensés · ${formatAmount(summary.plannedExpenseCents)} prévus`}
            </Text>
          </Card>
        )}

        {view?.groups.map((g) => (
          <View key={g.id} style={{ gap: 10 }}>
            <SectionTitle title={g.name} right={formatEuros(g.countedCents)} />
            <Card>
              {g.categories.map((c, i) => (
                <Fragment key={c.id}>
                  {i > 0 && <Divider />}
                  <CategoryRow line={c} month={month} income={income} />
                </Fragment>
              ))}
            </Card>
          </View>
        ))}

        {view && view.days.length > 0 && <SectionTitle title="Saisies" />}
        {view && view.days.length === 0 && !error && (
          <Text style={s.empty}>Aucune saisie de {title.toLowerCase()} ce mois-ci.</Text>
        )}
        {view && <EntryDays days={view.days} ctx={view.ctx} />}
      </ScrollView>
    </View>
  );
}

/** « 27,43 réel · 40,00 prévu » et ce qui compte : le prévu, ou le réel (dépassé, désactivé ou mois passé). */
function CategoryRow({ line, month, income }: { line: KindCategoryLine; month: Month; income: boolean }) {
  const over = line.actualCents > line.plannedCents;
  const note = line.countsPlanned ? 'compte le prévu' : over && !income ? 'dépassé · compte le réel' : 'compte le réel';
  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [s.row, pressed && s.pressed]}
      onPress={() => router.push({ pathname: '/categorie/[id]', params: { id: line.id, month } })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{line.name}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {formatAmount(line.actualCents)} réel · {formatAmount(line.plannedCents)} prévu ·{' '}
          <Text style={over && !line.countsPlanned && !income ? { color: colors.warn } : undefined}>{note}</Text>
        </Text>
      </View>
      <Text style={s.rowAmount}>{formatEuros(line.countedCents)}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  content: { gap: 16, paddingTop: 12 },
  error: { color: colors.warn, fontFamily: font.regular, textAlign: 'center', marginTop: 8 },
  muted: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14 },
  empty: { color: colors.textMuted, fontFamily: font.regular, fontSize: 15, textAlign: 'center', marginTop: 8 },

  summary: { padding: 20, gap: 6 },
  big: { color: colors.text, fontFamily: font.semibold, fontSize: 40, letterSpacing: -1.2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  pressed: { backgroundColor: colors.surface2 },
  rowTitle: { color: colors.text, fontFamily: font.medium, fontSize: 16 },
  rowSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  rowAmount: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },
});
