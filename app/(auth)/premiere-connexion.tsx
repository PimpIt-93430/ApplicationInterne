import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { definirMotDePasseInitial, signInWithEmail } from '@/api/auth';

/** Pour une personne dont le compte vient d'être créé par un admin (Profil → Inviter une
 * personne) : elle choisit elle-même son mot de passe avec l'email déjà renseigné par l'admin,
 * puis est connectée directement — pas d'email envoyé, pas de lien à cliquer (cf. discussion :
 * simplicité choisie plutôt qu'une invitation par email, qui aurait demandé un serveur SMTP dédié
 * et un écran de lien profond). */
export default function PremiereConnexionScreen() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  const handleValider = async () => {
    setErreur(null);
    if (motDePasse.length < 6) {
      setErreur('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setChargement(true);
    try {
      const emailPropre = email.trim();
      await definirMotDePasseInitial(emailPropre, motDePasse);
      await signInWithEmail(emailPropre, motDePasse);
      router.replace('/');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de définir le mot de passe.');
    } finally {
      setChargement(false);
    }
  };

  const pretAValider = !!email.trim() && !!motDePasse && !!confirmation;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-6">
        <Text className="mb-1 text-3xl font-bold text-slate-900">Première connexion</Text>
        <Text className="mb-8 text-base text-slate-500">
          Utilise l'email que ton admin a renseigné pour toi, et choisis ton mot de passe.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base"
        />
        <TextInput
          value={motDePasse}
          onChangeText={setMotDePasse}
          placeholder="Choisis un mot de passe"
          secureTextEntry
          className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base"
        />
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder="Confirme ton mot de passe"
          secureTextEntry
          className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base"
        />

        {erreur ? <Text className="mb-4 text-sm text-red-500">{erreur}</Text> : null}

        <Pressable
          onPress={handleValider}
          disabled={chargement || !pretAValider}
          style={chargement || !pretAValider ? { opacity: 0.5 } : undefined}
          className="items-center rounded-xl bg-indigo-600 py-3"
        >
          <Text className="text-base font-semibold text-white">
            {chargement ? 'Validation...' : 'Valider et me connecter'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} className="mt-4 items-center py-2">
          <Text className="text-sm font-semibold text-indigo-600">Retour à la connexion</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
