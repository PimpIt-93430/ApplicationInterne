import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import {
  insererShifts,
  publierShiftsSemaine,
  supprimerShift,
  supprimerShiftsBrouillon,
  validerShiftsSemaine,
} from '@/api/planning';
import { creerNotifications } from '@/api/notifications';
import { CarteShift } from '@/components/calendrier/CarteShift';
import { ColonneJour } from '@/components/calendrier/ColonneJour';
import { SemaineGrid } from '@/components/calendrier/SemaineGrid';
import { genererPlanning, type Alerte } from '@/domain/generationPlanning';
import { useCongesPeriode } from '@/hooks/useConges';
import { useDisponibilitesEquipeSemaine } from '@/hooks/useDisponibilites';
import { useJoursEcolePeriode } from '@/hooks/useAlternance';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { useReglesGlobales, useToutesEffectifsCreneaux } from '@/hooks/useReglesMetier';
import { useAuthStore } from '@/store/useAuthStore';
import { useSemaineStore } from '@/store/useSemaineStore';
import { dateEnISO, formatHeure, joursDeLaSemaine, jourSemaineISO, libelleJourCourt } from '@/utils/dateUtils';
import type { PlanningShift, Profile, TypeContrat } from '@/types/database.types';

const TYPES: { type: TypeContrat; abrev: string; champ: 'nb_managers_requis' | 'nb_employes_requis' | 'nb_alternants_requis' }[] = [
  { type: 'manager', abrev: 'Manager', champ: 'nb_managers_requis' },
  { type: 'employe', abrev: 'Employé', champ: 'nb_employes_requis' },
  { type: 'alternant', abrev: 'Alternant', champ: 'nb_alternants_requis' },
];

function libelleAlerte(a: Alerte): string {
  const creneau = `${formatHeure(a.heure_debut)}-${formatHeure(a.heure_fin)}`;
  if (a.type === 'manager_absent') {
    return `Aucun manager le ${a.date} (${creneau})`;
  }
  return `${a.manquants} ${a.type_contrat}(s) manquant(s) le ${a.date} (${creneau})`;
}

