import { Tabs } from 'expo-router/js-tabs';
import { GlassScene, GlassScenes } from '../../src/components/GlassBackdrop';
import { GlassTabBar } from '../../src/components/GlassTabBar';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  return (
    <GlassScenes>
      <Tabs
        tabBar={(props) => <GlassTabBar {...props} />}
        // Chaque onglet est une vue capturable : la barre en verre réfracte ce qu'il y a derrière elle.
        screenLayout={({ route, children }) => <GlassScene routeKey={route.key}>{children}</GlassScene>}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="saisies" />
        <Tabs.Screen name="reglages" />
      </Tabs>
    </GlassScenes>
  );
}
