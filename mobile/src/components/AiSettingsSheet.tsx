import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { clearAiSettings, saveAiSettings } from '../lib/ai-settings';
import { validateAiSettings, type AiSettings } from '../lib/receipt';
import { testAiSettings } from '../lib/receipts';
import { colors, font, radius } from '../theme';
import { BottomSheet, PrimaryButton } from './ui';

type Props = { visible: boolean; current: AiSettings | null; onClose: () => void; onSaved: () => void };

// Panneau du bas : service IA de lecture des tickets (URL, clé API, modèle). La clé n'est jamais réaffichée.
export function AiSettingsSheet({ visible, current, onClose, onSaved }: Props) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBaseUrl(current?.baseUrl ?? '');
    setApiKey('');
    setModel(current?.model ?? '');
    setResult(null);
  }, [visible, current]);

  // Champ clé vide = garder la clé enregistrée.
  const input = (): AiSettings => ({ baseUrl, model, apiKey: apiKey.trim() || current?.apiKey || '' });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setResult(null);
    try {
      await action();
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const test = () => run(async () => setResult(await testAiSettings(validateAiSettings(input()))));
  const save = () => run(async () => { await saveAiSettings(input()); onSaved(); onClose(); });
  const clear = () => run(async () => { await clearAiSettings(); onSaved(); onClose(); });

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Lecture des tickets">
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>URL du service</Text>
        <TextInput style={s.input} value={baseUrl} onChangeText={setBaseUrl} placeholder="https://…/v1"
          placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} keyboardType="url" />

        <Text style={s.label}>Clé API{current ? ' · Clé enregistrée' : ''}</Text>
        <TextInput style={s.input} value={apiKey} onChangeText={setApiKey} secureTextEntry
          placeholder={current ? 'Laisser vide pour la garder' : 'sk-…'}
          placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} />

        <Text style={s.label}>Modèle</Text>
        <TextInput style={s.input} value={model} onChangeText={setModel} placeholder="ex. Qwen/Qwen3.5-35B-A3B"
          placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} />

        {result && <Text style={[s.result, { color: result.ok ? colors.income : colors.warn }]}>{result.message}</Text>}

        <PrimaryButton label={busy ? 'Patiente…' : 'Enregistrer'} onPress={save} disabled={busy} />
        <PrimaryButton label="Tester" variant="secondary" onPress={test} disabled={busy} />
        {current && <PrimaryButton label="Effacer" variant="secondary" onPress={clear} disabled={busy} />}
        <Text style={s.note}>Ta clé reste sur ce téléphone (stockage chiffré). Tout service compatible OpenAI fonctionne.</Text>
      </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: { gap: 10, paddingBottom: 4 },
  label: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 4 },
  input: {
    height: 50, borderRadius: radius.key, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    paddingHorizontal: 14, color: colors.text, fontFamily: font.regular, fontSize: 16,
  },
  result: { fontFamily: font.regular, fontSize: 14 },
  note: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, textAlign: 'center' },
});
