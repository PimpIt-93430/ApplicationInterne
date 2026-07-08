import { useQuery } from '@tanstack/react-query';

import { fetchDisponibilitesEquipeSemaine } from '@/api/disponibilites';

export function useDisponibilitesEquipeSemaine(dateDebut: string, dateFin: string) {
  return useQuery({
    queryKey: ['disponibilites-equipe', dateDebut, dateFin],
    queryFn: () => fetchDisponibilitesEquipeSemaine(dateDebut, dateFin),
  });
}
