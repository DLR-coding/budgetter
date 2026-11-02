// Panneau « Ajuster le solde » (maquette 6) : remplace le solde de départ du mois par le solde bancaire réel.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatEuros, monthName, parseSignedCents, type Month } from '../lib/budget';
import { setBalanceAdjustment } from '../lib/data';
import { colors, font, radius } from '../theme';
import { BottomSheet, Divider, PrimaryButton } from './ui';

export function AdjustBalanceSheet({ visible, month, computedCents, onClose, onSaved }: {
  visible: boolean; month: Month; computedCents: number; onClose: () => void; onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setText(''); setError(null); }
  }, [visible]);

  const cents = parseSignedCents(text);
  const gap = cents == null ? null : cents - computedCents;

  // Le pavé decimal-pad d'Android n'a pas de touche « − » : bouton ± à côté du champ.
  const toggleSign = () => setText((t) => (/^[-−]/.test(t) ? t.slice(1) : `-${t}`));

  const save = async () => {
    if (cents == null) return;
    setSaving(true);
    try {
      await setBalanceAdjustment(month, cents);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ gap: 6 }}>
        <Text style={s.title} accessibilityRole="header">Ajuster le solde</Text>
        <Text style={s.lead}>
          Remplace le solde de départ de {monthName(month)} (début de mois, avant toute saisie) par ce que tu avais sur ton compte.
        </Text>
      </View>

      <View style={s.card}>
        <View style={s.computedRow}>
          <Text style={s.muted}>Calculé par l’appli</Text>
          <Text style={s.computed}>{formatEuros(computedCents)}</Text>
        </View>
        <Divider />
        <View style={s.inputBlock}>
          <Text style={s.mutedSmall}>Solde réel constaté</Text>
          <View style={s.inputRow}>
            <TextInput
              value={text} onChangeText={setText} keyboardType="decimal-pad" autoFocus
              placeholder={formatEuros(computedCents).replace(/\s?€$/, '')} placeholderTextColor={colors.textFaint}
              style={s.input} accessibilityLabel="Solde réel constaté, en euros" selectionColor={colors.accentText}
            />
            <Text style={s.input}>€</Text>
            <Pressable onPress={toggleSign} accessibilityRole="button" accessibilityLabel="Changer le signe"
              hitSlop={8} style={s.sign}>
              <Text style={s.signText}>±</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {gap != null && (
        <View style={[s.gap, { backgroundColor: gap < 0 ? colors.warnBg : colors.incomeBg }]}>
          <Text style={s.gapLabel}>Écart</Text>
          <Text style={[s.gapValue, { color: gap < 0 ? colors.warn : colors.income }]}>{formatEuros(gap, true)}</Text>
        </View>
      )}

      <Text style={s.muted}>Les mois suivants repartiront de ce nouveau solde.</Text>
      {error && <Text style={s.error}>Enregistrement impossible : {error}</Text>}

      <View style={s.buttons}>
        <View style={{ flex: 1 }}><PrimaryButton label="Annuler" variant="secondary" onPress={onClose} /></View>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Enregistrer" onPress={save} disabled={cents == null || saving} />
        </View>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 20, marginTop: 8 },
  lead: { color: colors.textMuted, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: colors.bg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
  computedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  computed: { color: colors.text, fontFamily: font.regular, fontSize: 15 },
  inputBlock: { padding: 16, paddingTop: 14, gap: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { color: colors.text, fontFamily: font.semibold, fontSize: 32, letterSpacing: -0.8, padding: 0 },
  sign: {
    marginLeft: 'auto', width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  signText: { color: colors.text, fontFamily: font.semibold, fontSize: 18 },
  muted: { color: colors.textMuted, fontFamily: font.regular, fontSize: 15 },
  mutedSmall: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14 },
  gap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.card },
  gapLabel: { color: colors.textSoft, fontFamily: font.regular, fontSize: 15 },
  gapValue: { fontFamily: font.semibold, fontSize: 15 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 14 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
