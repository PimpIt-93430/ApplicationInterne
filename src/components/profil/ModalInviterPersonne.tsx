import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { inviterEmploye } from '@/api/invitations';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { usePopUps } from '@/hooks/usePopUps';
import { useAjouterAffectationPopUp } from '@/hooks/useProfiles';
import type { Role, TypeContrat } from '@/types/database.types';

const OPTIONS_TYPE_CONTRAT: { valeur: TypeContrat; label: string }[] = [
  { valeur: 'employe', label: 'Employé' },
  { valeur: 'manager', label: 'Manager' },
  { valeur: 'alternant', label: 'Alternant' },
];

/** Invitation depuis Profil (mobile) — même mécanisme que "+ Nouvel employé" côté Équipe (web) :
 * le compte est créé immédiatement (cf. inviterEmploye/Edge Function inviter-employe), sans email.
 * La personne active elle-même son compte via "Première connexion" (email + mot de passe choisi
 * par elle), cf. app/(auth)/premiere-connexion.tsx — pas d'email/lien à gérer. */
export function ModalInviterPersonne({ onFermer }: { onFermer: () => void }) {
  const [nomComplet, setNomComplet] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('employe');
  const [typeContrat, setTypeContrat] = useState<TypeContrat>('employe');
  const [popUpId, setPopUpId] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const ajouterAffectation = useAjouterAffectationPopUp();

  // Un admin est considéré attribué à tous les lieux implicitement (cf. estAttribueA, popups.tsx)
  // — pas besoin de lui en choisir un.
  const popUpRequis = role !== 'admin';

  const envoyer = async () => {
    if (!nomComplet.trim() || !email.trim()) {
      setErreur('Nom complet et email requis.');
      return;
    }
    if (popUpRequis && !popUpId) {
      setErreur('Choisis le pop-up où cette personne travaille.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const { id } = await inviterEmploye({
        email: email.trim(),
        nomComplet: nomComplet.trim(),
        role,
        typeContrat,
      });
      // Le compte est déjà créé à ce stade : une erreur ici ne doit pas ressembler à un échec de
      // l'invitation entière (cf. message dédié affiché par le hook, Alert.alert) — l'admin pourra
      // toujours attribuer le lieu ensuite depuis Équipe si ça échoue.
      if (popUpRequis && popUpId) {
        await ajouterAffectation.mutateAsync({ profileId: id, popUpId }).catch(() => {});
      }
      setSucces(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'invitation.");
    } finally {
      setEnvoi(false);
    }
  };

  if (succes) {
    return (
      <FeuilleModale onClose={onFermer}>
        <Text className="mb-2 text-lg font-bold text-slate-900">Compte créé</Text>
        <Text className="mb-5 text-sm text-slate-500">
          Dis à {nomComplet} d'ouvrir l'appli, d'aller sur "Première connexion" et d'utiliser cet
          email ({email.trim()}) pour choisir son mot de passe.
        </Text>
        <Pressable onPress={onFermer} className="items-center rounded-xl bg-indigo-600 py-3">
          <Text className="text-base font-semibold text-white">Fermer</Text>
        </Pressable>
      </FeuilleModale>
    );
  }

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-4 text-lg font-bold text-slate-900">Inviter une personne</Text>

      <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Nom complet</Text>
      <TextInput
        value={nomComplet}
        onChangeText={setNomComplet}
        placeholder="Prénom Nom"
        className="mb-3 rounded-xl border border-slate-200 px-3 py-2.5"
      />

      <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="prenom@pimpitstore.com"
        autoCapitalize="none"
        keyboardType="email-address"
        className="mb-3 rounded-xl border border-slate-200 px-3 py-2.5"
      />

      <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Type de contrat</Text>
      <View className="mb-3 flex-row flex-wrap gap-2">
        {OPTIONS_TYPE_CONTRAT.map((o) => (
          <Pressable
            key={o.valeur}
            onPress={() => setTypeContrat(o.valeur)}
            className={`rounded-full px-3 py-2 ${typeContrat === o.valeur ? 'bg-indigo-600' : 'bg-slate-100'}`}
          >
            <Text
              className={`text-sm font-semibold ${typeContrat === o.valeur ? 'text-white' : 'text-slate-600'}`}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Droits</Text>
      <View className="mb-5 flex-row gap-2">
        <Pressable
          onPress={() => setRole('employe')}
          className={`flex-1 items-center rounded-xl py-2.5 ${role === 'employe' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={`text-sm font-semibold ${role === 'employe' ? 'text-white' : 'text-slate-600'}`}>
            Standard
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setRole('admin')}
          className={`flex-1 items-center rounded-xl py-2.5 ${role === 'admin' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={`text-sm font-semibold ${role === 'admin' ? 'text-white' : 'text-slate-600'}`}>
            Admin
          </Text>
        </Pressable>
      </View>

      {popUpRequis && (
        <>
          <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">
            Pop-up (pour qu'elle ait accès à son planning/stock)
          </Text>
          {chargementPopUps ? (
            <ActivityIndicator color="#6366F1" style={{ marginBottom: 16, alignSelf: 'flex-start' }} />
          ) : (
            <View className="mb-5 flex-row flex-wrap gap-2">
              {(popUps ?? []).length === 0 && (
                <Text className="text-sm text-slate-400">Aucun pop-up créé pour l'instant.</Text>
              )}
              {(popUps ?? []).map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPopUpId(p.id)}
                  className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${
                    popUpId === p.id ? 'bg-indigo-600' : 'bg-slate-100'
                  }`}
                >
                  <View
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: popUpId === p.id ? 'white' : p.couleur }}
                  />
                  <Text
                    className={`text-sm font-semibold ${popUpId === p.id ? 'text-white' : 'text-slate-600'}`}
                  >
                    {p.nom}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      {erreur && <Text className="mb-3 text-sm text-red-500">{erreur}</Text>}

      <View className="flex-row gap-3">
        <Pressable onPress={onFermer} className="flex-1 items-center rounded-xl border border-slate-200 py-3">
          <Text className="text-sm font-semibold text-slate-600">Annuler</Text>
        </Pressable>
        <Pressable
          onPress={envoyer}
          disabled={envoi}
          className="flex-1 items-center rounded-xl bg-indigo-600 py-3"
        >
          <Text className="text-sm font-semibold text-white">{envoi ? 'Création...' : 'Créer le compte'}</Text>
        </Pressable>
      </View>
    </FeuilleModale>
  );
}
