import { useActiveProfiles } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';
import type { Profile } from '@/types/database.types';

/**
 * Profil à utiliser pour toutes les données affichées (stock, calendrier, indisponibilités,
 * notifications). Un admin qui a choisi de se connecter à un profil (sélecteur dans Profil) voit
 * et agit avec CE profil précis — n'importe qui, pas seulement un rôle générique — pour vivre
 * l'app exactement comme cette personne plutôt que comme un admin déguisé. Pour un utilisateur
 * non-admin (ou un admin sans profil sélectionné), c'est simplement son propre profil.
 */
export function useProfilEffectif(): Profile | null {
  const profileReel = useAuthStore((s) => s.profile);
  const profilPreviewId = useVueAdminStore((s) => s.profilPreviewId);
  const { data: profils } = useActiveProfiles();

  if (profileReel?.role !== 'admin' || !profilPreviewId) return profileReel;

  return (profils ?? []).find((p) => p.id === profilPreviewId) ?? profileReel;
}
