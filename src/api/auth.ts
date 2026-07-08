import { supabase } from './supabaseClient';

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string, nomComplet: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nom_complet: nomComplet } },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
