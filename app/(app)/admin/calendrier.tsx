/** @jsxImportSource react */
// Écran en StyleSheet (pas de className) : évite le bug NativeWind rencontré avec le
// sélecteur de date/heure natif sur l'écran Indisponibilités, ici utilisé aussi.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfMonth, startOfMonth } from 'date-fns';
import { createElement, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  fetchShiftsSemaine,
  insererShifts,
  mettreAJourShift,
  supprimerShift,
  supprimerShiftsGeneresAutomatiquement,
} from '@/api/planning';
import { supabase } from '@/api/supabaseClient';
import { AxeHeures } from '@/components/calendrier/AxeHeures';
import { CalendrierPersonnel } from '@/components/calendrier/CalendrierPersonnel';
import { PanneauCreationShift } from '@/components/calendrier/PanneauCreationShift';
import { PanneauIndisponibilites } from '@/components/calendrier/PanneauIndisponibilites';
import { TimelineJour } from '@/components/calendrier/TimelineJour';
import { VueParEmployes } from '@/components/calendrier/VueParEmployes';
import { VueParJour } from '@/components/calendrier/VueParJour';
import { VueParMois } from '@/components/calendrier/VueParMois';
import { VueParPopUps } from '@/components/calendrier/VueParPopUps';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { genererPlanning } from '@/domain/generationPlanning';
import { useCongesPeriode, useGererConges } from '@/hooks/useConges';
import { useJoursEcolePeriode } from '@/hooks/useAlternance';
import { useTousHorairesRecurrents } from '@/hooks/useHorairesRecurrents';
import { useDatesDebutContratTous } from '@/hooks/useInformationsRh';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { useHorairesOuverture, useToutesHorairesOuverture } from '@/hooks/useReglesMetier';
import { useAuthStore } from '@/store/useAuthStore';
import { useSemaineStore } from '@/store/useSemaineStore';
import { construireMapAffectations, couleurCaseNomSalarie, estAttribueA } from '@/utils/affectations';
import {
  dateEnISO,
  formatDureeHeures,
  joursDeLaSemaine,
  jourSemaineISO,
  libelleJourCourt,
  libellePeriodeCourte,
  totalHeuresTravaillees,
} from '@/utils/dateUtils';
import { minutesVersHeure, versMinutes } from '@/utils/timelineLayout';
import type { Conge, PlanningShift, PopUp, Profile, TypeContrat } from '@/types/database.types';

// Permet d'appliquer une transform animée (glissement) tout en gardant le comportement Pressable
// (onPress vide = capture le tap pour qu'il ne remonte pas au fond assombri derrière).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

// Sélecteur de vue desktop (web uniquement) : remplace la grille semaine unique par plusieurs vues
// façon Combo, appliquées à la vue "équipe" (pas "Mon calendrier", qui reste CalendrierPersonnel).
// 'jour'/'mois' restent supportées par le code (VueParJour/VueParMois) mais volontairement pas
// listées dans VUES_CALENDRIER pour l'instant — on démarre avec pop-up/employés seulement, cf.
// consigne, et on rajoutera jour/mois à cette liste plus tard sans autre changement.
type VueCalendrier = 'popups' | 'employes' | 'jour' | 'mois';
type NomIconeVue = keyof typeof Ionicons.glyphMap;

const VUES_CALENDRIER: { value: VueCalendrier; label: string; icone: NomIconeVue }[] = [
  { value: 'popups', label: 'Vue par pop-up', icone: 'storefront-outline' },
  { value: 'employes', label: 'Vue par employés', icone: 'people-outline' },
];

// Filtres desktop (web uniquement, cf. barre de filtres) : purement de l'affichage local sur les
// shifts déjà chargés, aucune nouvelle requête. 'tous' = pas de filtre par type de contrat.
type FiltreContrat = 'tous' | TypeContrat;

const LIBELLE_TYPE_CONTRAT: Record<TypeContrat, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

