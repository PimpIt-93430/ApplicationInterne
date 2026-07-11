-- stock_a_ramener passe de manuel à calculé automatiquement à chaque comptage (côté app, cf.
-- recalculerStockARamener dans src/api/stock.ts) : la somme, sur toutes les cases d'un pin, du
-- manque par rapport à son seuil cible. Ce backfill couvre les comptages déjà enregistrés avant
-- ce changement — sans lui, le rapport resterait vide tant que chaque case n'est pas recomptée.
update public.stock_pins p
set stock_a_ramener = coalesce(
  (
    select round(sum(greatest(0, p.seuil_cible - quantite.valeur)))
    from public.pop_up_pin_boites b
    cross join lateral (
      select coalesce(
        b.quantite_restante,
        case when b.pourcentage_restant is not null then (b.pourcentage_restant / 100.0) * p.seuil_cible end
      ) as valeur
    ) quantite
    where b.pin_id = p.id and quantite.valeur is not null
  ),
  0
)
where p.seuil_cible is not null and p.seuil_cible > 0;

update public.stock_pins
set stock_a_ramener = 0
where seuil_cible is null or seuil_cible <= 0;
