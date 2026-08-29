import { addMonths, subMonths } from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { CalendrierMoisGrille, type LegendeCalendrier, type StyleJourCalendrier } from '@/components/calendrier/CalendrierMoisGrille';
import { SelecteurMoisCombo } from '@/components/calendrier/SelecteurMoisCombo';
import { PanneauValidationCalendrierEcole } from '@/components/demandes/PanneauValidationCalendrierEcole';
import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useGererJoursEcole, useJoursEcoleProfile } from '@/hooks/useAlternance';
import {
  useDemandeCalendrierEcoleEnAttente,
  useEnvoyerDemandeCalendrierEcole,
} from '@/hooks/useDemandesCalendrierEcole';
import { usePopUps } from '@/hooks/usePopUps';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';
import type { ActionJourCalendrierEcole } from '@/types/database.types';
import { construireMapAffectations, popUpsAttribues, estAttribueA } from '@/utils/affectations';

const STYLE_ECOLE: StyleJourCalendrier = { fond: '#FFFBEB', texte: '#D97706', bordure: '#FCD34D' };
const STYLE_NEUTRE: StyleJourCalendrier = { fond: '#F8FAFC', texte: '#475569', bordure: '#E2E8F0' };
const STYLE_AJOUT_PROPOSE: StyleJourCalendrier = { fond: '#ECFDF5', texte: '#059669', bordure: '#34D399' };
const STYLE_SUPPRESSION_PROPOSEE: StyleJourCalendrier = { fond: '#FEF2F2', texte: '#DC2626', bordure: '#FCA5A5' };

const LEGENDE_SIMPLE: LegendeCalendrier[] = [
  { couleur: STYLE_ECOLE.bordure, label: 'École' },
  { couleur: '#CBD5E1', label: 'Pas école' },
];
const LEGENDE_BROUILLON: LegendeCalendrier[] = [
  { couleur: STYLE_ECOLE.bordure, label: 'École (confirmé)' },
  { couleur: STYLE_AJOUT_PROPOSE.bordure, label: 'Ajout proposé' },
  { couleur: STYLE_SUPPRESSION_PROPOSEE.bordure, label: 'Retrait proposé' },
  { couleur: '#CBD5E1', label: 'Pas école' },
];

