import { Tabs } from 'expo-router';
import { GlassTabBar } from '../../src/components/GlassTabBar';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="saisies" />
      <Tabs.Screen name="reglages" />
    </Tabs>
  );
}