export default function GenerationScreen() {
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const { dateReference, semaineSuivante, semainePrecedente, revenirAujourdhui } = useSemaineStore();

  const jours = joursDeLaSemaine(dateReference);
  const dateDebut = dateEnISO(jours[0]);
  const dateFin = dateEnISO(jours[6]);

  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!popUpId && popUps && popUps.length > 0) setPopUpId(popUps[0].id);
  }, [popUps, popUpId]);

  const { data: profils } = useActiveProfiles();
  const { data: dispoEquipe } = useDisponibilitesEquipeSemaine(dateDebut, dateFin);
  const { data: conges } = useCongesPeriode(dateDebut, dateFin);
  const { data: joursEcole } = useJoursEcolePeriode(dateDebut, dateFin);
  const { data: toutesEffectifs } = useToutesEffectifsCreneaux();
  const { data: reglesGlobales } = useReglesGlobales();
  const { data: shifts, isLoading } = useShiftsSemaine(dateDebut, dateFin);

  const [genererEnCours, setGenererEnCours] = useState(false);
  const [pickerOuvert, setPickerOuvert] = useState<string | null>(null);
  const [alertes, setAlertes] = useState<Alerte[]>([]);

  const profilParId = new Map((profils ?? []).map((p) => [p.id, p]));

  const invalidateShifts = () =>
    queryClient.invalidateQueries({ queryKey: ['planning-shifts', dateDebut, dateFin] });

  const handleGenerer = async () => {
    if (!profile || !toutesEffectifs || !reglesGlobales || !dispoEquipe || !profils) return;
    setGenererEnCours(true);
    try {
      const joursMap = jours.map((j) => ({ date: dateEnISO(j), jour_semaine: jourSemaineISO(j) }));
      const resultat = genererPlanning({
        jours: joursMap,
        disponibilites: dispoEquipe,
        conges: conges ?? [],
        joursEcole: joursEcole ?? [],
        reglesEffectifs: toutesEffectifs,
        reglesGlobales,
        profiles: profils,
        adminId: profile.id,
      });
      await supprimerShiftsBrouillon(dateDebut, dateFin);
      await insererShifts(resultat.shifts);
      invalidateShifts();
      setAlertes(resultat.alertes);
      if (resultat.alertes.length > 0) {
        Alert.alert(
          'Planning généré',
          `${resultat.alertes.length} alerte(s) à vérifier ci-dessous avant validation.`,
        );
      }
    } finally {
      setGenererEnCours(false);
    }
  };

  const handleValider = async () => {
    await validerShiftsSemaine(dateDebut, dateFin);
    invalidateShifts();
  };

  const handlePublier = async () => {
    const profileIdsConcernes = Array.from(
      new Set((shifts ?? []).filter((s) => s.statut === 'valide').map((s) => s.profile_id)),
    );
    await publierShiftsSemaine(dateDebut, dateFin);
    await creerNotifications(
      profileIdsConcernes.map((profileId) => ({
        profile_id: profileId,
        titre: 'Planning publié',
        corps: `Votre planning du ${libelleJourCourt(jours[0])} au ${libelleJourCourt(jours[6])} est disponible.`,
      })),
    );
    invalidateShifts();
  };

  const handleSupprimerShift = (id: string, nomComplet: string) => {
    Alert.alert('Retirer ce créneau', `Retirer ${nomComplet} de ce créneau ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          await supprimerShift(id);
          invalidateShifts();
        },
      },
    ]);
  };

  const handleAjouter = async (
    profileId: string,
    dateIso: string,
    heureDebut: string,
    heureFin: string,
  ) => {
    if (!profile || !popUpId) return;
    await insererShifts([
      {
        pop_up_id: popUpId,
        profile_id: profileId,
        date: dateIso,
        heure_debut: heureDebut,
        heure_fin: heureFin,
        statut: 'brouillon',
        genere_automatiquement: false,
        created_by: profile.id,
      },
    ]);
    setPickerOuvert(null);
    invalidateShifts();
  };

  const seChevauchent = (aDebut: string, aFin: string, bDebut: string, bFin: string) =>
    aDebut < bFin && bDebut < aFin;

  const estDejaOccupeAilleurs = (p: Profile, dateIso: string, heureDebut: string, heureFin: string) =>
    (shifts ?? []).some(
      (s: PlanningShift) =>
        s.profile_id === p.id && s.date === dateIso && seChevauchent(s.heure_debut, s.heure_fin, heureDebut, heureFin),
    );

  if (chargementPopUps || isLoading || !popUpId) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white pt-14">
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2 px-4">
        <View className="flex-row gap-2">
          {(popUps ?? []).map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPopUpId(p.id)}
              className={`rounded-full px-4 py-2 ${popUpId === p.id ? '' : 'bg-slate-100'}`}
              style={popUpId === p.id ? { backgroundColor: p.couleur } : undefined}
            >
              <Text className={`text-sm font-semibold ${popUpId === p.id ? 'text-white' : 'text-slate-600'}`}>
                {p.nom}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View className="flex-row gap-2 px-4 pb-2">
        <Pressable
          onPress={handleGenerer}
          disabled={genererEnCours}
          className="flex-1 items-center rounded-xl bg-indigo-600 py-3 disabled:opacity-50"
        >
          <Text className="font-semibold text-white">{genererEnCours ? 'Génération...' : 'Générer'}</Text>
        </Pressable>
        <Pressable onPress={handleValider} className="flex-1 items-center rounded-xl bg-amber-500 py-3">
          <Text className="font-semibold text-white">Valider</Text>
        </Pressable>
        <Pressable onPress={handlePublier} className="flex-1 items-center rounded-xl bg-emerald-600 py-3">
          <Text className="font-semibold text-white">Publier</Text>
        </Pressable>
      </View>

      {alertes.length > 0 && (
        <View className="mx-4 mb-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <Text className="mb-1 text-xs font-semibold text-amber-700">
            {alertes.length} alerte(s) de la dernière génération
          </Text>
          {alertes.slice(0, 5).map((a, i) => (
            <Text key={i} className="text-xs text-amber-700">
              • {libelleAlerte(a)}
            </Text>
          ))}
        </View>
      )}

      <SemaineGrid>
        {jours.map((jour) => {
          const dateIso = dateEnISO(jour);
          const jourIso = jourSemaineISO(jour);
          const slots = (toutesEffectifs ?? []).filter(
            (r) => r.pop_up_id === popUpId && r.jour_semaine === jourIso,
          );

          return (
            <ColonneJour key={dateIso} date={jour}>
              {slots.length === 0 ? (
                <Text className="text-center text-xs text-slate-400">Fermé</Text>
              ) : (
                slots.map((slot) => (
                  <View key={`${slot.heure_debut}-${slot.heure_fin}`} className="mb-2">
                    <Text className="mb-1 text-[10px] uppercase text-slate-400">
                      {formatHeure(slot.heure_debut)}-{formatHeure(slot.heure_fin)}
                    </Text>

                    {TYPES.map(({ type, abrev, champ }) => {
                      const requis = slot[champ];
                      if (requis <= 0) return null;

                      const cleSlot = `${dateIso}|${popUpId}|${slot.heure_debut}|${slot.heure_fin}|${type}`;
                      const assignes = (shifts ?? []).filter(
                        (s) =>
                          s.pop_up_id === popUpId &&
                          s.date === dateIso &&
                          s.heure_debut === slot.heure_debut &&
                          s.heure_fin === slot.heure_fin &&
                          profilParId.get(s.profile_id)?.type_contrat === type,
                      );

                      const candidats = (profils ?? []).filter(
                        (p) =>
                          p.type_contrat === type &&
                          // Les admins sont disponibles par défaut tout le temps.
                          (p.role === 'admin' ||
                            (dispoEquipe ?? []).some(
                              (d) =>
                                d.profile_id === p.id &&
                                d.date === dateIso &&
                                d.heure_debut <= slot.heure_debut &&
                                d.heure_fin >= slot.heure_fin,
                            )) &&
                          !(conges ?? []).some(
                            (c) => c.profile_id === p.id && dateIso >= c.date_debut && dateIso <= c.date_fin,
                          ) &&
                          (type !== 'alternant' ||
                            !(joursEcole ?? []).some((j) => j.profile_id === p.id && j.date === dateIso)) &&
                          !estDejaOccupeAilleurs(p, dateIso, slot.heure_debut, slot.heure_fin),
                      );

                      return (
                        <View key={type} className="mb-1 rounded-lg bg-slate-50 p-1">
                          <Text className="mb-1 text-[9px] font-semibold text-slate-400">
                            {abrev} ({assignes.length}/{requis})
                          </Text>

                          {assignes.map((s) => {
                            const p = profilParId.get(s.profile_id);
                            return (
                              <Pressable
                                key={s.id}
                                onPress={() => handleSupprimerShift(s.id, p?.nom_complet || p?.email || '?')}
                              >
                                <CarteShift
                                  nomComplet={p?.nom_complet || p?.email || '?'}
                                  couleur={p?.couleur ?? '#6366F1'}
                                  heureDebut={s.heure_debut}
                                  heureFin={s.heure_fin}
                                  brouillon={s.statut === 'brouillon'}
                                />
                              </Pressable>
                            );
                          })}

                          {assignes.length < requis && (
                            <Pressable
                              onPress={() => setPickerOuvert(pickerOuvert === cleSlot ? null : cleSlot)}
                              className="mt-1 items-center rounded-lg border border-dashed border-indigo-300 py-1"
                            >
                              <Text className="text-[10px] text-indigo-500">+ Ajouter</Text>
                            </Pressable>
                          )}

                          {pickerOuvert === cleSlot && (
                            <View className="mt-1 gap-1">
                              {candidats.length === 0 ? (
                                <Text className="text-center text-[9px] text-slate-400">Personne dispo</Text>
                              ) : (
                                candidats.map((p) => (
                                  <Pressable
                                    key={p.id}
                                    onPress={() => handleAjouter(p.id, dateIso, slot.heure_debut, slot.heure_fin)}
                                    className="rounded-lg bg-white px-2 py-1"
                                  >
                                    <Text className="text-[10px] text-slate-700">
                                      {p.nom_complet || p.email}
                                    </Text>
                                  </Pressable>
                                ))
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </ColonneJour>
          );
        })}
      </SemaineGrid>
    </View>
  );
}
