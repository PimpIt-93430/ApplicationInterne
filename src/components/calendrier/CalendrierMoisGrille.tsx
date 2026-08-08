import { endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { Pressable, Text, View } from 'react-native';

import { dateEnISO, estAujourdhui, numeroJour } from '@/utils/dateUtils';

export interface StyleJourCalendrier {
  fond: string;
  texte: string;
  bordure: string;
}

export interface LegendeCalendrier {
  couleur: string;
  label: string;
}

/** Calendrier mensuel classique (semaines en lignes, lundi -> dimanche), une case par jour dont le
 * style est entièrement délégué à l'appelant (cf. `statutJour`) — sert aussi bien à un simple
 * calendrier "actif/inactif" (2 couleurs, ex. jours d'école déjà confirmés) qu'à un brouillon avec
 * changements proposés (ex. calendrier d'école : confirmé / ajout proposé / suppression proposée /
 * rien, cf. app/(app)/alternance.tsx). Les jours hors du mois affiché restent visibles mais
 * grisés, pour garder une grille rectangulaire complète. Tap sur une case = bascule (cf.
 * onPressJour), pas d'ouverture de feuille séparée. */
export function CalendrierMoisGrille({
  moisReference,
  statutJour,
  legende,
  onPressJour,
}: {
  moisReference: Date;
  statutJour: (dateIso: string) => StyleJourCalendrier;
  legende: LegendeCalendrier[];
  onPressJour?: (dateIso: string) => void;
}) {
  const debutGrille = startOfWeek(startOfMonth(moisReference), { weekStartsOn: 1 });
  const finGrille = endOfWeek(endOfMonth(moisReference), { weekStartsOn: 1 });
  const semaines: Date[][] = [];
  for (let semaineDebut = debutGrille; semaineDebut <= finGrille; ) {
    const semaine = Array.from({ length: 7 }, (_, i) => {
      const jour = new Date(semaineDebut);
      jour.setDate(jour.getDate() + i);
      return jour;
    });
    semaines.push(semaine);
    semaineDebut = new Date(semaine[6]);
    semaineDebut.setDate(semaineDebut.getDate() + 1);
  }

  return (
    <View>
      <View className="flex-row px-4 pb-1">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((lettre, i) => (
          <Text key={i} className="flex-1 text-center text-[11px] font-semibold uppercase text-slate-400">
            {lettre}
          </Text>
        ))}
      </View>

      <View className="px-4">
        {semaines.map((semaine, indexSemaine) => (
          <View key={indexSemaine} className="mb-1.5 flex-row gap-1.5">
            {semaine.map((jour) => {
              const dateIso = dateEnISO(jour);
              const dansLeMois = isSameMonth(jour, moisReference);
              const style = statutJour(dateIso);
              const aujourdhui = estAujourdhui(jour);
              const contenu = (
                <View
                  style={{
                    backgroundColor: style.fond,
                    opacity: dansLeMois ? 1 : 0.3,
                    borderWidth: aujourdhui ? 2 : 1,
                    borderColor: aujourdhui ? '#312E81' : style.bordure,
                  }}
                  className="aspect-square w-full items-center justify-center rounded-xl"
                >
                  <Text style={{ color: style.texte }} className="text-sm font-bold">
                    {numeroJour(jour)}
                  </Text>
                </View>
              );
              return onPressJour ? (
                <Pressable key={dateIso} onPress={() => onPressJour(dateIso)} className="flex-1">
                  {contenu}
                </Pressable>
              ) : (
                <View key={dateIso} className="flex-1">
                  {contenu}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <View className="mt-3 flex-row flex-wrap justify-center gap-x-4 gap-y-1.5 px-4">
        {legende.map((item) => (
          <View key={item.label} className="flex-row items-center gap-1.5">
            <View style={{ backgroundColor: item.couleur }} className="h-2.5 w-2.5 rounded-full" />
            <Text className="text-[11px] text-slate-500">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
