/** @jsxImportSource react */
// Web uniquement : si la personne connectée a un droit "calendrier" (cf. onglet Droits dans
// Équipe, migration 0034), affiche une vue équipe scopée à son/ses pop-up(s) et à leurs employés —
// sinon retombe sur exactement le même écran "mon planning" que calendrier.tsx (aucun changement
// pour un employé normal, ni pour un admin qui atterrirait ici par erreur : admin/calendrier.tsx
// reste sa route).
//
// Pas de réutilisation de admin/calendrier.tsx tel quel : cet écran régénère automatiquement le
// planning de TOUS les pop-ups à chaque montage, ce qui casserait silencieusement le planning d'un
// responsable scopé sous RLS restreinte (cf. plan). Ici : pas de génération auto, gestion manuelle
// uniquement dans le périmètre accordé.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { CalendrierPersonnelEcranWeb } from '@/components/calendrier/CalendrierPersonnelEcranWeb';
import { PanneauCreationShift } from '@/components/calendrier/PanneauCreationShift';
import { PanneauIndisponibilites } from '@/components/calendrier/PanneauIndisponibilites';
import { VueParEmployes } from '@/components/calendrier/VueParEmployes';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { useJoursEcolePeriode } from '@/hooks/useAlternance';
import { useCongesPeriode, useGererConges } from '@/hooks/useConges';
import { useDroitsEmploye } from '@/hooks/useDroits';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useSemaineStore } from '@/store/useSemaineStore';
import { construireMapAffectations } from '@/utils/affectations';
import { dateEnISO, joursDeLaSemaine, libelleJourCourt } from '@/utils/dateUtils';
import { popUpsCouverts } from '@/utils/permissions';
import type { Conge, DroitEmploye, PlanningShift, Profile } from '@/types/database.types';

// `useProfilEffectif` (pas `useAuthStore` directement) : un admin en "vue alternant" (bascule dans
// Profil, cf. useProfilEffectif.ts) doit voir exactement ce que la personne prévisualisée voit —
// y compris la vue équipe scopée si CETTE personne a un droit calendrier, pas celui de l'admin réel
// (qui, lui, verrait toujours la vue personnelle puisqu'un admin ne passe jamais par ici).
export default function CalendrierScreenWeb() {
  const profilEffectif = useProfilEffectif();
  const { data: droits, isLoading } = useDroitsEmploye(profilEffectif?.id);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#4F46E5" />
      </View>
    );
  }

  const droitsCalendrier = (droits ?? []).filter((d) => d.fonctionnalite === 'calendrier');
  if (!profilEffectif || profilEffectif.role === 'admin' || droitsCalendrier.length === 0) {
    return <CalendrierPersonnelEcranWeb />;
  }

  return <CalendrierEquipeScopee droitsCalendrier={droitsCalendrier} profilEffectif={profilEffectif} />;
}

type OngletEquipe = 'equipe' | 'indisponibilites';

