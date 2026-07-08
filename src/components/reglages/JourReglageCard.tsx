import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import type { RegleHoraireOuverture } from '@/types/database.types';

interface Props {
  popUpId: string;
  jourSemaine: number;
  label: string;
  regle: RegleHoraireOuverture | undefined;
  onEnregistrer: (horaire: {
    pop_up_id: string;
    jour_semaine: number;
    heure_ouverture: string;
    heure_fermeture: string;
    actif: boolean;
  }) => void;
}

export function JourReglageCard({ popUpId, jourSemaine, label, regle, onEnregistrer }: Props) {
  const [actif, setActif] = useState(regle?.actif ?? false);
  const [ouverture, setOuverture] = useState(regle?.heure_ouverture?.slice(0, 5) ?? '10:00');
  const [fermeture, setFermeture] = useState(regle?.heure_fermeture?.slice(0, 5) ?? '20:00');

  const enregistrer = () => {
    onEnregistrer({
      pop_up_id: popUpId,
      jour_semaine: jourSemaine,
      heure_ouverture: `${ouverture}:00`,
      heure_fermeture: `${fermeture}:00`,
      actif,
    });
  };

  return (
    <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-semibold text-slate-800">{label}</Text>
        <Switch value={actif} onValueChange={setActif} />
      </View>

      {actif && (
        <View className="mb-3 flex-row items-center gap-2">
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
      )}

      <Pressable onPress={enregistrer} className="mt-1 items-center rounded-lg bg-indigo-600 py-2">
        <Text className="text-sm font-semibold text-white">Enregistrer {label}</Text>
      </Pressable>
    </View>
  );
}
