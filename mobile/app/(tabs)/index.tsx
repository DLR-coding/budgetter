import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addMonths, formatEuros, monthOf, plannedFor, runway, type Month } from '../../src/lib/budget';
import { loadBudget } from '../../src/lib/data';
import { colors, font, radius } from '../../src/theme';

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const label = (m: Month) => {
  const [y, mo] = m.split('-').map(Number);
  return `${MONTHS_FR[mo - 1]} ${y}`;
};

export default function MonthScreen() {
  const current = monthOf(new Date());
  const [month, setMonth] = useState<Month>(current);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadBudget>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // On charge 12 mois en arrière (soldes) et 6 mois en avant (projection).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadBudget(addMonths(current, -12), addMonths(current, 6)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [current]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const summary = data?.summaries.find((s) => s.month === month);
  const rw = data ? runway(data.summaries) : null;

  const groups = useMemo(() => {
    if (!data) return [];
    return data.groups.filter((g) => g.kind === 'depense').map((g) => {
      const cats = data.cats.filter((c) => c.group_id === g.id).map((c) => {
        const cat = data.categories.find((x) => x.id === c.id)!;
        const planned = plannedFor(cat, month, data.overrides);
        const actual = data.actuals.filter((a) => a.categoryId === c.id && a.month === month)
          .reduce((s, a) => s + a.amountCents, 0);
        return { id: c.id, name: c.name, planned, actual };
      }).filter((c) => c.planned > 0 || c.actual > 0);
      return {
        id: g.id, name: g.name, cats,
        planned: cats.reduce((s, c) => s + c.planned, 0),
        actual: cats.reduce((s, c) => s + c.actual, 0),
      };
    }).filter((g) => g.cats.length > 0);
  }, [data, month]);

  if (!data && !error) {
    return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
    >
      <View style={s.monthRow}>
        <Pressable accessibilityLabel="Mois précédent" style={s.circle} onPress={() => setMonth(addMonths(month, -1))}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <View style={s.pill}><Text style={s.pillText}>{label(month)}</Text></View>
        <Pressable accessibilityLabel="Mois suivant" style={s.circle} onPress={() => setMonth(addMonths(month, 1))}>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      {error && <Text style={s.error}>Impossible de charger le budget : {error}</Text>}

      {summary && (
        <>
          <View style={s.hero}>
            <Text style={s.muted}>Solde {summary.status === 'passe' ? 'final' : 'projeté'} fin {MONTHS_FR[Number(month.slice(5)) - 1]}</Text>
            <Text style={s.big}>{formatEuros(summary.endCents)}</Text>
            <Text style={s.muted}>Départ {formatEuros(summary.startCents)}</Text>
          </View>

          {rw?.firstNegative && month === current && (
            <View style={s.card}>
              <Text style={s.muted}>Avec tes prévus, tu tiens jusqu’à</Text>
              <Text style={s.title}>{rw.lastOkMonth ? `fin ${label(rw.lastOkMonth)}` : 'moins d’un mois'}</Text>
            </View>
          )}

          <View style={s.row2}>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.muted}>Revenus</Text>
              <Text style={s.title}>{formatEuros(summary.actualIncomeCents, true)}</Text>
              <Text style={s.faint}>Prévu {formatEuros(summary.plannedIncomeCents)}</Text>
            </View>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.muted}>Dépenses</Text>
              <Text style={s.title}>{formatEuros(-summary.actualExpenseCents)}</Text>
              <Text style={s.faint}>Prévu {formatEuros(summary.plannedExpenseCents)}</Text>
            </View>
          </View>
        </>
      )}

      {groups.map((g) => (
        <View key={g.id} style={{ gap: 10 }}>
          <View style={s.groupHead}>
            <Text style={s.groupName}>{g.name}</Text>
            <Text style={s.muted}>{formatEuros(g.actual)} / {formatEuros(g.planned)}</Text>
          </View>
          <View style={s.list}>
            {g.cats.map((c, i) => {
              const over = c.actual > c.planned;
              const pct = c.planned > 0 ? Math.min(1, c.actual / c.planned) : c.actual > 0 ? 1 : 0;
              return (
                <View key={c.id} style={[s.item, i < g.cats.length - 1 && s.divider]}>
                  <View style={s.itemRow}>
                    <Text style={s.itemName}>{c.name}</Text>
                    <Text style={s.itemAmount}>
                      {formatEuros(c.actual)} <Text style={s.faint}>/ {formatEuros(c.planned)}</Text>
                    </Text>
                  </View>
                  <View style={s.track}>
                    <View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: over ? colors.warn : colors.accent }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 140, gap: 20 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  circle: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  pill: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pillText: { color: colors.text, fontFamily: font.semibold, fontSize: 15 },
  hero: { alignItems: 'center', gap: 6 },
  big: { color: colors.text, fontFamily: font.semibold, fontSize: 46, letterSpacing: -1.5 },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 19 },
  muted: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13 },
  faint: { color: colors.textFaint, fontFamily: font.regular, fontSize: 12 },
  error: { color: colors.warn, fontFamily: font.regular },
  row2: { flexDirection: 'row', gap: 10 },
  card: { padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 6 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  groupName: { color: colors.text, fontFamily: font.semibold, fontSize: 15 },
  list: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 4 },
  item: { paddingVertical: 12, gap: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemName: { color: colors.text, fontFamily: font.regular, fontSize: 15 },
  itemAmount: { color: colors.text, fontFamily: font.medium, fontSize: 15 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
