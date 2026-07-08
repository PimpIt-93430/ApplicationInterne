import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ajouterJourEcole, fetchJoursEcolePeriode, fetchJoursEcoleProfile, supprimerJourEcole } from '@/api/alternance';

export function useJoursEcoleProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: ['jours-ecole', profileId],
    queryFn: () => fetchJoursEcoleProfile(profileId as string),
    enabled: !!profileId,
  });
}

export function useJoursEcolePeriode(dateDebut: string, dateFin: string) {
  return useQuery({
    queryKey: ['jours-ecole-periode', dateDebut, dateFin],
    queryFn: () => fetchJoursEcolePeriode(dateDebut, dateFin),
  });
}

export function useGererJoursEcole(profileId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['jours-ecole', profileId] });

  const ajouter = useMutation({
    mutationFn: (date: string) => ajouterJourEcole(profileId as string, date),
    onSuccess: invalidate,
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerJourEcole(id),
    onSuccess: invalidate,
  });

  return { ajouter, supprimer };
}
