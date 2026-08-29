-- Cf. discussion 2026-08-29 : migration Boxtal → Sendcloud. La nouvelle Edge Function
-- envoyer-suivis-sendcloud (remplace envoyer-suivis-boxtal) a besoin des identifiants Sendcloud
-- (mêmes que Pimp It Hub/.env.local : SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY) via
-- get_vault_secret, même mécanisme que les secrets Boxtal/Shopify existants (cf. migration 0082).
--
-- Les valeurs elles-mêmes ne sont volontairement PAS dans ce fichier — posées directement en
-- session via vault.create_secret(valeur, nom). Noms posés (déjà faits, pas à refaire) :
--   sendcloud_public_key, sendcloud_secret_key
select 1; -- migration "marqueur" — rien à appliquer, la logique réelle est en 0087 (cron)
