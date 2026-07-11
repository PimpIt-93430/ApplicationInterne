import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import type { HoraireRecurrentProfil, PopUp } from '@/types/database.types';

interface Props {
  profileId: string;
  jourSemaine: number;
  label: string;
  regle: HoraireRecurrentProfil | undefined;
  popUpsDisponibles: PopUp[];
  onEnregistrer: (horaire: {
    profile_id: string;
    pop_up_id: string;
    jour_semaine: number;
    heure_debut: string;
    heure_fin: string;
    actif: boolean;
  }) => void;
}

export function HoraireRecurrentJourCard({
  profileId,
  jourSemaine,
  label,
  regle,
  popUpsDisponibles,
  onEnregistrer,
}: Props) {
  const [actif, setActif] = useState(regle?.actif ?? false);
  const [debut, setDebut] = useState(regle?.heure_debut?.slice(0, 5) ?? '10:00');
  const [fin, setFin] = useState(regle?.heure_fin?.slice(0, 5) ?? '19:00');
  const [popUpId, setPopUpId] = useState(regle?.pop_up_id ?? popUpsDisponibles[0]?.id);

  // Si le parent recharge la règle (ex: après "Copier les horaires du pop-up"), on suit.
  useEffect(() => {
    setActif(regle?.actif ?? false);
    setDebut(regle?.heure_debut?.slice(0, 5) ?? '10:00');
    setFin(regle?.heure_fin?.slice(0, 5) ?? '19:00');
    setPopUpId(regle?.pop_up_id ?? popUpsDisponibles[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regle]);

  const enregistrer = () => {
    if (!popUpId) return;
    onEnregistrer({
      profile_id: profileId,
      pop_up_id: popUpId,
      jour_semaine: jourSemaine,
      heure_debut: `${debut}:00`,
      heure_fin: `${fin}:00`,
      actif,
    });
  };

  const popUpChoisi = popUpsDisponibles.find((p) => p.id === popUpId);

  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-slate-800">{label}</Text>
        <Switch value={actif} onValueChange={setActif} disabled={popUpsDisponibles.length === 0} />
      </View>

      {actif && popUpsDisponibles.length === 0 && (
        <Text className="mb-2 text-xs text-red-500">
          Aucun lieu attribué — attribue d'abord cette personne à un lieu dans Pop-up.
        </Text>
      )}

      {actif && popUpsDisponibles.length > 0 && (
        <>
          {popUpsDisponibles.length > 1 && (
            <View className="mb-2 flex-row flex-wrap gap-1.5">
              {popUpsDisponibles.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPopUpId(p.id)}
                  className={`rounded-full px-3 py-1 ${popUpId === p.id ? '' : 'bg-slate-100'}`}
                  style={popUpId === p.id ? { backgroundColor: p.couleur } : undefined}
                >
                  <Text className={`text-xs font-semibold ${popUpId === p.id ? 'text-white' : 'text-slate-600'}`}>
                    {p.nom}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {popUpsDisponibles.length === 1 && (
            <Text className="mb-2 text-xs text-slate-400">Lieu : {popUpChoisi?.nom}</Text>
          )}

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
        </>
      )}

      <Pressable
        onPress={enregistrer}
        disabled={actif && !popUpId}
        className="items-center rounded-lg bg-indigo-600 py-1.5 disabled:opacity-50"
      >
        <Text className="text-xs font-semibold text-white">Enregistrer {label}</Text>
      </Pressable>
    </View>
  );
}
