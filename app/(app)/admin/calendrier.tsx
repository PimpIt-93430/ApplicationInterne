/** @jsxImportSource react */
// Écran en StyleSheet (pas de className) : évite le bug NativeWind rencontré avec le
// sélecteur de date/heure natif sur l'écran Indisponibilités, ici utilisé aussi.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { insererShifts, supprimerShift, supprimerShiftsGeneresAutomatiquement } from '@/api/planning';
import { supabase } from '@/api/supabaseClient';
import { AxeHeures } from '@/components/calendrier/AxeHeures';
import { CalendrierPersonnel } from '@/components/calendrier/CalendrierPersonnel';
import { PanneauIndisponibilites } from '@/components/calendrier/PanneauIndisponibilites';
import { TimelineJour } from '@/components/calendrier/TimelineJour';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { genererPlanning } from '@/domain/generationPlanning';
import { useCongesPeriode } from '@/hooks/useConges';
import { useJoursEcolePeriode } from '@/hooks/useAlternance';
import { useTousHorairesRecurrents } from '@/hooks/useHorairesRecurrents';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { useHorairesOuverture, useToutesHorairesOuverture } from '@/hooks/useReglesMetier';
import { useAuthStore } from '@/store/useAuthStore';
import { useSemaineStore } from '@/store/useSemaineStore';
import { construireMapAffectations, estAttribueA } from '@/utils/affectations';
import { dateEnISO, joursDeLaSemaine, jourSemaineISO, libelleJourCourt } from '@/utils/dateUtils';
import type { PlanningShift, Profile } from '@/types/database.types';

