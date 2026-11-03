import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ajouterJourEcole,
  fetchJoursEcolePeriode,
  fetchJoursEcoleProfile,
  supprimerJourEcole,
  supprimerJourEcoleParDate,
} from '@/api/alternance';

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

  // Application en une fois des changements sélectionnés à l'écran (admin/manager), après "Valider
  // les modifications" + confirmation (retour utilisateur du 2026-11-03).
  const appliquer = useMutation({
    // `id` connu pour une suppression : suppression par id, qui signale un blocage RLS (manager hors
    // équipe) au lieu de passer silencieusement.
    mutationFn: async (diffs: { date: string; action: 'ajout' | 'suppression'; id?: string }[]) => {
      for (const d of diffs) {
        if (d.action === 'ajout') await ajouterJourEcole(profileId as string, d.date);
        else if (d.id) await supprimerJourEcole(d.id);
        else await supprimerJourEcoleParDate(profileId as string, d.date);
      }
    },
    onSettled: () => {
      invalidate();
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'jours-ecole-periode' });
    },
  });

  return { ajouter, supprimer, appliquer };
}
