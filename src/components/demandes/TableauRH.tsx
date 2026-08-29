// Onglet "RH" de Demande & RH (manager/admin uniquement) : vue d'ensemble par personne — heures
// travaillées (mois en cours et année en cours, dont dimanche pour chacun), congés acquis/pris/
// solde et absences cette année. Un admin voit toute l'équipe ; un manager voit seulement les
// personnes attribuées à son/ses pop-up(s) couverts par son droit "équipe" (même principe que
// app/(app)/equipe.tsx). Cf. retour utilisateur du 2026-08-25 : "une table avec toutes les infos
// des heures travaillées... mets tout ce qui est important d'un point de vue RH".
//
// Congés acquis : règle simplifiée "2.5 jours par mois" fixée par l'utilisateur (2026-08-25,
// "on va dire 2.5 par mois pour l'instant") — comptés depuis le début de l'année civile en cours,
// ou depuis la date de début de contrat si elle est plus tardive (ex. quelqu'un qui démarre en
// cours d'année n'accumule rien avant son arrivée). Pas encore la vraie règle légale (période de
// référence juin-mai, jours ouvrables plutôt que mois civils) — volontairement approximatif tant
// que l'utilisateur n'a pas confirmé la règle exacte à appliquer.
import { differenceInCalendarMonths, startOfMonth, startOfYear } from 'date-fns';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { useJoursEcolePeriode } from '@/hooks/useAlternance';
import { useCongesPeriode } from '@/hooks/useConges';
import { useMesDroits } from '@/hooks/useDroits';
import { useDatesDebutContratTous } from '@/hooks/useInformationsRh';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { construireMapAffectations, estAttribueA } from '@/utils/affectations';
import { dateEnISO, estDimanche, formatDureeHeures, totalHeuresTravaillees } from '@/utils/dateUtils';
import { aAccesFonctionnalite, popUpsCouverts } from '@/utils/permissions';
import type { Profile } from '@/types/database.types';

// 2.5 jours de congé acquis par mois écoulé (cf. en-tête du fichier) — arrondi à une décimale pour
// l'affichage (ex. 3 mois = 7.5 jours), jamais négatif (quelqu'un pas encore arrivé n'a rien acquis).
const CONGES_ACQUIS_PAR_MOIS = 2.5;

const LIBELLE_TYPE_CONTRAT: Record<string, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

// Un jour d'école compte forfaitairement pour ce nombre d'heures — même convention que
// totalHeuresSemaineAvecEcole (dateUtils.ts) et le retour utilisateur qui l'a fixée.
const HEURES_ECOLE_PAR_JOUR = 7;

