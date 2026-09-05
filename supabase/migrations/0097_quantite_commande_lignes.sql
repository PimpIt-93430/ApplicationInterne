-- Cf. retour utilisateur du 2026-09-05 : "a chaque fois que le local envoie une commande a un pop
-- up il faut que le pin's soit décrémenté de 100 200 ou 300 ou met 100 par defaut" — commande_lignes
-- (Hub, app/(hub)/stock/pins) ne trackait jusqu'ici que "ce pin fait-il partie de l'envoi ?" (booléen
-- `fait`), jamais de quantité. Ajout d'une quantité par ligne, 100 par défaut (palier +100 côté UI).
alter table public.commande_lignes
  add column quantite integer not null default 100;
