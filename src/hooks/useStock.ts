import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  ajusterStockGeneral,
  annulerCommande,
  attribuerPinsACase,
  basculerCommandePin,
  basculerLigneCommande,
  basculerLigneCommandeFaite,
  basculerToutesLignesCommande,
  creerPin,
  envoyerCommande,
  fetchAttributionsPins,
  fetchCommandeActivePopUp,
  fetchCommandeDetail,
  fetchCommandesEnAttenteLocal,
  fetchCommandesTerminees,
  fetchDerniersRemplissages,
  fetchGrillePopUp,
  fetchMouvements,
  fetchPins,
  fetchRemplissagesDepuisDerniereCommande,
  marquerCommandeRecue,
  modifierPin,
  peserStockGeneral,
  retirerPinDeCase,
  signalerPinInconnu,
  supprimerRemplissage as supprimerRemplissageApi,
  validerCommandePrete,
  validerRemplissageBoite,
  type CommandeAvecLignes,
} from '@/api/stock';
import { supabase } from '@/api/supabaseClient';
import type { StockPin } from '@/types/database.types';

export function usePins() {
  return useQuery({ queryKey: ['stock-pins'], queryFn: fetchPins });
}

// Un alternant compte une boîte sur son pop-up depuis son propre appareil : sans abonnement temps
// réel, l'admin qui a déjà l'écran Stock ouvert sur ce pop-up ne voit rien passer tant qu'il ne
// rouvre pas l'écran (react-query ne sait pas qu'une donnée a changé ailleurs).
export function useGrillePopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['stock-grille', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`stock-grille-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pop_up_pin_boites', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchGrillePopUp(popUpId as string),
    enabled: !!popUpId,
  });
}

export function useMouvements(params: { pinId?: string; popUpId?: string }) {
  return useQuery({
    queryKey: ['stock-mouvements', params.pinId, params.popUpId],
    queryFn: () => fetchMouvements(params),
    enabled: !!(params.pinId || params.popUpId),
  });
}

// Dernier remplissage connu par case (affiché sous "Valider le remplissage" dans l'écran de case).
export function useDerniersRemplissages(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['stock-remplissages', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`stock-remplissages-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pop_up_boite_remplissages', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchDerniersRemplissages(popUpId as string),
    enabled: !!popUpId,
  });
}

// Historique des remplissages pour l'onglet Rapport, groupé par jour côté UI — repart de zéro à
// chaque commande envoyée (cf. fetchRemplissagesDepuisDerniereCommande), sans rien supprimer en
// base.
export function useRemplissages(popUpId: string | undefined) {
  return useQuery({
    queryKey: ['stock-remplissages-historique', popUpId],
    queryFn: () => fetchRemplissagesDepuisDerniereCommande(popUpId as string),
    enabled: !!popUpId,
  });
}

// Historique des commandes d'un pop-up (date + nombre de pins), pour l'onglet "Historique".
export function useCommandesTerminees(popUpId: string | undefined) {
  return useQuery({
    queryKey: ['stock-commandes-terminees', popUpId],
    queryFn: () => fetchCommandesTerminees(popUpId as string),
    enabled: !!popUpId,
  });
}

// Commande en cours (pas encore reçue) de ce pop-up — sert au statut affiché dans Rapport
// (envoyée / prête à récupérer). Realtime sur commandes_pop_up filtré par pop-up : le pop-up voit
// le passage à "prête" dès que le local valide, sans recharger l'écran.
export function useCommandeActivePopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['stock-commande-active', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`stock-commande-active-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commandes_pop_up', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchCommandeActivePopUp(popUpId as string),
    enabled: !!popUpId,
  });
}

// Onglet "Commandes" du Local : toutes les commandes envoyées ou prêtes, tous pop-ups confondus.
export function useCommandesEnAttenteLocal() {
  const queryClient = useQueryClient();
  const queryKey = ['stock-commandes-local'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`stock-commandes-local-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes_pop_up' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchCommandesEnAttenteLocal });
}

