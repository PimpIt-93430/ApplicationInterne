import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  definirQuantiteARamener,
  fetchChaussuresStock,
  incrementerQuantiteARamener,
  validerReapprovisionnementChaussures,
} from '@/api/chaussures';
import { supabase } from '@/api/supabaseClient';

export function useChaussuresStock() {
  const queryClient = useQueryClient();
  const queryKey = ['chaussures-stock'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`chaussures-stock-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chaussures_stock' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchChaussuresStock });
}

export function useGererChaussures() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['chaussures-stock'] });

  const definirQuantite = useMutation({
    mutationFn: (params: { id: string; quantite: number }) =>
      definirQuantiteARamener(params.id, params.quantite),
    onSuccess: invalidate,
  });

  const validerReappro = useMutation({
    mutationFn: () => validerReapprovisionnementChaussures(),
    onSuccess: invalidate,
  });

  const incrementerVendue = useMutation({
    mutationFn: (id: string) => incrementerQuantiteARamener(id),
    onSuccess: invalidate,
  });

  return { definirQuantite, validerReappro, incrementerVendue };
}
