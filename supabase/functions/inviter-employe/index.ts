// Crée un nouveau compte employé (accessible uniquement aux admins), immédiatement et sans envoi
// d'email, via l'API Admin de Supabase Auth, qui nécessite la clé de service (jamais exposée au
// client — cf. commentaire dans src/api/supabaseClient.ts). Le trigger `handle_new_user` déjà en
// place crée automatiquement la ligne `profiles` correspondante. La personne pourra se connecter
// plus tard via "Mot de passe oublié" une fois qu'un accès lui sera nécessaire.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Obligatoire pour un appel depuis le navigateur (l'écran Équipe web) : sans ces en-têtes, le
// navigateur bloque la requête au niveau CORS avant même qu'elle atteigne la fonction, ce qui
// remonte côté client comme "Failed to send a request to the Edge Function".
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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return reponseJson({ error: 'Non authentifié' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Client avec le jeton de l'appelant, uniquement pour vérifier qui il est — ne sert jamais à
  // créer l'utilisateur (ça, c'est le rôle exclusif du client service ci-dessous).
  const clientAppelant = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: erreurUser,
  } = await clientAppelant.auth.getUser();
  if (erreurUser || !user) {
    return reponseJson({ error: 'Non authentifié' }, 401);
  }

  const { data: profil, error: erreurProfil } = await clientAppelant
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (erreurProfil || profil?.role !== 'admin') {
    return reponseJson({ error: 'Réservé aux administrateurs' }, 403);
  }

  const body = await req.json().catch(() => null);
  const email: string | undefined = body?.email;
  const nomComplet: string | undefined = body?.nom_complet;
  const role: string | undefined = body?.role;
  const typeContrat: string | undefined = body?.type_contrat;
  if (!email || !nomComplet) {
    return reponseJson({ error: 'email et nom_complet requis' }, 400);
  }

  const clientAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await clientAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { nom_complet: nomComplet },
  });
  if (error) {
    return reponseJson({ error: error.message }, 400);
  }

  // handle_new_user vient de créer la ligne profiles avec les valeurs par défaut
  // (role 'employe', type_contrat 'employe') ; on les ajuste si l'admin a choisi autre chose.
  if (data.user && (role || typeContrat)) {
    await clientAdmin
      .from('profiles')
      .update({ ...(role ? { role } : {}), ...(typeContrat ? { type_contrat: typeContrat } : {}) })
      .eq('id', data.user.id);
  }

  return reponseJson({ id: data.user?.id }, 200);
});
