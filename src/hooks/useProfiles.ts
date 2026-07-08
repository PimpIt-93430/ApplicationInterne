import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { assignerPopUp, fetchActiveProfiles } from '@/api/profiles';

export function useActiveProfiles() {
  return useQuery({ queryKey: ['profiles-actifs'], queryFn: fetchActiveProfiles });
}

export function useAssignerPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { profileId: string; popUpId: string | null }) =>
      assignerPopUp(params.profileId, params.popUpId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles-actifs'] }),
  });
}
