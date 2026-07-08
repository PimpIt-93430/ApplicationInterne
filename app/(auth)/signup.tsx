import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { signUpWithEmail } from '@/api/auth';

export default function SignupScreen() {
  const [nomComplet, setNomComplet] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  const handleSignup = async () => {
    setErreur(null);
    setChargement(true);
    try {
      await signUpWithEmail(email.trim(), password, nomComplet.trim());
      router.replace('/');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Inscription impossible");
    } finally {
      setChargement(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-6">
        <Text className="mb-1 text-3xl font-bold text-slate-900">Créer un compte</Text>
        <Text className="mb-8 text-base text-slate-500">Espace équipe Pimp It</Text>

        <TextInput
          value={nomComplet}
          onChangeText={setNomComplet}
          placeholder="Nom complet"
          className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base"
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Mot de passe (min. 6 caractères)"
          secureTextEntry
          className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base"
        />

        {erreur ? <Text className="mb-4 text-sm text-red-500">{erreur}</Text> : null}

        <Pressable
          onPress={handleSignup}
          disabled={chargement || !email || !password || !nomComplet}
          className="items-center rounded-xl bg-indigo-600 py-3 disabled:opacity-50"
        >
          <Text className="text-base font-semibold text-white">
            {chargement ? 'Création...' : 'Créer mon compte'}
          </Text>
        </Pressable>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-slate-500">Déjà un compte ? </Text>
          <Link href="/(auth)/login" className="font-semibold text-indigo-600">
            Se connecter
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
