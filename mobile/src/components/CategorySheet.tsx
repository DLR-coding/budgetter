import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GroupKind } from '../lib/budget';
import type { CategoryRow, GroupRow } from '../lib/data';
import { colors, font, radius } from '../theme';

type Props = {
  visible: boolean;
  kind: GroupKind;              // n'affiche que les groupes de ce type
  groups: GroupRow[];
  cats: CategoryRow[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  onClose: () => void;
};

// Panneau du bas : choix d'une catégorie, rangées par groupe.
export function CategorySheet({ visible, kind, groups, cats, selectedId, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const shown = groups.filter((g) => g.kind === kind);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={s.backdrop} accessibilityLabel="Fermer" onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.handle} />
        <Text style={s.title}>Catégorie</Text>
        <ScrollView contentContainerStyle={{ gap: 18 }}>
          {shown.map((g) => (
            <View key={g.id} style={{ gap: 6 }}>
              <Text style={s.group}>{g.name}</Text>
              {cats.filter((c) => c.group_id === g.id && !c.archived).map((c) => {
                const selected = c.id === selectedId;
                return (
                  <Pressable key={c.id} style={[s.row, selected && s.rowSelected]}
                    accessibilityRole="button" accessibilityState={{ selected }}
                    onPress={() => { onSelect(c.id); onClose(); }}>
                    <Text style={[s.rowText, selected && { color: colors.accentText }]}>{c.name}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={colors.accentText} />}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '75%', backgroundColor: colors.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 10, gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 17 },
  group: { color: colors.textMuted, fontFamily: font.medium, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface2 },
  rowSelected: { backgroundColor: colors.accentTint },
  rowText: { color: colors.text, fontFamily: font.regular, fontSize: 15 },
});
