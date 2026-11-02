import { useQuery } from '@tanstack/react-query';

import { fetchCaJourShopify } from '@/api/caJour';

/** `enabled: false` pour un non-admin : la fonction ca-jour-shopify est réservée aux admins. */
export function useCaJourShopify(enabled = true) {
  return useQuery({ queryKey: ['ca-jour-shopify'], queryFn: fetchCaJourShopify, enabled });
}
