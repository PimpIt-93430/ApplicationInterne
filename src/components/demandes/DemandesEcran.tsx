import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { PanneauAbsences } from '@/components/calendrier/PanneauAbsences';
import { PanneauDemandesConge } from '@/components/calendrier/PanneauDemandesConge';
import { PanneauHistoriqueRH } from '@/components/demandes/PanneauHistoriqueRH';
import { PanneauValidationEquipe } from '@/components/demandes/PanneauValidationEquipe';
import { SectionHeuresRH } from '@/components/demandes/SectionHeuresRH';
import { BarreOnglets } from '@/components/ui/BarreOnglets';
import { useDemandesCongeEnAttente } from '@/hooks/useConges';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';

type Onglet = 'conges' | 'absences' | 'equipe';

/** Onglet "Demande et RH" de la barre de navigation basse : compteur d'heures + solde de congés en
 * haut (SectionHeuresRH), puis congés (demande soumise à validation manager/admin), absences
 * (maladie/autre, constat immédiat, auto-service), et pour un manager ou un admin un 3ᵉ onglet
 * "Équipe" pour valider/refuser les demandes de congé — de son équipe pour un manager, de tout le
 * monde pour un admin (RLS renvoie déjà tout pour lui, cf. useDemandesCongeEnAttente). Pas
 * d'onglet "indisponibilités" séparé : une indisponibilité est une absence comme une autre côté RH.
 *
 * Pour un admin (pas un manager) : ni compteur d'heures/congés (il n'est pas suivi comme un
 * salarié), ni onglet "Congés" (pas de demande à faire valider, il valide lui-même) — juste
 * "Absences" (se déclarer indisponible) et "Équipe" (voir/valider les demandes de tout le monde),
 * cf. retour utilisateur. */
export function DemandesEcran() {
  const profile = useProfilEffectif();
  const [onglet, setOnglet] = useState<Onglet>('conges');
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  // Réservé aux managers/admins (même condition que l'onglet "Ventes" dans BarreNavigationBasse) —
  // appelé inconditionnellement (règle des hooks), le résultat n'est juste pas affiché sinon.
  const { data: demandesEnAttente } = useDemandesCongeEnAttente();
  const estAdmin = profile?.role === 'admin';
  const estManagerOuAdmin = profile?.type_contrat === 'manager' || estAdmin;

  // Un admin n'a pas d'onglet "Congés" (cf. commentaire ci-dessus) — si jamais sélectionné (valeur
  // par défaut au montage, avant que le profil ne soit chargé), on retombe sur "Absences".
  useEffect(() => {
    if (estAdmin && onglet === 'conges') setOnglet('absences');
  }, [estAdmin, onglet]);

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pb-2 pt-14">
        <Text className="text-2xl font-bold text-slate-900">Demande et RH</Text>
      </View>

      {!profile ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
      ) : (
        <>
          {!estAdmin && (
            <ScrollView className="px-4" style={{ flexGrow: 0, maxHeight: 300 }}>
              <SectionHeuresRH profileId={profile.id} onVoirHistorique={() => setHistoriqueOuvert(true)} />
            </ScrollView>
          )}

          <View className="mx-4 mb-2">
            <BarreOnglets
              valeur={onglet}
              onChange={setOnglet}
              options={[
                ...(estAdmin ? [] : [{ valeur: 'conges' as const, label: 'Congés' }]),
                { valeur: 'absences', label: 'Absences' },
                ...(estManagerOuAdmin
                  ? [{ valeur: 'equipe' as const, label: 'Équipe', badge: (demandesEnAttente ?? []).length }]
                  : []),
              ]}
            />
          </View>

          <View className="flex-1">
            {onglet === 'equipe' && estManagerOuAdmin ? (
              <PanneauValidationEquipe />
            ) : onglet === 'absences' || estAdmin ? (
              <PanneauAbsences />
            ) : (
              <PanneauDemandesConge />
            )}
          </View>

          {!estAdmin && historiqueOuvert && (
            <PanneauHistoriqueRH profileId={profile.id} onFermer={() => setHistoriqueOuvert(false)} />
          )}
        </>
      )}
    </View>
  );
}
