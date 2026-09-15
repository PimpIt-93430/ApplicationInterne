import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY doivent être définis dans .env',
  );
}

// Le typage générique <Database> de supabase-js est volontairement omis : il est
// incompatible avec la version de TypeScript utilisée ici (résolution des types
// conditionnels de supabase-js cassée sur TS 6.0.3, cf. tests). Le typage est assuré
// à la place par les interfaces de `@/types/database.types` sur chaque fonction de src/api.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** PostgREST plafonne silencieusement `.select()` à sa limite de lignes par défaut (1000, aucune
 * erreur renvoyée) — cf. incident Hub du 2026-09-15 (commande Shopify #17933 disparue du cache une
 * fois celui-ci passé 1000 lignes) et son pendant ici (retour utilisateur du 2026-09-15 : "mon
 * sumup dans dépôt espèce... 4116€ alors que dans les rapports sumup j'ai 8000€" — ventes_sumup
 * triée par horodatage décroissant, les ventes les plus ANCIENNES de la période demandée étaient
 * tronquées sans le moindre message d'erreur). À utiliser pour toute requête sur une table qui peut
 * dépasser 1000 lignes (ventes, historiques) — boucle par blocs de 1000 jusqu'à une page
 * incomplète (fin des données). */
export async function paginerToutesLesLignes<T>(
  requete: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const TAILLE_PAGE = 1000;
  const lignes: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await requete(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    lignes.push(...(data ?? []));
    if (!data || data.length < TAILLE_PAGE) break;
  }
  return lignes;
}

// Sans ça, le rafraîchissement automatique du jeton continue de tourner (inutilement) pendant que
// l'app est en arrière-plan, et surtout ne redémarre pas forcément au premier plan sur certains
// appareils : le jeton d'accès stocké peut alors être expiré au moment où l'app se rouvre, ce qui
// oblige à se reconnecter alors qu'une session valide existait pourtant. Recommandation officielle
// Supabase pour Expo/React Native.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
