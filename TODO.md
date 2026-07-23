# À faire

Note de suivi — ajoutez vos idées/tâches ici au fil de l'eau, on les traite ensemble quand vous êtes prêt.


### Tableau RH (absences / heures / paie)

Décisions prises (2026-07-22) :
- Heures travaillées = heures planifiées (les shifts du calendrier), moins une pause déductible.
- Congés : comptage simple des jours pris (pas de solde acquis/pris pour l'instant).
- Paie : estimation interne (heures × taux horaire), pas d'export comptable pour l'instant.

Tâches :
- [ ] Ajouter un champ "pause" sur le shift (`planning_shifts`) — durée déductible des heures
      travaillées (ex. 1h de pause sur un 10h-19h → 8h comptées). À faire : migration + champ dans
      le formulaire de création de shift (`PanneauCreationShift.tsx`) + `TimelineJour`/mobile.
- [ ] Ajouter un taux horaire (ou salaire fixe pour les contrats mensualisés) par employé —
      nouveau champ, probablement dans `informations_rh` ou `profiles`.
- [ ] Calcul des heures travaillées sur une période (semaine/mois) = somme des shifts moins pauses.
      Réutiliser/adapter `totalHeuresTravaillees` (`src/utils/dateUtils.ts:73`), qui aujourd'hui
      calcule des heures *planifiées* sans tenir compte d'une pause.
- [ ] Comptage des jours de congé/indisponibilité pris sur la période (déjà en base via `conges`,
      juste besoin d'agréger — pas d'agrégation existante aujourd'hui).
- [ ] Estimation de paie = heures travaillées × taux horaire (ou salaire fixe affiché tel quel).
- [ ] Nouvel écran/onglet "RH" dans `equipe.web.tsx` : un tableau avec une ligne par employé
      (jours travaillés, heures travaillées, jours d'absence, estimation de paie), période
      sélectionnable (semaine/mois).

### Autres points importants pour gérer une équipe (à discuter/prioriser)

- [ ] Alerte fin de contrat / période d'essai qui approche (si CDD ou période d'essai) — pour ne
      pas oublier un renouvellement ou une confirmation. À vérifier si ces infos existent déjà dans
      `informations_rh` (`date_debut_contrat` existe, pas de date de fin/nature de contrat trouvée).
- [ ] Alerte document arrivant à expiration (autorisation de travail, visite médicale) — les champs
      existent déjà dans `informations_rh` mais rien ne les surveille aujourd'hui.
- [ ] Catégoriser les documents uploadés (contrat, pièce d'identité, RIB, diplôme...) pour repérer
      un dossier d'embauche incomplet — `documents_employe` n'a aujourd'hui qu'un nom de fichier,
      pas de type.
- [ ] Historique de sortie (date + motif) quand quelqu'un passe inactif, pour garder une trace RH.

## Pop-up

Fait (2026-07-22) :
- [x] Dates de début/fin d'un pop-up (`date_debut`/`date_fin`, migration `0032_pop_up_dates.sql`),
      éditables sur chaque fiche pop-up et à la création.
- [x] Toggle "C'est le local" retiré de l'écran (fixé une fois pour toutes, plus besoin de pouvoir
      le changer) — le champ `est_local` reste en base et continue d'être utilisé par la génération
      auto du planning.

Idées à prioriser (pas encore faites) :
- [ ] Afficher les alertes de trou de couverture (pop-up ouvert, personne dessus) — déjà calculées
      par `generationPlanning.ts` (`AlerteTrouCouverture`) mais jetées sans être affichées
      (`calendrier.tsx:679-694`, `regenerationPlanning.ts`).
- [ ] Fiche pratique du pop-up : adresse, contact (propriétaire/bailleur), accès (code alarme,
      clés), notes libres — rien de tout ça n'existe aujourd'hui sur la fiche pop-up.
- [ ] Vue d'ensemble multi-pop-up : dashboard "aujourd'hui" comparant les lieux (qui travaille où,
      alertes de couverture, stock bas) — aucun écran de ce type n'existe actuellement.
- [ ] Archivage au lieu de suppression définitive — supprimer un pop-up efface aussi son
      planning/stock historique d'un coup (`popups.tsx`).
- [ ] Suivi incidents/maintenance par pop-up (optionnel, à voir plus tard).

## Finance (SumUp)

Fait (2026-07-22) — écran `/admin/finance` en ligne :
- [x] Migration `0033_ventes_sumup.sql` : `pop_ups.lat/lon`, `informations_rh.sumup_email`, table
      `ventes_sumup` (RLS admin-only).
- [x] Edge Function `sync-ventes-sumup` : repart de la dernière vente déjà enregistrée
      (`max(horodatage)`) et ne va chercher à SumUp que ce qui est arrivé après (pas de rescan
      d'une fenêtre glissante) ; réattribue pop_up_id/profile_id sur tout l'historique à chaque
      appel (proximité GPS ≤200m, email SumUp mappé), en pur calcul local.
      **Limite connue/acceptée** : un remboursement tardif sur une vente déjà synchronisée n'est
      plus rattrapé automatiquement (on a simplifié exprès, à revoir si ça devient gênant).
- [x] Champs GPS sur la fiche pop-up (`popups.tsx`), champ "Email SumUp" dans l'onglet Contrat d'un
      salarié (`equipe.web.tsx`) — à remplir une fois les comptes salariés SumUp créés.
- [x] Écran Finance : KPI (CA, CA net, panier moyen, frais, pourboires, taux de remboursement),
      tendance quotidienne, répartitions pop-up/salarié, section ventes non attribuées, synchro
      auto à l'ouverture + bouton "Actualiser".

Reste à faire :
- [ ] **Chaque salarié doit se connecter avec son propre compte SumUp** (au lieu du compte
      partagé `team@pimpitstore.com`) — sans ça, aucune vente ne peut être attribuée à une
      personne (le `sumup_email` de sa fiche restera à `null`, elle apparaîtra en "Non attribué").
      Action à faire côté SumUp (créer les comptes salariés/"subaccounts"), pas du code.
- [ ] Remplir les coordonnées GPS de chaque pop-up (fiche pop-up) — sans ça, ses ventes restent en
      "Non attribué" côté lieu.
- [ ] Cron nocturne (au lieu de "synchro à l'ouverture + bouton") si le rythme actuel devient
      insuffisant — Supabase Cron gère Vault en interne, pas besoin d'écrire la plomberie
      pg_net/Vault à la main.

## Stock

*(rien pour l'instant)*

## Permissions granulaires (Stock / Calendrier — Finance exclue)

Fait (2026-07-22) — préalable au chantier "séparer le stock de chaque pop-up et du local" :
- [x] Migration `0034_droits_employe.sql` puis `0035_retirer_droit_finance.sql` : table
      `droits_employe` (fonctionnalite **calendrier uniquement** — Finance retirée, décision
      explicite : reste strictement réservé aux 3 admins, en permanence, aucun droit possible),
      `pop_up_id` nullable = tous les pop-up, fonctions RLS `a_droit`/`a_droit_sur_profil`, RLS
      étendues sur `planning_shifts` (lecture + écriture pour un droit calendrier scopé) et
      `conges` (lecture + écriture). `ventes_sumup` redevenue 100% admin-only (vérifié via
      `pg_policies` : une seule policy `ventes_sumup_admin`).
- [x] Onglet "Droits" dans Équipe (`equipe.web.tsx`) : lieux attribués (stock/planning, reprend
      `profil_pop_ups` existant — pas de nouveau système pour Stock) + Calendrier éditable
      (pop-up précis ou "tous"). Pas de section Finance.
- [x] Calendrier : `app/(app)/calendrier.web.tsx` — un droit calendrier affiche une vue équipe
      scopée (`VueParEmployes` + `PanneauCreationShift` réutilisés, gestion complète : créer/
      modifier/supprimer shifts et congés de l'équipe du pop-up) ; sans droit, comportement
      inchangé (planning perso uniquement). Pas de génération auto du planning dans cette vue
      (volontaire — la génération auto reste liée à l'écran admin, éviter de casser le planning
      scopé sous RLS restreinte, cf. discussion de conception).
- [x] Fiche employé (Équipe) réorganisée : les onglets (Informations/Contrat/Planification/...)
      sont maintenant au-dessus de la carte identité (avatar/nom/email/badge/lieu), qui n'apparaît
      plus que dans l'onglet Informations personnelles.

Pas encore fait :
- [ ] Tester en conditions réelles (créer un droit calendrier de test, se connecter avec ce
      compte, vérifier la vue équipe scopée de bout en bout).
- [ ] Cas limite accepté sans traitement : une personne promue admin puis rétrogradée regarde ses
      anciens `droits_employe` redevenir actifs silencieusement (pas nettoyé à la promotion).
- [ ] Étendre la gestion d'équipe scopée au mobile (`calendrier.web.tsx` est web uniquement pour
      l'instant).

## Autre

*(rien pour l'instant)*
