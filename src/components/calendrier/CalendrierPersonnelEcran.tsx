import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CalendrierPersonnel } from '@/components/calendrier/CalendrierPersonnel';
import { PanneauIndisponibilites } from '@/components/calendrier/PanneauIndisponibilites';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useSemaineStore } from '@/store/useSemaineStore';
import { joursDeLaSemaine, libelleJourCourt } from '@/utils/dateUtils';

type Onglet = 'planning' | 'indisponibilites';

// Ne montre jamais que le planning de la personne connectée (jamais celui de toute l'équipe) :
// utilisé par app/(app)/calendrier.tsx (mobile + fallback web sans droit calendrier) et par
// l'option "Mon calendrier" du Calendrier admin (via CalendrierPersonnel). Vit hors de app/ pour
// éviter un piège de résolution Metro : un fichier calendrier.web.tsx qui importerait
// "./calendrier" se résoudrait vers lui-même sur le web (résolution par extension de plateforme),
// pas vers calendrier.tsx — d'où cet emplacement neutre, sans ambiguïté de plateforme.
export function CalendrierPersonnelEcran() {
  const [onglet, setOnglet] = useState<Onglet>('planning');
  const profile = useProfilEffectif();
  const { dateReference, semaineSuivante, semainePrecedente, revenirAujourdhui } = useSemaineStore();
  const jours = joursDeLaSemaine(dateReference);

  return (
    <View className="flex-1 bg-white">
      <EnteteMenu titre="Calendrier" />

      <View className="mb-2 flex-row rounded-xl bg-slate-100 p-1 mx-4">
        <Pressable
          onPress={() => setOnglet('planning')}
          className={`flex-1 items-center rounded-lg py-2 ${onglet === 'planning' ? 'bg-white' : ''}`}
        >
          <Text className={onglet === 'planning' ? 'font-semibold text-indigo-600' : 'text-slate-500'}>
            Planning
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setOnglet('indisponibilites')}
          className={`flex-1 items-center rounded-lg py-2 ${onglet === 'indisponibilites' ? 'bg-white' : ''}`}
        >
          <Text className={onglet === 'indisponibilites' ? 'font-semibold text-indigo-600' : 'text-slate-500'}>
            Mes indisponibilités
          </Text>
        </Pressable>
      </View>

      {onglet === 'indisponibilites' ? (
        <PanneauIndisponibilites />
      ) : (
        <>
          <View className="flex-row items-center justify-between px-4 pb-2">
            <Pressable onPress={semainePrecedente} className="px-3 py-2">
              <Text className="text-lg text-indigo-600">‹</Text>
            </Pressable>
            <Pressable onPress={revenirAujourdhui}>
              <Text className="text-base font-semibold text-slate-800">
                {libelleJourCourt(jours[0])} — {libelleJourCourt(jours[6])}
              </Text>
            </Pressable>
            <Pressable onPress={semaineSuivante} className="px-3 py-2">
              <Text className="text-lg text-indigo-600">›</Text>
            </Pressable>
          </View>

          <CalendrierPersonnel profile={profile} />
        </>
      )}
    </View>
  );
}
