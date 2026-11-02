// Briques d'interface partagées par les écrans (maquettes docs/maquettes/).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GroupKind } from '../lib/budget';
import type { EntryRow } from '../lib/data';
import { colors, font, radius } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;
export type Tone = 'default' | 'muted' | 'accent' | 'income' | 'warn';
export type Tint = 'accent' | 'income' | 'warn';

const toneColor: Record<Tone, string> = {
  default: colors.text, muted: colors.textMuted, accent: colors.accentText, income: colors.income, warn: colors.warn,
};
const tintColors: Record<Tint, { bg: string; fg: string }> = {
  accent: { bg: colors.accentTint, fg: colors.accentText },
  income: { bg: colors.incomeBg, fg: colors.income },
  warn: { bg: colors.warnBg, fg: colors.warn },
};

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** Trait fin entre deux lignes d'une carte. */
export const Divider = () => <View style={s.divider} />;

export function CircleButton({ icon, onPress, accessibilityLabel, tone = 'default' }: {
  icon: IconName; onPress: () => void; accessibilityLabel: string; tone?: Tone;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={6} style={s.circle}>
      <Ionicons name={icon} size={20} color={toneColor[tone]} />
    </Pressable>
  );
}

/** En-tête d'écran empilé : rond ‹ ou ✕, titre centré, action à droite. Gère la marge haute de sécurité. */
export function ScreenHeader({ title, subtitle, left, onLeft = () => router.back(), right }: {
  title: string; subtitle?: string; left?: 'back' | 'close'; onLeft?: () => void; right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 12 }]}>
      <View style={s.headerSide}>
        {left && (
          <CircleButton icon={left === 'back' ? 'chevron-back' : 'close'} onPress={onLeft}
            accessibilityLabel={left === 'back' ? 'Retour' : 'Fermer'} />
        )}
      </View>
      <View style={s.headerCenter}>
        <Text style={s.headerTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={[s.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: string | { label: string; onPress: () => void } }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
      {typeof right === 'string' ? <Text style={s.sectionNote}>{right}</Text>
        : right ? (
          <Pressable accessibilityRole="button" onPress={right.onPress} hitSlop={8}>
            <Text style={s.sectionLink}>{right.label}</Text>
          </Pressable>
        ) : null}
    </View>
  );
}

/** Ligne de carte : libellé (+ sous-libellé) à gauche, valeur / contenu / chevron à droite. */
export function ListRow({ label, sublabel, value, valueTone = 'default', chevron, onPress, left, right }: {
  label: string; sublabel?: string; value?: string; valueTone?: Tone; chevron?: boolean;
  onPress?: () => void; left?: ReactNode; right?: ReactNode;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.row, pressed && s.pressed]}>
      {left}
      <View style={s.rowText}>
        <Text style={s.rowLabel} numberOfLines={1}>{label}</Text>
        {sublabel ? <Text style={s.rowSub} numberOfLines={1}>{sublabel}</Text> : null}
      </View>
      {right}
      {value != null && (
        <Text style={[s.rowValue, { color: toneColor[valueTone] }, valueTone === 'muted' && s.rowValueMuted]}>{value}</Text>
      )}
      {chevron && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

export function ProgressBar({ ratio, over }: { ratio: number; over?: boolean }) {
  const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
  return (
    <View style={s.track}>
      <View style={[s.fill, { width: `${pct}%`, backgroundColor: over ? colors.warn : colors.accent }]} />
    </View>
  );
}

export function CategoryPill({ label, tint, outlined, onPress }: {
  label: string; tint: Tint; outlined?: boolean; onPress?: () => void;
}) {
  const c = tintColors[tint];
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} hitSlop={6}
      style={[s.pill, outlined ? { borderColor: c.fg } : { backgroundColor: c.bg, borderColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Icône ronde d'une saisie : reçu (ticket), ⇄ (récurrente), crayon (manuel/formule), ↙ vert (revenu). */
export function EntryIcon({ source, kind, size = 40 }: { source: EntryRow['source']; kind: GroupKind; size?: number }) {
  const income = kind === 'revenu';
  const [name, color]: [IconName, string] = income ? ['arrow-down', colors.income]
    : source === 'ticket' ? ['receipt-outline', colors.accentText]
    : source === 'recurrence' ? ['swap-horizontal', colors.textMuted]
    : ['pencil-outline', colors.textMuted];
  return (
    <View style={[s.entryIcon, { width: size, height: size, borderRadius: size / 2 }, income && { backgroundColor: colors.incomeBg, borderColor: colors.incomeBg }]}>
      <Ionicons name={name} size={size * 0.45} color={color} style={income && { transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

export function PrimaryButton({ label, trailing, onPress, disabled, variant = 'accent' }: {
  label: string; trailing?: string; onPress: () => void; disabled?: boolean; variant?: 'accent' | 'secondary';
}) {
  const fg = variant === 'accent' ? colors.accentInk : colors.text;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.button, variant === 'accent' ? s.buttonAccent : s.buttonSecondary,
        trailing != null && s.buttonSplit, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.85 }]}>
      <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
      {trailing != null && <Text style={[s.buttonText, { color: fg }]}>{trailing}</Text>}
    </Pressable>
  );
}

export function Banner({ tone, icon, text, trailing }: { tone: 'ok' | 'warn'; icon?: IconName; text: string; trailing?: ReactNode }) {
  const c = tintColors[tone === 'ok' ? 'income' : 'warn'];
  return (
    <View style={[s.banner, { backgroundColor: c.bg }]}>
      {icon && <Ionicons name={icon} size={18} color={c.fg} />}
      <Text style={s.bannerText}>{text}</Text>
      {trailing}
    </View>
  );
}

/** Panneau du bas (même rendu que CategorySheet) : fond assombri, poignée, marge basse de sécurité. */
export function BottomSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title?: string; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={s.backdrop} accessibilityLabel="Fermer" onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.handle} />
        {title ? <Text style={s.sheetTitle}>{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginHorizontal: 16 },
  pressed: { backgroundColor: colors.surface2 },

  circle: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  headerSide: { minWidth: 46 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 17 },
  headerSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },

  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 14, marginBottom: 8 },
  sectionTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },
  sectionNote: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14 },
  sectionLink: { color: colors.accentText, fontFamily: font.semibold, fontSize: 14 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 12, paddingHorizontal: 16 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { color: colors.text, fontFamily: font.regular, fontSize: 16 },
  rowSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  rowValue: { fontFamily: font.semibold, fontSize: 16 },
  rowValueMuted: { fontFamily: font.regular },

  track: { height: 7, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },

  pill: { alignSelf: 'flex-start', height: 24, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  pillText: { fontFamily: font.medium, fontSize: 12 },

  entryIcon: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

  button: { height: 56, borderRadius: radius.pill, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  buttonSplit: { justifyContent: 'space-between' },
  buttonAccent: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  buttonText: { fontFamily: font.semibold, fontSize: 17 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.card },
  bannerText: { flex: 1, color: colors.textSoft, fontFamily: font.regular, fontSize: 14 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 10, gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  sheetTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 17 },
});
