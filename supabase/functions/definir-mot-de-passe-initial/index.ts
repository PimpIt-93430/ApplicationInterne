// Écran "Première connexion" (app/(auth)/premiere-connexion.tsx) : la personne entre l'email
// que l'admin a déjà saisi lors de la création de son compte (cf. inviter-employe) et choisit son
// mot de passe elle-même — pas d'email envoyé, pas de lien à cliquer. Endpoint volontairement
// PUBLIC (pas de session à ce stade), donc protégé uniquement par un garde-fou : n'autorise à
// définir un mot de passe QUE si le compte ne s'est encore jamais connecté (`last_sign_in_at`
// null) — une fois activé, cet endpoint refuse, pour qu'il ne devienne pas un moyen de prendre la
// main sur un compte déjà utilisé en devinant juste son email.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const enTetesCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reponseJson(corps: unknown, status: number) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...enTetesCors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: enTetesCors });
  }
  if (req.method !== 'POST') {
    return reponseJson({ error: 'Méthode non autorisée' }, 405);
  }

  const body = await req.json().catch(() => null);
  const email: string | undefined = body?.email?.trim().toLowerCase();
  const password: string | undefined = body?.password;
  if (!email || !password) {
    return reponseJson({ error: 'email et password requis' }, 400);
  }
  if (password.length < 6) {
    return reponseJson({ error: 'Le mot de passe doit faire au moins 6 caractères.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clientAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: profil, error: erreurProfil } = await clientAdmin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (erreurProfil || !profil) {
    return reponseJson({ error: 'Aucun compte ne correspond à cet email.' }, 404);
  }

  const { data: utilisateur, error: erreurUtilisateur } = await clientAdmin.auth.admin.getUserById(
    profil.id,
  );
  if (erreurUtilisateur || !utilisateur.user) {
    return reponseJson({ error: 'Aucun compte ne correspond à cet email.' }, 404);
  }
  if (utilisateur.user.last_sign_in_at) {
    return reponseJson(
      { error: 'Ce compte a déjà été activé — connecte-toi avec ton mot de passe, ou contacte un admin.' },
      409,
    );
  }

  const { error: erreurMaj } = await clientAdmin.auth.admin.updateUserById(profil.id, { password });
  if (erreurMaj) {
    return reponseJson({ error: erreurMaj.message }, 400);
  }

  return reponseJson({ ok: true }, 200);
});
