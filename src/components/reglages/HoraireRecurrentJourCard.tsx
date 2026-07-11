import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import type { HoraireRecurrentProfil } from '@/types/database.types';

interface Props {
  profileId: string;
  jourSemaine: number;
  label: string;
  regle: HoraireRecurrentProfil | undefined;
  onEnregistrer: (horaire: {
    profile_id: string;
    jour_semaine: number;
    heure_debut: string;
    heure_fin: string;
    actif: boolean;
  }) => void;
}

export function HoraireRecurrentJourCard({ profileId, jourSemaine, label, regle, onEnregistrer }: Props) {
  const [actif, setActif] = useState(regle?.actif ?? false);
  const [debut, setDebut] = useState(regle?.heure_debut?.slice(0, 5) ?? '10:00');
  const [fin, setFin] = useState(regle?.heure_fin?.slice(0, 5) ?? '19:00');

  // Si le parent recharge la règle (ex: après "Copier les horaires du pop-up"), on suit.
  useEffect(() => {
    setActif(regle?.actif ?? false);
    setDebut(regle?.heure_debut?.slice(0, 5) ?? '10:00');
    setFin(regle?.heure_fin?.slice(0, 5) ?? '19:00');
  }, [regle]);

  const enregistrer = () => {
    onEnregistrer({
      profile_id: profileId,
      jour_semaine: jourSemaine,
      heure_debut: `${debut}:00`,
      heure_fin: `${fin}:00`,
      actif,
    });
  };

  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-slate-800">{label}</Text>
        <Switch value={actif} onValueChange={setActif} />
      </View>

      {actif && (
        <View className="mb-2 flex-row items-center gap-2">
          <TextInput
            value={debut}
            onChangeText={setDebut}
            placeholder="10:00"
            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
          />
          <Text className="text-slate-400">à</Text>
          <TextInput
            value={fin}
            onChangeText={setFin}
            placeholder="19:00"
            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
          />
        </View>
      )}

      <Pressable onPress={enregistrer} className="items-center rounded-lg bg-indigo-600 py-1.5">
        <Text className="text-xs font-semibold text-white">Enregistrer {label}</Text>
      </Pressable>
    </View>
  );
}
