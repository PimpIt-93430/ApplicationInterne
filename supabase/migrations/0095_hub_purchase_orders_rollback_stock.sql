-- Cf. retour utilisateur du 2026-09-05 : refonte de l'écran "Commandes fournisseurs" du Hub — à
-- la réception, on demande maintenant explicitement si le stock local doit être incrémenté (au
-- lieu de le faire systématiquement), avec possibilité de revenir en arrière (décrémenter une
-- commande déjà incrémentée, ou l'incrémenter a posteriori si elle a été reçue sans). Cette colonne
-- traque l'état courant de cet incrément, indépendamment du statut "reçue" de la commande.
alter table public.hub_purchase_orders
  add column stock_incremente boolean not null default false;
