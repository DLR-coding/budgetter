import { BlurTargetView } from 'expo-blur';
import { Tabs } from 'expo-router/js-tabs';
import { createRef, useRef, type ComponentRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { GlassTabBar } from '../../src/components/GlassTabBar';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  // Chaque onglet est une zone floutable (BlurTargetView) ; la barre floute celle de l'onglet affiché.
  const targets = useRef<Record<string, RefObject<ComponentRef<typeof View> | null>>>({});
  const targetFor = (key: string) => (targets.current[key] ??= createRef<ComponentRef<typeof View>>());

  return (
    <Tabs
      screenLayout={({ route, children }) => (
        <BlurTargetView ref={targetFor(route.key)} style={{ flex: 1, backgroundColor: colors.bg }}>{children}</BlurTargetView>
      )}
      tabBar={(props) => <GlassTabBar {...props} blurTarget={targetFor(props.state.routes[props.state.index].key)} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="saisies" />
      <Tabs.Screen name="reglages" />
    </Tabs>
  );
}
