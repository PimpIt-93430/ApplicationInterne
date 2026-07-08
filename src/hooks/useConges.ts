import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ajouterConge, fetchCongesPeriode, fetchCongesProfile, supprimerConge } from '@/api/conges';
import type { TypeConge } from '@/types/database.types';

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

  const ajouter = useMutation({
    mutationFn: (params: {
      dateDebut: string;
      dateFin: string;
      heureDebut: string | null;
      heureFin: string | null;
      type: TypeConge;
      note: string;
    }) => ajouterConge({ profileId: profileId as string, ...params }),
    onSuccess: invalidate,
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerConge(id),
    onSuccess: invalidate,
  });

  return { ajouter, supprimer };
}
