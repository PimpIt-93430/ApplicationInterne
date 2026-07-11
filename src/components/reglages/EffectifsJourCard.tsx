import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { RegleEffectifCreneau } from '@/types/database.types';

interface Props {
  popUpId: string;
  jourSemaine: number;
  label: string;
  horaireOuverture: string;
  horaireFermeture: string;
  creneaux: RegleEffectifCreneau[];
  onEnregistrer: (creneau: {
    pop_up_id: string;
    jour_semaine: number;
    heure_debut: string;
    heure_fin: string;
    nb_managers_requis: number;
    nb_employes_requis: number;
    nb_alternants_requis: number;
  }) => void;
  onSupprimer: (id: string) => void;
}

export function EffectifsJourCard({
  popUpId,
  jourSemaine,
  label,
  horaireOuverture,
  horaireFermeture,
  creneaux,
  onEnregistrer,
  onSupprimer,
}: Props) {
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [heureDebut, setHeureDebut] = useState(horaireOuverture.slice(0, 5));
  const [heureFin, setHeureFin] = useState(horaireFermeture.slice(0, 5));
  const [managers, setManagers] = useState('0');
  const [employes, setEmployes] = useState('1');
  const [alternants, setAlternants] = useState('0');

  const ajouter = () => {
    onEnregistrer({
      pop_up_id: popUpId,
      jour_semaine: jourSemaine,
      heure_debut: `${heureDebut}:00`,
      heure_fin: `${heureFin}:00`,
      nb_managers_requis: Number(managers) || 0,
      nb_employes_requis: Number(employes) || 0,
      nb_alternants_requis: Number(alternants) || 0,
    });
    setFormulaireOuvert(false);
  };

  return (
    <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
      <Text className="mb-2 text-base font-semibold text-slate-800">{label}</Text>

      {creneaux.length === 0 && !formulaireOuvert && (
        <Text className="mb-2 text-sm text-slate-400">Aucun effectif requis défini pour ce jour.</Text>
      )}

      {creneaux.map((c) => (
        <View
          key={c.id}
          className="mb-1.5 flex-row items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
        >
          <Text className="flex-1 text-sm text-slate-700">
            {c.heure_debut.slice(0, 5)}-{c.heure_fin.slice(0, 5)} · {c.nb_managers_requis} manager(s),{' '}
            {c.nb_employes_requis} employé(s), {c.nb_alternants_requis} alternant(s)
          </Text>
          <Pressable onPress={() => onSupprimer(c.id)} className="px-2 py-1">
            <Text className="text-sm text-red-400">✕</Text>
          </Pressable>
        </View>
      ))}

      {formulaireOuvert ? (
        <View className="mt-2 gap-2">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={heureDebut}
              onChangeText={setHeureDebut}
              placeholder="10:00"
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
            />
            <Text className="text-slate-400">à</Text>
            <TextInput
              value={heureFin}
              onChangeText={setHeureFin}
              placeholder="20:00"
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
            />
          </View>
          <View className="flex-row items-center gap-2">
            <View className="flex-1 items-center">
              <Text className="mb-1 text-[10px] uppercase text-slate-400">Managers</Text>
              <TextInput
                value={managers}
                onChangeText={setManagers}
                keyboardType="numeric"
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
            </View>
            <View className="flex-1 items-center">
              <Text className="mb-1 text-[10px] uppercase text-slate-400">Employés</Text>
              <TextInput
                value={employes}
                onChangeText={setEmployes}
                keyboardType="numeric"
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
            </View>
            <View className="flex-1 items-center">
              <Text className="mb-1 text-[10px] uppercase text-slate-400">Alternants</Text>
              <TextInput
                value={alternants}
                onChangeText={setAlternants}
                keyboardType="numeric"
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
            </View>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setFormulaireOuvert(false)}
              className="flex-1 items-center rounded-lg border border-slate-200 py-2"
            >
              <Text className="text-sm font-semibold text-slate-600">Annuler</Text>
            </Pressable>
            <Pressable onPress={ajouter} className="flex-1 items-center rounded-lg bg-indigo-600 py-2">
              <Text className="text-sm font-semibold text-white">Ajouter</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setFormulaireOuvert(true)} className="mt-1 items-center py-1">
          <Text className="text-sm font-semibold text-indigo-600">+ Ajouter un créneau</Text>
        </Pressable>
      )}
    </View>
  );
}