// Détail d'une commande en préparation (écran du local) : photo/sku/poids/stock restant par pin,
// coché "fait" au fil des pesées.
export function useCommandeDetail(commandeId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['stock-commande-detail', commandeId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!commandeId) return;
    const channel = supabase
      .channel(`stock-commande-detail-${commandeId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'commande_lignes', filter: `commande_id=eq.${commandeId}` },
        (payload) => {
          // Patch ciblé de la ligne modifiée plutôt qu'invalidate : évite de re-fetcher (et donc
          // re-rendre toute la liste, photos comprises) à chaque coche — c'était la source du lag
          // signalé sur l'écran de préparation.
          const nouvelleLigne = payload.new as { id: string; fait: boolean };
          queryClient.setQueryData<(CommandeAvecLignes & { popUpNom: string }) | undefined>(
            queryKey,
            (old) =>
              old
                ? {
                    ...old,
                    lignes: old.lignes.map((l) =>
                      l.id === nouvelleLigne.id ? { ...l, fait: nouvelleLigne.fait } : l,
                    ),
                  }
                : old,
          );
        },
      )
      .on(
        // INSERT/DELETE de lignes n'arrive jamais dans ce flux (les lignes sont figées à la
        // création de la commande) — invalidate en secours si ça arrivait quand même.
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'commande_lignes', filter: `commande_id=eq.${commandeId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'commande_lignes', filter: `commande_id=eq.${commandeId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [commandeId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchCommandeDetail(commandeId as string),
    enabled: !!commandeId,
  });
}

// Vue d'ensemble (catalogue) : quelles cases contiennent déjà chaque pin, tous pop-ups confondus.
// Sans filtre de pop-up, donc abonnement realtime global sur la table plutôt que par lieu.
export function useAttributionsPins() {
  const queryClient = useQueryClient();
  const queryKey = ['stock-attributions-pins'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`stock-attributions-pins-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pop_up_pin_boites' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchAttributionsPins });
}

export function useGererCasesPopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateGrille = () => queryClient.invalidateQueries({ queryKey: ['stock-grille', popUpId] });

  const attribuer = useMutation({
    mutationFn: (params: {
      casePosition: string;
      pinIdsActuels: string[];
      pinIdsVoulus: string[];
      profileId: string;
    }) => attribuerPinsACase({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidateGrille,
  });

  const retirer = useMutation({
    mutationFn: (params: { casePosition: string; pinId: string }) =>
      retirerPinDeCase({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidateGrille,
  });

  const basculerCommande = useMutation({
    mutationFn: (params: { boiteId: string; aCommander: boolean; profileId: string }) =>
      basculerCommandePin(params),
    onSuccess: invalidateGrille,
  });

  const validerRemplissage = useMutation({
    mutationFn: (params: { casePosition: string; profileId: string }) =>
      validerRemplissageBoite({ popUpId: popUpId as string, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages', popUpId] });
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages-historique', popUpId] });
    },
  });

  const supprimerRemplissage = useMutation({
    mutationFn: (id: string) => supprimerRemplissageApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages', popUpId] });
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages-historique', popUpId] });
    },
  });

  return {
    attribuer,
    retirer,
    basculerCommande,
    validerRemplissage,
    supprimerRemplissage,
  };
}

// Côté pop-up (onglet Rapport) : envoyer une commande au local, puis confirmer sa réception une
// fois récupérée.
export function useGererCommandePopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateActive = () =>
    queryClient.invalidateQueries({ queryKey: ['stock-commande-active', popUpId] });

  const envoyer = useMutation({
    mutationFn: (params: { profileId: string; pinIds: string[] }) =>
      envoyerCommande({ popUpId: popUpId as string, ...params }),
    onSuccess: () => {
      invalidateActive();
      // La commande envoyée devient la nouvelle référence "depuis" du rapport : le remet à zéro.
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages-historique', popUpId] });
      queryClient.invalidateQueries({ queryKey: ['stock-commandes-terminees', popUpId] });
    },
  });

  const marquerRecue = useMutation({
    mutationFn: (params: { commandeId: string; profileId: string }) =>
      marquerCommandeRecue({ popUpId: popUpId as string, ...params }),
    onSuccess: () => {
      invalidateActive();
      queryClient.invalidateQueries({ queryKey: ['stock-grille', popUpId] });
      queryClient.invalidateQueries({ queryKey: ['stock-commandes-terminees', popUpId] });
    },
  });

  // Annule une commande envoyée par erreur ou pas finie — tant que le local ne l'a pas prise en
  // charge (RLS migration 0042). Les pins restent "à commander" (invalidation de la grille pour que
  // ça se voie tout de suite si l'écran était déjà ouvert ailleurs).
  const annuler = useMutation({
    mutationFn: (commandeId: string) => annulerCommande(commandeId),
    onSuccess: () => {
      invalidateActive();
      queryClient.invalidateQueries({ queryKey: ['stock-grille', popUpId] });
      queryClient.invalidateQueries({ queryKey: ['stock-commandes-terminees', popUpId] });
    },
  });

  // Coche/décoche un pin d'une commande déjà envoyée, enregistré tout de suite (pas seulement au
  // clic sur un bouton "Mettre à jour") — si la personne quitte le panneau par erreur en cours de
  // route, rien n'est perdu : chaque coche est déjà sauvegardée. Seulement possible tant que la
  // commande est encore "envoyee" côté base (RLS, migration 0042) : verrouillé dès que le local
  // valide.
  const basculerLigne = useMutation({
    mutationFn: (params: { commandeId: string; pinId: string; inclus: boolean }) =>
      basculerLigneCommande(params),
    onSuccess: invalidateActive,
  });

  return { envoyer, marquerRecue, basculerLigne, annuler };
}

// Côté local : préparer une commande (cocher/peser pin par pin), puis la valider comme prête.
export function useGererPreparationCommande() {
  const queryClient = useQueryClient();

  // Patch direct du cache (pas d'invalidate) : la coche doit réagir instantanément, pas attendre
  // un aller-retour réseau — le realtime patchera pareil à la confirmation serveur (idempotent).
  const patchLigneFait = (commandeId: string, ligneId: string, fait: boolean) => {
    queryClient.setQueryData<(CommandeAvecLignes & { popUpNom: string }) | undefined>(
      ['stock-commande-detail', commandeId],
      (old) =>
        old
          ? { ...old, lignes: old.lignes.map((l) => (l.id === ligneId ? { ...l, fait } : l)) }
          : old,
    );
  };

  const basculerFait = useMutation({
    mutationFn: (params: { ligneId: string; commandeId: string; fait: boolean }) =>
      basculerLigneCommandeFaite(params.ligneId, params.fait),
    onMutate: (params) => patchLigneFait(params.commandeId, params.ligneId, params.fait),
    onError: (_err, params) => patchLigneFait(params.commandeId, params.ligneId, !params.fait),
  });

  const basculerTout = useMutation({
    mutationFn: (params: { commandeId: string; fait: boolean }) =>
      basculerToutesLignesCommande(params.commandeId, params.fait),
    onMutate: (params) => {
      queryClient.setQueryData<(CommandeAvecLignes & { popUpNom: string }) | undefined>(
        ['stock-commande-detail', params.commandeId],
        (old) => (old ? { ...old, lignes: old.lignes.map((l) => ({ ...l, fait: params.fait })) } : old),
      );
    },
    onError: (_err, params) => {
      queryClient.invalidateQueries({ queryKey: ['stock-commande-detail', params.commandeId] });
    },
  });

  const validerPrete = useMutation({
    mutationFn: (params: {
      commandeId: string;
      popUpId: string;
      profileId: string;
      lignes: { pinId: string; fait: boolean }[];
    }) => validerCommandePrete(params),
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: ['stock-commandes-local'] });
      queryClient.invalidateQueries({ queryKey: ['stock-commande-detail', params.commandeId] });
      queryClient.invalidateQueries({ queryKey: ['stock-commande-active', params.popUpId] });
      queryClient.invalidateQueries({ queryKey: ['stock-commandes-terminees', params.popUpId] });
    },
  });

  return { basculerFait, basculerTout, validerPrete };
}

export function useGererCatalogue() {
  const queryClient = useQueryClient();
  // Le catalogue (stock-pins) n'est pas la seule vue à contenir les pins : la grille des boîtes
  // (stock-grille) embarque le pin complet dans chaque case (contenu.pin) — sans cette
  // invalidation, éditer le poids/seuil/taille depuis le catalogue laisse l'écran de pesée avec
  // les anciennes valeurs tant que la grille n'est pas rechargée par un autre moyen.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-pins'] });
    queryClient.invalidateQueries({ queryKey: ['stock-grille'] });
  };

  const creer = useMutation({
    mutationFn: (params: Parameters<typeof creerPin>[0]) => creerPin(params),
    onSuccess: invalidate,
  });

  const modifier = useMutation({
    mutationFn: ({ id, params }: { id: string; params: Partial<StockPin> }) => modifierPin(id, params),
    onSuccess: invalidate,
  });

  const ajusterStock = useMutation({
    mutationFn: (params: { pinId: string; delta: number; note: string; profileId: string }) =>
      ajusterStockGeneral(params),
    onSuccess: invalidate,
  });

  const peser = useMutation({
    mutationFn: (params: { pinId: string; popUpLocalId: string; poidsPese: number; profileId: string }) =>
      peserStockGeneral(params),
    onSuccess: invalidate,
  });

  const signaler = useMutation({
    mutationFn: (params: { photoUrl: string; note?: string }) => signalerPinInconnu(params),
    onSuccess: invalidate,
  });

  return { creer, modifier, ajusterStock, peser, signaler };
}
