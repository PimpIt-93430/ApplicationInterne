import { supabase } from './supabaseClient';

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Écran "Première connexion" : la personne choisit son mot de passe elle-même avec l'email que
 * l'admin a déjà saisi en l'invitant (cf. inviterEmploye) — aucun email envoyé. Appel public (pas
 * encore de session), l'Edge Function refuse si le compte s'est déjà connecté au moins une fois. */
export async function definirMotDePasseInitial(email: string, password: string) {
  const { data, error } = await supabase.functions.invoke('definir-mot-de-passe-initial', {
    body: { email, password },
  });
  if (error) {
    // FunctionsHttpError : le message générique de supabase-js ne reprend pas le corps JSON
    // renvoyé par la fonction (`{ error: "..." }`) — on va le rechercher nous-mêmes pour afficher
    // un message compréhensible ("Aucun compte ne correspond à cet email...") plutôt qu'un message
    // technique générique.
    const corps = await (error as { context?: Response }).context?.json().catch(() => null);
    throw new Error(corps?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