function CalendrierEquipeScopee({
  droitsCalendrier,
  profilEffectif,
}: {
  droitsCalendrier: DroitEmploye[];
  profilEffectif: Profile;
}) {
  const queryClient = useQueryClient();
  // Un responsable de pop-up reste aussi un salarié : il doit pouvoir déclarer ses propres
  // indisponibilités, pas seulement gérer celles de son équipe (cf. retour utilisateur).
  const [onglet, setOnglet] = useState<OngletEquipe>('equipe');
  const { data: popUpsTous } = usePopUps();
  const { data: profilsTous } = useActiveProfiles();
  const { data: affectations } = useAffectationsPopUp();
  const { dateReference, semaineSuivante, semainePrecedente, revenirAujourdhui } = useSemaineStore();
  const jours = joursDeLaSemaine(dateReference);
  const dateDebut = dateEnISO(jours[0]);
  const dateFin = dateEnISO(jours[6]);

  // Pas de filtrage manuel ici : la RLS (migration 0034) ne renvoie déjà que les shifts/congés
  // couverts par le(s) droit(s) calendrier de la personne connectée.
  const { data: shifts } = useShiftsSemaine(dateDebut, dateFin);
  const { data: conges } = useCongesPeriode(dateDebut, dateFin);
  const { data: joursEcole } = useJoursEcolePeriode(dateDebut, dateFin);
  const { supprimer: supprimerConge } = useGererConges(undefined);

  const popUpsCouvertsIds = popUpsCouverts(droitsCalendrier, 'calendrier'); // null = tous
  const popUps = (popUpsTous ?? []).filter((p) => popUpsCouvertsIds === null || popUpsCouvertsIds.includes(p.id));
  const popUpIdsSet = new Set(popUps.map((p) => p.id));
  const popUpParId = new Map(popUps.map((p) => [p.id, p]));

  const mapAffectations = construireMapAffectations(affectations ?? []);
  const profils = (profilsTous ?? []).filter(
    (p) =>
      p.role !== 'admin' &&
      (affectations ?? []).some((a) => a.profile_id === p.id && popUpIdsSet.has(a.pop_up_id)),
  );

  const invalidateShifts = () => queryClient.invalidateQueries({ queryKey: ['planning-shifts', dateDebut, dateFin] });

  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [panneauDate, setPanneauDate] = useState('');
  const [panneauProfil, setPanneauProfil] = useState<Profile | null>(null);
  const [panneauPopUpId, setPanneauPopUpId] = useState<string | undefined>(undefined);
  const [panneauHeureDebut, setPanneauHeureDebut] = useState<string | undefined>(undefined);
  const [panneauHeureFin, setPanneauHeureFin] = useState<string | undefined>(undefined);
  const [panneauShiftsExistants, setPanneauShiftsExistants] = useState<PlanningShift[]>([]);

  const ouvrirPanneau = (profilCible: Profile, dateIso: string, shiftsExistants: PlanningShift[]) => {
    setPanneauProfil(profilCible);
    setPanneauPopUpId(shiftsExistants[0]?.pop_up_id ?? popUps[0]?.id);
    setPanneauDate(dateIso);
    setPanneauHeureDebut(shiftsExistants[0] ? shiftsExistants[0].heure_debut.slice(0, 5) : undefined);
    setPanneauHeureFin(shiftsExistants[0] ? shiftsExistants[0].heure_fin.slice(0, 5) : undefined);
    setPanneauShiftsExistants(shiftsExistants);
    setPanneauOuvert(true);
  };

  // Même raison que admin/calendrier.tsx : Alert.alert est un no-op sur web, window.confirm
  // fonctionne réellement (écran web-only).
  const handlePressCelluleConge = (conge: Conge, profilCible: Profile) => {
    const confirme = window.confirm(
      `Supprimer ${conge.type === 'conge' ? 'le congé' : "l'indisponibilité"} de ${profilCible.nom_complet || profilCible.email} ? Cette action est irréversible.`,
    );
    if (!confirme) return;
    supprimerConge.mutate(conge);
  };

  return (
    <View style={styles.ecran}>
      <EnteteMenu titre="Calendrier" />

      <View style={styles.segment}>
        <Pressable
          onPress={() => setOnglet('equipe')}
          style={[styles.segmentBouton, onglet === 'equipe' && styles.segmentBoutonActif]}
        >
          <Text style={onglet === 'equipe' ? styles.segmentTexteActif : styles.segmentTexte}>Équipe</Text>
        </Pressable>
        <Pressable
          onPress={() => setOnglet('indisponibilites')}
          style={[styles.segmentBouton, onglet === 'indisponibilites' && styles.segmentBoutonActif]}
        >
          <Text style={onglet === 'indisponibilites' ? styles.segmentTexteActif : styles.segmentTexte}>
            Mes indisponibilités
          </Text>
        </Pressable>
      </View>

      {onglet === 'indisponibilites' ? (
        <PanneauIndisponibilites />
      ) : (
        <>
          <View style={styles.entete}>
            <Pressable onPress={semainePrecedente} style={styles.boutonNav}>
              <Text style={styles.boutonNavTexte}>‹</Text>
            </Pressable>
            <Pressable onPress={revenirAujourdhui}>
              <Text style={styles.periodeTexte}>
                {libelleJourCourt(jours[0])} — {libelleJourCourt(jours[6])}
              </Text>
            </Pressable>
            <Pressable onPress={semaineSuivante} style={styles.boutonNav}>
              <Text style={styles.boutonNavTexte}>›</Text>
            </Pressable>
          </View>

          <VueParEmployes
            jours={jours}
            profils={profils}
            shifts={shifts ?? []}
            onPressCellule={ouvrirPanneau}
            onPressCelluleConge={handlePressCelluleConge}
            popUpParId={popUpParId}
            joursEcole={joursEcole ?? []}
            conges={conges ?? []}
            mapAffectations={mapAffectations}
            popUps={popUps}
          />

          <PanneauCreationShift
            visible={panneauOuvert}
            onClose={() => setPanneauOuvert(false)}
            popUps={popUps}
            popUpIdInitial={panneauPopUpId}
            profils={profils}
            mapAffectations={mapAffectations}
            tousLesShifts={shifts ?? []}
            tousLesConges={conges ?? []}
            adminId={profilEffectif.id}
            dateInitiale={panneauDate}
            profilInitial={panneauProfil}
            heureDebutInitiale={panneauHeureDebut}
            heureFinInitiale={panneauHeureFin}
            shiftsExistants={panneauShiftsExistants}
            onShiftCree={invalidateShifts}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  segment: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    gap: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    padding: 4,
  },
  segmentBouton: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 8 },
  segmentBoutonActif: { backgroundColor: 'white' },
  segmentTexte: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  segmentTexteActif: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  boutonNav: { paddingHorizontal: 12, paddingVertical: 6 },
  boutonNavTexte: { fontSize: 20, color: '#4F46E5' },
  periodeTexte: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
});
