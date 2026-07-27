import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ajouterConge, demanderConge, fetchCongesPeriode, fetchCongesProfile, supprimerConge } from '@/api/conges';
import { supprimerShiftsProfilChevauchants } from '@/api/planning';
import { regenererPlanningProfil } from '@/api/regenerationPlanning';
import type { Conge, TypeConge } from '@/types/database.types';

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
