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
import { useResponsable } from '@/hooks/useResponsable';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';
import type { ActionJourCalendrierEcole } from '@/types/database.types';
import { construireMapAffectations, estAttribueA } from '@/utils/affectations';

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
  // Responsable de pop-up (droits simplifiés, cf. useResponsable) : gère le calendrier école des
  // alternants de son/ses pop-up(s).
  const { estResponsable: estManager, responsableDe } = useResponsable();

  const { data: profils } = useActiveProfiles();
  const alternants = (profils ?? []).filter((p) => p.type_contrat === 'alternant');

  // Équipe d'un manager = alternants attribués au(x) même(s) pop-up(s) que lui (même pattern que
  // PlanningMobile.tsx pour la vue équipe scopée) — modification directe comme l'admin (migration
  // 0129, retour utilisateur du 2026-11-02), la
  // validation des demandes de calendrier école reste 100% admin.
  const { data: popUpsTous } = usePopUps();
  const { data: affectationsToutes } = useAffectationsPopUp();
  const mapAffectations = useMemo(() => construireMapAffectations(affectationsToutes ?? []), [affectationsToutes]);
  const alternantsEquipe = useMemo(() => {
    if (!estManager || !profile) return [];
    const mesPopUps = (popUpsTous ?? []).filter((p) => responsableDe(p.id));
    return alternants.filter((a) => mesPopUps.some((popUp) => estAttribueA(a, popUp.id, mapAffectations)));
  }, [estManager, profile, mapAffectations, popUpsTous, alternants, responsableDe]);

  const [profileCibleId, setProfileCibleId] = useState<string | undefined>(undefined);
  const [moisReference, setMoisReference] = useState(new Date());
  // Changements pas encore validés, accumulés au fil de la navigation entre mois — remis à zéro à
  // la validation. Pour tout le monde depuis le retour utilisateur du 2026-11-03 : on touche les
  // jours (jaune = on retire l'école, sinon on l'ajoute), puis "Valider les modifications" +
  // confirmation. Alternant → demande envoyée à l'admin ; admin/manager → appliqué directement.
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
  const { appliquer } = useGererJoursEcole(profileCibleId);

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

  const envoyerOuAppliquer = () => {
    const diffs = Array.from(brouillon.entries()).map(([date, action]) => ({ date, action }));
    const options = {
      onSuccess: () => setBrouillon(new Map()),
      onError: (error: unknown) =>
        Alert.alert('Erreur', error instanceof Error ? error.message : 'Modification impossible.'),
    };
    if (modeDemande) {
      envoyerDemande.mutate(diffs, options);
    } else {
      appliquer.mutate(
        diffs.map((d) => ({ ...d, id: joursEcole?.find((j) => j.date === d.date)?.id })),
        options,
      );
    }
  };

  // Rappel avant d'enregistrer (retour utilisateur du 2026-11-03).
  const handleValider = () => {
    const n = brouillon.size;
    Alert.alert(
      "Changer le calendrier d'école ?",
      `Voulez-vous vraiment changer le calendrier d'école (${n} jour${n > 1 ? 's' : ''}) ?` +
        (modeDemande ? " La demande sera envoyée à l'admin." : ''),
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Oui, changer', onPress: envoyerOuAppliquer },
      ],
    );
  };

  const enregistrementEnCours = envoyerDemande.isPending || appliquer.isPending;

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
    if (modeDemande && joursProposesEnAttente) {
      return joursProposesEnAttente.has(dateIso) ? STYLE_ECOLE : STYLE_NEUTRE;
    }
    const diff = brouillon.get(dateIso);
    if (diff === 'ajout') return STYLE_AJOUT_PROPOSE;
    if (diff === 'suppression') return STYLE_SUPPRESSION_PROPOSEE;
    return joursConfirmes.has(dateIso) ? STYLE_ECOLE : STYLE_NEUTRE;
  };

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingBottom: 24 }}>
      <EnteteRetour titre="Calendrier d'école" onRetour={() => router.back()} />
      <View className="px-4">
        <Text className="mb-4 text-sm text-slate-400">
          {modeDemande
            ? "Touchez un jour : s'il est en jaune il est retiré de l'école, sinon il est ajouté. Validez ensuite vos modifications — l'admin doit les approuver."
            : "Touchez un jour : s'il est en jaune il est retiré de l'école, sinon il est ajouté. Validez ensuite les modifications — la personne ne sera jamais planifiée un jour d'école."}
        </Text>
      </View>

      {afficherSelecteur && listeSelectionnable.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 px-4">
          <View className="flex-row gap-2">
            {listeSelectionnable.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => {
                  // Changer de personne abandonne la sélection en cours (autre calendrier).
                  if (a.id !== profileCibleId) setBrouillon(new Map());
                  setProfileCibleId(a.id);
                }}
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
          legende={brouillon.size > 0 ? LEGENDE_BROUILLON : LEGENDE_SIMPLE}
          onPressJour={modeDemande && demandeEnAttente ? undefined : handlePressJourBrouillon}
        />
      )}

      {!(modeDemande && demandeEnAttente) && brouillon.size > 0 && (
        <View className="mx-4 mt-5 flex-row gap-3">
          <Pressable
            onPress={() => setBrouillon(new Map())}
            className="items-center rounded-2xl border border-slate-200 px-5 py-3.5"
          >
            <Text className="text-sm font-semibold text-slate-600">Annuler</Text>
          </Pressable>
          <Pressable
            onPress={handleValider}
            disabled={enregistrementEnCours}
            className="flex-1 items-center rounded-2xl bg-indigo-600 py-3.5"
          >
            <Text className="text-sm font-bold text-white">
              {enregistrementEnCours ? 'Enregistrement…' : `Valider les modifications (${brouillon.size})`}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Manager : seulement les demandes des alternants de ses pop-ups (filtré par la RLS,
          migration 0134 — retour utilisateur du 2026-11-03). */}
      {(estAdmin || (estManager && !estAlternant)) && (
        <View className="mt-6">
          <Text className="mb-2 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {estAdmin ? 'Demandes de tous les alternants' : 'Demandes des alternants de mon équipe'}
          </Text>
          <PanneauValidationCalendrierEcole />
        </View>
      )}
    </ScrollView>
  );
}
