import { Pressable, Text, View } from 'react-native';

import { useAuthStore } from '@/store/useAuthStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';

// Header identique mobile/web (retour utilisateur du 2026-09-16 : le site web doit être identique
// à l'appli) — `masquerTitre` n'est plus utilisé ici mais reste accepté pour ne pas casser les
// appelants existants (admin/calendrier.tsx notamment, qui gère son propre affichage de titre).
export function EnteteMenu({ titre, masquerTitre: _masquerTitre = false }: { titre: string; masquerTitre?: boolean }) {
  const ouvrir = useMenuStore((s) => s.ouvrir);
  const profile = useAuthStore((s) => s.profile);
  const profilPreviewId = useVueAdminStore((s) => s.profilPreviewId);

  const estAdmin = profile?.role === 'admin' && !profilPreviewId;
  // Un manager a lui aussi accès au tiroir (Équipe scopée à son pop-up, cf. liensNavigation) — pas
  // seulement un admin, contrairement à avant (retour utilisateur du 2026-08-24).
  const estManager = profile?.type_contrat === 'manager' && !profilPreviewId;

  return (
    <View className="flex-row items-center gap-3 px-4 pb-2 pt-14">
      {(estAdmin || estManager) && (
        <Pressable onPress={ouvrir} className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Text className="text-lg text-slate-700">☰</Text>
        </Pressable>
      )}
      <Text className="text-2xl font-bold text-slate-900">{titre}</Text>
    </View>
  );
}
