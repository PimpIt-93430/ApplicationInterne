import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchVentesSumupLignesPeriode, fetchVentesSumupPeriode, synchroniserVentesSumup } from '@/api/ventesSumup';

export function useVentesSumupPeriode(dateDebut: string, dateFin: string) {
  return useQuery({
    queryKey: ['ventes-sumup-periode', dateDebut, dateFin],
    queryFn: () => fetchVentesSumupPeriode(dateDebut, dateFin),
  });
}

export function useVentesSumupLignesPeriode(dateDebut: string, dateFin: string) {
  return useQuery({
    queryKey: ['ventes-sumup-lignes-periode', dateDebut, dateFin],
    queryFn: () => fetchVentesSumupLignesPeriode(dateDebut, dateFin),
  });
}

export function useSynchroniserVentesSumup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: synchroniserVentesSumup,
    onSuccess: () =>
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'ventes-sumup-periode' || q.queryKey[0] === 'ventes-sumup-lignes-periode',
      }),
  });
}
