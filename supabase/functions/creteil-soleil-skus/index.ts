// Sert au site admin Shopify (commandes fournisseur, mode "Pop-up store") pour étiqueter et
// remonter en haut les pins déjà attribués à une case du pop-up Créteil Soleil. Le site admin
// est un serveur Node séparé sans session Supabase — la clé anon (publique, déjà dans l'appli
// mobile) suffit comme JWT d'authentification, la lecture réelle passe par le rôle service pour
// contourner la RLS (qui exige normalement un utilisateur connecté).
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
  if (req.method === 'OPTIONS') return new Response(null, { headers: enTetesCors });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client = createClient(supabaseUrl, serviceRoleKey);

  const { data: popUp, error: erreurPopUp } = await client
    .from('pop_ups')
    .select('id')
    .ilike('nom', 'Creteil%')
    .maybeSingle();
  if (erreurPopUp) return reponseJson({ error: erreurPopUp.message }, 500);
  if (!popUp) return reponseJson({ skus: [] }, 200);

  const { data, error } = await client
    .from('pop_up_pin_boites')
    .select('pin:stock_pins(sku_pimpit)')
    .eq('pop_up_id', popUp.id);
  if (error) return reponseJson({ error: error.message }, 500);

  const skus = [
    ...new Set(
      (data ?? [])
        .map((r) => (r as unknown as { pin: { sku_pimpit: string | null } | null }).pin?.sku_pimpit)
        .filter((s): s is string => !!s),
    ),
  ];
  return reponseJson({ skus }, 200);
});
