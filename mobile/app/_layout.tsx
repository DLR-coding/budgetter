import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import type { Session } from '@supabase/supabase-js';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Login } from '../src/components/Login';
import { bootstrap } from '../src/lib/data';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Premier lancement : catégories de l'Excel + charges récurrentes du mois.
  useEffect(() => {
    if (session) bootstrap().catch(console.warn);
  }, [session?.user.id]);

  if (!fontsLoaded || session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {session ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="saisie" options={{ presentation: 'modal' }} />
          <Stack.Screen name="saisie-articles" />
          <Stack.Screen name="categorie/[id]" />
          <Stack.Screen name="entree/[id]" />
          <Stack.Screen name="projection" />
          <Stack.Screen name="groupe/[id]" />
          <Stack.Screen name="recurrences" />
          <Stack.Screen name="ticket" options={{ presentation: 'modal' }} />
        </Stack>
      ) : (
        <Login />
      )}
    </>
  );
}
