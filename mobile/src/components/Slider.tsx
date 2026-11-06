import { useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

// Curseur horizontal en JS (pas de module natif : pas de nouveau build de l'appli).
// onChange reçoit la valeur brute ; à l'appelant de la borner et de l'arrondir à son pas.
export function Slider({ value, min, max, onChange, accessibilityLabel }: {
  value: number; min: number; max: number; onChange: (v: number) => void; accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const at = (x: number) => min + Math.min(1, Math.max(0, x / (width || 1))) * (max - min);
  // locationX est relatif à la piste : pouce et remplissage ignorent le toucher (pointerEvents).
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // le défilement vertical ne vole pas le geste
    onPanResponderGrant: (e) => onChange(at(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => onChange(at(e.nativeEvent.locationX)),
  });
  const step = (max - min) / 20;
  return (
    <View
      style={s.hit}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
      {...pan.panHandlers}
    >
      <View style={s.track} pointerEvents="none">
        <View style={[s.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <View style={[s.thumb, { left: ratio * width - THUMB / 2 }]} pointerEvents="none" />
    </View>
  );
}

const THUMB = 22;
const s = StyleSheet.create({
  hit: { height: 36, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.text,
    borderWidth: 2, borderColor: colors.accent,
  },
});
