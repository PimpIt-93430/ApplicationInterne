import { useQuery } from '@tanstack/react-query';

import { fetchCaJourShopify } from '@/api/caJour';

export function useCaJourShopify() {
  return useQuery({ queryKey: ['ca-jour-shopify'], queryFn: fetchCaJourShopify });
}
