import { addMonths, format, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Pressable, Text, View } from 'react-native';

function libelleMois(date: Date): string {
  const texte = format(date, 'MMMM yyyy', { locale: fr });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** Navigation mois en 3 pastilles (précédent / en cours en indigo / suivant), même façon Combo que
 * SelecteurSemaineCombo.tsx — le calendrier mensuel remplace désormais la vue semaine (cf. Planning). */
export function SelecteurMoisCombo({
  moisReference,
  onPrecedent,
  onSuivant,
  onRevenirAujourdhui,
}: {
  moisReference: Date;
  onPrecedent: () => void;
  onSuivant: () => void;
  onRevenirAujourdhui: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-2 pb-3">
      <Pressable onPress={onPrecedent} className="flex-1 items-center py-2">
        <Text className="text-center text-xs font-medium text-slate-400">
          {libelleMois(subMonths(moisReference, 1))}
        </Text>
      </Pressable>
      <Pressable onPress={onRevenirAujourdhui} className="mx-1 items-center rounded-full bg-indigo-600 px-4 py-2">
        <Text className="text-center text-xs font-bold text-white">{libelleMois(moisReference)}</Text>
      </Pressable>
      <Pressable onPress={onSuivant} className="flex-1 items-center py-2">
        <Text className="text-center text-xs font-medium text-slate-400">
          {libelleMois(addMonths(moisReference, 1))}
        </Text>
      </Pressable>
    </View>
  );
}
