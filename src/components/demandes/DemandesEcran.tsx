import { useState } from 'react';
import { Text, View } from 'react-native';

import { PanneauDemandesConge } from '@/components/calendrier/PanneauDemandesConge';
import { PanneauIndisponibilites } from '@/components/calendrier/PanneauIndisponibilites';
import { BarreOnglets } from '@/components/ui/BarreOnglets';

type Onglet = 'conges' | 'indisponibilites';

/** Onglet "Demandes" de la barre de navigation basse non-admin : congés (demande soumise à
 * validation manager/admin, hors périmètre ici) et indisponibilités (auto-service immédiat,
 * inchangé — PanneauIndisponibilites réutilisé tel quel). */
export function DemandesEcran() {
  const [onglet, setOnglet] = useState<Onglet>('conges');

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pb-2 pt-14">
        <Text className="text-2xl font-bold text-slate-900">Demandes</Text>
      </View>

      <View className="mx-4 mb-2">
        <BarreOnglets
          valeur={onglet}
          onChange={setOnglet}
          options={[
            { valeur: 'conges', label: 'Congés' },
            { valeur: 'indisponibilites', label: 'Indisponibilités' },
          ]}
        />
      </View>

      {onglet === 'indisponibilites' ? <PanneauIndisponibilites /> : <PanneauDemandesConge />}
    </View>
  );
}
