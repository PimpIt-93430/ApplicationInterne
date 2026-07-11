import { useActiveProfiles } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';
import type { Profile } from '@/types/database.types';

/**
 * Profil à utiliser pour toutes les données affichées (stock, calendrier, indisponibilités,
 * notifications). Un admin en "vue alternant" (bascule dans Profil) voit et agit avec le profil
 * de Namory, l'alternante de test, pour vivre l'app exactement comme elle plutôt que comme un
 * admin déguisé — pop-up assigné, indisponibilités, notifications, etc. sont donc les siens.
 * Pour un utilisateur non-admin (ou un admin en vue "admin"), c'est simplement son propre profil.
 */
export function useProfilEffectif(): Profile | null {
  const profileReel = useAuthStore((s) => s.profile);
  const vue = useVueAdminStore((s) => s.vue);
  const { data: profils } = useActiveProfiles();

  const previsualiseAlternant = profileReel?.role === 'admin' && vue === 'alternant';
  if (!previsualiseAlternant) return profileReel;

  const namory = (profils ?? []).find((p) => p.nom_complet.toLowerCase().includes('namory'));
  return namory ?? profileReel;
}
