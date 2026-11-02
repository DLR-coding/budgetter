// Mini-graphe « jusqu'où je tiens » (maquette 1) : une barre par mois, au-dessus de la base
// si le solde de fin est positif, en dessous sinon. Barres en View, sans bibliothèque de graphe.
import { StyleSheet, Text, View } from 'react-native';
import { shortMonthLabel, type MonthSummary } from '../lib/budget';
import { colors, font } from '../theme';

const MAX_H = 40;   // hauteur maximale d'une barre, de chaque côté de la base
const MIN_H = 5;    // un petit solde reste visible
// Atténuations des jetons accent et warn (posées sur colors.surface).
const accentDim = 'rgba(47, 82, 174, 0.55)';
const warnDim = 'rgba(255, 158, 87, 0.45)';

export function RunwayChart({ months, currentMonth }: { months: MonthSummary[]; currentMonth: string }) {
  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.endCents)));
  const firstNeg = months.find((m) => m.endCents < 0)?.month;
  const hasPos = months.some((m) => m.endCents >= 0);
  const height = (cents: number) => Math.max(MIN_H, Math.round((Math.abs(cents) / maxAbs) * MAX_H));

  return (
    <View accessible accessibilityLabel={`Solde de fin de mois sur ${months.length} mois`}>
      <View style={s.bars}>
        {months.map((m) => {
          const neg = m.endCents < 0;
          const color = neg ? (m.month === firstNeg ? colors.warn : warnDim)
            : m.month === currentMonth ? colors.accent : accentDim;
          return (
            <View key={m.month} style={s.col}>
              <View style={[s.half, { height: hasPos ? MAX_H : 0 }]}>
                {!neg && <View style={[s.bar, s.up, { height: height(m.endCents), backgroundColor: color }]} />}
              </View>
              <View style={s.base} />
              <View style={[s.half, s.down, { height: firstNeg ? MAX_H : 0 }]}>
                {neg && <View style={[s.bar, s.downBar, { height: height(m.endCents), backgroundColor: color }]} />}
              </View>
            </View>
          );
        })}
      </View>
      <View style={s.labels}>
        {months.map((m) => {
          const first = m.month === firstNeg;
          const current = m.month === currentMonth;
          return (
            <Text key={m.month} style={[s.label, (first || current) && s.labelStrong, first && { color: colors.warn }]}>
              {shortMonthLabel(m.month)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bars: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  half: { justifyContent: 'flex-end' },
  down: { justifyContent: 'flex-start' },
  base: { height: 1, backgroundColor: colors.border },
  bar: { width: '100%' },
  up: { borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  downBar: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  labels: { flexDirection: 'row', gap: 8, marginTop: 10 },
  label: { flex: 1, textAlign: 'center', color: colors.textMuted, fontFamily: font.regular, fontSize: 13 },
  labelStrong: { color: colors.text, fontFamily: font.semibold },
});
