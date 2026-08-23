-- La description d'une ligne produit SumUp (distincte du nom) peut porter la variante choisie à la
-- vente (ex. "36-37 · Gris" pour "Clogs") — pas capturée jusqu'ici, alors qu'elle pourrait suffire
-- à déduire couleur/taille automatiquement sans mapping manuel (cf. sync-ventes-sumup, passe de
-- réparation qui backfille les lignes déjà écrites sans ce champ).
alter table public.ventes_sumup_lignes add column if not exists description text;
