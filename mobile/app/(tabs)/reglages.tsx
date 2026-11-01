import { Text, View } from 'react-native';
import { colors, font } from '../../src/theme';

// Écran à construire (étape 2) : voir la maquette « Réglages » sur le canevas.
export default function Screen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 72, paddingHorizontal: 24 }}>
      <Text style={{ color: colors.text, fontSize: 30, fontFamily: font.semibold }}>Réglages</Text>
      <Text style={{ color: colors.textMuted, marginTop: 8, fontFamily: font.regular }}>À venir.</Text>
    </View>
  );
}
