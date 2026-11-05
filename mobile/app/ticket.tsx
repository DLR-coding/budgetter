// Maquette 4 · Validation du ticket : photo → lecture par le service IA → vérification des lignes → saisie.
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategorySheet } from '../src/components/CategorySheet';
import { Banner, BottomSheet, CategoryPill, CircleButton, Divider, PrimaryButton, ScreenHeader } from '../src/components/ui';
import { isoDate } from '../src/lib/articles';
import { formatAmount, formatEuros, monthLabel, monthOf, tintFor } from '../src/lib/budget';
import { loadCategories, saveEntry, type CategoryRow, type GroupRow } from '../src/lib/data';
import {
  applyLineForm, canSave, lineForm, linesTotal, matchesTotal, needsReview, receiptDate, receiptSubtitle, removeLine,
  setLineCategory, toSaveLines, type LineForm, type ParsedReceipt,
} from '../src/lib/receipt';
import { loadAiSettings } from '../src/lib/ai-settings';
import { MISSING_AI_SETTINGS, parseReceipt, removeReceipt, takeReceiptPhoto, uploadReceipt } from '../src/lib/receipts';
import { colors, font, radius } from '../src/theme';
import { haptics } from '../src/lib/haptics';

type Phase = { step: 'photo' } | { step: 'loading' } | { step: 'error'; message: string; settings?: boolean } | { step: 'ready' };

