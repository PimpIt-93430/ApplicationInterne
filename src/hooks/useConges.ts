import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  ajouterConge,
  demanderConge,
  fetchCongesPeriode,
  fetchCongesProfile,
  fetchDemandesCongeEnAttente,
  supprimerConge,
  traiterDemandeConge,
} from '@/api/conges';
import { supprimerShiftsProfilChevauchants } from '@/api/planning';
import { regenererPlanningProfil } from '@/api/regenerationPlanning';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import { useResponsable } from '@/hooks/useResponsable';
import type { Conge, StatutConge, TypeConge } from '@/types/database.types';

export function useCongesProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: ['conges', profileId],
    queryFn: () => fetchCongesProfile(profileId as string),
    enabled: !!profileId,
  });
}

export function useCongesPeriode(dateDebut: string, dateFin: string) {
  return useQuery({
    queryKey: ['conges-periode', dateDebut, dateFin],
    queryFn: () => fetchCongesPeriode(dateDebut, dateFin),
  });
}

export function useGererConges(profileId: string | undefined) {
  const queryClient = useQueryClient();
  // Invalide aussi bien la liste par personne (feuille "Mes indisponibilités") que la vue par
  // période (grille du calendrier admin, cf. useCongesPeriode) — sans ce second invalidate, une
  // absence créée/supprimée depuis le panneau du calendrier reste enregistrée en base mais
  // n'apparaît/disparaît de la grille qu'après un rechargement complet de la page.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['conges', profileId] });
    queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'conges-periode' });
  };

  // Best-effort : si la régénération échoue (ex. la personne connectée n'est pas admin, sans
  // droit d'écriture sur planning_shifts), l'indisponibilité est quand même bien enregistrée —
  // elle sera juste prise en compte à la prochaine régénération (ex. un admin ouvrant le
  // Calendrier). Ne doit jamais faire échouer la déclaration/suppression elle-même.
  const regenererSansBloquer = (id: string, dateDebut: string, dateFin: string) => {
    regenererPlanningProfil(id, dateDebut, dateFin).catch((error) =>
      console.warn('Régénération du planning après indisponibilité impossible :', error),
    );
  };

  const ajouter = useMutation({
    mutationFn: (params: {
      dateDebut: string;
      dateFin: string;
      heureDebut: string | null;
      heureFin: string | null;
      type: TypeConge;
      note: string;
    }) => ajouterConge({ profileId: profileId as string, ...params }),
    onSuccess: async (_data, params) => {
      invalidate();
      // Une absence doit empêcher la personne de travailler : on retire tout créneau déjà
      // planifié sur cette période (manuel ou auto-généré) avant de régénérer, sinon elle
      // resterait affichée comme travaillant malgré l'absence déclarée.
      await supprimerShiftsProfilChevauchants(
        profileId as string,
        params.dateDebut,
        params.dateFin,
        params.heureDebut,
        params.heureFin,
      ).catch((error) => console.warn('Suppression des créneaux en conflit avec l’absence impossible :', error));
      regenererSansBloquer(profileId as string, params.dateDebut, params.dateFin);
    },
  });

  const supprimer = useMutation({
    mutationFn: (conge: Conge) => supprimerConge(conge.id),
    onSuccess: (_data, conge) => {
      invalidate();
      regenererSansBloquer(conge.profile_id, conge.date_debut, conge.date_fin);
    },
  });

  return { ajouter, supprimer };
}

// Demande de congé (onglet "Demandes") : mutation séparée de useGererConges().ajouter — une
// demande "en attente" ne doit ni supprimer les créneaux existants ni régénérer le planning tant
// qu'elle n'est pas validée par un manager/admin (hors périmètre de cette tâche).
export function useDemanderConge(profileId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { dateDebut: string; dateFin: string; note: string }) =>
      demanderConge({ profileId: profileId as string, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conges', profileId] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'conges-periode' });
    },
  });
}

/** Demandes de congé "en attente" visibles par la personne connectée — RLS ne renvoie déjà que
 * celles de son équipe (droit "équipe"/"calendrier") ou tout si admin (cf. fetchDemandesCongeEnAttente). */
export function useDemandesCongeEnAttente() {
  return useQuery({ queryKey: ['conges-en-attente'], queryFn: fetchDemandesCongeEnAttente });
}

/** Demandes en attente que le profil effectif peut valider : toutes pour un admin, sinon celles des
 * personnes affectées à un pop-up dont il est responsable (ex. Charli à Val d'Europe → Pierre
 * seulement, pas Makeda). La RLS fait déjà ce tri pour le vrai utilisateur, mais un admin en
 * aperçu "voir en tant que" reçoit tout — d'où ce filtre côté appli (retour du 2026-11-03). */
export function useDemandesCongeEquipe() {
  const requete = useDemandesCongeEnAttente();
  const { estAdmin, responsableDe } = useResponsable();
  const { data: affectations } = useAffectationsPopUp();
  const data = useMemo(() => {
    if (!requete.data) return requete.data;
    if (estAdmin) return requete.data;
    return requete.data.filter((c) =>
      (affectations ?? []).some((a) => a.profile_id === c.profile_id && responsableDe(a.pop_up_id)),
    );
  }, [requete.data, estAdmin, responsableDe, affectations]);
  return { ...requete, data };
}

/** Validation/refus d'une demande par un manager/admin — `traitePar` doit être l'id du vrai
 * utilisateur connecté (pas le profil "effectif" de prévisualisation), RLS vérifie auth.uid(). */
export function useTraiterDemandeConge(traitePar: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = (profileId: string) => {
    queryClient.invalidateQueries({ queryKey: ['conges-en-attente'] });
    queryClient.invalidateQueries({ queryKey: ['conges', profileId] });
    queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'conges-periode' });
  };

  return useMutation({
    mutationFn: (params: { conge: Conge; statut: Extract<StatutConge, 'validee' | 'refusee'> }) =>
      traiterDemandeConge({ id: params.conge.id, statut: params.statut, traitePar: traitePar as string }),
    onSuccess: async (_data, { conge, statut }) => {
      invalidate(conge.profile_id);
      if (statut !== 'validee') return;
      // Un congé validé doit maintenant bloquer le planning comme n'importe quelle indispo —
      // même logique que useGererConges().ajouter (retirer les créneaux en conflit puis
      // régénérer, best-effort pour ne jamais faire échouer la validation elle-même).
      await supprimerShiftsProfilChevauchants(conge.profile_id, conge.date_debut, conge.date_fin, null, null).catch(
        (error) => console.warn('Suppression des créneaux en conflit avec le congé validé impossible :', error),
      );
      regenererPlanningProfil(conge.profile_id, conge.date_debut, conge.date_fin).catch((error) =>
        console.warn('Régénération du planning après validation du congé impossible :', error),
      );
    },
  });
}
