-- Cf. discussion 2026-08-29 : "il me faut absolument le lien de suivi" — Boxtal ne génère pas
-- toujours le numéro de suivi tout de suite à la création de l'étiquette. Ce champ garde l'id du
-- fulfillment Shopify créé (fulfillmentCreateV2, sans suivi si pas encore prêt) pour pouvoir lui
-- pousser le suivi plus tard, dès qu'il devient disponible côté Boxtal (cf. "Vérifier les
-- livraisons" dans le Hub, qui repousse alors le suivi vers Shopify via fulfillmentTrackingInfoUpdateV2).
alter table public.expeditions_boxtal
  add column fulfillment_shopify_id text;
