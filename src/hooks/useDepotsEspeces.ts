import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ajouterDepotEspece, fetchDepotsEspeces, supprimerDepotEspece } from '@/api/depotsEspeces';

export function useDepotsEspeces() {
  return useQuery({ queryKey: ['depots-especes'], queryFn: fetchDepotsEspeces });
}

export function useGererDepotsEspeces() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['depots-especes'] });

  const ajouter = useMutation({
    mutationFn: ajouterDepotEspece,
    onSuccess: invalidate,
  });

  const supprimer = useMutation({
    mutationFn: supprimerDepotEspece,
    onSuccess: invalidate,
  });

  return { ajouter, supprimer };
}