export default function Ticket() {
  const { source } = useLocalSearchParams<{ source?: string }>(); // 'library' : image de la galerie
  const insets = useSafeAreaInsets();
  const photo = useRef<string | null>(null);   // base64 du JPEG réduit
  const path = useRef<string | null>(null);    // chemin dans le bucket 'receipts', une fois envoyé
  const left = useRef(false);                  // écran quitté (✕, retour Android, enregistrement)
  const kept = useRef(false);                  // photo rattachée à une saisie (enregistrée ou en cours)
  const [phase, setPhase] = useState<Phase>({ step: 'photo' });
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lineEdit, setLineEdit] = useState<{ index: number | null; form: LineForm } | null>(null); // index null : nouvel article
  const [merchantText, setMerchantText] = useState<string | null>(null);

  /** Envoi (s'il n'est pas déjà fait) et lecture en parallèle. */
  async function analyse() {
    if (!photo.current) return;
    const base64 = photo.current;
    setPhase({ step: 'loading' });
    try {
      const upload = path.current ? Promise.resolve(path.current) : uploadReceipt(base64).then((p) => {
        path.current = p;
        if (left.current) drop(); // écran quitté pendant l'envoi
        return p;
      });
      const parse = loadCategories().then(({ groups: g, cats: c }) => {
        setGroups(g);
        setCats(c);
        return parseReceipt(base64, g, c);
      });
      const [up, parsed] = await Promise.allSettled([upload, parse]);
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
      // Sans service IA réglé, inutile de prendre la photo.
      if (!(await loadAiSettings())) return setPhase({ step: 'error', message: MISSING_AI_SETTINGS, settings: true });
      const shot = await takeReceiptPhoto(source === 'library' ? 'library' : 'camera');
      if (!shot) return router.back();
      photo.current = shot.base64;
      await analyse();
    } catch (e) {
      setPhase({ step: 'error', message: (e as Error).message });
    }
  }

  useEffect(() => { shoot(); }, []);

  /** Supprime la photo envoyée si aucune saisie ne la garde. */
  function drop() {
    if (path.current && !kept.current) removeReceipt(path.current).catch(console.warn);
  }

  // Quitter sans enregistrer, par n'importe quel moyen (✕, geste ou bouton retour) : la photo est supprimée.
  useEffect(() => {
    left.current = false;
    return () => { left.current = true; drop(); };
  }, []);

  async function save() {
    if (!receipt || !path.current) return;
    setSaving(true);
    setSaveError(null);
    kept.current = true; // pendant l'enregistrement, quitter l'écran ne doit pas effacer la photo
    try {
      const date = receiptDate(receipt.date);
      await saveEntry({
        source: 'ticket', receiptPath: path.current, merchant: receipt.merchant ?? undefined,
        date, lines: toSaveLines(receipt.lines),
      });
      // Le ticket peut dater d'un autre mois : on ouvre ce mois-là, sinon la dépense semble absente.
      haptics.success();
      router.dismissTo({ pathname: '/', params: { month: date.slice(0, 7), at: String(Date.now()) } });
    } catch (e) {
      haptics.warning();
      kept.current = false;
      if (left.current) drop();
      setSaving(false);
      setSaveError(`Enregistrement impossible : ${(e as Error).message}`);
    }
  }

  const header = (
    <ScreenHeader title="Vérifier le ticket" left="close" onLeft={() => router.back()}
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
              {phase.settings
                ? <PrimaryButton label="Ouvrir les réglages" onPress={() => router.dismissTo('/reglages')} />
                : <PrimaryButton label="Réessayer" variant="secondary" onPress={photo.current ? analyse : shoot} />}
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
  const date = receiptDate(receipt.date);
  const otherMonth = monthOf(date) !== monthOf(new Date());
  const edited = lineEdit ? applyLineForm(lines, lineEdit.index, lineEdit.form) : null;
  const setForm = (patch: Partial<LineForm>) => lineEdit && setLineEdit({ ...lineEdit, form: { ...lineEdit.form, ...patch } });

  const pickDate = () => {
    const [y, m, d] = date.split('-').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(y, m - 1, d), mode: 'date',
      onChange: (ev, picked) => { if (ev.type === 'set' && picked) setReceipt({ ...receipt, date: isoDate(picked) }); },
    });
  };

  return (
    <View style={s.screen}>
      {header}
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.merchant}>
          <View style={s.merchantIcon}>
            <Ionicons name="receipt-outline" size={24} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Pressable onPress={() => setMerchantText(receipt.merchant ?? '')} accessibilityRole="button"
              accessibilityLabel={`Commerçant : ${receipt.merchant ?? 'aucun'}. Modifier`} hitSlop={6}>
              <Text style={s.merchantName} numberOfLines={1}>{receipt.merchant ?? 'Ticket'}</Text>
            </Pressable>
            <Pressable onPress={pickDate} accessibilityRole="button" accessibilityLabel="Modifier la date du ticket" hitSlop={6}>
              <Text style={s.muted} numberOfLines={1}>{receiptSubtitle(date, lines.length)}</Text>
            </Pressable>
          </View>
          <Text style={s.merchantTotal}>{formatEuros(receipt.total_cents ?? total)}</Text>
        </View>

        {otherMonth && (
          <Banner tone="warn" icon="calendar-outline"
            text={`Ce ticket sera classé en ${monthLabel(monthOf(date)).toLowerCase()} : touche la date pour la changer`} />
        )}

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
                  <Pressable style={({ pressed }) => [s.line, pressed && s.pressed]}
                    onPress={() => setLineEdit({ index: i, form: lineForm(l) })}
                    onLongPress={() => { haptics.warning(); setReceipt({ ...receipt, lines: removeLine(lines, i) }); }}
                    accessibilityRole="button" accessibilityHint="Touche pour modifier, appui long pour retirer la ligne">
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

        <Pressable onPress={() => setLineEdit({ index: null, form: lineForm() })} accessibilityRole="button"
          style={({ pressed }) => [s.addLine, pressed && s.pressed]}>
          <Ionicons name="add" size={18} color={colors.accentText} />
          <Text style={s.addLineText}>Ajouter un article</Text>
        </Pressable>
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

      <BottomSheet visible={merchantText != null} onClose={() => setMerchantText(null)} title="Commerçant">
        <View style={{ gap: 12 }}>
          <TextInput style={s.input} value={merchantText ?? ''} onChangeText={setMerchantText} autoFocus
            placeholder="Nom du commerçant" placeholderTextColor={colors.textFaint} accessibilityLabel="Nom du commerçant" />
          <PrimaryButton label="Valider" onPress={() => {
            setReceipt({ ...receipt, merchant: merchantText?.trim() || null });
            setMerchantText(null);
          }} />
        </View>
      </BottomSheet>

      <BottomSheet visible={lineEdit != null} onClose={() => setLineEdit(null)}
        title={lineEdit?.index == null ? 'Ajouter un article' : 'Modifier l’article'}>
        {lineEdit && (
          <View style={{ gap: 12 }}>
            {lineEdit.index != null && lines[lineEdit.index]?.raw_label
              ? <Text style={s.raw}>Sur le ticket : {lines[lineEdit.index].raw_label.toUpperCase()}</Text> : null}
            <TextInput style={s.input} value={lineEdit.form.label} onChangeText={(label) => setForm({ label })}
              autoFocus={lineEdit.index == null} placeholder="Libellé" placeholderTextColor={colors.textFaint}
              accessibilityLabel="Libellé de l’article" />
            <View style={s.formRow}>
              <TextInput style={[s.input, s.qty]} value={lineEdit.form.quantity} onChangeText={(quantity) => setForm({ quantity })}
                keyboardType="number-pad" selectTextOnFocus accessibilityLabel="Quantité" />
              <Text style={s.times}>×</Text>
              <TextInput style={[s.input, { flex: 1 }]} value={lineEdit.form.price} onChangeText={(price) => setForm({ price })}
                keyboardType="decimal-pad" selectTextOnFocus placeholder="Prix unitaire" placeholderTextColor={colors.textFaint}
                accessibilityLabel="Prix unitaire en euros" />
              {/* Le pavé decimal-pad d'Android n'a pas de « − » : remises. */}
              <Pressable style={s.sign} accessibilityRole="button" accessibilityLabel="Changer le signe (remise)" hitSlop={6}
                onPress={() => setForm({ price: /^[-−]/.test(lineEdit.form.price) ? lineEdit.form.price.slice(1) : `-${lineEdit.form.price}` })}>
                <Text style={s.signText}>±</Text>
              </Pressable>
            </View>
            <Text style={s.muted}>
              {edited ? `Total de la ligne : ${formatEuros(linesTotal(lineEdit.index == null ? edited.slice(-1) : [edited[lineEdit.index]]))}`
                : 'Quantité entière (1 ou plus) et prix non nul.'}
            </Text>
            {lineEdit.index == null && <Text style={s.muted}>Choisis ensuite sa catégorie sur la pastille « À vérifier ».</Text>}
            <View style={s.formRow}>
              {lineEdit.index != null && (
                <View style={{ flex: 1 }}>
                  <PrimaryButton label="Retirer" variant="secondary" onPress={() => {
                    haptics.warning();
                    setReceipt({ ...receipt, lines: removeLine(lines, lineEdit.index!) });
                    setLineEdit(null);
                  }} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Valider" disabled={!edited} onPress={() => {
                  if (edited) setReceipt({ ...receipt, lines: edited });
                  setLineEdit(null);
                }} />
              </View>
            </View>
          </View>
        )}
      </BottomSheet>
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

  pressed: { backgroundColor: colors.surface2 },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 10, borderRadius: radius.pill },
  addLineText: { color: colors.accentText, fontFamily: font.semibold, fontSize: 15 },

  input: {
    height: 52, paddingHorizontal: 14, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2, color: colors.text, fontFamily: font.regular, fontSize: 17,
  },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qty: { width: 64, textAlign: 'center' },
  times: { color: colors.textMuted, fontFamily: font.regular, fontSize: 18 },
  sign: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  signText: { color: colors.text, fontFamily: font.semibold, fontSize: 18 },

  footer: { paddingTop: 8, gap: 10 },
});
