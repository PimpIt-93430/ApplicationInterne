import { ActivityIndicator, View } from 'react-native';

import { EquipeMobileEcran } from '@/components/equipe/EquipeMobileEcran';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { construireMapAffectations } from '@/utils/affectations';

export default function EquipeScreen() {
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations, isLoading: chargementAffectations } = useAffectationsPopUp();

  const mapAffectations = construireMapAffectations(affectations ?? []);

  if (chargementProfils || chargementPopUps || chargementAffectations) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <EquipeMobileEcran
      titre="Équipe"
      texteIntro="L'horaire récurrent de chaque personne pilote la génération automatique du planning. Les admins sont attribués à tous les lieux, mais n'ont plus aucun horaire par défaut — à régler ici comme pour n'importe qui."
      membres={profils ?? []}
      popUps={popUps ?? []}
      mapAffectations={mapAffectations}
      estAdmin
    />
  );
}
