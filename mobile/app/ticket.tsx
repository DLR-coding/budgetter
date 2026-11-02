// Maquette 4 · Validation du ticket : photo → lecture par Claude → vérification des lignes → saisie.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategorySheet } from '../src/components/CategorySheet';
import { Banner, CategoryPill, CircleButton, Divider, PrimaryButton, ScreenHeader } from '../src/components/ui';
import { formatAmount, formatEuros, tintFor } from '../src/lib/budget';
import { loadCategories, saveEntry, type CategoryRow, type GroupRow } from '../src/lib/data';
import {
  canSave, linesTotal, matchesTotal, needsReview, receiptDate, receiptSubtitle, removeLine, setLineCategory, toSaveLines,
  type ParsedReceipt,
} from '../src/lib/receipt';
import { parseReceipt, removeReceipt, takeReceiptPhoto, uploadReceipt } from '../src/lib/receipts';
import { colors, font, radius } from '../src/theme';

type Phase = { step: 'photo' } | { step: 'loading' } | { step: 'error'; message: string } | { step: 'ready' };

export default function Ticket() {
  const insets = useSafeAreaInsets();
  const photo = useRef<string | null>(null);   // base64 du JPEG réduit
  const path = useRef<string | null>(null);    // chemin dans le bucket 'receipts', une fois envoyé
  const [phase, setPhase] = useState<Phase>({ step: 'photo' });
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Envoi (s'il n'est pas déjà fait) et lecture en parallèle. */
  async function analyse() {
    if (!photo.current) return;
    const base64 = photo.current;
    setPhase({ step: 'loading' });
    try {
      const upload = path.current ? Promise.resolve(path.current) : uploadReceipt(base64);
      const parse = loadCategories().then(({ groups: g, cats: c }) => {
        setGroups(g);
        setCats(c);
        return parseReceipt(base64, g, c);
      });
      const [up, parsed] = await Promise.allSettled([upload, parse]);
      if (up.status === 'fulfilled') path.current = up.value;
      if (up.status === 'rejected') throw up.reason;
      if (parsed.status === 'rejected') throw parsed.reason;
      setReceipt(parsed.value);
      setPhase({ step: 'ready' });
    } catch (e) {
      setPhase({ step: 'error', message: (e as Error).message });
    }
  }

  async function shoot() {
    setPhase({ step: 'photo' });
    try {
      const shot = await takeReceiptPhoto();
      if (!shot) return router.back();
      photo.current = shot.base64;
      await analyse();
    } catch (e) {
      setPhase({ step: 'error', message: (e as Error).message });
    }
  }

  useEffect(() => { shoot(); }, []);

  /** ✕ : abandon, la photo déjà envoyée est supprimée. */
  function cancel() {
    if (path.current) removeReceipt(path.current).catch(console.warn);
    router.back();
  }

  async function save() {
    if (!receipt || !path.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveEntry({
        source: 'ticket', receiptPath: path.current, merchant: receipt.merchant ?? undefined,
        date: receiptDate(receipt.date), lines: toSaveLines(receipt.lines),
      });
      router.dismissTo('/');
    } catch (e) {
      setSaving(false);
      setSaveError(`Enregistrement impossible : ${(e as Error).message}`);
    }
  }

  const header = (
    <ScreenHeader title="Vérifier le ticket" left="close" onLeft={cancel}
      right={phase.step === 'ready' || (phase.step === 'error' && photo.current)
        ? <CircleButton icon="refresh" onPress={analyse} accessibilityLabel="Relancer l’analyse" />
        : undefined} />
  );

  if (phase.step !== 'ready' || !receipt) {
    return (
      <View style={[s.screen, { paddingBottom: insets.bottom + 16 }]}>
        {header}
        <View style={s.center}>
          {phase.step === 'error' ? (
            <>
              <Ionicons name="alert-circle-outline" size={32} color={colors.warn} />
              <Text style={s.error}>{phase.message}</Text>
              <PrimaryButton label="Réessayer" variant="secondary" onPress={photo.current ? analyse : shoot} />
            </>
          ) : phase.step === 'loading' ? (
            <>
              <ActivityIndicator color={colors.accentText} />
              <Text style={s.muted}>Lecture du ticket…</Text>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const lines = receipt.lines;
  const match = matchesTotal(receipt);
  const total = linesTotal(lines);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <View style={s.screen}>
      {header}
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.merchant}>
          <View style={s.merchantIcon}>
            <Ionicons name="receipt-outline" size={24} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.merchantName} numberOfLines={1}>{receipt.merchant ?? 'Ticket'}</Text>
            <Text style={s.muted} numberOfLines={1}>{receiptSubtitle(receipt.date, lines.length)}</Text>
          </View>
          <Text style={s.merchantTotal}>{formatEuros(receipt.total_cents ?? total)}</Text>
        </View>

        {match != null && (match
          ? <Banner tone="ok" icon="checkmark" text="La somme des lignes correspond au total du ticket" />
          : <Banner tone="warn" icon="alert-circle-outline"
              text={`La somme des lignes (${formatEuros(total)}) ne correspond pas au total du ticket (${formatEuros(receipt.total_cents!)})`} />)}

        {lines.length > 0 && (
          <View style={s.card}>
            {lines.map((l, i) => {
              const cat = l.category_id ? catById.get(l.category_id) : undefined;
              const group = cat ? groupById.get(cat.group_id) : undefined;
              return (
                <View key={i}>
                  {i > 0 && <Divider />}
                  <Pressable style={s.line} onLongPress={() => setReceipt({ ...receipt, lines: removeLine(lines, i) })}
                    accessibilityHint="Appui long pour retirer la ligne">
                    <View style={s.lineText}>
                      <Text style={s.lineLabel} numberOfLines={1}>
                        {l.label || l.raw_label}
                        {l.quantity > 1 && <Text style={s.lineQty}> {l.quantity} × {formatAmount(l.unit_price_cents)}</Text>}
                      </Text>
                      {l.raw_label ? <Text style={s.raw} numberOfLines={1}>{l.raw_label.toUpperCase()}</Text> : null}
                    </View>
                    {!cat || needsReview(l)
                      ? <CategoryPill label="À vérifier" tint="warn" outlined onPress={() => setEditing(i)} />
                      : <CategoryPill label={cat.name} tint={group ? tintFor(group) : 'accent'} onPress={() => setEditing(i)} />}
                    <Text style={s.amount}>{formatAmount(l.quantity * l.unit_price_cents)}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        {saveError && <Text style={s.error}>{saveError}</Text>}
        <PrimaryButton label={saving ? 'Enregistrement…' : 'Ajouter au budget'} trailing={formatEuros(total)}
          disabled={!canSave(lines) || saving} onPress={save} />
      </View>

      <CategorySheet visible={editing != null} kind="depense" groups={groups} cats={cats}
        selectedId={editing != null ? lines[editing]?.category_id ?? null : null}
        onSelect={(id) => editing != null && setReceipt({ ...receipt, lines: setLineCategory(lines, editing, id) })}
        onClose={() => setEditing(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  content: { paddingTop: 16, paddingBottom: 24, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 8 },
  muted: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14 },
  error: { color: colors.warn, fontFamily: font.regular, fontSize: 15, textAlign: 'center' },

  merchant: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingRight: 16,
    backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
  },
  merchantIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  merchantName: { color: colors.text, fontFamily: font.semibold, fontSize: 17, marginBottom: 2 },
  merchantTotal: { color: colors.text, fontFamily: font.semibold, fontSize: 19 },

  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  lineText: { flex: 1, minWidth: 0 },
  lineLabel: { color: colors.text, fontFamily: font.regular, fontSize: 16 },
  lineQty: { color: colors.textMuted },
  raw: { color: colors.textMuted, fontFamily: font.regular, fontSize: 12, marginTop: 2, letterSpacing: 0.3 },
  amount: { minWidth: 52, textAlign: 'right', color: colors.text, fontFamily: font.semibold, fontSize: 16 },

  footer: { paddingTop: 8, gap: 10 },
});