const FILTRES_CONTRAT: FiltreContrat[] = ['tous', 'manager', 'employe', 'alternant'];

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
  const { data: datesDebutContrat } = useDatesDebutContratTous();

  const [dropdownOuvert, setDropdownOuvert] = useState(false);
  const [vueDropdownOuvert, setVueDropdownOuvert] = useState(false);

  // Filtres desktop de la vue équipe (barre de filtres web, cf. rendu ci-dessous) : recherche par
  // nom/email et type de contrat. Sans effet côté mobile, où aucune UI ne les modifie jamais.
  const [rechercheMembre, setRechercheMembre] = useState('');
  const [filtreContrat, setFiltreContrat] = useState<FiltreContrat>('tous');

  const choisirLieu = (id: string) => {
    setSelectionId(id);
    setRechercheMembre('');
    setFiltreContrat('tous');
  };

  const profilCorrespondFiltres = (profil: Profile | undefined) => {
    if (!profil) return false;
    if (filtreContrat !== 'tous' && profil.type_contrat !== filtreContrat) return false;
    const recherche = rechercheMembre.trim().toLowerCase();
    if (recherche && !`${profil.nom_complet} ${profil.email}`.toLowerCase().includes(recherche)) return false;
    return true;
  };

  // --- Nouvelles vues desktop (web uniquement) : sélecteur de vue + données dérivées pour les 3
  // vues (Vue par employés/jour/mois) et le panneau "Créer un shift/absence" qui les remplace. Le
  // mobile n'utilise rien de ce qui suit (cf. gates Platform.OS === 'web' au rendu, plus bas). ---
  const [vue, setVue] = useState<VueCalendrier>('employes');
  const [rechercheVue, setRechercheVue] = useState('');
  const popUpParId = new Map((popUps ?? []).map((p) => [p.id, p]));
  const [jourSelectionneIso, setJourSelectionneIso] = useState<string>(() => dateEnISO(new Date()));

  // Vue par mois : besoin des shifts sur tout le mois affiché, hors de la plage semaine déjà
  // chargée par useShiftsSemaine — requête dédiée, activée seulement en vue "mois" web.
  const moisDebutIso = dateEnISO(startOfMonth(dateReference));
  const moisFinIso = dateEnISO(endOfMonth(dateReference));
  const { data: shiftsMois } = useQuery({
    queryKey: ['planning-shifts-mois', moisDebutIso, moisFinIso],
    queryFn: () => fetchShiftsSemaine(moisDebutIso, moisFinIso),
    enabled: Platform.OS === 'web' && vue === 'mois',
  });
  // Jours d'école (alternants) sur tout le mois affiché, pour l'indicateur "École" de la vue par
  // mois — même schéma que shiftsMois ci-dessus, `joursEcole` (semaine) ne couvrant pas le mois
  // entier. Requête non gatée par `enabled` (comme `joursEcole`) : coût négligeable, simplicité.
  const { data: joursEcoleMois } = useJoursEcolePeriode(moisDebutIso, moisFinIso);

  // Vue équipe web (par pop-up / par employés) : agrège désormais tous les lieux, il n'y a plus de
  // sélection préalable d'un seul pop-up (cf. VueParPopUps/VueParEmployes) — seuls les filtres
  // desktop (recherche/type de contrat) s'appliquent encore.
  const profilsEquipeWeb = (profils ?? []).filter((p) => profilCorrespondFiltres(p));
  const shiftsEquipeSemaine = (shifts ?? []).filter((s) => profilCorrespondFiltres(profilParId.get(s.profile_id)));
  const shiftsEquipeMois = (shiftsMois ?? []).filter((s) => profilCorrespondFiltres(profilParId.get(s.profile_id)));

  // Vue par jour (pas encore proposée dans le sélecteur, cf. VUES_CALENDRIER) : reste scopée à un
  // seul pop-up (celui choisi côté mobile), code conservé tel quel pour un ajout ultérieur.
  const jourSelectionne = jours.find((j) => dateEnISO(j) === jourSelectionneIso) ?? jours[0];
  const regleJourSelectionne = horaires?.find((h) => h.jour_semaine === jourSemaineISO(jourSelectionne));
  const shiftsJourSelectionneFiltres = popUpId
    ? (shifts ?? [])
        .filter((s) => s.pop_up_id === popUpId && s.date === jourSelectionneIso)
        .filter((s) => profilCorrespondFiltres(profilParId.get(s.profile_id)))
    : [];

  // Panneau latéral "Créer un shift / une absence" (web uniquement), remplace la feuille "Qui
  // travaille ?" ci-dessous pour la vue équipe desktop.
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [panneauDate, setPanneauDate] = useState('');
  const [panneauProfil, setPanneauProfil] = useState<Profile | null>(null);
  const [panneauPopUpId, setPanneauPopUpId] = useState<string | undefined>(undefined);
  const [panneauHeureDebut, setPanneauHeureDebut] = useState<string | undefined>(undefined);
  const [panneauHeureFin, setPanneauHeureFin] = useState<string | undefined>(undefined);
  // Shift(s) déjà présents sur la cellule cliquée (vide pour une cellule libre) : permet au
  // panneau de proposer un bouton "Supprimer" qui les retire, en plus d'"Ajouter".
  const [panneauShiftsExistants, setPanneauShiftsExistants] = useState<PlanningShift[]>([]);

  // Suppression d'un congé/indisponibilité directement depuis sa cellule rouge dans la vue par
  // employés (cf. VueParEmployes/celluleConge) : cliquer dessus n'a pas de sens pour créer un
  // shift (la personne est absente), donc on propose plutôt de le supprimer. Réutilise le même
  // hook que PanneauIndisponibilites/équipe (useGererConges) — pas de nouvelle voie de suppression.
  const { supprimer: supprimerConge } = useGererConges(undefined);

  // Sur web, Alert.alert ne fait rien (react-native-web l'implémente comme un no-op complet,
  // cf. node_modules/react-native-web/src/exports/Alert) — la confirmation ne s'affichait donc
  // jamais et le clic semblait ne rien faire. window.confirm fonctionne réellement sur web ; cette
  // fonction n'est de toute façon appelée que depuis la vue web (VueParEmployes).
  const handlePressCelluleConge = (conge: Conge, profilCible: Profile) => {
    const confirme = window.confirm(
      `Supprimer ${conge.type === 'conge' ? 'le congé' : "l'indisponibilité"} de ${profilCible.nom_complet || profilCible.email} ? Cette action est irréversible.`,
    );
    if (!confirme) return;
    supprimerConge.mutate(conge);
  };

  // Vue par employés : la ligne identifie déjà la personne, le lieu vient du premier shift existant
  // sur la cellule (si déjà rempli), sinon laissé au panneau de choisir (premier pop-up par défaut).
  const ouvrirPanneauPourCelluleEmploye = (
    profilCible: Profile,
    dateIso: string,
    shiftsExistants: PlanningShift[],
  ) => {
    setPanneauProfil(profilCible);
    setPanneauPopUpId(shiftsExistants[0]?.pop_up_id);
    setPanneauDate(dateIso);
    setPanneauHeureDebut(shiftsExistants[0] ? shiftsExistants[0].heure_debut.slice(0, 5) : undefined);
    setPanneauHeureFin(shiftsExistants[0] ? shiftsExistants[0].heure_fin.slice(0, 5) : undefined);
    setPanneauShiftsExistants(shiftsExistants);
    setPanneauOuvert(true);
  };

  // Vue par pop-up : la ligne identifie déjà le lieu, la personne vient du premier shift existant
  // sur la cellule (si déjà rempli), sinon laissée au panneau (aucun salarié pré-sélectionné).
  const ouvrirPanneauPourCellulePopUp = (popUp: PopUp, dateIso: string, shiftsExistants: PlanningShift[]) => {
    setPanneauProfil(shiftsExistants[0] ? (profilParId.get(shiftsExistants[0].profile_id) ?? null) : null);
    setPanneauPopUpId(popUp.id);
    setPanneauDate(dateIso);
    setPanneauHeureDebut(shiftsExistants[0] ? shiftsExistants[0].heure_debut.slice(0, 5) : undefined);
    setPanneauHeureFin(shiftsExistants[0] ? shiftsExistants[0].heure_fin.slice(0, 5) : undefined);
    setPanneauShiftsExistants(shiftsExistants);
    setPanneauOuvert(true);
  };

  const ouvrirPanneauPourJour = (dateIso: string, hDebut?: string, hFin?: string) => {
    setPanneauProfil(null);
    setPanneauDate(dateIso);
    setPanneauHeureDebut(hDebut);
    setPanneauHeureFin(hFin);
    setPanneauShiftsExistants([]);
    setPanneauOuvert(true);
  };

  const ouvrirPanneauDepuisBlocJour = (shift: PlanningShift) => {
    setPanneauProfil(profilParId.get(shift.profile_id) ?? null);
    setPanneauDate(shift.date);
    setPanneauHeureDebut(shift.heure_debut.slice(0, 5));
    setPanneauHeureFin(shift.heure_fin.slice(0, 5));
    setPanneauShiftsExistants([shift]);
    setPanneauOuvert(true);
  };

  // Même logique d'arrondi/bornage que `ouvrirAjout` (feuille mobile, plus bas dans ce fichier),
  // dupliquée à dessein plutôt que factorisée : `ouvrirAjout` reste intact pour ne rien risquer
  // côté mobile (cf. consigne "TimelineJour/CalendrierPersonnel/PanneauIndisponibilites non
  // modifiés" — même prudence appliquée ici au code mobile de ce fichier).
  const calculerHorairesDepuisClicTimeline = (
    regleJour: { heure_ouverture: string; heure_fermeture: string } | undefined,
    minutesDepuisOuverture: number,
  ) => {
    const [hO, mO] = (regleJour?.heure_ouverture ?? '10:00:00').split(':').map(Number);
    const [hF, mF] = (regleJour?.heure_fermeture ?? '20:00:00').split(':').map(Number);
    const ouvertureMin = hO * 60 + mO;
    const fermetureMin = hF * 60 + mF;
    let debutMin = Math.round((ouvertureMin + minutesDepuisOuverture) / 15) * 15;
    debutMin = Math.max(ouvertureMin, Math.min(debutMin, fermetureMin - 30));
    const finMin = Math.min(debutMin + 120, fermetureMin);
    return { heureDebut: minutesVersHeure(debutMin).slice(0, 5), heureFin: minutesVersHeure(finMin).slice(0, 5) };
  };

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

  // Web (vue équipe agrégée, cf. plus bas) n'a plus besoin des horaires d'un pop-up précis pour
  // s'afficher — seul le mobile (qui garde son propre pop-up sélectionné) attend chargementHoraires.
  const chargement =
    chargementPopUps ||
    chargementProfils ||
    chargementShifts ||
    (Platform.OS !== 'web' && !estMonCalendrier && (chargementHoraires || !popUpId));

  // Invalide la requête de la semaine ET celle, séparée, de la vue par mois (web) — cette
  // dernière n'a pas d'abonnement Realtime, donc sans ce second invalidate elle resterait figée
  // après une régénération auto ou une création manuelle tant qu'on ne rechargeait pas la page.
  // Invalider une requête inactive (vue semaine affichée, pas mois) ne coûte rien : React Query la
  // marque juste "stale", elle ne se relance que si elle redevient active.
  const invalidateShifts = () => {
    queryClient.invalidateQueries({ queryKey: ['planning-shifts', dateDebut, dateFin] });
    queryClient.invalidateQueries({ queryKey: ['planning-shifts-mois', moisDebutIso, moisFinIso] });
  };

  const seChevauchent = (aDebut: string, aFin: string, bDebut: string, bFin: string) =>
    aDebut < bFin && bDebut < aFin;

  const shiftsEnConflit = (p: Profile, dateIso: string, heureDebut: string, heureFin: string) =>
    (shifts ?? []).filter(
      (s) => s.profile_id === p.id && s.date === dateIso && seChevauchent(s.heure_debut, s.heure_fin, heureDebut, heureFin),
    );

  // Vérifie qu'un nouveau créneau (glissé/redimensionné) n'entre pas en conflit avec un autre
  // créneau de la même personne ce jour-là — les autres créneaux du même groupe déplacé sont
  // exclus puisqu'ils bougent ensemble, pas entre eux.
  const conflitApresDeplacement = (
    shiftsDeplaces: PlanningShift[],
    nouveauxCreneaux: Map<string, { heure_debut: string; heure_fin: string }>,
  ) => {
    const idsDeplaces = new Set(shiftsDeplaces.map((s) => s.id));
    return shiftsDeplaces.some((shift) => {
      const nouveau = nouveauxCreneaux.get(shift.id);
      if (!nouveau) return false;
      return (shifts ?? []).some(
        (autre) =>
          !idsDeplaces.has(autre.id) &&
          autre.profile_id === shift.profile_id &&
          autre.date === shift.date &&
          seChevauchent(autre.heure_debut, autre.heure_fin, nouveau.heure_debut, nouveau.heure_fin),
      );
    });
  };

  const handleShiftMoved = async (shiftsDeplaces: PlanningShift[], deltaMinutes: number): Promise<boolean> => {
    const nouveaux = new Map(
      shiftsDeplaces.map((s) => [
        s.id,
        {
          heure_debut: minutesVersHeure(versMinutes(s.heure_debut) + deltaMinutes),
          heure_fin: minutesVersHeure(versMinutes(s.heure_fin) + deltaMinutes),
        },
      ]),
    );
    if (conflitApresDeplacement(shiftsDeplaces, nouveaux)) {
      Alert.alert('Conflit', 'Ce créneau chevaucherait un autre créneau existant pour cette personne.');
      return false;
    }
    for (const shift of shiftsDeplaces) {
      const nouveau = nouveaux.get(shift.id)!;
      await mettreAJourShift(shift.id, nouveau);
    }
    invalidateShifts();
    return true;
  };

  const handleShiftResized = async (
    shiftsRedimensionnes: PlanningShift[],
    bord: 'debut' | 'fin',
    nouvelleMinutes: number,
  ): Promise<boolean> => {
    const nouvelleHeure = minutesVersHeure(nouvelleMinutes);
    const nouveaux = new Map(
      shiftsRedimensionnes.map((s) => [
        s.id,
        {
          heure_debut: bord === 'debut' ? nouvelleHeure : s.heure_debut,
          heure_fin: bord === 'fin' ? nouvelleHeure : s.heure_fin,
        },
      ]),
    );
    if (conflitApresDeplacement(shiftsRedimensionnes, nouveaux)) {
      Alert.alert('Conflit', 'Ce créneau chevaucherait un autre créneau existant pour cette personne.');
      return false;
    }
    for (const shift of shiftsRedimensionnes) {
      const nouveau = nouveaux.get(shift.id)!;
      await mettreAJourShift(shift.id, bord === 'debut' ? { heure_debut: nouveau.heure_debut } : { heure_fin: nouveau.heure_fin });
    }
    invalidateShifts();
    return true;
  };

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

  // Glissement vers le bas sur la poignée grise pour fermer la feuille "Qui travaille ?", au lieu
  // de forcer à taper en dehors ou sur "Fermer" — même logique que FeuilleModale (composants
  // partagés) ailleurs dans l'app, réécrite ici en StyleSheet/Animated pour rester cohérente avec
  // le reste de cet écran (cf. commentaire en tête de fichier).
  const translateYAjout = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (ajoutPourDate) translateYAjout.setValue(0);
  }, [ajoutPourDate, translateYAjout]);
  const panResponderAjout = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, geste) => Math.abs(geste.dy) > 6,
      onPanResponderMove: (_e, geste) => {
        if (geste.dy > 0) translateYAjout.setValue(geste.dy);
      },
      onPanResponderRelease: (_e, geste) => {
        if (geste.dy > 100 || geste.vy > 0.8) {
          Animated.timing(translateYAjout, { toValue: 800, duration: 180, useNativeDriver: true }).start(() => {
            translateYAjout.setValue(0);
            fermerAjout();
          });
        } else {
          Animated.spring(translateYAjout, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const creerShiftPourPersonne = async (personne: Profile, conflitsAEcraser: PlanningShift[] = []) => {
    if (!profile || !popUpId || !ajoutPourDate) return;
    const heureDebut = formatHeureAffichee(heureDebutChoisie) + ':00';
    const heureFin = formatHeureAffichee(heureFinChoisie) + ':00';
    if (heureFin <= heureDebut) {
      Alert.alert('Heures invalides', "L'heure de fin doit être après l'heure de début.");
      return;
    }

    const conflits = shiftsEnConflit(personne, ajoutPourDate, heureDebut, heureFin);
    // Les conflits n'ont pas encore été confirmés à écraser : on demande, plutôt qu'un blocage sec.
    if (conflits.length > 0 && conflitsAEcraser.length === 0) {
      const details = conflits
        .map((c) => {
          const nomLieu = popUps?.find((p) => p.id === c.pop_up_id)?.nom ?? 'un autre lieu';
          return `${nomLieu} (${c.heure_debut.slice(0, 5)}-${c.heure_fin.slice(0, 5)})`;
        })
        .join(', ');
      Alert.alert(
        "Conflit d'horaire",
        `${personne.nom_complet || personne.email} est déjà sur : ${details}. Remplacer par ce nouveau créneau ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Remplacer',
            style: 'destructive',
            onPress: () => creerShiftPourPersonne(personne, conflits),
          },
        ],
      );
      return;
    }

    for (const c of conflitsAEcraser) {
      await supprimerShift(c.id);
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

    const continuer = () => {
      if (modeCreneau === 'personnalise') {
        setPersonneChoisie(personne);
        return;
      }
      creerShiftPourPersonne(personne);
    };

    if (ajoutPourDate) {
      const heureDebut = formatHeureAffichee(heureDebutChoisie) + ':00';
      const heureFin = formatHeureAffichee(heureFinChoisie) + ':00';
      if (congeEnConflit(personne, ajoutPourDate, heureDebut, heureFin)) {
        Alert.alert(
          'Indisponible',
          `${personne.nom_complet || personne.email} n'est pas disponible ce jour-ci (indisponibilité déclarée). Continuer quand même ?`,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Continuer', onPress: continuer },
          ],
        );
        return;
      }
    }

    continuer();
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

  // Congé/indisponibilité déclaré par la personne elle-même qui couvre la date + créneau visés
  // (jour entier si heure_debut/heure_fin non renseignées, sinon seulement s'il chevauche).
  const congeEnConflit = (personne: Profile, dateIso: string, heureDebut: string, heureFin: string) =>
    (conges ?? []).find((c) => {
      if (c.profile_id !== personne.id) return false;
      if (dateIso < c.date_debut || dateIso > c.date_fin) return false;
      if (c.heure_debut && c.heure_fin) return seChevauchent(c.heure_debut, c.heure_fin, heureDebut, heureFin);
      return true;
    });

  // Pastille verte/rouge dans "Qui travaille ?" : rouge si la personne a déclaré une
  // indisponibilité sur ce créneau, ou si le créneau choisi tombe hors de son horaire récurrent
  // habituel pour ce jour de la semaine (simple indication, n'empêche pas de l'ajouter quand même
  // — ex. renfort ponctuel hors de son horaire habituel — mais un avertissement est affiché au
  // clic dans le cas d'une indisponibilité déclarée, cf. choisirPersonne).
  const estDisponiblePourCreneau = (personne: Profile) => {
    if (!ajoutPourDate) return false;
    if (personne.role === 'admin') return true;
    const heureDebut = formatHeureAffichee(heureDebutChoisie) + ':00';
    const heureFin = formatHeureAffichee(heureFinChoisie) + ':00';
    if (congeEnConflit(personne, ajoutPourDate, heureDebut, heureFin)) return false;
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

  // Remplit automatiquement la semaine à partir de l'horaire récurrent de chaque personne, plus un
  // horaire 9h-19h au local par défaut pour les admins sans horaire récurrent ce jour-là — cf.
  // genererPlanning. L'admin peut ensuite encore ajouter/retirer des personnes à la main sur les
  // créneaux avant de valider et publier.
  // Toujours silencieux : plus aucun bouton ne déclenche cette fonction manuellement, elle ne
  // tourne qu'en arrière-plan (montage de l'écran + abonnement temps réel ci-dessous).
  // Verrou anti-concurrence : sans lui, deux appels quasi simultanés (ex. double-invocation des
  // effets en StrictMode/dev, ou montage + anti-rebond réseau qui se chevauchent) lancent chacun
  // leur propre supprimer-puis-réinsérer en parallèle ; comme aucun n'attend l'autre, les deux
  // insertions survivent et chaque créneau généré se retrouve en double dans le planning.
  const genererEnCoursRef = useRef(false);
  const handleGenerer = async () => {
    if (genererEnCoursRef.current) return;
    if (!profile || !profils || !toutesHorairesOuverture) return;
    if ((horairesRecurrents ?? []).filter((h) => h.actif).length === 0) return;

    genererEnCoursRef.current = true;
    try {
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
        popUps: popUps ?? [],
        adminId: profile.id,
        datesDebutContrat: datesDebutContrat ?? [],
      });
      await supprimerShiftsGeneresAutomatiquement(dateDebut, dateFin);
      await insererShifts(resultat.shifts);
      invalidateShifts();
    } finally {
      genererEnCoursRef.current = false;
    }
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'informations_rh' },
        regenererAvecAntiRebond,
      )
      .subscribe();

    return () => {
      if (delai) clearTimeout(delai);
      supabase.removeChannel(channel);
    };
  }, [dateDebut, dateFin]);

  // Seules les personnes attribuées à ce pop-up peuvent y être planifiées (les admins sont
  // considérés attribués à tous les lieux, cf. estAttribueA). Une indisponibilité déclarée
  // n'exclut plus la personne de la liste : elle reste visible avec la pastille rouge
  // (estDisponiblePourCreneau) et un avertissement à la confirmation (cf. choisirPersonne) —
  // avant, elle disparaissait complètement de la liste, invisible même pour passer outre.
  const candidatsPourAjout = ajoutPourDate && popUpId
    ? (profils ?? []).filter(
        (p) =>
          estAttribueA(p, popUpId, mapAffectations) &&
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
    <View style={[styles.ecran, Platform.OS === 'web' && styles.ecranWeb]}>
      <EnteteMenu titre="Calendrier" masquerTitre={Platform.OS === 'web'} />

      {Platform.OS !== 'web' && (
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
      )}

      {onglet === 'indisponibilites' ? (
        <PanneauIndisponibilites />
      ) : (
        <>
      {Platform.OS === 'web' ? (
        <View style={styles.toolbarWeb}>
          <View style={styles.controlsRowWeb}>
              <View style={styles.controlsColonne}>
                <View style={styles.rechercheWrapper}>
                  <Ionicons name="search-outline" size={16} color="#94A3B8" style={styles.rechercheIcone} />
                  <input
                    placeholder="Rechercher un membre de l'équipe"
                    value={rechercheMembre}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setRechercheMembre(e.target.value)}
                    style={styles.rechercheInputWeb as unknown as CSSProperties}
                  />
                </View>
              </View>

              {/* Navigateur de date + sélecteur de vue, appariés l'un à côté de l'autre (même
                  hauteur/rayon) façon Combo ("‹ 20 juil. - 26 juil. 2026 › · Vue par employés ⌄"),
                  centrés au milieu de la barre (colonne centrale d'une rangée à 3 colonnes égales
                  gauche/centre/droite, la droite servant juste de contrepoids symétrique). */}
              <View style={[styles.controlsColonne, styles.controlsColonneCentre]}>
              <View style={styles.navPairWeb}>
                <View style={[styles.semaineNav, styles.semaineNavWebCompact]}>
                  <Pressable onPress={semainePrecedente} style={styles.navBouton}>
                    <Ionicons name="chevron-back" size={14} color="#94A3B8" />
                  </Pressable>
                  <Pressable onPress={revenirAujourdhui} style={{ flexShrink: 1 }}>
                    <Text style={styles.navTexte} numberOfLines={1}>
                      {libellePeriodeCourte(jours[0], jours[6])}
                    </Text>
                  </Pressable>
                  <Pressable onPress={semaineSuivante} style={styles.navBouton}>
                    <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                  </Pressable>
                </View>

                <View style={styles.vueDropdownZone}>
                  <Pressable
                    onPress={() => setVueDropdownOuvert((v) => !v)}
                    style={styles.vueDropdownBouton}
                  >
                    <Text style={styles.vueDropdownTexte}>{VUES_CALENDRIER.find((v) => v.value === vue)?.label}</Text>
                    <Ionicons name={vueDropdownOuvert ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />
                  </Pressable>
                  {vueDropdownOuvert && (
                    <View style={styles.vueDropdownListe}>
                      <View style={styles.vueDropdownRechercheWrapper}>
                        <Ionicons name="search-outline" size={14} color="#94A3B8" style={styles.vueDropdownRechercheIcone} />
                        <input
                          placeholder="Rechercher une vue"
                          value={rechercheVue}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setRechercheVue(e.target.value)}
                          style={styles.vueDropdownRechercheInput as unknown as CSSProperties}
                          autoFocus
                        />
                      </View>
                      {VUES_CALENDRIER.filter((v) =>
                        v.label.toLowerCase().includes(rechercheVue.trim().toLowerCase()),
                      ).map((v) => (
                        <Pressable
                          key={v.value}
                          onPress={() => {
                            setVue(v.value);
                            setVueDropdownOuvert(false);
                            setRechercheVue('');
                          }}
                          style={[styles.dropdownOption, vue === v.value && styles.vueDropdownOptionActive]}
                        >
                          <Ionicons name={v.icone} size={16} color={vue === v.value ? '#4338CA' : '#64748B'} />
                          <Text
                            style={[
                              styles.dropdownOptionTexte,
                              styles.vueDropdownOptionLabel,
                              vue === v.value && styles.vueDropdownOptionTexteActive,
                            ]}
                          >
                            {v.label}
                          </Text>
                          {vue === v.value && <Ionicons name="checkmark" size={16} color="#4338CA" />}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.controlsColonne} />
          </View>
        </View>
      ) : (
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
      )}

      {/* Nav semaine "pleine largeur" classique : mobile uniquement désormais (web affiche
          toujours la vue équipe agrégée, le nav + le sélecteur de vue sont appariés dans
          controlsRowWeb ci-dessus). */}
      {Platform.OS !== 'web' && (
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
      )}

      {Platform.OS === 'web' ? (
        <View style={{ flex: 1, minHeight: 0 }}>
          {vue === 'popups' && (
            <VueParPopUps
              jours={jours}
              popUps={popUps ?? []}
              shifts={shiftsEquipeSemaine}
              profilParId={profilParId}
              onPressCellule={ouvrirPanneauPourCellulePopUp}
            />
          )}
          {vue === 'employes' && (
            <VueParEmployes
              jours={jours}
              profils={profilsEquipeWeb}
              shifts={shiftsEquipeSemaine}
              onPressCellule={ouvrirPanneauPourCelluleEmploye}
              onPressCelluleConge={handlePressCelluleConge}
              popUpParId={popUpParId}
              joursEcole={joursEcole ?? []}
              conges={conges ?? []}
              mapAffectations={mapAffectations}
              popUps={popUps ?? []}
            />
          )}
          {vue === 'jour' && (
            <VueParJour
              jours={jours}
              jourSelectionneIso={jourSelectionneIso}
              onSelectJour={setJourSelectionneIso}
              date={jourSelectionne}
              heureOuverture={regleJourSelectionne?.heure_ouverture ?? '10:00:00'}
              heureFermeture={regleJourSelectionne?.heure_fermeture ?? '20:00:00'}
              ferme={!regleJourSelectionne?.actif}
              shifts={shiftsJourSelectionneFiltres}
              profilParId={profilParId}
              onPressBloc={ouvrirPanneauDepuisBlocJour}
              onPressTimeline={(minutes) => {
                const { heureDebut, heureFin } = calculerHorairesDepuisClicTimeline(regleJourSelectionne, minutes);
                ouvrirPanneauPourJour(jourSelectionneIso, heureDebut, heureFin);
              }}
              popUpActuel={popUpActuel}
              joursEcole={joursEcole ?? []}
            />
          )}
          {vue === 'mois' && (
            <VueParMois
              moisReference={dateReference}
              profils={profilsEquipeWeb}
              shifts={shiftsEquipeMois}
              onPressCellule={ouvrirPanneauPourCelluleEmploye}
              couleurPopUp={popUpActuel?.couleur ?? '#6366F1'}
              joursEcole={joursEcoleMois ?? []}
              mapAffectations={mapAffectations}
              popUps={popUps ?? []}
            />
          )}
        </View>
      ) : estMonCalendrier ? (
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
                  const shiftsJour = (shifts ?? [])
                    .filter((s) => s.pop_up_id === popUpId && s.date === dateIso)
                    .filter((s) => profilCorrespondFiltres(profilParId.get(s.profile_id)));

                  return (
                    <TimelineJour
                      key={dateIso}
                      date={jour}
                      heureOuverture={regleJour?.heure_ouverture ?? '10:00:00'}
                      heureFermeture={regleJour?.heure_fermeture ?? '20:00:00'}
                      ferme={!regleJour?.actif}
                      shifts={shiftsJour}
                      profilParId={profilParId}
                      modifiable={Platform.OS !== 'web'}
                      onPressBloc={ouvrirAjoutDepuisBloc}
                      onPressTimeline={(minutes) => ouvrirAjout(dateIso, regleJour, minutes)}
                      onShiftMoved={handleShiftMoved}
                      onShiftResized={handleShiftResized}
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
          <AnimatedPressable
            style={[styles.feuille, { transform: [{ translateY: translateYAjout }] }]}
            onPress={() => {}}
          >
            <View {...panResponderAjout.panHandlers}>
              <View style={styles.poignee} />
            </View>

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
                    const heures = totalHeuresTravaillees(shifts ?? [], p.id);
                    const depassement = !!p.heures_max_semaine && heures > p.heures_max_semaine;
                    // Couleur du pop-up attribué (pas celle, propre à la personne, de p.couleur) —
                    // neutre pour un admin, cf. couleurCaseNomSalarie.
                    const couleurPopUpCandidat = couleurCaseNomSalarie(p, mapAffectations, popUps ?? []);
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
                        <View
                          style={[
                            styles.pastille,
                            couleurPopUpCandidat ? { backgroundColor: couleurPopUpCandidat } : styles.pastilleNeutre,
                          ]}
                        />
                        <Text style={styles.candidatTexte}>{p.nom_complet || p.email}</Text>
                        <Text style={[styles.candidatHeures, depassement && styles.candidatHeuresDepassement]}>
                          {formatDureeHeures(heures)}
                        </Text>
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

                {pickerHeureOuvert && Platform.OS === 'web' && (
                  <input
                    type="time"
                    value={formatHeureAffichee(pickerHeureOuvert === 'debut' ? heureDebutChoisie : heureFinChoisie)}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const texte = event.target.value;
                      if (!texte) return;
                      const [h, m] = texte.split(':').map(Number);
                      const base = new Date(pickerHeureOuvert === 'debut' ? heureDebutChoisie : heureFinChoisie);
                      base.setHours(h, m, 0, 0);
                      if (pickerHeureOuvert === 'debut') setHeureDebutChoisie(base);
                      else setHeureFinChoisie(base);
                      setPickerHeureOuvert(null);
                    }}
                    style={styles.champInputWeb as unknown as CSSProperties}
                  />
                )}
                {pickerHeureOuvert &&
                  Platform.OS !== 'web' &&
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
          </AnimatedPressable>
        </Pressable>
      )}

      {Platform.OS === 'web' && (
        <PanneauCreationShift
          visible={panneauOuvert}
          onClose={() => setPanneauOuvert(false)}
          popUps={popUps ?? []}
          popUpIdInitial={panneauPopUpId}
          profils={profilsEquipeWeb}
          mapAffectations={mapAffectations}
          tousLesShifts={shifts ?? []}
          tousLesConges={conges ?? []}
          adminId={profile?.id ?? ''}
          dateInitiale={panneauDate}
          profilInitial={panneauProfil}
          heureDebutInitiale={panneauHeureDebut}
          heureFinInitiale={panneauHeureFin}
          shiftsExistants={panneauShiftsExistants}
          onShiftCree={invalidateShifts}
        />
      )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: 'white' },
  ecranWeb: { backgroundColor: '#F8FAFC' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  // --- Barre de filtres desktop (web uniquement), langage visuel de equipe.web.tsx : pills
  // indigo/slate, recherche en pilule avec icône loupe, chips de filtre par type de contrat. ---
  // zIndex élevé : le dropdown du sélecteur de vue (position absolute, plus bas dans l'arbre) doit
  // s'afficher au-dessus de la grille du calendrier qui suit juste après dans le DOM — sans zIndex
  // ici, la grille (peinte après) recouvrait le menu déplié.
  toolbarWeb: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8, gap: 8, zIndex: 20, position: 'relative' },
  lieuxPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lieuPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  lieuPillActif: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
  lieuPillTexte: { fontSize: 13, fontWeight: '600', color: '#475569' },
  lieuPillTexteActif: { color: '#4338CA' },
  // Ligne "recherche + nav date/vue" façon 2e barre d'outils Combo : recherche à gauche, nav
  // semaine + sélecteur de vue appariés (navPairWeb) à droite — même ligne, tailles cohérentes.
  // 3 colonnes de largeur égale (recherche / nav+vue / vide) : la colonne centrale est ainsi
  // toujours centrée au milieu de la barre, quelle que soit la largeur de la recherche à gauche —
  // la colonne vide de droite sert uniquement de contrepoids symétrique.
  controlsRowWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlsColonne: { flex: 1 },
  controlsColonneCentre: { alignItems: 'center' },
  rechercheWrapper: { position: 'relative', justifyContent: 'center', minWidth: 240 },
  rechercheIcone: { position: 'absolute', left: 12, zIndex: 1 },
  rechercheInputWeb: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingLeft: 36,
    paddingRight: 12,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 13,
    width: '100%',
  },
  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActif: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },
  chipTexte: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  chipTexteActif: { color: 'white' },
  // --- Nav date + sélecteur de vue appariés (vue équipe web), façon Combo "‹ 20 juil. - 26 juil.
  // 2026 › · Vue par employés ⌄" : les deux contrôles collés l'un à l'autre, même hauteur/rayon. ---
  navPairWeb: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  semaineNavWeb: {
    marginHorizontal: 20,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  semaineNavWebCompact: {
    alignSelf: 'flex-start',
    // paddingTop/paddingBottom explicites (plutôt que paddingVertical) pour bien écraser le
    // paddingBottom asymétrique hérité de `semaineNav` (base partagée avec mobile) — sans ça le
    // texte n'était pas centré verticalement dans la pilule compacte. Doit rester strictement
    // identique en hauteur à vueDropdownBouton (même paddingTop/Bottom, même bordure) pour que
    // les deux contrôles soient appariés visuellement, comme sur Combo.
    paddingHorizontal: 6,
    paddingTop: 7,
    paddingBottom: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
  },
  vueDropdownZone: { position: 'relative', zIndex: 10 },
  vueDropdownBouton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 7,
  },
  vueDropdownTexte: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  vueDropdownListe: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: 4,
    width: 240,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  vueDropdownRechercheWrapper: { position: 'relative', justifyContent: 'center', marginBottom: 6 },
  vueDropdownRechercheIcone: { position: 'absolute', left: 10, zIndex: 1 },
  vueDropdownRechercheInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingLeft: 30,
    paddingRight: 10,
    paddingTop: 7,
    paddingBottom: 7,
    fontSize: 12,
    width: '100%',
  },
  vueDropdownOptionLabel: { flex: 1 },
  vueDropdownOptionActive: { backgroundColor: '#EEF2FF' },
  vueDropdownOptionTexteActive: { color: '#4338CA', fontWeight: '600' },
  grilleCarteWeb: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
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
  // Admin (attribué à tous les lieux, cf. estAttribueA) ou personne sans pop-up attribué : pas de
  // couleur de lieu pertinente, pastille neutre avec juste un contour pour rester visible sur fond
  // blanc (cf. couleurCaseNomSalarie).
  pastilleNeutre: { backgroundColor: 'white', borderWidth: 1, borderColor: '#CBD5E1' },
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
  navBouton: { paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  navFleche: { fontSize: 15, fontWeight: '600', color: '#94A3B8' },
  navTexte: { fontSize: 13, fontWeight: '600', color: '#1E293B', paddingHorizontal: 2 },
  fond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  feuille: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20, paddingBottom: 32 },
  poignee: { marginBottom: 16, height: 6, width: 48, alignSelf: 'center', borderRadius: 3, backgroundColor: '#E2E8F0' },
  feuilleTitre: { marginBottom: 16, fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  ligneCandidat: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 12 },
  ligneCandidatAssignee: { backgroundColor: '#FEF2F2' },
  candidatTexte: { flex: 1, fontSize: 15, color: '#1E293B' },
  candidatHeures: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  candidatHeuresDepassement: { color: '#DC2626' },
  candidatAssigneeTexte: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  ligneChamps: { marginBottom: 8, flexDirection: 'row', gap: 12 },
  label: { marginBottom: 4, fontSize: 12, color: '#94A3B8' },
  champ: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 12 },
  champTexte: { textAlign: 'center', color: '#1E293B' },
  champInputWeb: {
    marginBottom: 8,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlign: 'center',
    color: '#1E293B',
    fontSize: 14,
  },
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
