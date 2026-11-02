import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { Conge, JourEcoleAlternant, PlanningShift, PopUp, Profile } from '@/types/database.types';
import {
  dateEnISO,
  formatCreneauShift,
  formatDureeHeures,
  libelleJourCourt,
  libellePeriodeCourte,
  totalHeuresSemaineAvecEcole,
} from '@/utils/dateUtils';

const LIBELLE_CONGE: Record<Conge['type'], string> = {
  conge: 'Congé',
  indisponibilite: 'Indispo',
  absence: 'Absence',
  repos: 'Repos',
  maladie: 'Maladie',
};

/** Planning de la semaine d'un pop-up, mis en page pour être envoyé en image dans la conv de
 * l'équipe (cf. demande du 2026-11-02 : "tous les dimanches les managers font un screen") — un
 * bloc par jour avec les horaires de chacun, puis le total d'heures de la semaine par personne.
 * "Partager" capture la carte en PNG (react-native-view-shot) et ouvre la feuille de partage iOS
 * (WhatsApp, Messages…) plutôt que de demander une capture d'écran qui couperait la semaine. */
export function PanneauPartagePlanning({
  visible,
  onClose,
  popUp,
  jours,
  profils,
  shifts,
  conges,
  joursEcole,
}: {
  visible: boolean;
  onClose: () => void;
  popUp: PopUp | undefined;
  jours: Date[];
  profils: Profile[];
  shifts: PlanningShift[];
  conges: Conge[];
  joursEcole: JourEcoleAlternant[];
}) {
  const refCarte = useRef<ScrollView>(null);
  const [enCours, setEnCours] = useState(false);

  const partager = async () => {
    setEnCours(true);
    try {
      // snapshotContentContainer : capture toute la semaine, même la partie hors écran.
      const uri = await captureRef(refCarte, { format: 'png', quality: 1, snapshotContentContainer: true });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Partage indisponible', "Le partage n'est pas disponible sur cet appareil.");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Planning de la semaine' });
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible de générer l'image.");
    } finally {
      setEnCours(false);
    }
  };

  const couleur = popUp?.couleur ?? '#6366F1';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-100">
        <View className="flex-row items-center justify-between px-4 pb-3 pt-4">
          <Pressable onPress={onClose} className="rounded-full bg-white px-4 py-2">
            <Text className="text-sm font-semibold text-slate-600">Fermer</Text>
          </Pressable>
          <Pressable
            onPress={partager}
            disabled={enCours}
            className="flex-row items-center gap-2 rounded-full bg-indigo-600 px-4 py-2"
          >
            {enCours && <ActivityIndicator size="small" color="white" />}
            <Text className="text-sm font-bold text-white">Partager l’image</Text>
          </Pressable>
        </View>

        <ScrollView ref={refCarte} contentContainerStyle={{ padding: 12, backgroundColor: '#F1F5F9' }}>

          <View className="rounded-2xl bg-white p-4">
            <View className="mb-3 flex-row items-center gap-2">
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: couleur }} />
              <Text className="text-lg font-bold text-slate-900">{popUp?.nom ?? 'Planning'}</Text>
            </View>
            <Text className="mb-4 text-sm font-semibold text-slate-500">
              Semaine du {libellePeriodeCourte(jours[0], jours[6])}
            </Text>

            {jours.map((jour) => {
              const dateIso = dateEnISO(jour);
              return (
                <View key={dateIso} className="mb-3 overflow-hidden rounded-xl border border-slate-200">
                  <View style={{ backgroundColor: couleur }} className="px-3 py-1.5">
                    <Text className="text-xs font-bold uppercase text-white">{libelleJourCourt(jour)}</Text>
                  </View>
                  {profils.map((membre, index) => {
                    const shiftsMembre = shifts
                      .filter((s) => s.profile_id === membre.id && s.date === dateIso)
                      .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
                    const conge = conges.find(
                      (c) => c.profile_id === membre.id && dateIso >= c.date_debut && dateIso <= c.date_fin,
                    );
                    const ecole = joursEcole.some((j) => j.profile_id === membre.id && j.date === dateIso);
                    const libelle =
                      shiftsMembre.length > 0
                        ? shiftsMembre.map((s) => formatCreneauShift(s)).join(' / ')
                        : conge
                          ? LIBELLE_CONGE[conge.type]
                          : ecole
                            ? 'École'
                            : 'Repos';
                    return (
                      <View
                        key={membre.id}
                        className={`flex-row items-center justify-between px-3 py-1.5 ${index > 0 ? 'border-t border-slate-100' : ''}`}
                      >
                        <Text className="text-sm font-semibold text-slate-800">{membre.nom_complet || membre.email}</Text>
                        <Text
                          className={`text-sm ${shiftsMembre.length > 0 ? 'font-bold text-slate-900' : 'text-slate-400'}`}
                        >
                          {libelle}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}

            <View className="mt-1 rounded-xl bg-slate-50 px-3 py-2">
              <Text className="mb-1 text-xs font-bold uppercase text-slate-500">Total de la semaine</Text>
              {profils.map((membre) => {
                const { heuresTravaillees, heuresEcole } = totalHeuresSemaineAvecEcole(
                  jours,
                  shifts,
                  joursEcole,
                  membre.id,
                );
                return (
                  <View key={membre.id} className="flex-row justify-between py-0.5">
                    <Text className="text-sm text-slate-700">{membre.nom_complet || membre.email}</Text>
                    <Text className="text-sm font-bold text-slate-900">
                      {formatDureeHeures(heuresTravaillees)}
                      {heuresEcole > 0 ? ` (+ ${formatDureeHeures(heuresEcole)} école)` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