export default function AlternanceScreen() {
  const profileReel = useAuthStore((s) => s.profile);
  const profile = useProfilEffectif();
  const profilPreviewId = useVueAdminStore((s) => s.profilPreviewId);
  const estAlternant = profile?.type_contrat === 'alternant';
  // Basé sur le rôle réel ET la prévisualisation active (pas juste le rôle réel) : sinon un admin
  // connecté au profil d'un alternant verrait quand même le panneau de validation admin sur le
  // même écran que le formulaire de demande de cette personne — et pourrait s'auto-valider. En
  // prévisualisation, l'écran doit se comporter exactement comme ce que voit cette personne, pas
  // comme un admin déguisé (même principe que estAdminEnVueAdmin ailleurs).
  const estAdmin = profileReel?.role === 'admin' && !profilPreviewId;
  const estManager = profile?.type_contrat === 'manager';

  const { data: profils } = useActiveProfiles();
  const alternants = (profils ?? []).filter((p) => p.type_contrat === 'alternant');

  // Équipe d'un manager = alternants attribués au(x) même(s) pop-up(s) que lui (même pattern que
  // PlanningMobile.tsx pour la vue équipe scopée) — consultation en lecture seule uniquement, la
  // validation des demandes de calendrier école reste 100% admin.
  const { data: popUpsTous } = usePopUps();
  const { data: affectationsToutes } = useAffectationsPopUp();
  const mapAffectations = useMemo(() => construireMapAffectations(affectationsToutes ?? []), [affectationsToutes]);
  const alternantsEquipe = useMemo(() => {
    if (!estManager || !profile) return [];
    const mesPopUps = popUpsAttribues(profile, mapAffectations, popUpsTous ?? []);
    return alternants.filter((a) => mesPopUps.some((popUp) => estAttribueA(a, popUp.id, mapAffectations)));
  }, [estManager, profile, mapAffectations, popUpsTous, alternants]);

  const [profileCibleId, setProfileCibleId] = useState<string | undefined>(undefined);
  const [moisReference, setMoisReference] = useState(new Date());
  // Changements pas encore envoyés, accumulés au fil de la navigation entre mois — remis à zéro à
  // l'envoi de la demande (cf. handleEnvoyer). Uniquement pertinent pour un alternant qui modifie
  // son propre calendrier (l'admin qui pique un alternant garde l'ancien comportement immédiat).
  const [brouillon, setBrouillon] = useState<Map<string, ActionJourCalendrierEcole>>(new Map());

  useEffect(() => {
    if (profileCibleId) return;
    if (estAlternant && profile) {
      setProfileCibleId(profile.id);
    } else if (estAdmin && alternants.length > 0) {
      setProfileCibleId(alternants[0].id);
    } else if (estManager && alternantsEquipe.length > 0) {
      setProfileCibleId(alternantsEquipe[0].id);
    }
  }, [estAlternant, estAdmin, estManager, profile, alternants, alternantsEquipe, profileCibleId]);

  const { data: joursEcole, isLoading } = useJoursEcoleProfile(profileCibleId);
  const { ajouter, supprimer } = useGererJoursEcole(profileCibleId);

  // Modification directe (admin) vs demande à valider (alternant sur son propre calendrier) — cf.
  // migration 0052 : un alternant n'a plus le droit d'écrire directement sur jours_ecole_alternant.
  const modeDemande = estAlternant;
  const { data: demandeEnAttente } = useDemandeCalendrierEcoleEnAttente(modeDemande ? profileCibleId : undefined);
  const envoyerDemande = useEnvoyerDemandeCalendrierEcole(profileCibleId);

  const joursConfirmes = useMemo(() => new Set((joursEcole ?? []).map((j) => j.date)), [joursEcole]);

  // Tant qu'une demande est en attente, on affiche l'état proposé (confirmé + diffs de la demande
  // encore non appliqués) plutôt que l'état confirmé seul, pour que l'alternant voie ce qu'il a
  // envoyé — et on verrouille toute nouvelle modification (cf. décision : bloqué jusqu'à réponse).
  const joursProposesEnAttente = useMemo(() => {
    if (!demandeEnAttente) return null;
    const set = new Set(joursConfirmes);
    for (const jour of demandeEnAttente.jours) {
      if (jour.action === 'ajout') set.add(jour.date);
      else set.delete(jour.date);
    }
    return set;
  }, [demandeEnAttente, joursConfirmes]);

  const handlePressJourAdmin = (dateIso: string) => {
    const existant = joursEcole?.find((j) => j.date === dateIso);
    if (existant) supprimer.mutate(existant.id);
    else if (profileCibleId) ajouter.mutate(dateIso);
  };

  const handlePressJourBrouillon = (dateIso: string) => {
    setBrouillon((prev) => {
      const next = new Map(prev);
      if (next.has(dateIso)) {
        next.delete(dateIso);
      } else if (joursConfirmes.has(dateIso)) {
        next.set(dateIso, 'suppression');
      } else {
        next.set(dateIso, 'ajout');
      }
      return next;
    });
  };

  const handleEnvoyer = () => {
    const diffs = Array.from(brouillon.entries()).map(([date, action]) => ({ date, action }));
    envoyerDemande.mutate(diffs, {
      onSuccess: () => setBrouillon(new Map()),
      onError: (error) =>
        Alert.alert('Erreur', error instanceof Error ? error.message : "Impossible d'envoyer la demande."),
    });
  };

  if (!estAlternant && !estAdmin && !estManager) {
    return (
      <View className="flex-1 bg-white">
        <EnteteRetour titre="Calendrier d'école" onRetour={() => router.back()} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-slate-400">Cet écran concerne les alternants.</Text>
        </View>
      </View>
    );
  }

  if (estManager && !estAlternant && alternantsEquipe.length === 0) {
    return (
      <View className="flex-1 bg-white">
        <EnteteRetour titre="Calendrier d'école" onRetour={() => router.back()} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-slate-400">Aucun alternant dans votre équipe.</Text>
        </View>
      </View>
    );
  }

  const afficherSelecteur = (estAdmin || estManager) && !estAlternant;
  const listeSelectionnable = estAdmin ? alternants : alternantsEquipe;

  const styleJour = (dateIso: string): StyleJourCalendrier => {
    if (modeDemande) {
      if (joursProposesEnAttente) return joursProposesEnAttente.has(dateIso) ? STYLE_ECOLE : STYLE_NEUTRE;
      const diff = brouillon.get(dateIso);
      if (diff === 'ajout') return STYLE_AJOUT_PROPOSE;
      if (diff === 'suppression') return STYLE_SUPPRESSION_PROPOSEE;
      return joursConfirmes.has(dateIso) ? STYLE_ECOLE : STYLE_NEUTRE;
    }
    return joursConfirmes.has(dateIso) ? STYLE_ECOLE : STYLE_NEUTRE;
  };

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingBottom: 24 }}>
      <EnteteRetour titre="Calendrier d'école" onRetour={() => router.back()} />
      <View className="px-4">
        <Text className="mb-4 text-sm text-slate-400">
          {modeDemande
            ? 'Touchez un jour pour proposer un changement, puis validez votre demande — l\'admin doit l\'approuver.'
            : estManager
              ? 'Consultez le calendrier d\'école des alternants de votre équipe (lecture seule).'
              : 'Touchez un jour pour le marquer "école" — la personne ne sera jamais planifiée ce jour-là.'}
        </Text>
      </View>

      {afficherSelecteur && listeSelectionnable.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 px-4">
          <View className="flex-row gap-2">
            {listeSelectionnable.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setProfileCibleId(a.id)}
                className={`rounded-full px-3 py-2 ${profileCibleId === a.id ? 'bg-indigo-600' : 'bg-slate-100'}`}
              >
                <Text className={profileCibleId === a.id ? 'text-sm font-semibold text-white' : 'text-sm text-slate-600'}>
                  {a.nom_complet || a.email}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {modeDemande && demandeEnAttente && (
        <View className="mx-4 mb-4 rounded-2xl bg-amber-50 px-4 py-3">
          <Text className="text-sm font-semibold text-amber-700">En attente de validation</Text>
          <Text className="mt-0.5 text-xs text-amber-600">
            Votre demande ({demandeEnAttente.jours.length} changement
            {demandeEnAttente.jours.length > 1 ? 's' : ''}) a été envoyée à l'admin. Vous ne pouvez pas en
            proposer une nouvelle tant qu'elle n'a pas été traitée.
          </Text>
        </View>
      )}

      <SelecteurMoisCombo
        moisReference={moisReference}
        onPrecedent={() => setMoisReference((m) => subMonths(m, 1))}
        onSuivant={() => setMoisReference((m) => addMonths(m, 1))}
        onRevenirAujourdhui={() => setMoisReference(new Date())}
      />

      {isLoading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
      ) : (
        <CalendrierMoisGrille
          moisReference={moisReference}
          statutJour={styleJour}
          legende={modeDemande && brouillon.size > 0 ? LEGENDE_BROUILLON : LEGENDE_SIMPLE}
          onPressJour={
            modeDemande
              ? demandeEnAttente
                ? undefined
                : handlePressJourBrouillon
              : estManager
                ? undefined
                : handlePressJourAdmin
          }
        />
      )}

      {modeDemande && !demandeEnAttente && brouillon.size > 0 && (
        <View className="mx-4 mt-5 flex-row gap-3">
          <Pressable
            onPress={() => setBrouillon(new Map())}
            className="items-center rounded-2xl border border-slate-200 px-5 py-3.5"
          >
            <Text className="text-sm font-semibold text-slate-600">Annuler</Text>
          </Pressable>
          <Pressable
            onPress={handleEnvoyer}
            disabled={envoyerDemande.isPending}
            className="flex-1 items-center rounded-2xl bg-indigo-600 py-3.5"
          >
            <Text className="text-sm font-bold text-white">
              {envoyerDemande.isPending
                ? 'Envoi…'
                : `Valider la demande (${brouillon.size} changement${brouillon.size > 1 ? 's' : ''})`}
            </Text>
          </Pressable>
        </View>
      )}

      {estAdmin && (
        <View className="mt-6">
          <Text className="mb-2 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Demandes de tous les alternants
          </Text>
          <PanneauValidationCalendrierEcole />
        </View>
      )}
    </ScrollView>
  );
}
