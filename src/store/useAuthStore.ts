import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { fetchProfile } from '@/api/profiles';
import { supabase } from '@/api/supabaseClient';
import type { Profile } from '@/types/database.types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  initializing: boolean;
  init: () => void;
}

let initialized = false;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  initializing: true,
  init: () => {
    if (initialized) return;
    initialized = true;

    const loadProfile = async (session: Session | null) => {
      if (!session) {
        set({ session: null, profile: null, initializing: false });
        return;
      }
      try {
        const profile = await fetchProfile(session.user.id);
        set({ session, profile, initializing: false });
      } catch {
        set({ session, profile: null, initializing: false });
      }
    };

    supabase.auth.getSession().then(({ data }) => loadProfile(data.session));

    supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session);
    });
  },
}));
