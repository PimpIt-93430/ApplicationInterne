import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { definirSumupEmailPopUp, fetchSumupEmailsPopUp, supprimerSumupEmailPopUp } from '@/api/sumupEmailsPopUp';

export function useSumupEmailsPopUp() {
  return useQuery({ queryKey: ['sumup-emails-pop-up'], queryFn: fetchSumupEmailsPopUp });
}

export function useGererSumupEmailsPopUp() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sumup-emails-pop-up'] });

  const definir = useMutation({
    mutationFn: (params: { email: string; popUpId: string }) =>
      definirSumupEmailPopUp(params.email, params.popUpId),
    onSuccess: invalidate,
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerSumupEmailPopUp(id),
    onSuccess: invalidate,
  });

  return { definir, supprimer };
}
