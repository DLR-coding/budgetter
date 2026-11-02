// Projection « jusqu'où je tiens » (maquette 7) : solde de fin des 6 prochains mois avec les prévus.
import { router, useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Divider, ScreenHeader } from '../src/components/ui';
import {
  addMonths, formatAmount, formatEuros, monthName, monthOf, projectionLabels, runwayHeadline, type MonthSummary,
} from '../src/lib/budget';
import { loadBudget } from '../src/lib/data';
import { colors, font, radius } from '../src/theme';

export default function ProjectionScreen() {
  const current = monthOf(new Date());
  const [rows, setRows] = useState<MonthSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadBudget(addMonths(current, -12), addMonths(current, 6))
      .then((d) => { setRows(d.summaries.filter((x) => x.month >= current).slice(0, 6)); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, [current]));

  const headline = rows?.length ? runwayHeadline(rows) : null;
  const labels = rows ? projectionLabels(rows.map((r) => r.month)) : [];
  const firstNeg = headline?.firstNegative?.month;

  return (
    <View style={s.screen}>
      <View style={s.pad}><ScreenHeader title="Projection" left="back" /></View>
      <ScrollView contentContainerStyle={s.content}>
        {error && <Text style={s.error}>Impossible de charger la projection : {error}</Text>}
        {!rows && !error && <ActivityIndicator color={colors.accent} />}

        {headline && (
          <View style={{ gap: 4 }}>
            <Text style={s.lead}>{headline.lead}</Text>
            <Text style={s.big}>{headline.title}</Text>
            {headline.firstNegative && (
              <Text style={s.lead}>
                En {monthName(headline.firstNegative.month)}, ton solde passerait à{' '}
                <Text style={s.warnAmount}>{formatEuros(headline.firstNegative.endCents)}</Text>
              </Text>
            )}
          </View>
        )}

        {rows && rows.length > 0 && (
          <Card>
            <View style={s.tableHead}>
              <Text style={s.th}>Mois</Text>
              <Text style={s.th}>Solde fin de mois</Text>
            </View>
            {rows.map((r, i) => {
              const neg = r.endCents < 0;
              return (
                <Fragment key={r.month}>
                  <Divider />
                  <Pressable accessibilityRole="button"
                    onPress={() => router.navigate({ pathname: '/', params: { month: r.month, at: String(Date.now()) } })}
                    style={({ pressed }) => [s.row, pressed && s.pressed]}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={s.nameLine}>
                        <Text style={[s.name, r.month === firstNeg && { color: colors.warn }]}>{labels[i]}</Text>
                        {r.month === current && <View style={s.badge}><Text style={s.badgeText}>En cours</Text></View>}
                      </View>
                      <Text style={s.sub}>{formatAmount(r.incomeCents, true)} · {formatAmount(-r.expenseCents)}</Text>
                    </View>
                    <Text style={[s.amount, neg && { color: colors.warn }]}>{formatEuros(r.endCents)}</Text>
                  </Pressable>
                </Fragment>
              );
            })}
          </Card>
        )}

        {rows && (
          <Text style={s.note}>
            Calculé avec les revenus et dépenses prévus de chaque mois. Touche un mois pour ajuster ses prévus.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 22 },
  error: { color: colors.warn, fontFamily: font.regular },
  lead: { color: colors.textSoft, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  big: { color: colors.text, fontFamily: font.semibold, fontSize: 34, letterSpacing: -1, marginVertical: 2 },
  warnAmount: { color: colors.warn, fontFamily: font.semibold },

  tableHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  th: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  pressed: { backgroundColor: colors.surface2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontFamily: font.medium, fontSize: 16 },
  badge: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: colors.accentInk, fontFamily: font.semibold, fontSize: 12 },
  sub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13 },
  amount: { color: colors.text, fontFamily: font.semibold, fontSize: 17 },
  note: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
});
