import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdjustBalanceSheet } from '../../src/components/AdjustBalanceSheet';
import { RunwayChart } from '../../src/components/RunwayChart';
import { Card, CircleButton, Divider, ProgressBar } from '../../src/components/ui';
import {
  addMonths, collapseRows, computedStartCents, formatAmount, formatEuros, groupBreakdown, monthLabel, monthName,
  monthOf, runwayHeadline, splitEuros, type CategoryLine, type Month,
} from '../../src/lib/budget';
import { loadBudget } from '../../src/lib/data';
import { colors, font, radius } from '../../src/theme';

const isMonth = (m: unknown): m is Month => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
// shortcut: le groupe « charges fixes » est reconnu à son nom ; à remplacer par un drapeau en base si on renomme.
const isFixedGroup = (name: string) => /^fixe/i.test(name.trim());

export default function MonthScreen() {
  const current = monthOf(new Date());
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState<Month>(isMonth(params.month) ? params.month : current);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadBudget>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => { if (isMonth(params.month)) setMonth(params.month); }, [params.month]);

  // 12 mois avant le plus ancien (soldes) jusqu'à 6 mois après le plus récent (projection).
  const from = addMonths(month < current ? month : current, -12);
  const to = addMonths(month > current ? month : current, 6);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadBudget(from, to));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const summary = data?.summaries.find((x) => x.month === month);
  const horizon = useMemo(() => {
    const i = data?.summaries.findIndex((x) => x.month === current) ?? -1;
    return i === -1 ? [] : data!.summaries.slice(i, i + 6);
  }, [data, current]);
  const groups = useMemo(() => (data ? groupBreakdown({ month, ...data }) : []), [data, month]);

  if (!data && !error) {
    return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  const headline = horizon.length ? runwayHeadline(horizon) : null;
  const hero = summary ? splitEuros(summary.endCents) : null;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
    >
      <View style={s.monthRow}>
        <CircleButton icon="chevron-back" accessibilityLabel="Mois précédent" onPress={() => setMonth(addMonths(month, -1))} />
        <View style={s.monthPill}><Text style={s.monthPillText}>{monthLabel(month)}</Text></View>
        <CircleButton icon="chevron-forward" accessibilityLabel="Mois suivant" onPress={() => setMonth(addMonths(month, 1))} />
      </View>

      {error && <Text style={s.error}>Impossible de charger le budget : {error}</Text>}

      {summary && hero && (
        <View style={s.hero}>
          <Text style={s.heroLabel}>Solde {summary.status === 'passe' ? 'final' : 'projeté'} fin {monthName(month)}</Text>
          <Text style={s.heroAmount}>
            {hero.units}<Text style={s.heroRest}>{hero.rest}</Text>
          </Text>
          <View style={s.startPill}>
            <Text style={s.startText}>Départ {formatEuros(summary.startCents)}</Text>
            <Pressable accessibilityRole="button" onPress={() => setAdjusting(true)} hitSlop={10}>
              <Text style={s.adjust}>Ajuster</Text>
            </Pressable>
          </View>
        </View>
      )}

      {headline && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/projection')}
          style={({ pressed }) => [s.card, s.runway, pressed && s.pressed]}>
          <View style={s.runwayHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.runwayLead}>{headline.lead}</Text>
              <Text style={s.runwayTitle}>{headline.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <RunwayChart months={horizon} currentMonth={current} />
        </Pressable>
      )}

      {summary && (
        <View style={s.row2}>
          <View style={[s.card, s.flowCard]}>
            <View style={s.flowHead}>
              <View style={[s.flowIcon, { backgroundColor: colors.incomeBg }]}>
                <Ionicons name="arrow-down" size={15} color={colors.income} style={s.rotate} />
              </View>
              <Text style={s.flowLabel}>Revenus</Text>
            </View>
            <Text style={s.flowAmount} numberOfLines={1} adjustsFontSizeToFit>{formatEuros(summary.actualIncomeCents, true)}</Text>
            <Text style={s.flowPlanned}>Prévu {formatEuros(summary.plannedIncomeCents)}</Text>
          </View>
          <View style={[s.card, s.flowCard]}>
            <View style={s.flowHead}>
              <View style={[s.flowIcon, { backgroundColor: colors.warnBg }]}>
                <Ionicons name="arrow-up" size={15} color={colors.warn} style={s.rotate} />
              </View>
              <Text style={s.flowLabel}>Dépenses</Text>
            </View>
            <Text style={s.flowAmount} numberOfLines={1} adjustsFontSizeToFit>{formatEuros(-summary.actualExpenseCents)}</Text>
            <Text style={s.flowPlanned}>Prévu {formatEuros(summary.plannedExpenseCents)}</Text>
          </View>
        </View>
      )}

      {groups.map((g) => {
        const open = expanded.includes(g.id);
        const { shown, rest } = isFixedGroup(g.name) && !open
          ? collapseRows(g.categories, 2) : { shown: g.categories, rest: null };
        return (
          <View key={g.id} style={{ gap: 12 }}>
            <View style={s.groupHead}>
              <Text style={s.groupName} accessibilityRole="header">{g.name}</Text>
              <Text style={s.groupTotal}>{formatAmount(g.actualCents)} / {formatEuros(g.plannedCents)}</Text>
            </View>
            <Card>
              {shown.map((c, i) => (
                <Fragment key={c.id}>
                  {i > 0 && <Divider />}
                  <CategoryRow line={c} month={month} />
                </Fragment>
              ))}
              {rest && (
                <>
                  <Divider />
                  <Pressable accessibilityRole="button" onPress={() => setExpanded([...expanded, g.id])}
                    style={({ pressed }) => [s.catRow, pressed && s.pressed]}>
                    <View style={s.catLine}>
                      <Text style={s.restText}>+ {rest.count} {rest.count > 1 ? 'autres charges' : 'autre charge'}</Text>
                      <Text style={s.restText}>{formatEuros(rest.actualCents)}</Text>
                    </View>
                  </Pressable>
                </>
              )}
            </Card>
          </View>
        );
      })}

      {summary && data && (
        <AdjustBalanceSheet
          visible={adjusting} month={month} computedCents={computedStartCents(data.summaries, month)}
          onClose={() => setAdjusting(false)}
          onSaved={() => { setAdjusting(false); load(); }}
        />
      )}
    </ScrollView>
  );
}