function formatJours(n: number): string {
  const texte = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${texte} jour${n > 1 ? 's' : ''}`;
}

function LigneStat({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-xs text-slate-400">{label}</Text>
      <Text className="text-sm font-semibold text-slate-800">{valeur}</Text>
    </View>
  );
}

export function TableauRH() {
  const profile = useProfilEffectif();
  const { data: droits, isLoading: chargementDroits } = useMesDroits(profile?.id);
  const { data: profilsTous, isLoading: chargementProfils } = useActiveProfiles();
  const { data: affectations, isLoading: chargementAffectations } = useAffectationsPopUp();
  const { data: datesDebutContrat } = useDatesDebutContratTous();

  const aujourdhui = dateEnISO(new Date());
  const debutMois = dateEnISO(startOfMonth(new Date()));
  const debutAnnee = dateEnISO(startOfYear(new Date()));

  const { data: shiftsAnnee, isLoading: chargementShifts } = useShiftsSemaine(debutAnnee, aujourdhui);
  const { data: congesAnnee, isLoading: chargementConges } = useCongesPeriode(debutAnnee, aujourdhui);
  const { data: joursEcoleAnnee } = useJoursEcolePeriode(debutAnnee, aujourdhui);

  const dateDebutContratParProfil = useMemo(
    () => new Map((datesDebutContrat ?? []).map((d) => [d.profile_id, d.date_debut_contrat])),
    [datesDebutContrat],
  );

  const estAdmin = profile?.role === 'admin';
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);

  // Même règle de scope que app/(app)/equipe.tsx (droit "équipe") — un admin voit tout le monde,
  // sans avoir besoin de droit explicite (is_admin() prime déjà côté RLS).
  const membres = useMemo(() => {
    const tous = profilsTous ?? [];
    if (estAdmin) return tous;
    if (!aAccesFonctionnalite(droits ?? [], 'equipe')) return [];
    const idsCouverts = popUpsCouverts(droits ?? [], 'equipe');
    return tous.filter((p) => {
      if (idsCouverts === null) return true;
      return idsCouverts.some((popUpId) => estAttribueA(p, popUpId, mapAffectations));
    });
  }, [profilsTous, estAdmin, droits, mapAffectations]);

  const statsParProfil = useMemo(() => {
    const shifts = shiftsAnnee ?? [];
    const conges = congesAnnee ?? [];
    const joursEcole = joursEcoleAnnee ?? [];
    const shiftsPasses = shifts.filter((s) => s.date <= aujourdhui);
    const shiftsDuMois = shiftsPasses.filter((s) => s.date >= debutMois);

    const map = new Map<
      string,
      {
        heuresMois: number;
        heuresDimancheMois: number;
        heuresAnnee: number;
        heuresDimancheAnnee: number;
        joursConge: number;
        joursAbsence: number;
        congesAcquis: number;
      }
    >();
    for (const p of membres) {
      // Un créneau planifié avant le début de contrat ne compte pas comme du temps de travail
      // effectif, même s'il existe déjà en base (ex. généré à l'avance sur l'horaire récurrent
      // avant que la date de début de contrat ne soit renseignée) — cf. retour utilisateur du
      // 2026-08-25 sur Gregory (contrat au 31/08, mais déjà des créneaux début août).
      const dateDebutContrat = dateDebutContratParProfil.get(p.id);
      const filtrerAvantContrat = <T extends { date: string }>(liste: T[]): T[] =>
        dateDebutContrat ? liste.filter((s) => s.date >= dateDebutContrat) : liste;

      const heuresMois = totalHeuresTravaillees(filtrerAvantContrat(shiftsDuMois), p.id);
      const heuresDimancheMois = totalHeuresTravaillees(
        filtrerAvantContrat(shiftsDuMois.filter((s) => estDimanche(s.date))),
        p.id,
      );
      const heuresTravailAnnee = totalHeuresTravaillees(filtrerAvantContrat(shiftsPasses), p.id);
      const heuresDimancheAnnee = totalHeuresTravaillees(
        filtrerAvantContrat(shiftsPasses.filter((s) => estDimanche(s.date))),
        p.id,
      );
      const joursEcoleAnneeCount = joursEcole.filter(
        (j) => j.profile_id === p.id && (!dateDebutContrat || j.date >= dateDebutContrat),
      ).length;
      const heuresAnnee = heuresTravailAnnee + joursEcoleAnneeCount * HEURES_ECOLE_PAR_JOUR;

      let joursConge = 0;
      let joursAbsence = 0;
      for (const c of conges) {
        if (c.profile_id !== p.id) continue;
        const debut = c.date_debut < debutAnnee ? debutAnnee : c.date_debut;
        const fin = c.date_fin > aujourdhui ? aujourdhui : c.date_fin;
        if (debut > fin) continue;
        const nbJours = Math.round((new Date(`${fin}T00:00:00`).getTime() - new Date(`${debut}T00:00:00`).getTime()) / 86400000) + 1;
        if (c.type === 'conge' && c.statut === 'validee') joursConge += nbJours;
        if (c.type === 'absence' || c.type === 'indisponibilite') joursAbsence += nbJours;
      }

      // Depuis le début de l'année civile, ou depuis la date de début de contrat si elle tombe
      // cette année (quelqu'un qui démarre en cours d'année n'accumule rien avant son arrivée) —
      // cf. en-tête du fichier. Négatif (contrat pas encore commencé) ramené à 0.
      const debutReference = dateDebutContrat && dateDebutContrat > debutAnnee ? dateDebutContrat : debutAnnee;
      const moisEcoules = Math.max(
        0,
        differenceInCalendarMonths(new Date(`${aujourdhui}T00:00:00`), new Date(`${debutReference}T00:00:00`)),
      );
      const congesAcquis = moisEcoules * CONGES_ACQUIS_PAR_MOIS;

      map.set(p.id, { heuresMois, heuresDimancheMois, heuresAnnee, heuresDimancheAnnee, joursConge, joursAbsence, congesAcquis });
    }
    return map;
  }, [membres, shiftsAnnee, congesAnnee, joursEcoleAnnee, dateDebutContratParProfil, aujourdhui, debutMois, debutAnnee]);

  if (chargementDroits || chargementProfils || chargementAffectations || chargementShifts || chargementConges) {
    return <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />;
  }

  return (
    <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
      <Text className="mb-3 text-xs text-slate-400">
        Heures déjà travaillées (planning passé, pas les créneaux à venir) — mois en cours et année
        en cours. Les jours d'école comptent pour {HEURES_ECOLE_PAR_JOUR}h dans le total de
        l'année pour un alternant. Congés acquis : règle simplifiée {CONGES_ACQUIS_PAR_MOIS} jours
        par mois écoulé depuis le 1ᵉʳ janvier (ou depuis le début du contrat s'il tombe cette
        année) — à affiner si besoin.
      </Text>

      {membres.length === 0 && <Text className="py-8 text-center text-sm text-slate-400">Aucun membre pour l'instant.</Text>}

      {membres.map((p: Profile) => {
        const s = statsParProfil.get(p.id);
        if (!s) return null;
        return (
          <View key={p.id} className="mb-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <View className="mb-1 flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.couleur }} />
              <Text className="flex-1 text-sm font-bold text-slate-900">{p.nom_complet || p.email}</Text>
              <Text className="text-xs font-semibold uppercase text-indigo-500">
                {LIBELLE_TYPE_CONTRAT[p.type_contrat] ?? p.type_contrat}
              </Text>
            </View>
            {p.heures_max_semaine != null && (
              <Text className="mb-1 text-xs text-slate-400">Contrat : {p.heures_max_semaine}h/semaine</Text>
            )}

            <View className="mt-1 border-t border-slate-100 pt-1">
              <LigneStat label="Heures ce mois" valeur={formatDureeHeures(s.heuresMois)} />
              <LigneStat label="dont dimanche" valeur={formatDureeHeures(s.heuresDimancheMois)} />
              <LigneStat label="Heures cette année" valeur={formatDureeHeures(s.heuresAnnee)} />
              <LigneStat label="dont dimanche (année)" valeur={formatDureeHeures(s.heuresDimancheAnnee)} />
              <LigneStat label="Congés acquis (année)" valeur={formatJours(s.congesAcquis)} />
              <LigneStat label="Congés pris (année)" valeur={formatJours(s.joursConge)} />
              <LigneStat label="Solde congés" valeur={formatJours(s.congesAcquis - s.joursConge)} />
              <LigneStat label="Absences (année)" valeur={formatJours(s.joursAbsence)} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
