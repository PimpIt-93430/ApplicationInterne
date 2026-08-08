-- `poids_unitaire` était jusqu'ici saisi/interprété comme le poids d'un lot de 10 pins (convention
-- côté app pour plus de précision au pesage) — retour utilisateur : source de confusion, le poids
-- doit toujours être celui d'une seule unité. On convertit les valeurs déjà en base en conséquence
-- (le code applicatif ne fait plus aucune conversion ×10/÷10, cf. StockScreen.tsx/api/stock.ts).
update public.stock_pins
set poids_unitaire = poids_unitaire / 10
where poids_unitaire is not null;
