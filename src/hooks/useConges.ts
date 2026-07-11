import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ajouterConge, fetchCongesPeriode, fetchCongesProfile, supprimerConge } from '@/api/conges';
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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conges', profileId] });

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
    onSuccess: (_data, params) => {
      invalidate();
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
