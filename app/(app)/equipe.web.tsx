/** @jsxImportSource react */
// Web uniquement — écran "Équipe" pour un manager (droit "équipe", migration 0038), scopé au(x)
// pop-up(s) couverts par son droit. Contrairement à l'écran admin (app/(app)/admin/equipe.web.tsx),
// pas d'invitation de nouveaux membres et pas d'onglet Droits ; les sections bancaire/médical sont
// masquées par EquipeEcranBase (estAdmin=false) — la RLS (migration 0038) applique la même
// restriction côté base, ceci n'est qu'un reflet côté UI.
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { EquipeEcranBase } from '@/components/equipe/EquipeEcranBase';
import { useMesDroits } from '@/hooks/useDroits';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { construireMapAffectations } from '@/utils/affectations';
import { aAccesFonctionnalite, popUpsCouverts } from '@/utils/permissions';

export default function EquipeManagerScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { data: droits, isLoading: chargementDroits } = useMesDroits(profile?.id);
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations, isLoading: chargementAffectations } = useAffectationsPopUp();

  if (chargementDroits || chargementProfils || chargementPopUps || chargementAffectations) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  const aAcces = aAccesFonctionnalite(droits ?? [], 'equipe');
  if (!aAcces) {
    return (
      <View style={styles.centre}>
        <Text style={styles.texteAlerte}>
          Aucun droit "équipe" — demande à un admin de t'en attribuer un pour voir la fiche de ton
          équipe.
        </Text>
      </View>
    );
  }

  const idsCouverts = popUpsCouverts(droits ?? [], 'equipe');
  const popUps = idsCouverts === null ? (popUpsTous ?? []) : (popUpsTous ?? []).filter((p) => idsCouverts.includes(p.id));
  const popUpsIds = new Set(popUps.map((p) => p.id));
  const mapAffectations = construireMapAffectations(affectations ?? []);
  const membres = (profils ?? []).filter((p) => {
    const lieux = mapAffectations.get(p.id);
    return lieux && [...lieux].some((id) => popUpsIds.has(id));
  });

  return (
    <EquipeEcranBase
      profils={membres}
      popUps={popUps}
      lieuxAttribuesDe={(profil) => {
        const ids = mapAffectations.get(profil.id);
        return ids ? popUps.filter((p) => ids.has(p.id)) : [];
      }}
      estAdmin={false}
      montrerInvite={false}
    />
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: 24 },
  texteAlerte: { fontSize: 14, color: '#94A3B8', textAlign: 'center', maxWidth: 320 },
});
