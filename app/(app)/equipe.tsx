// Mobile — écran "Équipe" pour un manager (droit "équipe", migration 0038), scopé au(x) pop-up(s)
// couverts par son droit — même principe que app/(app)/equipe.web.tsx, avec EquipeMobileEcran (cf.
// admin/equipe.tsx) plutôt que EquipeEcranBase (web uniquement, cf. son en-tête). Remplace l'ancien
// stub "disponible seulement sur web" (cf. retour utilisateur du 2026-08-24 : "il faut qu'ils
// aient accès à tout comme les admins mais uniquement pour... les équipes qui sont associées à
// leur pop up").
import { ActivityIndicator, Text, View } from 'react-native';

import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { EquipeMobileEcran } from '@/components/equipe/EquipeMobileEcran';
import { useMesDroits } from '@/hooks/useDroits';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { construireMapAffectations } from '@/utils/affectations';
import { aAccesFonctionnalite, popUpsCouverts } from '@/utils/permissions';

export default function EquipeManagerScreenMobile() {
  const profile = useProfilEffectif();
  const { data: droits, isLoading: chargementDroits } = useMesDroits(profile?.id);
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations, isLoading: chargementAffectations } = useAffectationsPopUp();

  if (!profile || chargementDroits || chargementProfils || chargementPopUps || chargementAffectations) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  const aAcces = aAccesFonctionnalite(droits ?? [], 'equipe');
  if (!aAcces) {
    return (
      <View className="flex-1 bg-slate-50">
        <EnteteMenu titre="Équipe" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-slate-400">
            Aucun droit "équipe" — demande à un admin de t'en attribuer un pour voir la fiche de ton
            équipe.
          </Text>
        </View>
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
    <EquipeMobileEcran
      titre="Équipe"
      texteIntro="L'horaire récurrent de chaque personne de ton équipe pilote la génération automatique du planning."
      membres={membres}
      popUps={popUps}
      mapAffectations={mapAffectations}
      estAdmin={false}
    />
  );
}
