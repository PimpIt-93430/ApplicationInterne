import { router, usePathname } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMesDroits } from '@/hooks/useDroits';
import { useAuthStore } from '@/store/useAuthStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';
import { aAccesFonctionnalite } from '@/utils/permissions';
import { liensNavigation } from './MenuLateral';

// Route de expo-router sans le segment de groupe "(app)" (usePathname() ne le renvoie jamais),
// pour comparer proprement à pathname et savoir quel lien est actif.
function routeSansGroupe(route: string): string {
  const sansGroupe = route.replace('/(app)', '');
  return sansGroupe === '' ? '/' : sansGroupe;
}

export function EnteteMenu({ titre, masquerTitre = false }: { titre: string; masquerTitre?: boolean }) {
  const ouvrir = useMenuStore((s) => s.ouvrir);
  const profile = useAuthStore((s) => s.profile);
  const profilPreviewId = useVueAdminStore((s) => s.profilPreviewId);
  const pathname = usePathname();

  const { data: mesDroits } = useMesDroits(profile?.id);
  const estAdmin = profile?.role === 'admin' && !profilPreviewId;
  // Sur mobile, un manager a lui aussi accès au tiroir (Équipe scopée à son pop-up, cf.
  // liensNavigation) — pas seulement un admin, contrairement à avant (retour utilisateur du
  // 2026-08-24).
  const estManager = profile?.type_contrat === 'manager' && !profilPreviewId;

  if (Platform.OS === 'web') {
    const aDroitEquipe = aAccesFonctionnalite(mesDroits ?? [], 'equipe');
    const liens = liensNavigation(estAdmin, aDroitEquipe);

    return (
      <View>
        <View style={styles.barreNav}>
          <Text style={styles.logo}>Pimp It</Text>
          <View style={styles.liensRow}>
            {liens.map((lien) => {
              const actif = pathname === routeSansGroupe(lien.route);
              return (
                <Pressable
                  key={lien.route}
                  onPress={() => router.push(lien.route as Parameters<typeof router.push>[0])}
                  style={styles.lien}
                >
                  <Text style={[styles.lienTexte, actif && styles.lienTexteActif]}>{lien.label}</Text>
                  {actif && <View style={styles.lienSoulignement} />}
                </Pressable>
              );
            })}
          </View>
        </View>
        {!masquerTitre && (
          <View style={styles.titreRow}>
            <Text style={styles.titre}>{titre}</Text>
          </View>
        )}
      </View>
    );
  }

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

const styles = StyleSheet.create({
  barreNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: 'white',
  },
  logo: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  liensRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  lien: { paddingVertical: 2 },
  lienTexte: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  lienTexteActif: { color: '#0F172A' },
  lienSoulignement: { marginTop: 6, height: 2, borderRadius: 1, backgroundColor: '#4F46E5' },
  titreRow: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  titre: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
});
