import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheet, Card, CircleButton, Divider, EntryIcon, PrimaryButton, ProgressBar, ScreenHeader, SectionTitle,
} from '../../src/components/ui';
import { parsePriceCents } from '../../src/lib/articles';
import { formatAmount, formatEuros, monthLabel, monthOf, plannedFor, type Category, type Month } from '../../src/lib/budget';
import {
  clearPlannedOverride, loadBudget, loadCategories, loadEntries, setCategoryCounted, setPlannedOverride, type EntryRow,
} from '../../src/lib/data';
import { dayMonth, entryKind, entryTitle, lineLabel, otherLinesNote, qtyLabel, sourceLabel } from '../../src/lib/entries';
import { colors, font, radius } from '../../src/theme';

type Data = Awaited<ReturnType<typeof loadBudget>> & { entries: EntryRow[] };

// Détail d'une catégorie sur un mois (maquette 2) : réel / prévu, saisies dépliables, prévu du mois.
export default function CategoryScreen() {
  const params = useLocalSearchParams<{ id: string; month?: string }>();
  const id = params.id;
  const month: Month = params.month ?? monthOf(new Date());
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<'closed' | 'menu' | 'edit'>('closed');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingCounted, setPendingCounted] = useState<boolean | null>(null); // affiché avant la fin de l'enregistrement

  const load = useCallback(async () => {
    try {
      const [b, entries, all] = await Promise.all([
        loadBudget(month, month), loadEntries(month), loadCategories({ includeArchived: true }),
      ]);
      // Les archivées aussi : une catégorie archivée reste consultable, et ses saisies passées gardent leur nom.
      setData({ ...b, cats: all.cats, entries });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cat = data?.cats.find((c) => c.id === id);
  const group = data?.groups.find((g) => g.id === cat?.group_id);
  const monthName = monthLabel(month, false).toLowerCase();

  if (!data || !cat) {
    return (
      <View style={s.screen}>
        <ScreenHeader title="Catégorie" left="back" />
        {error || data ? <Text style={s.error}>{error ?? 'Catégorie introuvable.'}</Text>
          : <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const ctx = { groups: data.groups, cats: data.cats };
  const kind = data.groups.find((g) => g.id === cat.group_id)?.kind ?? 'depense';
  const category: Category = { id, kind, defaultPlannedCents: cat.default_planned_cents, archived: cat.archived };
  const planned = plannedFor(category, month, data.overrides);
  const override = data.overrides.find((o) => o.categoryId === id && o.month === month);
  const hasOverride = override?.amountCents != null;
  // Interrupteur de la catégorie ; celui du mois (écran Mois) peut le neutraliser.
  const catCounted = pendingCounted ?? override?.counted ?? true;
  const monthCounted = data.monthSettings.find((x) => x.month === month && x.kind === kind)?.plannedCounted ?? true;
  const showCounted = month >= monthOf(new Date()) && kind !== 'epargne';
  const items = data.entries
    .map((e) => {
      const lines = e.entry_lines.filter((l) => l.category_id === id);
      return { e, lines, cents: lines.reduce((t, l) => t + l.quantity * l.unit_price_cents, 0) };
    })
    .filter((x) => x.lines.length > 0);
  const actual = items.reduce((t, x) => t + x.cents, 0);
  const over = actual > planned;

  // Une saisie dépliée a sa propre carte ; les autres se suivent dans une carte commune.
  const cards: (typeof items)[] = [];
  for (const x of items) {
    const last = cards[cards.length - 1];
    if (open.has(x.e.id) || !last || open.has(last[0].e.id)) cards.push([x]);
    else last.push(x);
  }

  const toggle = (x: (typeof items)[number]) => {
    if (x.lines.length < 2 || open.has(x.e.id)) {
      router.push({ pathname: '/entree/[id]', params: { id: x.e.id } });
      return;
    }
    setOpen(new Set(open).add(x.e.id));
  };

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      setMenu('closed');
      await load();
    } catch (e) {
      setError((e as Error).message);
      setMenu('closed');
    }
  };
  const newCents = parsePriceCents(amount);
  const toggleCounted = async (on: boolean) => {
    setPendingCounted(on);
    try {
      await setCategoryCounted(id, month, on);
      await load();
    } catch (e) {
      setError((e as Error).message); // l'interrupteur revient à la valeur enregistrée
    } finally {
      setPendingCounted(null);
    }
  };

  return (
    <View style={s.screen}>
      <ScreenHeader title={cat.name} subtitle={`${group?.name ?? ''} · ${monthName}`} left="back"
        right={<CircleButton icon="ellipsis-horizontal" accessibilityLabel="Options du prévu" onPress={() => setMenu('menu')} />} />

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={s.summary}>
          <View style={s.summaryTop}>
            <Text style={s.big} numberOfLines={1} adjustsFontSizeToFit>{formatEuros(actual)}</Text>
            <Text style={s.of}>sur {formatEuros(planned)} prévus</Text>
          </View>
          <ProgressBar ratio={planned > 0 ? actual / planned : actual > 0 ? 1 : 0} over={over} />
          <View style={s.summaryBottom}>
            <Text style={s.muted}>{items.length} saisie{items.length > 1 ? 's' : ''}</Text>
            {over
              ? <Text style={[s.muted, { color: colors.warn }]}>Dépassé de <Text style={s.strong}>{formatEuros(actual - planned)}</Text></Text>
              : <Text style={s.muted}>Reste <Text style={[s.strong, { color: colors.text }]}>{formatEuros(planned - actual)}</Text></Text>}
          </View>
        </Card>

        {showCounted && (
          <Card style={s.counted}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.countedTitle}>Compter le prévu en {monthName}</Text>
              <Text style={s.muted}>
                {!monthCounted
                  ? `Désactivé pour tous les ${kind === 'revenu' ? 'revenus' : 'dépenses'} de ${monthName} (écran Mois) : le solde projeté ne compte que le réel (${formatEuros(actual)})`
                  : catCounted
                    ? `Activé : le solde projeté compte le prévu (${formatEuros(planned)})`
                    : `Désactivé : le solde projeté ne compte que le réel (${formatEuros(actual)})`}
              </Text>
            </View>
            <Switch value={catCounted} onValueChange={toggleCounted}
              accessibilityLabel={`Compter le prévu de ${cat.name} en ${monthName}`}
              trackColor={{ false: colors.surface2, true: colors.accent }} thumbColor={colors.text} />
          </Card>
        )}

        {error && <Text style={s.error}>{error}</Text>}

        {items.length > 0 && <SectionTitle title="Saisies" />}
        {cards.map((card) => (
          <Card key={card[0].e.id}>
            {card.map((x, i) => {
              const expanded = open.has(x.e.id);
              const source = sourceLabel(x.e.source);
              const sub = [source[0].toUpperCase() + source.slice(1), dayMonth(x.e.date)];
              if (x.lines.length > 1) sub.push(`${x.lines.length} articles`);
              const note = expanded ? otherLinesNote(x.e, id, ctx) : null;
              return (
                <Fragment key={x.e.id}>
                  {i > 0 && <Divider />}
                  <Pressable style={({ pressed }) => [s.row, pressed && s.pressed]} onPress={() => toggle(x)}
                    accessibilityRole="button" accessibilityState={{ expanded: x.lines.length > 1 ? expanded : undefined }}>
                    <EntryIcon source={x.e.source} kind={entryKind(x.e, ctx)} size={42} />
                    <View style={s.rowText}>
                      <Text style={s.rowTitle} numberOfLines={1}>{entryTitle(x.e, ctx)}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>{sub.join(' · ')}</Text>
                    </View>
                    <Text style={s.rowAmount}>{formatEuros(x.cents)}</Text>
                  </Pressable>
                  {expanded && (
                    <View style={s.lines}>
                      {x.lines.map((l) => (
                        <View key={l.id} style={s.line}>
                          <Text style={s.lineLabel} numberOfLines={1}>
                            {lineLabel(l)}{qtyLabel(l) ? <Text style={s.lineQty}>  {qtyLabel(l)}</Text> : null}
                          </Text>
                          <Text style={s.lineAmount}>{formatAmount(l.quantity * l.unit_price_cents)}</Text>
                        </View>
                      ))}
                      {note && <Text style={s.lineNote}>{note}</Text>}
                    </View>
                  )}
                </Fragment>
              );
            })}
          </Card>
        ))}
      </ScrollView>

      <BottomSheet visible={menu !== 'closed'} onClose={() => setMenu('closed')}
        title={menu === 'edit' ? `Prévu de ${monthName}` : cat.name}>
        {menu === 'menu' ? (
          <View style={{ gap: 6 }}>
            <Pressable style={s.option} accessibilityRole="button"
              onPress={() => { setAmount(formatAmount(planned).replace(/\s/g, '')); setMenu('edit'); }}>
              <Ionicons name="create-outline" size={18} color={colors.text} />
              <Text style={s.optionText}>Modifier le prévu de {monthName}</Text>
            </Pressable>
            {hasOverride && (
              <Pressable style={s.option} accessibilityRole="button" onPress={() => run(() => clearPlannedOverride(id, month))}>
                <Ionicons name="refresh" size={18} color={colors.text} />
                <Text style={s.optionText}>Revenir au prévu par défaut ({formatEuros(cat.default_planned_cents)})</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={s.inputBox}>
              <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus
                selectTextOnFocus accessibilityLabel={`Prévu de ${monthName} en euros`} />
              <Text style={s.euro}>€</Text>
            </View>
            <Text style={s.muted}>Seulement pour {monthName} : le prévu par défaut ({formatEuros(cat.default_planned_cents)}) ne change pas.</Text>
            <PrimaryButton label="Enregistrer" disabled={newCents === null}
              onPress={() => { if (newCents !== null) run(() => setPlannedOverride(id, month, newCents)); }} />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  content: { gap: 14, paddingTop: 12 },
  error: { color: colors.warn, fontFamily: font.regular, textAlign: 'center', marginTop: 8 },

  summary: { padding: 20, gap: 16 },
  summaryTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  big: { flexShrink: 1, color: colors.text, fontFamily: font.semibold, fontSize: 44, letterSpacing: -1.2 },
  of: { color: colors.textMuted, fontFamily: font.regular, fontSize: 16 },
  summaryBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14 },
  strong: { fontFamily: font.semibold },
  counted: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  countedTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  pressed: { backgroundColor: colors.surface2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontFamily: font.medium, fontSize: 16 },
  rowSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  rowAmount: { color: colors.text, fontFamily: font.semibold, fontSize: 16 },

  // Retrait aligné sur le texte de la ligne de saisie (16 + icône 42 + 12).
  lines: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider,
    paddingLeft: 70, paddingRight: 16, paddingTop: 10, paddingBottom: 14, gap: 12,
  },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  lineLabel: { flex: 1, color: colors.textSoft, fontFamily: font.regular, fontSize: 14 },
  lineQty: { color: colors.textMuted },
  lineAmount: { color: colors.textSoft, fontFamily: font.regular, fontSize: 14 },
  lineNote: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13 },

  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: colors.surface2,
  },
  optionText: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 16, borderRadius: radius.key,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  input: { flex: 1, color: colors.text, fontFamily: font.semibold, fontSize: 28, paddingVertical: 0 },
  euro: { color: colors.textMuted, fontFamily: font.regular, fontSize: 24 },
});