function CategoryRow({ line, month }: { line: CategoryLine; month: Month }) {
  const { plannedCents: planned, actualCents: actual } = line;
  const settled = actual === planned;
  return (
    <Pressable accessibilityRole="button"
      onPress={() => router.push({ pathname: '/categorie/[id]', params: { id: line.id, month } })}
      style={({ pressed }) => [s.catRow, pressed && s.pressed]}>
      <View style={s.catLine}>
        <Text style={s.catName} numberOfLines={1}>{line.name}</Text>
        {settled ? <Text style={s.catAmount}>{formatEuros(actual)}</Text> : (
          <Text style={s.catAmount}>{formatAmount(actual)}<Text style={s.catPlanned}> / {formatEuros(planned)}</Text></Text>
        )}
      </View>
      {!settled && <ProgressBar ratio={planned > 0 ? actual / planned : 1} over={actual > planned} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Marge basse : la navbar flottante en verre recouvre le bas de l'écran.
  content: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 140, gap: 22 },
  pressed: { backgroundColor: colors.surface2 },
  error: { color: colors.warn, fontFamily: font.regular },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthPill: {
    height: 46, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, justifyContent: 'center',
  },
  monthPillText: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },

  hero: { alignItems: 'center', gap: 4 },
  heroLabel: { color: colors.textSoft, fontFamily: font.regular, fontSize: 15 },
  heroAmount: { color: colors.text, fontFamily: font.semibold, fontSize: 48, letterSpacing: -1.5 },
  heroRest: { color: colors.textMuted, fontSize: 28, letterSpacing: -0.5 },
  startPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  startText: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14 },
  adjust: { color: colors.accentText, fontFamily: font.semibold, fontSize: 14 },

  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
  runway: { padding: 16, gap: 14 },
  runwayHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  runwayLead: { color: colors.textSoft, fontFamily: font.regular, fontSize: 14 },
  runwayTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 19, marginTop: 2 },

  row2: { flexDirection: 'row', gap: 10 },
  flowCard: { flex: 1, padding: 16, gap: 8 },
  flowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flowIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rotate: { transform: [{ rotate: '45deg' }] },
  flowLabel: { color: colors.textSoft, fontFamily: font.regular, fontSize: 14 },
  flowAmount: { color: colors.text, fontFamily: font.semibold, fontSize: 22, letterSpacing: -0.4, marginTop: 4 },
  flowPlanned: { color: colors.textFaint, fontFamily: font.regular, fontSize: 13 },

  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  groupName: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },
  groupTotal: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14 },

  catRow: { paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  catLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  catName: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 16 },
  catAmount: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },
  catPlanned: { color: colors.textFaint, fontFamily: font.regular },
  restText: { color: colors.textMuted, fontFamily: font.regular, fontSize: 16 },
});
