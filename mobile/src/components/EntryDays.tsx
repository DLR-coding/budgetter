// Saisies groupées par jour (écran Saisies, écran Dépenses / Revenus) ; toucher une saisie ouvre son détail.
import { router } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatEuros } from '../lib/budget';
import { entryKind, entrySubtitle, entryTitle, longDayLabel, signedCents, type Ctx } from '../lib/entries';
import type { EntryRow } from '../lib/data';
import { colors, font } from '../theme';
import { Card, Divider, EntryIcon } from './ui';

export function EntryDays({ days, ctx }: {
  days: { date: string; totalCents: number; entries: EntryRow[] }[]; ctx: Ctx;
}) {
  return days.map((d) => (
    <View key={d.date} style={s.day}>
      <View style={s.dayHead}>
        <Text style={s.dayLabel}>{longDayLabel(d.date)}</Text>
        <Text style={s.dayTotal}>{formatEuros(d.totalCents, true)}</Text>
      </View>
      <Card>
        {d.entries.map((e, i) => {
          const kind = entryKind(e, ctx);
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
                  {formatEuros(signedCents(e, ctx), true)}
                </Text>
              </Pressable>
            </Fragment>
          );
        })}
      </Card>
    </View>
  ));
}

const s = StyleSheet.create({
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
});
