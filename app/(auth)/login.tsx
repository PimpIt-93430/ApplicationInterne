import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { signInWithEmail } from '@/api/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  const handleLogin = async () => {
    setErreur(null);
    setChargement(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace('/');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Connexion impossible');
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
        <Text className="mb-1 text-3xl font-bold text-slate-900">Pimp It</Text>
        <Text className="mb-8 text-base text-slate-500">Connexion à l'espace équipe</Text>

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
          placeholder="Mot de passe"
          secureTextEntry
          className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base"
        />

        {erreur ? <Text className="mb-4 text-sm text-red-500">{erreur}</Text> : null}

        <Pressable
          onPress={handleLogin}
          disabled={chargement || !email || !password}
          className="items-center rounded-xl bg-indigo-600 py-3 disabled:opacity-50"
        >
          <Text className="text-base font-semibold text-white">
            {chargement ? 'Connexion...' : 'Se connecter'}
          </Text>
        </Pressable>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-slate-500">Pas encore de compte ? </Text>
          <Link href="/(auth)/signup" className="font-semibold text-indigo-600">
            Créer un compte
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
