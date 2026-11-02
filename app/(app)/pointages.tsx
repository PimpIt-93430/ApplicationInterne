import { addDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { Dropdown } from '@/components/ui/Dropdown';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { useDefinirPositionPopUp, useGererPointages, usePointagesJour } from '@/hooks/usePointages';
import { usePopUps } from '@/hooks/usePopUps';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import type { PlanningShift, Pointage, TypePointage } from '@/types/database.types';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import { dateEnISO, formatCreneauShift, formatHeure } from '@/utils/dateUtils';
import { versMinutes } from '@/utils/timelineLayout';

// Tolérance avant d'afficher "retard" (arrivée) ou "parti tôt" (départ).
const TOLERANCE_MIN = 5;

function heureDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function minutesDansLaJournee(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// Le GPS ne bloque jamais le pointage (migration 0131) : il est seulement signalé ici, case verte
// si la position était bonne au scan, rouge sinon — pour que l'admin/le manager repère un pointage
// fait depuis ailleurs.
function fondCase(p: Pointage | undefined): string {
  if (!p) return 'bg-slate-50';
  if (p.saisi_par || p.gps_ok === null) return 'bg-slate-100';
  return p.gps_ok ? 'bg-emerald-50' : 'bg-red-50';
}

function BadgeGps({ pointage }: { pointage: Pointage | undefined }) {
  if (!pointage) return null;
  if (pointage.saisi_par) return <Text className="text-[11px] font-semibold text-slate-500">Ajouté à la main</Text>;
  if (pointage.gps_ok === null) {
    return <Text className="text-[11px] font-semibold text-slate-500">GPS non vérifié (position du pop-up à enregistrer)</Text>;
  }
  if (pointage.gps_ok) return <Text className="text-[11px] font-bold text-emerald-600">✓ GPS OK</Text>;
  return (
    <Text className="text-[11px] font-bold text-red-600">
      {pointage.distance_m != null ? `⚠ Hors zone (${pointage.distance_m} m)` : '⚠ Sans position GPS'}
    </Text>
  );
}

/** Combine une date (jour affiché) et une heure "HH:MM:SS" du planning en Date locale. */
function dateAvecHeure(jour: Date, heure: string): Date {
  const [h, m] = heure.split(':').map(Number);
  const d = new Date(jour);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Suivi des pointages d'un pop-up, jour par jour (admin + manager du pop-up, cf. migration 0130) :
 * prévu au planning vs arrivée/départ réels, retards signalés, correction à la main en cas d'oubli
 * — et "Enregistrer la position du pop-up ici", à faire une fois sur place pour activer le
 * contrôle GPS. */
export default function PointagesScreen() {
  const profile = useProfilEffectif();
  const profileReel = useAuthStore((s) => s.profile);
  const estAdmin = profile?.role === 'admin';
  const estManager = profile?.type_contrat === 'manager';

  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const { data: profils } = useActiveProfiles();
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const mesPopUps = useMemo(
    () =>
      profile ? popUpsAttribues(profile, mapAffectations, popUpsTous ?? []).filter((p) => p.pointage_actif) : [],
    [profile, mapAffectations, popUpsTous],
  );
  const profilParId = useMemo(() => new Map((profils ?? []).map((p) => [p.id, p])), [profils]);

  const [popUpChoisi, setPopUpChoisi] = useState<string | undefined>(undefined);
  const popUpId = popUpChoisi ?? mesPopUps[0]?.id;
  const popUp = mesPopUps.find((p) => p.id === popUpId);

  const [jour, setJour] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const jourIso = dateEnISO(jour);
  const { data: shiftsJour, isLoading: chargementShifts } = useShiftsSemaine(jourIso, jourIso);
  const { data: pointages, isLoading: chargementPointages } = usePointagesJour(popUpId, jour, addDays(jour, 1));
  const definirPosition = useDefinirPositionPopUp();
  const { ajouter, supprimer } = useGererPointages();

  // Une ligne par personne : planifiée ici ce jour-là, ou qui a pointé ici sans être planifiée.
  const lignes = useMemo(() => {
    const shifts = (shiftsJour ?? [])
      .filter((s) => s.pop_up_id === popUpId)
      .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
    const ids = [...new Set([...shifts.map((s) => s.profile_id), ...(pointages ?? []).map((p) => p.profile_id)])];
    return ids.map((id) => ({
      profileId: id,
      shifts: shifts.filter((s) => s.profile_id === id),
      pointages: (pointages ?? []).filter((p) => p.profile_id === id),
    }));
  }, [shiftsJour, pointages, popUpId]);

  if (!estAdmin && !estManager) {
    return (
      <View className="flex-1 bg-white">
        <EnteteRetour titre="Pointages" onRetour={() => router.back()} />
        <Text className="mt-10 text-center text-slate-400">Réservé aux managers.</Text>
      </View>
    );
  }

  const enregistrerPosition = () => {
    if (!popUp) return;
    Alert.alert(
      'Position du pop-up',
      `Tu dois être physiquement à ${popUp.nom}. Ta position actuelle deviendra celle du pop-up pour vérifier les pointages.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Enregistrer',
          onPress: async () => {
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') throw new Error("Autorise l'accès à ta position.");
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
              await definirPosition.mutateAsync({
                popUpId: popUp.id,
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
              });
              Alert.alert('Position enregistrée', `Précision : ~${Math.round(pos.coords.accuracy ?? 0)} m.`);
            } catch (e) {
              Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer la position.");
            }
          },
        },
      ],
    );
  };

  const corriger = (profileId: string, shifts: PlanningShift[], pointagesPersonne: Pointage[]) => {
    if (!popUpId || !profileReel) return;
    const premier = shifts[0];
    const dernier = shifts[shifts.length - 1];
    const ajouterA = (type: TypePointage, heure: string) =>
      ajouter.mutate(
        { profileId, popUpId, type, horodatage: dateAvecHeure(jour, heure), saisiPar: profileReel.id },
        { onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : 'Ajout impossible.') },
      );
    const boutons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (premier && !pointagesPersonne.some((p) => p.type === 'arrivee')) {
      boutons.push({
        text: `Arrivée à ${formatHeure(premier.heure_debut)} (prévu)`,
        onPress: () => ajouterA('arrivee', premier.heure_debut),
      });
    }
    if (dernier && !pointagesPersonne.some((p) => p.type === 'depart')) {
      boutons.push({
        text: `Départ à ${formatHeure(dernier.heure_fin)} (prévu)`,
        onPress: () => ajouterA('depart', dernier.heure_fin),
      });
    }
    for (const p of pointagesPersonne) {
      boutons.push({
        text: `Supprimer ${p.type === 'arrivee' ? "l'arrivée" : 'le départ'} de ${heureDe(p.horodatage)}`,
        style: 'destructive',
        onPress: () =>
          supprimer.mutate(p.id, {
            onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : 'Suppression impossible.'),
          }),
      });
    }
    boutons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Corriger le pointage', profilParId.get(profileId)?.nom_complet ?? '', boutons);
  };

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Pointages" onRetour={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {mesPopUps.length > 1 && (
          <View className="mb-3">
            <Dropdown
              value={popUpId}
              options={mesPopUps.map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
              onChange={setPopUpChoisi}
            />
          </View>
        )}

        <View className="mb-3 flex-row items-center justify-between rounded-2xl bg-white px-2 py-2 shadow-sm">
          <Pressable onPress={() => setJour((j) => addDays(j, -1))} className="px-4 py-2">
            <Text className="text-lg font-bold text-indigo-600">‹</Text>
          </Pressable>
          <Text className="text-sm font-bold capitalize text-slate-800">
            {format(jour, 'EEEE d MMMM', { locale: fr })}
          </Text>
          <Pressable onPress={() => setJour((j) => addDays(j, 1))} className="px-4 py-2">
            <Text className="text-lg font-bold text-indigo-600">›</Text>
          </Pressable>
        </View>

        {popUp && (popUp.lat == null || popUp.lon == null) && (
          <View className="mb-3 rounded-2xl bg-amber-50 px-4 py-3">
            <Text className="text-sm font-semibold text-amber-700">Position du pop-up pas encore enregistrée</Text>
            <Text className="mt-0.5 text-xs text-amber-600">
              Les pointages de {popUp.nom} sont enregistrés mais le GPS ne peut pas être vérifié tant qu’elle n’est
              pas faite. Sur place, appuie sur le bouton ci-dessous.
            </Text>
          </View>
        )}

        {chargementShifts || chargementPointages ? (
          <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
        ) : lignes.length === 0 ? (
          <Text className="mt-6 text-center text-sm text-slate-400">Personne de prévu ce jour-là.</Text>
        ) : (
          lignes.map(({ profileId, shifts, pointages: pts }) => {
            const membre = profilParId.get(profileId);
            const arrivee = pts.find((p) => p.type === 'arrivee');
            const depart = [...pts].reverse().find((p) => p.type === 'depart');
            const premier = shifts[0];
            const dernier = shifts[shifts.length - 1];
            const retardMin =
              arrivee && premier ? minutesDansLaJournee(arrivee.horodatage) - versMinutes(premier.heure_debut) : 0;
            const partiTotMin =
              depart && dernier ? versMinutes(dernier.heure_fin) - minutesDansLaJournee(depart.horodatage) : 0;
            return (
              <Pressable
                key={profileId}
                onPress={() => corriger(profileId, shifts, pts)}
                className="mb-2 rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <View
                      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: membre?.couleur ?? '#94A3B8' }}
                    />
                    <Text className="text-sm font-bold text-slate-800">{membre?.nom_complet ?? '?'}</Text>
                  </View>
                  <Text className="text-xs text-slate-500">
                    {shifts.length > 0 ? `Prévu ${shifts.map((s) => formatCreneauShift(s)).join(', ')}` : 'Non prévu'}
                  </Text>
                </View>
                <View className="mt-2 flex-row gap-2">
                  <View className={`flex-1 rounded-xl px-3 py-2 ${fondCase(arrivee)}`}>
                    <Text className="text-[10px] font-semibold uppercase text-slate-400">Arrivée</Text>
                    <Text className={`text-sm font-bold ${arrivee ? 'text-slate-900' : 'text-slate-300'}`}>
                      {arrivee ? heureDe(arrivee.horodatage) : '—'}
                      {arrivee?.saisi_par ? ' ✎' : ''}
                    </Text>
                    <BadgeGps pointage={arrivee} />
                    {retardMin > TOLERANCE_MIN && (
                      <Text className="text-[11px] font-bold text-red-600">Retard {retardMin} min</Text>
                    )}
                  </View>
                  <View className={`flex-1 rounded-xl px-3 py-2 ${fondCase(depart)}`}>
                    <Text className="text-[10px] font-semibold uppercase text-slate-400">Départ</Text>
                    <Text className={`text-sm font-bold ${depart ? 'text-slate-900' : 'text-slate-300'}`}>
                      {depart ? heureDe(depart.horodatage) : '—'}
                      {depart?.saisi_par ? ' ✎' : ''}
                    </Text>
                    <BadgeGps pointage={depart} />
                    {partiTotMin > TOLERANCE_MIN && (
                      <Text className="text-[11px] font-bold text-amber-600">Parti {partiTotMin} min plus tôt</Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

        <Text className="mt-2 text-center text-[11px] text-slate-400">
          Touche une personne pour corriger un oubli. Vert = GPS OK, rouge = pointé hors du pop-up.
        </Text>

        {popUp && (
          <Pressable
            onPress={enregistrerPosition}
            disabled={definirPosition.isPending}
            className="mt-6 items-center rounded-2xl border border-slate-200 bg-white py-3.5"
          >
            <Text className="text-sm font-semibold text-slate-700">
              {definirPosition.isPending
                ? 'Enregistrement…'
                : popUp.lat == null
                  ? `Enregistrer la position de ${popUp.nom} ici`
                  : `Mettre à jour la position de ${popUp.nom} ici`}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
