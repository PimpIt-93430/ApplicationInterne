import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { Dropdown } from '@/components/ui/Dropdown';
import { usePopUps } from '@/hooks/usePopUps';
import { useGererSumupEmailsPopUp, useSumupEmailsPopUp } from '@/hooks/useSumupEmailsPopUp';

/** Attribue un pop-up à une adresse email SumUp : la synchro (sync-ventes-sumup) rattache alors
 * directement à ce lieu toute vente faite avec cette adresse, avant même de regarder le GPS —
 * plus fiable qu'une proximité calculée, une fois que chaque pop-up/salarié a sa propre adresse.
 *
 * Attention tant qu'un seul compte SumUp partagé est utilisé sur le terrain (cf. TODO "chaque
 * salarié doit se connecter avec son propre compte SumUp") : mapper cette adresse partagée à un
 * pop-up attribuerait TOUTES les ventes, de tous les lieux, à ce seul pop-up. À utiliser une fois
 * que chaque lieu a sa propre adresse SumUp. */
export function SumupPopUpEcran({ onRetour }: { onRetour: () => void }) {
  const { data: mapping, isLoading: chargementMapping } = useSumupEmailsPopUp();
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { definir, supprimer } = useGererSumupEmailsPopUp();

  const [email, setEmail] = useState('');
  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);

  const ajouter = () => {
    if (!email.trim() || !popUpId) return;
    definir.mutate(
      { email: email.trim(), popUpId },
      { onSuccess: () => { setEmail(''); setPopUpId(undefined); } },
    );
  };

  const chargement = chargementMapping || chargementPopUps;

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="SumUp" onRetour={onRetour} />
      {chargement ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text className="mb-3 text-xs text-slate-400">
            Attribue une adresse email SumUp à un pop-up : toute vente faite avec cette adresse sera
            rattachée directement à ce lieu, sans dépendre du GPS.
          </Text>
          <Text className="mb-4 text-xs font-semibold text-amber-600">
            Tant que le compte SumUp est partagé entre tous les pop-ups, ne mappe pas cette adresse
            commune — ça attribuerait toutes les ventes de tous les lieux à un seul pop-up. À
            réserver aux adresses propres à un lieu ou un salarié.
          </Text>

          <View className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="mb-2 text-sm font-semibold text-slate-800">Nouvelle attribution</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="adresse@sumup.example"
              autoCapitalize="none"
              keyboardType="email-address"
              className="mb-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
            />
            <Dropdown
              value={popUpId}
              options={(popUps ?? []).map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
              onChange={setPopUpId}
              placeholder="Pop-up"
            />
            <Pressable
              onPress={ajouter}
              disabled={!email.trim() || !popUpId || definir.isPending}
              className={`mt-3 items-center rounded-xl py-3 ${email.trim() && popUpId ? 'bg-indigo-600' : 'bg-slate-200'}`}
            >
              <Text className={`text-sm font-bold ${email.trim() && popUpId ? 'text-white' : 'text-slate-500'}`}>
                {definir.isPending ? 'Enregistrement…' : 'Attribuer'}
              </Text>
            </Pressable>
          </View>

          <Text className="mb-2 text-xs font-semibold uppercase text-slate-400">Attributions existantes</Text>
          {(mapping ?? []).length === 0 ? (
            <Text className="text-sm text-slate-400">Aucune pour l'instant.</Text>
          ) : (
            (mapping ?? []).map((m) => {
              const popUp = (popUps ?? []).find((p) => p.id === m.pop_up_id);
              return (
                <View
                  key={m.id}
                  className="mb-1.5 flex-row items-center justify-between rounded-lg bg-white p-3 shadow-sm"
                >
                  <View>
                    <Text className="text-sm font-semibold text-slate-800">{m.email}</Text>
                    <Text className="text-xs text-slate-400">{popUp?.nom ?? 'Pop-up supprimé'}</Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert('Retirer l’attribution', `"${m.email}" ne sera plus rattachée à un lieu.`, [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Retirer', style: 'destructive', onPress: () => supprimer.mutate(m.id) },
                      ])
                    }
                  >
                    <Text className="text-sm font-semibold text-red-500">Retirer</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
