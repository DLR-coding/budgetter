import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, font, radius } from '../theme';

// Connexion par e-mail + mot de passe. Le compte se crée une seule fois dans
// le tableau de bord Supabase (Authentication > Users > Add user).
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError('E-mail ou mot de passe incorrect.');
  };

  return (
    <View style={s.screen}>
      <Text style={s.title}>Budget</Text>
      <TextInput style={s.input} placeholder="E-mail" placeholderTextColor={colors.textFaint}
        autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Mot de passe" placeholderTextColor={colors.textFaint}
        secureTextEntry value={password} onChangeText={setPassword} />
      {error && <Text style={s.error}>{error}</Text>}
      <Pressable style={s.button} onPress={signIn}><Text style={s.buttonText}>Se connecter</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 12 },
  title: { color: colors.text, fontSize: 34, fontFamily: font.semibold, marginBottom: 12 },
  input: {
    height: 52, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontSize: 16, fontFamily: font.regular,
  },
  error: { color: colors.warn, fontFamily: font.regular },
  button: { height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: colors.accentInk, fontSize: 16, fontFamily: font.semibold },
});
