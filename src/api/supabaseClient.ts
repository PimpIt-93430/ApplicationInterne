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

// Sans ça, le rafraîchissement automatique du jeton continue de tourner (inutilement) pendant que
// l'app est en arrière-plan, et surtout ne redémarre pas forcément au premier plan sur certains
// appareils : le jeton d'accès stocké peut alors être expiré au moment où l'app se rouvre, ce qui
// oblige à se reconnecter alors qu'une session valide existait pourtant. Recommandation officielle
// Supabase pour Expo/React Native.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
