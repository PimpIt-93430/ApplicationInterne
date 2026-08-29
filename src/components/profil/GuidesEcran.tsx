// Écran "Informations" (guides globaux : procédures pop-up, fonctionnement caisse, etc.) —
// accessible depuis Profil > "Afficher les informations", à tout le monde en lecture. L'ajout
// d'un guide reste web uniquement (même limite que documents employé dans EquipeEcranBase : un
// <input type="file"> HTML, pas de sélecteur de fichier natif mobile) — un admin sur téléphone
// peut lire/ouvrir les guides comme tout le monde, mais doit passer par l'ordinateur pour en
// ajouter. Cf. retour utilisateur du 2026-08-25.
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View, Linking } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { obtenirUrlGuide } from '@/api/guides';
import { useGuides, useSupprimerGuide, useUploaderGuide } from '@/hooks/useGuides';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import type { Guide } from '@/types/database.types';

async function ouvrirGuide(chemin: string) {
  const url = await obtenirUrlGuide(chemin);
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
  } else {
    Linking.openURL(url);
  }
}

function LigneGuide({ guide, estAdmin, onSupprimer }: { guide: Guide; estAdmin: boolean; onSupprimer: () => void }) {
  return (
    <View className="mb-2 flex-row items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm">
      <Pressable onPress={() => ouvrirGuide(guide.chemin_stockage)} className="flex-1">
        <Text className="text-base font-semibold text-slate-800">{guide.titre}</Text>
        <Text className="mt-0.5 text-xs text-slate-400">{guide.nom_fichier}</Text>
      </Pressable>
      {estAdmin && (
        <Pressable
          onPress={() =>
            Alert.alert('Supprimer', `Retirer "${guide.titre}" ? Cette action est irréversible.`, [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Supprimer', style: 'destructive', onPress: onSupprimer },
            ])
          }
          className="ml-3 px-2 py-1"
        >
          <Text className="text-sm font-semibold text-red-500">Supprimer</Text>
        </Pressable>
      )}
    </View>
  );
}

export function GuidesEcran({ onRetour }: { onRetour: () => void }) {
  // Profil effectif (pas le profil réel) : un admin en train de prévisualiser un autre profil
  // (cf. Profil > "Se connecter en tant que") voit cet écran exactement comme la personne
  // prévisualisée — pas de bouton d'ajout s'il prévisualise un non-admin, même principe que
  // "Inviter une personne"/"SumUp" dans Profil.
  const profile = useProfilEffectif();
  const estAdmin = profile?.role === 'admin';
  const { data: guides, isLoading } = useGuides();
  const uploader = useUploaderGuide();
  const supprimer = useSupprimerGuide();
  const [titre, setTitre] = useState('');

  const choisirFichier = (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier || !profile) return;
    if (!titre.trim()) {
      Alert.alert('Titre manquant', "Donne un titre au guide avant de choisir le fichier.");
      e.target.value = '';
      return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const base64 = String(lecteur.result).split(',')[1] ?? '';
      uploader.mutate(
        {
          titre: titre.trim(),
          uploadedBy: profile.id,
          nomFichier: fichier.name,
          base64,
          contentType: fichier.type || 'application/pdf',
        },
        { onSuccess: () => setTitre('') },
      );
    };
    lecteur.readAsDataURL(fichier);
    e.target.value = '';
  };

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Informations" onRetour={onRetour} />
      <ScrollView className="flex-1 px-4 pt-2" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="mb-4 text-xs text-slate-400">
          Guides et procédures (fonctionnement des pop-up, de la caisse, etc.), accessibles à tout
          le monde.
        </Text>

        {estAdmin && Platform.OS === 'web' && (
          <View className="mb-5 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-4">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Ajouter un guide
            </Text>
            <TextInput
              value={titre}
              onChangeText={setTitre}
              placeholder="Titre (ex. Fonctionnement de la caisse)"
              className="mb-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
            />
            <label style={{ display: 'inline-block' }}>
              <View className="items-center rounded-xl bg-indigo-600 px-4 py-2.5">
                <Text className="text-sm font-semibold text-white">
                  {uploader.isPending ? 'Envoi…' : '+ Choisir un fichier'}
                </Text>
              </View>
              <input type="file" accept="application/pdf" onChange={choisirFichier} style={{ display: 'none' }} />
            </label>
          </View>
        )}
        {estAdmin && Platform.OS !== 'web' && (
          <Text className="mb-4 text-xs text-slate-400">
            Pour ajouter un guide, passe par l'ordinateur — l'ajout n'est pas encore disponible sur
            téléphone.
          </Text>
        )}

        {isLoading ? (
          <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
        ) : (guides ?? []).length === 0 ? (
          <Text className="text-sm text-slate-400">Aucun guide pour l'instant.</Text>
        ) : (
          (guides ?? []).map((g) => (
            <LigneGuide
              key={g.id}
              guide={g}
              estAdmin={estAdmin}
              onSupprimer={() => supprimer.mutate({ id: g.id, cheminStockage: g.chemin_stockage })}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
