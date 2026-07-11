import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { EffectifsJourCard } from '@/components/reglages/EffectifsJourCard';
import { JourReglageCard } from '@/components/reglages/JourReglageCard';
import { useCreerPopUp, usePopUps, useRenommerPopUp, useSupprimerPopUp } from '@/hooks/usePopUps';
import { useActiveProfiles, useAssignerPopUp } from '@/hooks/useProfiles';
import {
  useEffectifsCreneaux,
  useEnregistrerEffectifCreneau,
  useEnregistrerHoraireOuverture,
  useHorairesOuverture,
  useSupprimerEffectifCreneau,
} from '@/hooks/useReglesMetier';
import { JOURS_LABELS } from '@/utils/dateUtils';
import type { PopUp, Profile } from '@/types/database.types';

function CartePopUp({ popUp, profils }: { popUp: PopUp; profils: Profile[] }) {
  const [horairesOuverts, setHorairesOuverts] = useState(false);
  const [effectifsOuverts, setEffectifsOuverts] = useState(false);
  const [ajoutMembreOuvert, setAjoutMembreOuvert] = useState(false);
  const [editionNom, setEditionNom] = useState(false);
  const [nom, setNom] = useState(popUp.nom);

  const membres = profils.filter((p) => p.pop_up_id === popUp.id);
  const disponibles = profils.filter((p) => p.pop_up_id !== popUp.id);

  const { data: horaires, isLoading: chargementHoraires } = useHorairesOuverture(
    horairesOuverts || effectifsOuverts ? popUp.id : undefined,
  );
  const { data: effectifs, isLoading: chargementEffectifs } = useEffectifsCreneaux(
    effectifsOuverts ? popUp.id : undefined,
  );
  const enregistrerHoraire = useEnregistrerHoraireOuverture();
  const enregistrerEffectif = useEnregistrerEffectifCreneau();
  const supprimerEffectif = useSupprimerEffectifCreneau();
  const assigner = useAssignerPopUp();
  const renommer = useRenommerPopUp();
  const supprimer = useSupprimerPopUp();

  const handleSupprimer = () => {
    Alert.alert(
      'Supprimer ce pop-up',
      `Supprimer ${popUp.nom} ? Le planning et les horaires liés seront aussi supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => supprimer.mutate(popUp.id) },
      ],
    );
  };

  const validerNom = () => {
    const nomPropre = nom.trim();
    if (nomPropre && nomPropre !== popUp.nom) {
      renommer.mutate({ id: popUp.id, nom: nomPropre });
    } else {
      setNom(popUp.nom);
    }
    setEditionNom(false);
  };

  return (
    <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <View className="mb-3 flex-row items-center gap-2">
        <View className="h-3 w-3 rounded-full" style={{ backgroundColor: popUp.couleur }} />
        {editionNom ? (
          <TextInput
            value={nom}
            onChangeText={setNom}
            autoFocus
            onSubmitEditing={validerNom}
            onBlur={validerNom}
            className="flex-1 border-b border-indigo-300 pb-0.5 text-lg font-bold text-slate-900"
          />
        ) : (
          <Pressable onPress={() => setEditionNom(true)} className="flex-1 flex-row items-center gap-2">
            <Text className="text-lg font-bold text-slate-900">{popUp.nom}</Text>
            <Text className="text-sm text-slate-300">✎</Text>
          </Pressable>
        )}
        <Pressable onPress={handleSupprimer} className="px-2 py-1">
          <Text className="text-sm text-red-400">Supprimer</Text>
        </Pressable>
      </View>

      <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Effectifs</Text>
      <View className="mb-2 flex-row flex-wrap gap-2">
        {membres.length === 0 && <Text className="text-sm text-slate-400">Personne pour l'instant</Text>}
        {membres.map((m) => (
          <Pressable
            key={m.id}
            onPress={() =>
              Alert.alert('Retirer', `Retirer ${m.nom_complet || m.email} de ${popUp.nom} ?`, [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Retirer',
                  style: 'destructive',
                  onPress: () => assigner.mutate({ profileId: m.id, popUpId: null }),
                },
              ])
            }
            className="rounded-full bg-slate-100 px-3 py-1.5"
          >
            <Text className="text-sm text-slate-700">{m.nom_complet || m.email} ✕</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => setAjoutMembreOuvert((v) => !v)} className="mb-2">
        <Text className="text-sm font-semibold text-indigo-600">
          {ajoutMembreOuvert ? 'Fermer' : '+ Ajouter un membre'}
        </Text>
      </Pressable>

      {ajoutMembreOuvert && (
        <View className="mb-3 gap-1 rounded-xl bg-slate-50 p-2">
          {disponibles.length === 0 ? (
            <Text className="p-2 text-sm text-slate-400">Tout le monde est déjà attribué.</Text>
          ) : (
            disponibles.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  assigner.mutate({ profileId: p.id, popUpId: popUp.id });
                  setAjoutMembreOuvert(false);
                }}
                className="rounded-lg bg-white px-3 py-2"
              >
                <Text className="text-sm text-slate-700">{p.nom_complet || p.email}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      <Pressable onPress={() => setHorairesOuverts((v) => !v)} className="mb-2">
        <Text className="text-sm font-semibold text-indigo-600">
          {horairesOuverts ? 'Masquer les horaires' : 'Voir / modifier les horaires'}
        </Text>
      </Pressable>

      {horairesOuverts &&
        (chargementHoraires ? (
          <ActivityIndicator color="#6366F1" />
        ) : (
          JOURS_LABELS.map((label, jourSemaine) => (
            <JourReglageCard
              key={jourSemaine}
              popUpId={popUp.id}
              jourSemaine={jourSemaine}
              label={label}
              regle={horaires?.find((h) => h.jour_semaine === jourSemaine)}
              onEnregistrer={(horaire) => enregistrerHoraire.mutate(horaire)}
            />
          ))
        ))}

      <Pressable onPress={() => setEffectifsOuverts((v) => !v)} className="mb-2">
        <Text className="text-sm font-semibold text-indigo-600">
          {effectifsOuverts ? 'Masquer les effectifs requis' : 'Voir / modifier les effectifs requis'}
        </Text>
      </Pressable>

      {effectifsOuverts && (
        <>
          <Text className="mb-2 text-xs text-slate-400">
            Qui doit être présent, et quand : c'est ce que la génération automatique du planning
            utilise pour remplir la semaine.
          </Text>
          {chargementHoraires || chargementEffectifs ? (
            <ActivityIndicator color="#6366F1" />
          ) : (
            JOURS_LABELS.map((label, jourSemaine) => {
              const regleJour = horaires?.find((h) => h.jour_semaine === jourSemaine);
              if (!regleJour?.actif) return null;
              return (
                <EffectifsJourCard
                  key={jourSemaine}
                  popUpId={popUp.id}
                  jourSemaine={jourSemaine}
                  label={label}
                  horaireOuverture={regleJour.heure_ouverture}
                  horaireFermeture={regleJour.heure_fermeture}
                  creneaux={(effectifs ?? []).filter((c) => c.jour_semaine === jourSemaine)}
                  onEnregistrer={(creneau) => enregistrerEffectif.mutate(creneau)}
                  onSupprimer={(id) => supprimerEffectif.mutate(id)}
                />
              );
            })
          )}
        </>
      )}
    </View>
  );
}

export default function PopUpsScreen() {
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const creerPopUp = useCreerPopUp();

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [ouverture, setOuverture] = useState('10:00');
  const [fermeture, setFermeture] = useState('20:00');

  const handleCreer = () => {
    if (!nom.trim()) return;
    creerPopUp.mutate(
      { nom: nom.trim(), heureOuverture: ouverture, heureFermeture: fermeture },
      {
        onSuccess: () => {
          setNom('');
          setFormulaireOuvert(false);
        },
      },
    );
  };

  if (chargementPopUps || chargementProfils) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Pop-up" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>

      {(popUps ?? []).map((popUp) => (
        <CartePopUp key={popUp.id} popUp={popUp} profils={profils ?? []} />
      ))}

      <View className="rounded-2xl border border-dashed border-indigo-300 bg-white p-4">
        <Pressable onPress={() => setFormulaireOuvert((v) => !v)}>
          <Text className="text-center text-sm font-semibold text-indigo-600">
            {formulaireOuvert ? 'Annuler' : '+ Ajouter un pop-up'}
          </Text>
        </Pressable>

        {formulaireOuvert && (
          <View className="mt-3">
            <TextInput
              value={nom}
              onChangeText={setNom}
              placeholder="Nom du pop-up"
              className="mb-3 rounded-lg border border-slate-200 px-3 py-2"
            />
            <View className="mb-3 flex-row items-center justify-center gap-2">
              <TextInput
                value={ouverture}
                onChangeText={setOuverture}
                placeholder="10:00"
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
              <Text className="text-slate-400">à</Text>
              <TextInput
                value={fermeture}
                onChangeText={setFermeture}
                placeholder="20:00"
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
            </View>
            <Pressable onPress={handleCreer} className="items-center rounded-lg bg-indigo-600 py-2">
              <Text className="text-sm font-semibold text-white">Créer le pop-up</Text>
            </Pressable>
          </View>
        )}
      </View>
      </ScrollView>
    </View>
  );
}
