import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ajouterJourEcole, supprimerJourEcoleParDate } from '@/api/alternance';
import {
  envoyerDemandeCalendrierEcole,
  fetchDemandeCalendrierEcoleEnAttente,
  fetchDemandesCalendrierEcoleEnAttente,
  traiterDemandeCalendrierEcole,
} from '@/api/demandesCalendrierEcole';
import type { DemandeAvecJours } from '@/api/demandesCalendrierEcole';
import type { ActionJourCalendrierEcole } from '@/types/database.types';

export function useDemandeCalendrierEcoleEnAttente(profileId: string | undefined) {
  return useQuery({
    queryKey: ['demande-calendrier-ecole-en-attente', profileId],
    queryFn: () => fetchDemandeCalendrierEcoleEnAttente(profileId as string),
    enabled: !!profileId,
  });
}

/** Toutes les demandes en attente, tous alternants confondus — écran de validation admin. */
export function useDemandesCalendrierEcoleEnAttente() {
  return useQuery({
    queryKey: ['demandes-calendrier-ecole-en-attente'],
    queryFn: fetchDemandesCalendrierEcoleEnAttente,
  });
}

export function useEnvoyerDemandeCalendrierEcole(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (diffs: { date: string; action: ActionJourCalendrierEcole }[]) =>
      envoyerDemandeCalendrierEcole({ profileId: profileId as string, diffs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demande-calendrier-ecole-en-attente', profileId] });
      queryClient.invalidateQueries({ queryKey: ['demandes-calendrier-ecole-en-attente'] });
    },
  });
}

/** Validation/refus d'une demande par l'admin — `traitePar` doit être l'id du vrai utilisateur
 * connecté, RLS vérifie auth.uid() (même règle que pour les congés). Si validée, applique les
 * diffs à `jours_ecole_alternant` avant de marquer la demande "validee" (best-effort par ligne :
 * un ajout déjà présent ou une suppression déjà absente ne doit jamais faire échouer le reste). */
export function useTraiterDemandeCalendrierEcole(traitePar: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = (profileId: string) => {
    queryClient.invalidateQueries({ queryKey: ['demande-calendrier-ecole-en-attente', profileId] });
    queryClient.invalidateQueries({ queryKey: ['demandes-calendrier-ecole-en-attente'] });
    queryClient.invalidateQueries({ queryKey: ['jours-ecole', profileId] });
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'jours-ecole-periode' });
  };

  return useMutation({
    mutationFn: async ({ demande, jours, statut }: DemandeAvecJours & { statut: 'validee' | 'refusee' }) => {
      if (statut === 'validee') {
        for (const jour of jours) {
          if (jour.action === 'ajout') await ajouterJourEcole(demande.profile_id, jour.date);
          else await supprimerJourEcoleParDate(demande.profile_id, jour.date);
        }
      }
      await traiterDemandeCalendrierEcole({ id: demande.id, statut, traitePar: traitePar as string });
    },
    onSuccess: (_data, { demande }) => invalidate(demande.profile_id),
  });
}
