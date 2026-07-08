// Script à usage unique (admin) : crée des comptes auth.users en masse via l'API admin
// Supabase. Le trigger `handle_new_user` crée automatiquement la ligne `profiles`
// correspondante ; ce script met ensuite à jour role/type_contrat/pop_up_id dessus.
//
// Usage (PowerShell) :
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="xxxx"
//   node scripts/bulk-create-profiles.mjs

import { createClient } from '@supabase/supabase-js';

const MOT_DE_PASSE_TEMPORAIRE = 'PimpIt2026!';

const personnes = [
  {
    nom_complet: "Luidji d'Arthur",
    email: 'mon.lulu.972@gmail.com',
    role: 'admin',
    type_contrat: 'manager',
  },
  {
    nom_complet: 'Hugo Radas',
    email: 'hugo.rds@yahoo.com',
    role: 'admin',
    type_contrat: 'manager',
  },
  {
    nom_complet: 'Namory Bamba',
    email: 'namory.bamba@pimpit.temp',
    role: 'employe',
    type_contrat: 'alternant',
  },
  {
    nom_complet: 'Louise Gagliardi',
    email: 'louise.gagliardi@yahoo.fr',
    role: 'employe',
    type_contrat: 'alternant',
  },
];

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis dans l\'environnement.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const personne of personnes) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: personne.email,
    password: MOT_DE_PASSE_TEMPORAIRE,
    email_confirm: true,
    user_metadata: { nom_complet: personne.nom_complet },
  });

  if (error) {
    console.error(`Échec création ${personne.nom_complet} (${personne.email}) :`, error.message);
    continue;
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: personne.role, type_contrat: personne.type_contrat })
    .eq('id', data.user.id);

  if (updateError) {
    console.error(`Compte créé mais échec mise à jour profil pour ${personne.nom_complet} :`, updateError.message);
    continue;
  }

  console.log(`OK : ${personne.nom_complet} (${personne.email}) — role=${personne.role}, type_contrat=${personne.type_contrat}`);
}

console.log(`\nMot de passe temporaire pour tous les comptes créés : ${MOT_DE_PASSE_TEMPORAIRE}`);
