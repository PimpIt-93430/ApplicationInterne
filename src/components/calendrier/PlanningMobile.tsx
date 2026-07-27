import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { CarteShiftJournee } from './CarteShiftJournee';
import { SelecteurSemaineCombo } from './SelecteurSemaineCombo';
import { BarreOnglets } from '@/components/ui/BarreOnglets';
import { Dropdown } from '@/components/ui/Dropdown';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp, useActiveProfiles } from '@/hooks/useProfiles';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useSemaineStore } from '@/store/useSemaineStore';
import type { PlanningShift } from '@/types/database.types';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import { dateEnISO, joursDeLaSemaine, libelleJourCourt } from '@/utils/dateUtils';

type Onglet = 'mes_shifts' | 'equipe';

/** Écran "Planning" mobile façon Combo (onglet de la barre de navigation basse non-admin) :
 * toggle "Mes shifts"/"Équipe(s)", navigation semaine en 3 pastilles, cartes de shifts groupées
 * par jour. Distinct de CalendrierPersonnelEcran.tsx (non touché, reste utilisé sur web et par
 * l'admin) — cf. plan pour le détail de cette séparation. */
export function PlanningMobile() {
  const profile = useProfilEffectif();
  const [onglet, setOnglet] = useState<Onglet>('mes_shifts');
  const [popUpSelectionne, setPopUpSelectionne] = useState<string | undefined>(undefined);
  const { dateReference, semaineSuivante, semainePrecedente, revenirAujourdhui } = useSemaineStore();
  const jours = joursDeLaSemaine(dateReference);
  const dateDebut = dateEnISO(jours[0]);
  const dateFin = dateEnISO(jours[6]);

  const { data: shifts, isLoading: chargementShifts } = useShiftsSemaine(dateDebut, dateFin);
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const { data: profils } = useActiveProfiles();
  const { data: affectations } = useAffectationsPopUp();

  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const mesPopUps = useMemo(
    () => (profile ? popUpsAttribues(profile, mapAffectations, popUpsTous ?? []) : []),
    [profile, mapAffectations, popUpsTous],
  );
  const profilParId = useMemo(() => new Map((profils ?? []).map((p) => [p.id, p])), [profils]);
  const popUpParId = useMemo(() => new Map((popUpsTous ?? []).map((p) => [p.id, p])), [popUpsTous]);

  const popUpEquipe = popUpSelectionne ?? mesPopUps[0]?.id;

  const shiftsAffiches = useMemo(() => {
    if (onglet === 'mes_shifts') return (shifts ?? []).filter((s) => s.profile_id === profile?.id);
    return (shifts ?? []).filter((s) => s.pop_up_id === popUpEquipe);
  }, [shifts, onglet, profile?.id, popUpEquipe]);

  const shiftsParJour = useMemo(() => {
    const map = new Map<string, PlanningShift[]>();
    for (const jour of jours) map.set(dateEnISO(jour), []);
    for (const shift of shiftsAffiches) {
      map.get(shift.date)?.push(shift);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftsAffiches, dateDebut, dateFin]);

  const chargement = chargementShifts || chargementPopUps;

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pb-2 pt-14">
        <Text className="text-2xl font-bold text-slate-900">Planning</Text>
      </View>

      <View className="mx-4 mb-3">
        <BarreOnglets
          valeur={onglet}
          onChange={setOnglet}
          options={[
            { valeur: 'mes_shifts', label: 'Mes shifts' },
            { valeur: 'equipe', label: 'Équipe(s)' },
          ]}
        />
      </View>

      <SelecteurSemaineCombo
        dateReference={dateReference}
        onPrecedente={semainePrecedente}
        onSuivante={semaineSuivante}
        onRevenirAujourdhui={revenirAujourdhui}
      />

      {onglet === 'equipe' && mesPopUps.length > 1 && (
        <View className="mb-3 px-4">
          <Dropdown
            value={popUpEquipe}
            options={mesPopUps.map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
            onChange={setPopUpSelectionne}
          />
        </View>
      )}

      {chargement ? (
        <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {jours.map((jour) => {
            const dateIso = dateEnISO(jour);
            const shiftsJour = [...(shiftsParJour.get(dateIso) ?? [])].sort((a, b) =>
              a.heure_debut.localeCompare(b.heure_debut),
            );
            return (
              <View key={dateIso} className="mb-4">
                <View className="mb-2 flex-row items-center gap-2">
                  <View className="h-px flex-1 bg-slate-200" />
                  <Text className="text-xs font-semibold uppercase text-slate-400">
                    {libelleJourCourt(jour)}
                  </Text>
                  <View className="h-px flex-1 bg-slate-200" />
                </View>

                {shiftsJour.length === 0 ? (
                  onglet === 'mes_shifts' && (
                    <View className="flex-row overflow-hidden rounded-2xl bg-white shadow-sm">
                      <View style={{ width: 4, backgroundColor: '#CBD5E1' }} />
                      <View className="flex-1 p-3">
                        <Text className="text-sm font-semibold text-slate-400">Repos hebdomadaire</Text>
                      </View>
                    </View>
                  )
                ) : (
                  shiftsJour.map((shift) => (
                    <CarteShiftJournee
                      key={shift.id}
                      heureDebut={shift.heure_debut}
                      heureFin={shift.heure_fin}
                      etiquette={shift.etiquette}
                      couleur={
                        onglet === 'mes_shifts'
                          ? (popUpParId.get(shift.pop_up_id)?.couleur ?? '#6366F1')
                          : (profilParId.get(shift.profile_id)?.couleur ?? '#6366F1')
                      }
                      libelleDroite={
                        onglet === 'mes_shifts'
                          ? (popUpParId.get(shift.pop_up_id)?.nom ?? '?')
                          : (profilParId.get(shift.profile_id)?.nom_complet ?? '?')
                      }
                    />
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
