# Configuration Supabase

Ces migrations ne sont pas encore appliquées automatiquement (pas de CLI Supabase en V1).
À faire une seule fois, dans le tableau de bord Supabase du projet :

1. Ouvrir **SQL Editor** dans le projet Supabase.
2. Coller puis exécuter le contenu de `migrations/0001_init_schema.sql`.
3. Coller puis exécuter le contenu de `migrations/0002_rls_policies.sql`.
4. Coller puis exécuter le contenu de `migrations/0003_multi_popup.sql` (ajoute les 3 pop-ups, les congés, le calendrier d'alternance, les notifications).
5. Coller puis exécuter le contenu de `migrations/0004_rls_multi_popup.sql`.
6. Coller puis exécuter le contenu de `migrations/0005_fix_profile_trigger.sql` (corrige un bug : sans ça, changer un `role` en `admin` depuis le SQL Editor est silencieusement annulé).
7. Coller puis exécuter le contenu de `migrations/0006_popup_roster.sql`, `migrations/0007_conges_horaires.sql`, `migrations/0008_stock.sql`, `migrations/0009_stock_pins_photos.sql`, `migrations/0010_stock_pins_stock_a_ramener.sql`, `migrations/0011_stock_boites_multi_pins.sql` puis `migrations/0012_stock_pourcentage_restant.sql` (ajoute le catalogue de pins, les casiers par pop-up A1-G3 pouvant contenir plusieurs pins chacun, l'historique des mouvements de stock, le bucket Storage pour les photos, la quantité à ramener par pin, la pesée par pin dans chaque case, et l'estimation en pourcentage quand il n'y a plus de sac à peser).
8. Dans **Authentication > Providers**, vérifier que "Email" est activé (c'est le cas par défaut).
9. Dans **Authentication > Settings**, désactiver "Confirm email" pour l'instant si vous voulez tester rapidement sans boîte mail (à réactiver avant un usage réel).
10. Créer un premier compte depuis l'app (écran "Créer un compte"), puis dans **Table Editor > profiles**, changer manuellement le champ `role` de ce compte à `admin` (le trigger crée tout le monde en `employe` par défaut). Changer aussi `type_contrat` (`manager`/`employe`/`alternant`) selon la personne.
11. Pour récupérer le catalogue existant de pins depuis Airtable plutôt que de le ressaisir à la main, coller puis exécuter le contenu de `scripts/seed-stock-pins.sql` (généré depuis Airtable, aucune clé nécessaire).
12. Pour récupérer les photos des pins (pas incluses dans l'étape précédente : les URLs Airtable expirent), exécuter une fois en local `scripts/import-stock-photos.mjs` (voir l'en-tête du script pour les variables d'environnement nécessaires — il faut un token d'accès personnel Airtable, créé sur airtable.com/create/tokens avec le scope `data.records:read` et l'accès à la base "Gestion du stock").
13. Coller puis exécuter le contenu de `migrations/0013_pop_up_local.sql` (ajoute la notion de "local", le lieu permanent) puis `migrations/0014_horaires_recurrents_profil.sql` (ajoute l'horaire récurrent par personne utilisé par la génération automatique du planning, et supprime les anciennes tables `disponibilites`, `regles_effectifs_creneau`, `regles_globales` — jamais éditables depuis aucun écran).

Après ça, l'app est utilisable avec un compte admin et des comptes employés/alternants sur les 3 pop-ups.

**Important** : les migrations ne s'appliquent jamais automatiquement (voir la note en haut de ce fichier). Après l'ajout d'une nouvelle migration au dépôt, il faut systématiquement la coller à la main dans le SQL Editor Supabase avant que la fonctionnalité correspondante ne marche dans l'app — sinon les écrans qui en dépendent échouent silencieusement.