function formatHeureAffichee(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

type ModeCreneau = 'matin' | 'apres-midi' | 'journee' | 'personnalise';

const MODES_CRENEAU: { value: ModeCreneau; label: string }[] = [
  { value: 'matin', label: 'Matin' },
  { value: 'apres-midi', label: 'Après-midi' },
  { value: 'journee', label: 'Journée' },
  { value: 'personnalise', label: 'Personnalisé' },
];

type Onglet = 'planning' | 'indisponibilites';

export default function CalendrierPopUpScreen() {
  const [onglet, setOnglet] = useState<Onglet>('planning');
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  // "moi" (par défaut) : l'admin voit son propre planning tous lieux confondus (cf.
  // CalendrierPersonnel), comme n'importe qui d'autre. En choisissant un pop-up dans la
  // roulette, il bascule sur la vue équipe complète de ce lieu, éditable.
  const [selectionId, setSelectionId] = useState<string>('moi');
  const estMonCalendrier = selectionId === 'moi';
  const popUpId = estMonCalendrier ? undefined : selectionId;
  const popUpActuel = popUps?.find((p) => p.id === popUpId);

  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const profilParId = new Map((profils ?? []).map((p) => [p.id, p]));
  const { data: affectations } = useAffectationsPopUp();
  const mapAffectations = construireMapAffectations(affectations ?? []);

  const { dateReference, semaineSuivante, semainePrecedente, revenirAujourdhui } = useSemaineStore();
  const jours = joursDeLaSemaine(dateReference);
  const dateDebut = dateEnISO(jours[0]);
  const dateFin = dateEnISO(jours[6]);

  const { data: horaires, isLoading: chargementHoraires } = useHorairesOuverture(popUpId);
  const { data: toutesHorairesOuverture } = useToutesHorairesOuverture();
  const { data: shifts, isLoading: chargementShifts } = useShiftsSemaine(dateDebut, dateFin);
  const { data: conges } = useCongesPeriode(dateDebut, dateFin);
  const { data: joursEcole } = useJoursEcolePeriode(dateDebut, dateFin);
  const { data: horairesRecurrents } = useTousHorairesRecurrents();

  const [dropdownOuvert, setDropdownOuvert] = useState(false);

  // Ajout d'une personne sur un jour
  const [ajoutPourDate, setAjoutPourDate] = useState<string | null>(null);
  const [regleJourPourAjout, setRegleJourPourAjout] = useState<
    { heure_ouverture: string; heure_fermeture: string } | undefined
  >(undefined);
  const [modeCreneau, setModeCreneau] = useState<ModeCreneau>('personnalise');
  const [personneChoisie, setPersonneChoisie] = useState<Profile | null>(null);
  const [heureDebutChoisie, setHeureDebutChoisie] = useState(new Date());
  const [heureFinChoisie, setHeureFinChoisie] = useState(new Date());
  const [pickerHeureOuvert, setPickerHeureOuvert] = useState<'debut' | 'fin' | null>(null);

  const chargement =
    chargementPopUps ||
    chargementProfils ||
    chargementShifts ||
    (!estMonCalendrier && (chargementHoraires || !popUpId));

  const invalidateShifts = () =>
    queryClient.invalidateQueries({ queryKey: ['planning-shifts', dateDebut, dateFin] });

  const seChevauchent = (aDebut: string, aFin: string, bDebut: string, bFin: string) =>
    aDebut < bFin && bDebut < aFin;

  const estDejaOccupeAilleurs = (p: Profile, dateIso: string, heureDebut: string, heureFin: string) =>
    (shifts ?? []).some(
      (s) => s.profile_id === p.id && s.date === dateIso && seChevauchent(s.heure_debut, s.heure_fin, heureDebut, heureFin),
    );

  const ouvrirAjout = (
    dateIso: string,
    regleJour: { heure_ouverture: string; heure_fermeture: string } | undefined,
    minutesDepuisOuverture: number,
  ) => {
    setAjoutPourDate(dateIso);
    setRegleJourPourAjout(regleJour);
    setModeCreneau('personnalise');
    setPersonneChoisie(null);

    const [hO, mO] = (regleJour?.heure_ouverture ?? '10:00:00').split(':').map(Number);
    const [hF, mF] = (regleJour?.heure_fermeture ?? '20:00:00').split(':').map(Number);
    const ouvertureMin = hO * 60 + mO;
    const fermetureMin = hF * 60 + mF;

    // Arrondi au quart d'heure le plus proche, borné aux horaires d'ouverture
    let debutMin = Math.round((ouvertureMin + minutesDepuisOuverture) / 15) * 15;
    debutMin = Math.max(ouvertureMin, Math.min(debutMin, fermetureMin - 30));
    const finMin = Math.min(debutMin + 120, fermetureMin);

    const debut = new Date();
    debut.setHours(Math.floor(debutMin / 60), debutMin % 60, 0, 0);
    const fin = new Date();
    fin.setHours(Math.floor(finMin / 60), finMin % 60, 0, 0);

    setHeureDebutChoisie(debut);
    setHeureFinChoisie(fin);
  };

  const choisirMode = (mode: ModeCreneau) => {
    setModeCreneau(mode);
    if (mode === 'personnalise') return;

    const [hO, mO] = (regleJourPourAjout?.heure_ouverture ?? '10:00:00').split(':').map(Number);
    const [hF, mF] = (regleJourPourAjout?.heure_fermeture ?? '20:00:00').split(':').map(Number);
    const ouvertureMin = hO * 60 + mO;
    const fermetureMin = hF * 60 + mF;

    let debutMin: number;
    let finMin: number;
    if (mode === 'matin') {
      debutMin = ouvertureMin;
      finMin = Math.min(ouvertureMin + 480, fermetureMin);
    } else if (mode === 'apres-midi') {
      finMin = fermetureMin;
      debutMin = Math.max(fermetureMin - 480, ouvertureMin);
    } else {
      debutMin = ouvertureMin;
      finMin = fermetureMin;
    }

    const debut = new Date();
    debut.setHours(Math.floor(debutMin / 60), debutMin % 60, 0, 0);
    const fin = new Date();
    fin.setHours(Math.floor(finMin / 60), finMin % 60, 0, 0);

    setHeureDebutChoisie(debut);
    setHeureFinChoisie(fin);
  };

  const fermerAjout = () => {
    setAjoutPourDate(null);
    setRegleJourPourAjout(undefined);
    setModeCreneau('personnalise');
    setPersonneChoisie(null);
    setPickerHeureOuvert(null);
  };

  const creerShiftPourPersonne = async (personne: Profile) => {
    if (!profile || !popUpId || !ajoutPourDate) return;
    const heureDebut = formatHeureAffichee(heureDebutChoisie) + ':00';
    const heureFin = formatHeureAffichee(heureFinChoisie) + ':00';
    if (heureFin <= heureDebut) {
      Alert.alert('Heures invalides', "L'heure de fin doit être après l'heure de début.");
      return;
    }
    if (estDejaOccupeAilleurs(personne, ajoutPourDate, heureDebut, heureFin)) {
      Alert.alert('Conflit', `${personne.nom_complet || personne.email} est déjà sur un autre créneau à cette heure.`);
      return;
    }
    await insererShifts([
      {
        pop_up_id: popUpId,
        profile_id: personne.id,
        date: ajoutPourDate,
        heure_debut: heureDebut,
        heure_fin: heureFin,
        statut: 'brouillon',
        genere_automatiquement: false,
        created_by: profile.id,
      },
    ]);
    invalidateShifts();
    // On revient à la liste (sans fermer la feuille) pour pouvoir ajouter quelqu'un d'autre au même créneau.
    setPersonneChoisie(null);
  };

  const dejaSurCeCreneau = (personne: Profile) => {
    if (!ajoutPourDate) return undefined;
    const heureDebut = formatHeureAffichee(heureDebutChoisie) + ':00';
    const heureFin = formatHeureAffichee(heureFinChoisie) + ':00';
    return (shifts ?? []).find(
      (s) =>
        s.pop_up_id === popUpId &&
        s.profile_id === personne.id &&
        s.date === ajoutPourDate &&
        s.heure_debut === heureDebut &&
        s.heure_fin === heureFin,
    );
  };

  const choisirPersonne = (personne: Profile) => {
    const assignation = dejaSurCeCreneau(personne);
    if (assignation) {
      Alert.alert('Retirer', `Retirer ${personne.nom_complet || personne.email} de ce créneau ?`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            await supprimerShift(assignation.id);
            invalidateShifts();
          },
        },
      ]);
      return;
    }
    if (modeCreneau === 'personnalise') {
      setPersonneChoisie(personne);
      return;
    }
    creerShiftPourPersonne(personne);
  };

  const confirmerAjout = () => {
    if (personneChoisie) creerShiftPourPersonne(personneChoisie);
  };

  const ouvrirAjoutDepuisBloc = (shift: PlanningShift) => {
    const jour = jours.find((j) => dateEnISO(j) === shift.date);
    const regleJour = jour ? horaires?.find((h) => h.jour_semaine === jourSemaineISO(jour)) : undefined;

    setAjoutPourDate(shift.date);
    setRegleJourPourAjout(regleJour);
    setModeCreneau('personnalise');
    setPersonneChoisie(null);

    const [hD, mD] = shift.heure_debut.split(':').map(Number);
    const [hF, mF] = shift.heure_fin.split(':').map(Number);
    const debut = new Date();
    debut.setHours(hD, mD, 0, 0);
    const fin = new Date();
    fin.setHours(hF, mF, 0, 0);
    setHeureDebutChoisie(debut);
    setHeureFinChoisie(fin);
  };

  // Pastille verte/rouge dans "Qui travaille ?" : indique si le créneau choisi tombe dans
  // l'horaire récurrent habituel de la personne pour ce jour de la semaine (simple indication,
  // n'empêche pas de l'ajouter quand même — ex. renfort ponctuel hors de son horaire habituel).
  const estDisponiblePourCreneau = (personne: Profile) => {
    if (!ajoutPourDate) return false;
    if (personne.role === 'admin') return true;
    const heureDebut = formatHeureAffichee(heureDebutChoisie) + ':00';
    const heureFin = formatHeureAffichee(heureFinChoisie) + ':00';
    const jour = jours.find((j) => dateEnISO(j) === ajoutPourDate);
    if (!jour) return false;
    const jourIso = jourSemaineISO(jour);
    return (horairesRecurrents ?? []).some(
      (h) =>
        h.profile_id === personne.id &&
        h.pop_up_id === popUpId &&
        h.jour_semaine === jourIso &&
        h.actif &&
        seChevauchent(h.heure_debut, h.heure_fin, heureDebut, heureFin),
    );
  };

  // Remplit automatiquement la semaine à partir de l'horaire récurrent de chaque personne (hors
  // admins, toujours gérés à la main) — cf. genererPlanning. L'admin peut ensuite encore
  // ajouter/retirer des personnes à la main sur les créneaux avant de valider et publier.
  // Toujours silencieux : plus aucun bouton ne déclenche cette fonction manuellement, elle ne
  // tourne qu'en arrière-plan (montage de l'écran + abonnement temps réel ci-dessous).
  const handleGenerer = async () => {
    if (!profile || !profils || !toutesHorairesOuverture) return;
    if ((horairesRecurrents ?? []).filter((h) => h.actif).length === 0) return;

    const joursMap = jours.map((j) => ({ date: dateEnISO(j), jour_semaine: jourSemaineISO(j) }));
    const shiftsExistants = (shifts ?? []).filter((s) => !(s.statut === 'brouillon' && s.genere_automatiquement));
    const resultat = genererPlanning({
      jours: joursMap,
      profiles: profils,
      horairesRecurrents: horairesRecurrents ?? [],
      horairesOuverture: toutesHorairesOuverture,
      conges: conges ?? [],
      joursEcole: joursEcole ?? [],
      shiftsExistants,
      mapAffectations,
      adminId: profile.id,
    });
    await supprimerShiftsGeneresAutomatiquement(dateDebut, dateFin);
    await insererShifts(resultat.shifts);
    invalidateShifts();
  };

  // Toujours à jour, contrairement à `handleGenerer` capturé au moment où l'effet ci-dessous
  // s'est monté : les abonnements réagissent à un événement arrivé n'importe quand plus tard.
  const handleGenererRef = useRef(handleGenerer);
  handleGenererRef.current = handleGenerer;

  // Régénère une première fois (silencieusement) dès que les données de la semaine affichée
  // sont chargées — pas besoin d'appuyer sur "Générer" en arrivant sur l'écran.
  useEffect(() => {
    if (chargement) return;
    handleGenererRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateDebut, dateFin, chargement]);

  // Puis re-régénère automatiquement (silencieusement, avec un léger anti-rebond) à chaque fois
  // qu'une indisponibilité, un horaire récurrent ou un jour d'école change — tant que cet écran
  // reste ouvert. Ne touche jamais les créneaux déjà validés/publiés ni les ajouts manuels
  // (cf. supprimerShiftsGeneresAutomatiquement), donc sans risque d'écraser un ajustement.
  useEffect(() => {
    let delai: ReturnType<typeof setTimeout> | null = null;
    const regenererAvecAntiRebond = () => {
      if (delai) clearTimeout(delai);
      delai = setTimeout(() => handleGenererRef.current(), 800);
    };

    const channel = supabase
      .channel(`auto-generation-planning-${dateDebut}-${dateFin}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conges' }, regenererAvecAntiRebond)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'horaires_recurrents_profil' },
        regenererAvecAntiRebond,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jours_ecole_alternant' },
        regenererAvecAntiRebond,
      )
      .subscribe();

    return () => {
      if (delai) clearTimeout(delai);
      supabase.removeChannel(channel);
    };
  }, [dateDebut, dateFin]);

  // Seules les personnes attribuées à ce pop-up peuvent y être planifiées (les admins sont
  // considérés attribués à tous les lieux, cf. estAttribueA).
  const candidatsPourAjout = ajoutPourDate && popUpId
    ? (profils ?? []).filter(
        (p) =>
          estAttribueA(p, popUpId, mapAffectations) &&
          !(conges ?? []).some(
            (c) => c.profile_id === p.id && ajoutPourDate >= c.date_debut && ajoutPourDate <= c.date_fin,
          ) &&
          (p.type_contrat !== 'alternant' ||
            !(joursEcole ?? []).some((j) => j.profile_id === p.id && j.date === ajoutPourDate)),
      )
    : [];

  if (chargement && onglet === 'planning') {
    return (
      <View style={[styles.ecran, styles.centre]}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.ecran}>
      <EnteteMenu titre="Calendrier" />

      <View style={styles.segment}>
        <Pressable
          onPress={() => setOnglet('planning')}
          style={[styles.segmentBouton, onglet === 'planning' && styles.segmentBoutonActif]}
        >
          <Text style={onglet === 'planning' ? styles.segmentTexteActif : styles.segmentTexte}>Planning</Text>
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
      <View style={styles.dropdownZone}>
        <Pressable onPress={() => setDropdownOuvert((v) => !v)} style={styles.dropdownBouton}>
          <View style={styles.dropdownLigne}>
            {!estMonCalendrier && (
              <View style={[styles.pastille, { backgroundColor: popUpActuel?.couleur ?? '#6366F1' }]} />
            )}
            <Text style={styles.dropdownTexte}>
              {estMonCalendrier ? 'Mon calendrier' : (popUpActuel?.nom ?? 'Choisir un pop-up')}
            </Text>
          </View>
          <Text style={styles.dropdownFleche}>{dropdownOuvert ? '︿' : '⌄'}</Text>
        </Pressable>

        {dropdownOuvert && (
          <View style={styles.dropdownListe}>
            <Pressable
              onPress={() => {
                setSelectionId('moi');
                setDropdownOuvert(false);
              }}
              style={styles.dropdownOption}
            >
              <Text style={styles.dropdownOptionTexte}>Mon calendrier</Text>
            </Pressable>
            {(popUps ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  setSelectionId(p.id);
                  setDropdownOuvert(false);
                }}
                style={styles.dropdownOption}
              >
                <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                <Text style={styles.dropdownOptionTexte}>{p.nom}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.semaineNav}>
        <Pressable onPress={semainePrecedente} style={styles.navBouton}>
          <Text style={styles.navFleche}>‹</Text>
        </Pressable>
        <Pressable onPress={revenirAujourdhui} style={{ flexShrink: 1 }}>
          <Text style={styles.navTexte} numberOfLines={1}>
            {libelleJourCourt(jours[0])} — {libelleJourCourt(jours[6])}
          </Text>
        </Pressable>
        <Pressable onPress={semaineSuivante} style={styles.navBouton}>
          <Text style={styles.navFleche}>›</Text>
        </Pressable>
      </View>

      {estMonCalendrier ? (
        <CalendrierPersonnel profile={profile} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
            <AxeHeures
              heureOuverture={horaires?.[0]?.heure_ouverture ?? '10:00:00'}
              heureFermeture={horaires?.[0]?.heure_fermeture ?? '20:00:00'}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {jours.map((jour) => {
                  const dateIso = dateEnISO(jour);
                  const jourIso = jourSemaineISO(jour);
                  const regleJour = horaires?.find((h) => h.jour_semaine === jourIso);
                  const shiftsJour = (shifts ?? []).filter((s) => s.pop_up_id === popUpId && s.date === dateIso);

                  return (
                    <TimelineJour
                      key={dateIso}
                      date={jour}
                      heureOuverture={regleJour?.heure_ouverture ?? '10:00:00'}
                      heureFermeture={regleJour?.heure_fermeture ?? '20:00:00'}
                      ferme={!regleJour?.actif}
                      shifts={shiftsJour}
                      profilParId={profilParId}
                      onPressBloc={ouvrirAjoutDepuisBloc}
                      onPressTimeline={(minutes) => ouvrirAjout(dateIso, regleJour, minutes)}
                    />
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {!estMonCalendrier && ajoutPourDate && (
        <Pressable style={styles.fond} onPress={fermerAjout}>
          <Pressable style={styles.feuille} onPress={() => {}}>
            <View style={styles.poignee} />

            {!personneChoisie ? (
              <>
                <Text style={styles.feuilleTitre}>Qui travaille ?</Text>

                <View style={styles.modeGrille}>
                  {MODES_CRENEAU.map((m) => (
                    <Pressable
                      key={m.value}
                      onPress={() => choisirMode(m.value)}
                      style={[styles.modeBouton, modeCreneau === m.value && styles.modeBoutonActif]}
                    >
                      <Text style={modeCreneau === m.value ? styles.modeTexteActif : styles.modeTexte}>
                        {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.apercuHoraire}>
                  {formatHeureAffichee(heureDebutChoisie)} - {formatHeureAffichee(heureFinChoisie)}
                </Text>

                <ScrollView style={{ maxHeight: 320 }}>
                  {candidatsPourAjout.map((p) => {
                    const assignation = dejaSurCeCreneau(p);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => choisirPersonne(p)}
                        style={[styles.ligneCandidat, assignation && styles.ligneCandidatAssignee]}
                      >
                        <View
                          style={[
                            styles.pastilleDispo,
                            { backgroundColor: estDisponiblePourCreneau(p) ? '#22C55E' : '#EF4444' },
                          ]}
                        />
                        <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                        <Text style={styles.candidatTexte}>{p.nom_complet || p.email}</Text>
                        {assignation && <Text style={styles.candidatAssigneeTexte}>✓ Retirer</Text>}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable onPress={fermerAjout} style={styles.boutonAnnuler}>
                  <Text style={styles.boutonAnnulerTexte}>Fermer</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.feuilleTitre}>{personneChoisie.nom_complet || personneChoisie.email}</Text>
                <View style={styles.ligneChamps}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>De</Text>
                    <Pressable onPress={() => setPickerHeureOuvert('debut')} style={styles.champ}>
                      <Text style={styles.champTexte}>{formatHeureAffichee(heureDebutChoisie)}</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>À</Text>
                    <Pressable onPress={() => setPickerHeureOuvert('fin')} style={styles.champ}>
                      <Text style={styles.champTexte}>{formatHeureAffichee(heureFinChoisie)}</Text>
                    </Pressable>
                  </View>
                </View>

                {pickerHeureOuvert &&
                  createElement(DateTimePicker, {
                    value: pickerHeureOuvert === 'debut' ? heureDebutChoisie : heureFinChoisie,
                    mode: 'time',
                    display: Platform.OS === 'ios' ? 'spinner' : 'default',
                    onChange: (event: { type: string }, valeur?: Date) => {
                      if (Platform.OS === 'android') setPickerHeureOuvert(null);
                      if (event.type === 'dismissed' || !valeur) return;
                      if (pickerHeureOuvert === 'debut') setHeureDebutChoisie(valeur);
                      else setHeureFinChoisie(valeur);
                    },
                  })}

                {Platform.OS === 'ios' && pickerHeureOuvert && (
                  <Pressable onPress={() => setPickerHeureOuvert(null)} style={{ marginBottom: 8, alignItems: 'center' }}>
                    <Text style={styles.ok}>OK</Text>
                  </Pressable>
                )}

                <View style={styles.ligneBoutons}>
                  <Pressable onPress={() => setPersonneChoisie(null)} style={styles.boutonAnnulerFlex}>
                    <Text style={styles.boutonAnnulerTexte}>Retour</Text>
                  </Pressable>
                  <Pressable onPress={confirmerAjout} style={styles.boutonValider}>
                    <Text style={styles.boutonValiderTexte}>Ajouter</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: 'white' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  segment: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    padding: 4,
  },
  segmentBouton: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 8 },
  segmentBoutonActif: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentTexte: { color: '#64748B' },
  segmentTexteActif: { fontWeight: '600', color: '#4F46E5' },
  dropdownZone: { position: 'relative', zIndex: 10, marginBottom: 6, paddingHorizontal: 16 },
  dropdownBouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownLigne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dropdownTexte: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  dropdownFleche: { color: '#94A3B8' },
  dropdownListe: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '100%',
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 },
  dropdownOptionTexte: { fontSize: 15, color: '#1E293B' },
  pastille: { height: 10, width: 10, borderRadius: 5 },
  pastilleDispo: { height: 8, width: 8, borderRadius: 4 },
  modeGrille: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  modeBouton: {
    flexBasis: '48%',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingVertical: 10,
  },
  modeBoutonActif: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
  modeTexte: { fontSize: 13, fontWeight: '600', color: '#475569' },
  modeTexteActif: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  apercuHoraire: { marginBottom: 12, textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#64748B' },
  semaineNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navBouton: { paddingHorizontal: 8, paddingVertical: 6 },
  navFleche: { fontSize: 18, color: '#6366F1' },
  navTexte: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  fond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  feuille: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20, paddingBottom: 32 },
  poignee: { marginBottom: 16, height: 6, width: 48, alignSelf: 'center', borderRadius: 3, backgroundColor: '#E2E8F0' },
  feuilleTitre: { marginBottom: 16, fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  ligneCandidat: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 12 },
  ligneCandidatAssignee: { backgroundColor: '#FEF2F2' },
  candidatTexte: { flex: 1, fontSize: 15, color: '#1E293B' },
  candidatAssigneeTexte: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  ligneChamps: { marginBottom: 8, flexDirection: 'row', gap: 12 },
  label: { marginBottom: 4, fontSize: 12, color: '#94A3B8' },
  champ: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 12 },
  champTexte: { textAlign: 'center', color: '#1E293B' },
  ok: { fontSize: 14, fontWeight: '600', color: '#4F46E5' },
  ligneBoutons: { marginTop: 12, flexDirection: 'row', gap: 12 },
  boutonAnnuler: {
    marginTop: 8,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
  },
  boutonAnnulerFlex: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
  },
  boutonAnnulerTexte: { fontWeight: '600', color: '#475569' },
  boutonValider: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#4F46E5', paddingVertical: 12 },
  boutonValiderTexte: { fontWeight: '600', color: 'white' },
});
