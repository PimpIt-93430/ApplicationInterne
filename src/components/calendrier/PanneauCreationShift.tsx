/** @jsxImportSource react */
// Panneau latéral droit web-only "façon Combo" : remplace la feuille "Qui travaille ?" sur web
// uniquement (le mobile garde son ancienne feuille, cf. app/(app)/admin/calendrier.tsx). Bascule
// Nouveau shift / Nouvelle absence. En StyleSheet (pas de className), comme le reste du dossier
// calendrier.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ajouterConge } from '@/api/conges';
import { insererShifts, mettreAJourShift, supprimerShift } from '@/api/planning';
import { useGererConges } from '@/hooks/useConges';
import type { Conge, PlanningShift, PopUp, Profile, TypeConge } from '@/types/database.types';
import { estAttribueA } from '@/utils/affectations';

function seChevauchent(aDebut: string, aFin: string, bDebut: string, bFin: string): boolean {
  return aDebut < bFin && bDebut < aFin;
}

type ModePanneau = 'shift' | 'absence';
type ModeDureeAbsence = 'journee' | 'creneau';

/** Liste fixe côté client (pas d'écran de gestion des étiquettes, cf. plan) — correspond aux
 * étiquettes visibles sur les blocs Combo (Ouverture, Fermeture...). */
export const ETIQUETTES_SHIFT = ['Ouverture', 'Fermeture', 'Caisse', 'Réserve', 'Vente'] as const;

const LIBELLE_TYPE_CONGE: Record<TypeConge, string> = {
  conge: 'Congé',
  indisponibilite: 'Indisponibilité',
  absence: 'Absence',
  repos: 'Repos',
};

function formatDateCourte(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  const txt = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function nomAffiche(p: Profile): string {
  return p.nom_complet || p.email;
}

export function PanneauCreationShift({
  visible,
  onClose,
  popUps,
  popUpIdInitial,
  profils,
  mapAffectations,
  tousLesShifts,
  tousLesConges,
  adminId,
  dateInitiale,
  profilInitial,
  heureDebutInitiale,
  heureFinInitiale,
  shiftsExistants,
  onShiftCree,
}: {
  visible: boolean;
  onClose: () => void;
  /** Tous les pop-ups actifs — la vue équipe web agrège désormais tous les lieux, donc le panneau
   * doit permettre de choisir à quel lieu rattacher le nouveau shift. */
  popUps: PopUp[];
  /** Pré-rempli quand le clic vient d'une cellule dont le lieu est déjà connu (vue par pop-up). */
  popUpIdInitial?: string;
  /** Candidats (déjà filtrés par les filtres desktop actifs). */
  profils: Profile[];
  /** profile_id -> ensemble des pop_up_id auxquels la personne est attribuée — sert à avertir si
   * on l'affecte à un shift sur un lieu qui n'est pas le sien (cf. estAttribueA). */
  mapAffectations: Map<string, Set<string>>;
  /** Tous les shifts de la vue courante (pas seulement la cellule cliquée) — sert à avertir en cas
   * de chevauchement avec un shift déjà existant pour la personne. */
  tousLesShifts: PlanningShift[];
  /** Tous les congés/indisponibilités de la vue courante — sert à avertir si on planifie
   * quelqu'un un jour où il/elle est déjà déclaré(e) absent(e). */
  tousLesConges: Conge[];
  adminId: string;
  dateInitiale: string;
  profilInitial?: Profile | null;
  heureDebutInitiale?: string;
  heureFinInitiale?: string;
  /** Shift(s) déjà présents sur la cellule cliquée — affiche un bouton "Supprimer" en mode Nouveau
   * shift pour les retirer directement, plutôt que d'obliger à passer par une autre vue. */
  shiftsExistants?: PlanningShift[];
  onShiftCree: () => void;
}) {
  const [mode, setMode] = useState<ModePanneau>('shift');
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [modificationEnCours, setModificationEnCours] = useState(false);

  // --- Nouveau shift ---
  const [salariesChoisis, setSalariesChoisis] = useState<Profile[]>([]);
  const [rechercheSalarie, setRechercheSalarie] = useState('');
  const [joursChoisis, setJoursChoisis] = useState<string[]>([]);
  // Plage "un jour sur deux" (ou tous les jours) : évite de cliquer chaque date une par une pour
  // un rythme alterné (ex. un alternant qui travaille un jour sur deux).
  const [plageOuverte, setPlageOuverte] = useState(false);
  const [plageDebut, setPlageDebut] = useState('');
  const [plageFin, setPlageFin] = useState('');
  const [plageUnJourSurDeux, setPlageUnJourSurDeux] = useState(true);
  const [popUpChoisiId, setPopUpChoisiId] = useState('');
  const [popUpOuvert, setPopUpOuvert] = useState(false);
  const [etiquette, setEtiquette] = useState('');
  const [etiquetteOuverte, setEtiquetteOuverte] = useState(false);
  const [heureDebut, setHeureDebut] = useState('10:00');
  const [heureFin, setHeureFin] = useState('19:00');
  const [pauseActive, setPauseActive] = useState(false);
  const [heureDebutPause, setHeureDebutPause] = useState('13:00');
  const [heureFinPause, setHeureFinPause] = useState('14:00');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  // --- Nouvelle absence ---
  const [salarieAbsence, setSalarieAbsence] = useState<Profile | null>(null);
  const [rechercheSalarieAbsence, setRechercheSalarieAbsence] = useState('');
  const [typeAbsence, setTypeAbsence] = useState<TypeConge>('conge');
  const [modeDureeAbsence, setModeDureeAbsence] = useState<ModeDureeAbsence>('journee');
  const [dateDebutAbsence, setDateDebutAbsence] = useState(dateInitiale);
  const [dateFinAbsence, setDateFinAbsence] = useState(dateInitiale);
  const [heureDebutAbsence, setHeureDebutAbsence] = useState('09:00');
  const [heureFinAbsence, setHeureFinAbsence] = useState('18:00');
  const [noteAbsence, setNoteAbsence] = useState('');

  const { ajouter } = useGererConges(salarieAbsence?.id);
  const queryClient = useQueryClient();

  // Réinitialise le formulaire à chaque ouverture, pré-rempli avec le contexte du clic.
  useEffect(() => {
    if (!visible) return;
    setMode('shift');
    setSalariesChoisis(profilInitial ? [profilInitial] : []);
    setRechercheSalarie('');
    setJoursChoisis(dateInitiale ? [dateInitiale] : []);
    setPlageOuverte(false);
    setPlageDebut('');
    setPlageFin('');
    setPlageUnJourSurDeux(true);
    setPopUpChoisiId(popUpIdInitial ?? popUps[0]?.id ?? '');
    setPopUpOuvert(false);
    // Préremplie depuis le shift existant en mode édition (une seule case cliquée), vide sinon.
    setEtiquette(shiftsExistants?.length === 1 ? (shiftsExistants[0].etiquette ?? '') : '');
    setEtiquetteOuverte(false);
    setHeureDebut(heureDebutInitiale ?? '10:00');
    setHeureFin(heureFinInitiale ?? '19:00');
    const pauseExistante =
      shiftsExistants?.length === 1 ? shiftsExistants[0] : null;
    setPauseActive(!!(pauseExistante?.pause_debut && pauseExistante?.pause_fin));
    setHeureDebutPause(pauseExistante?.pause_debut?.slice(0, 5) ?? '13:00');
    setHeureFinPause(pauseExistante?.pause_fin?.slice(0, 5) ?? '14:00');
    setSalarieAbsence(profilInitial ?? null);
    setRechercheSalarieAbsence('');
    setTypeAbsence('conge');
    setModeDureeAbsence('journee');
    setDateDebutAbsence(dateInitiale);
    setDateFinAbsence(dateInitiale);
    setHeureDebutAbsence('09:00');
    setHeureFinAbsence('18:00');
    setNoteAbsence('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dateInitiale, profilInitial, heureDebutInitiale, heureFinInitiale, popUpIdInitial]);

  if (!visible) return null;

  // Cliquer sur une case qui ne contient qu'un seul shift = vouloir le modifier (horaires, lieu,
  // étiquette), pas en créer un nouveau à côté — cf. retour utilisateur. Le formulaire de création
  // (multi-salariés/multi-jours) reste utilisé pour une case vide, ou une case à plusieurs shifts
  // existants (ex. vue par pop-up avec plusieurs personnes) où "modifier" un seul n'aurait pas de
  // sens univoque ; "Supprimer" reste alors la seule action sur l'existant dans ce cas.
  const shiftAModifier = shiftsExistants?.length === 1 ? shiftsExistants[0] : null;

  const candidatsShift = profils.filter((p) => {
    if (salariesChoisis.some((s) => s.id === p.id)) return false;
    const recherche = rechercheSalarie.trim().toLowerCase();
    if (!recherche) return true;
    return `${p.nom_complet} ${p.email}`.toLowerCase().includes(recherche);
  });

  const candidatsAbsence = profils.filter((p) => {
    const recherche = rechercheSalarieAbsence.trim().toLowerCase();
    if (!recherche) return true;
    return `${p.nom_complet} ${p.email}`.toLowerCase().includes(recherche);
  });

  // Pause comprise dans le créneau et heure de fin après l'heure de début — vérifié avant tout
  // envoi (création comme modification), pas seulement à la saisie.
  const pauseValide =
    heureFinPause > heureDebutPause && heureDebutPause >= heureDebut && heureFinPause <= heureFin;

  const ajouterJour = (dateIso: string) => {
    setJoursChoisis((prev) => (prev.includes(dateIso) ? prev : [...prev, dateIso].sort()));
  };
  const retirerJour = (dateIso: string) => setJoursChoisis((prev) => prev.filter((d) => d !== dateIso));

  const ajouterPlage = () => {
    if (!plageDebut || !plageFin || plageFin < plageDebut) return;
    const pas = plageUnJourSurDeux ? 2 : 1;
    const curseur = new Date(`${plageDebut}T00:00:00`);
    const fin = new Date(`${plageFin}T00:00:00`);
    while (curseur <= fin) {
      ajouterJour(curseur.toISOString().slice(0, 10));
      curseur.setDate(curseur.getDate() + pas);
    }
    setPlageDebut('');
    setPlageFin('');
    setPlageOuverte(false);
  };

  const handleCreerShift = async () => {
    if (salariesChoisis.length === 0) {
      Alert.alert('Salarié requis', 'Choisissez au moins un salarié.');
      return;
    }
    if (joursChoisis.length === 0) {
      Alert.alert('Jour requis', 'Choisissez au moins un jour.');
      return;
    }
    if (heureFin <= heureDebut) {
      Alert.alert('Heures invalides', "L'heure de fin doit être après l'heure de début.");
      return;
    }
    if (pauseActive && !pauseValide) {
      Alert.alert('Pause invalide', "La pause doit être comprise dans le créneau, heure de fin après l'heure de début.");
      return;
    }
    if (!popUpChoisiId) {
      Alert.alert('Lieu requis', 'Choisissez un pop-up.');
      return;
    }

    // Avertit sans bloquer : un admin peut avoir une bonne raison de dépanner sur un lieu qui
    // n'est pas le sien (cf. estAttribueA — un admin est toujours considéré attribué partout, donc
    // ce cas ne concerne que le reste de l'équipe).
    const nonAttribues = salariesChoisis.filter((s) => !estAttribueA(s, popUpChoisiId, mapAffectations));
    if (nonAttribues.length > 0) {
      const noms = nonAttribues.map(nomAffiche).join(', ');
      const confirme = window.confirm(
        nonAttribues.length === 1
          ? `${noms} n'est pas attribué(e) à ce pop-up. Voulez-vous quand même lui ajouter ce shift ?`
          : `${noms} ne sont pas attribués à ce pop-up. Voulez-vous quand même leur ajouter ce shift ?`,
      );
      if (!confirme) return;
    }

    // Avertit aussi (sans bloquer) en cas de chevauchement avec un shift déjà existant, ou si la
    // personne est en congé/indisponibilité ce jour-là — l'admin garde la main pour corriger
    // volontairement une situation exceptionnelle, mais ne doit pas le faire sans le savoir.
    const heureDebutAvecSecondes = `${heureDebut}:00`;
    const heureFinAvecSecondes = `${heureFin}:00`;
    const alertes: string[] = [];
    for (const salarie of salariesChoisis) {
      for (const dateIso of joursChoisis) {
        const libelle = `${nomAffiche(salarie)} – ${formatDateCourte(dateIso)}`;
        const chevauche = tousLesShifts.some(
          (s) =>
            s.profile_id === salarie.id &&
            s.date === dateIso &&
            seChevauchent(s.heure_debut, s.heure_fin, heureDebutAvecSecondes, heureFinAvecSecondes),
        );
        if (chevauche) alertes.push(`${libelle} : chevauche un shift déjà existant`);

        const enConge = tousLesConges.some((c) => {
          if (c.profile_id !== salarie.id || dateIso < c.date_debut || dateIso > c.date_fin) return false;
          if (!c.heure_debut || !c.heure_fin) return true;
          return seChevauchent(c.heure_debut, c.heure_fin, heureDebutAvecSecondes, heureFinAvecSecondes);
        });
        if (enConge) alertes.push(`${libelle} : en congé/indisponibilité ce jour-là`);
      }
    }
    if (alertes.length > 0) {
      const confirme = window.confirm(`Attention :\n${alertes.join('\n')}\n\nCréer quand même ce(s) shift(s) ?`);
      if (!confirme) return;
    }

    setEnvoiEnCours(true);
    try {
      const lignes = salariesChoisis.flatMap((salarie) =>
        joursChoisis.map((dateIso) => ({
          pop_up_id: popUpChoisiId,
          profile_id: salarie.id,
          date: dateIso,
          heure_debut: `${heureDebut}:00`,
          heure_fin: `${heureFin}:00`,
          pause_debut: pauseActive ? `${heureDebutPause}:00` : null,
          pause_fin: pauseActive ? `${heureFinPause}:00` : null,
          statut: 'brouillon' as const,
          genere_automatiquement: false,
          created_by: adminId,
          etiquette: etiquette || null,
        })),
      );
      await insererShifts(lignes);
      onShiftCree();
      onClose();
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de créer le shift.');
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const handleModifierShift = async () => {
    if (!shiftAModifier || !profilInitial) return;
    if (heureFin <= heureDebut) {
      Alert.alert('Heures invalides', "L'heure de fin doit être après l'heure de début.");
      return;
    }
    if (pauseActive && !pauseValide) {
      Alert.alert('Pause invalide', "La pause doit être comprise dans le créneau, heure de fin après l'heure de début.");
      return;
    }
    if (!popUpChoisiId) {
      Alert.alert('Lieu requis', 'Choisissez un pop-up.');
      return;
    }

    if (!estAttribueA(profilInitial, popUpChoisiId, mapAffectations)) {
      const confirme = window.confirm(
        `${nomAffiche(profilInitial)} n'est pas attribué(e) à ce pop-up. Enregistrer quand même ?`,
      );
      if (!confirme) return;
    }

    // Mêmes vérifications que pour une création, en excluant ce shift de la comparaison (sinon il
    // "chevaucherait" toujours ses propres horaires actuels).
    const heureDebutAvecSecondes = `${heureDebut}:00`;
    const heureFinAvecSecondes = `${heureFin}:00`;
    const chevauche = tousLesShifts.some(
      (s) =>
        s.id !== shiftAModifier.id &&
        s.profile_id === profilInitial.id &&
        s.date === dateInitiale &&
        seChevauchent(s.heure_debut, s.heure_fin, heureDebutAvecSecondes, heureFinAvecSecondes),
    );
    const enConge = tousLesConges.some((c) => {
      if (c.profile_id !== profilInitial.id || dateInitiale < c.date_debut || dateInitiale > c.date_fin) return false;
      if (!c.heure_debut || !c.heure_fin) return true;
      return seChevauchent(c.heure_debut, c.heure_fin, heureDebutAvecSecondes, heureFinAvecSecondes);
    });
    if (chevauche || enConge) {
      const alertes = [
        chevauche && 'Chevauche un autre shift déjà existant',
        enConge && 'En congé/indisponibilité ce jour-là',
      ].filter(Boolean);
      const confirme = window.confirm(`Attention :\n${alertes.join('\n')}\n\nEnregistrer quand même ?`);
      if (!confirme) return;
    }

    setModificationEnCours(true);
    try {
      await mettreAJourShift(shiftAModifier.id, {
        pop_up_id: popUpChoisiId,
        heure_debut: heureDebutAvecSecondes,
        heure_fin: heureFinAvecSecondes,
        pause_debut: pauseActive ? `${heureDebutPause}:00` : null,
        pause_fin: pauseActive ? `${heureFinPause}:00` : null,
        etiquette: etiquette || null,
        // Un shift touché à la main ne doit plus jamais être considéré comme un simple brouillon
        // auto-généré : sinon la régénération silencieuse (cf. admin/calendrier.tsx) le supprime
        // et le recrée depuis l'horaire récurrent, écrasant la modification.
        genere_automatiquement: false,
      });
      onShiftCree();
      onClose();
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de modifier le shift.');
    } finally {
      setModificationEnCours(false);
    }
  };

  // Un shift supprimé par l'admin (pas une indisponibilité déclarée par la personne elle-même,
  // cf. consigne : "si c'est lui qui met une indispo c'est indispo pas repos") laisse la journée
  // ambiguë — propose de la marquer "Repos" pour ne pas avoir à repasser ensuite par le panneau
  // "Nouvelle absence". Une paire (personne, jour) par shift supprimé, dédupliquée.
  const proposerRepos = async (shiftsSupprimes: PlanningShift[]) => {
    const paires = new Map<string, { profileId: string; date: string; nom: string }>();
    for (const s of shiftsSupprimes) {
      const cle = `${s.profile_id}_${s.date}`;
      if (paires.has(cle)) continue;
      const profil = profils.find((p) => p.id === s.profile_id) ?? (profilInitial?.id === s.profile_id ? profilInitial : undefined);
      paires.set(cle, { profileId: s.profile_id, date: s.date, nom: profil ? nomAffiche(profil) : 'cette personne' });
    }
    const liste = Array.from(paires.values());
    if (liste.length === 0) return;

    const message =
      liste.length === 1
        ? `Marquer ${liste[0].nom} en repos le ${formatDateCourte(liste[0].date)} ?`
        : `Marquer en repos :\n${liste.map((l) => `${l.nom} – ${formatDateCourte(l.date)}`).join('\n')} ?`;
    if (!window.confirm(message)) return;

    await Promise.all(
      liste.map((l) =>
        ajouterConge({
          profileId: l.profileId,
          dateDebut: l.date,
          dateFin: l.date,
          heureDebut: null,
          heureFin: null,
          type: 'repos',
          note: '',
        }),
      ),
    );
    for (const l of liste) {
      queryClient.invalidateQueries({ queryKey: ['conges', l.profileId] });
    }
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'conges-periode' });
  };

  // Alert.alert ne fait rien sur web (no-op dans react-native-web) — ce panneau n'existe que sur
  // web (cf. en-tête du fichier), donc window.confirm fonctionne réellement.
  const handleSupprimerShifts = async () => {
    if (!shiftsExistants || shiftsExistants.length === 0) return;
    const confirme = window.confirm(
      shiftsExistants.length === 1
        ? 'Supprimer ce shift ?'
        : `Supprimer ces ${shiftsExistants.length} shifts ?`,
    );
    if (!confirme) return;
    setSuppressionEnCours(true);
    try {
      await Promise.all(shiftsExistants.map((s) => supprimerShift(s.id)));
      await proposerRepos(shiftsExistants);
      onShiftCree();
      onClose();
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de supprimer le shift.');
    } finally {
      setSuppressionEnCours(false);
    }
  };

  const handleCreerAbsence = () => {
    if (!salarieAbsence) {
      Alert.alert('Salarié requis', 'Choisissez un salarié.');
      return;
    }
    if (modeDureeAbsence === 'journee' && dateFinAbsence < dateDebutAbsence) {
      Alert.alert('Dates invalides', 'La date de fin doit être après la date de début.');
      return;
    }
    if (modeDureeAbsence === 'creneau' && heureFinAbsence <= heureDebutAbsence) {
      Alert.alert('Heures invalides', "L'heure de fin doit être après l'heure de début.");
      return;
    }
    ajouter.mutate(
      {
        dateDebut: dateDebutAbsence,
        dateFin: modeDureeAbsence === 'journee' ? dateFinAbsence : dateDebutAbsence,
        heureDebut: modeDureeAbsence === 'creneau' ? `${heureDebutAbsence}:00` : null,
        heureFin: modeDureeAbsence === 'creneau' ? `${heureFinAbsence}:00` : null,
        type: typeAbsence,
        note: noteAbsence,
      },
      {
        onSuccess: () => {
          onShiftCree();
          onClose();
        },
        onError: (error) =>
          Alert.alert('Erreur', error instanceof Error ? error.message : "Impossible de créer l'absence."),
      },
    );
  };

  if (shiftAModifier) {
    return (
      <Pressable style={styles.fond} onPress={onClose}>
        <Pressable style={styles.panneau} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.entete}>
              <Text style={styles.titre}>Modifier le shift</Text>
              <Pressable onPress={onClose} style={styles.fermerBouton}>
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <Text style={styles.label}>Salarié</Text>
            <View style={styles.chipsRow}>
              <View style={styles.chipPersonne}>
                <Text style={styles.chipPersonneTexte}>{profilInitial ? nomAffiche(profilInitial) : '—'}</Text>
              </View>
              <View style={styles.chipPersonne}>
                <Text style={styles.chipPersonneTexte}>{formatDateCourte(dateInitiale)}</Text>
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Lieu</Text>
            <Pressable onPress={() => setPopUpOuvert((v) => !v)} style={styles.champSelect}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {popUpChoisiId && (
                  <View
                    style={[
                      styles.pastille,
                      { backgroundColor: popUps.find((p) => p.id === popUpChoisiId)?.couleur ?? '#6366F1' },
                    ]}
                  />
                )}
                <Text style={styles.champSelectTexte}>
                  {popUps.find((p) => p.id === popUpChoisiId)?.nom ?? 'Choisir un lieu'}
                </Text>
              </View>
              <Ionicons name={popUpOuvert ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
            </Pressable>
            {popUpOuvert && (
              <View style={styles.listeSuggestions}>
                {popUps.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setPopUpChoisiId(p.id);
                      setPopUpOuvert(false);
                    }}
                    style={styles.suggestionLigne}
                  >
                    <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                    <Text style={styles.suggestionTexte}>{p.nom}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={[styles.label, { marginTop: 16 }]}>Étiquette</Text>
            <Pressable onPress={() => setEtiquetteOuverte((v) => !v)} style={styles.champSelect}>
              <Text style={styles.champSelectTexte}>{etiquette || 'Aucune étiquette'}</Text>
              <Ionicons name={etiquetteOuverte ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
            </Pressable>
            {etiquetteOuverte && (
              <View style={styles.listeSuggestions}>
                <Pressable
                  onPress={() => {
                    setEtiquette('');
                    setEtiquetteOuverte(false);
                  }}
                  style={styles.suggestionLigne}
                >
                  <Text style={styles.suggestionTexte}>Aucune étiquette</Text>
                </Pressable>
                {ETIQUETTES_SHIFT.map((et) => (
                  <Pressable
                    key={et}
                    onPress={() => {
                      setEtiquette(et);
                      setEtiquetteOuverte(false);
                    }}
                    style={styles.suggestionLigne}
                  >
                    <Text style={styles.suggestionTexte}>{et}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={[styles.label, { marginTop: 16 }]}>Horaires</Text>
            <View style={styles.ligneChamps}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sousLabel}>De</Text>
                <input
                  type="time"
                  value={heureDebut}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureDebut(e.target.value)}
                  style={styles.champInputWeb as unknown as CSSProperties}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sousLabel}>À</Text>
                <input
                  type="time"
                  value={heureFin}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureFin(e.target.value)}
                  style={styles.champInputWeb as unknown as CSSProperties}
                />
              </View>
            </View>

            <Pressable onPress={() => setPauseActive((v) => !v)} style={styles.ligneCase}>
              <View style={[styles.case, pauseActive && styles.caseCochee]}>
                {pauseActive && <Ionicons name="checkmark" size={12} color="white" />}
              </View>
              <Text style={styles.caseTexte}>Pause déjeuner</Text>
            </Pressable>
            {pauseActive && (
              <View style={[styles.ligneChamps, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sousLabel}>De</Text>
                  <input
                    type="time"
                    value={heureDebutPause}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureDebutPause(e.target.value)}
                    style={styles.champInputWeb as unknown as CSSProperties}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sousLabel}>À</Text>
                  <input
                    type="time"
                    value={heureFinPause}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureFinPause(e.target.value)}
                    style={styles.champInputWeb as unknown as CSSProperties}
                  />
                </View>
              </View>
            )}

            <View style={styles.ligneBoutons}>
              <Pressable onPress={onClose} style={styles.boutonAnnulerFlex}>
                <Text style={styles.boutonAnnulerTexte}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleModifierShift} style={styles.boutonValider} disabled={modificationEnCours}>
                <Text style={styles.boutonValiderTexte}>
                  {modificationEnCours ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </Text>
              </Pressable>
            </View>
            <Pressable onPress={handleSupprimerShifts} style={styles.boutonSupprimerShift} disabled={suppressionEnCours}>
              <Text style={styles.boutonSupprimerShiftTexte}>
                {suppressionEnCours ? 'Suppression...' : 'Supprimer ce shift'}
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.fond} onPress={onClose}>
      <Pressable style={styles.panneau} onPress={() => {}}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.entete}>
            <Text style={styles.titre}>{mode === 'shift' ? 'Créer un shift' : 'Créer une absence'}</Text>
            <Pressable onPress={onClose} style={styles.fermerBouton}>
              <Ionicons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>

          <View style={styles.segment}>
            <Pressable
              onPress={() => setMode('shift')}
              style={[styles.segmentBouton, mode === 'shift' && styles.segmentBoutonActif]}
            >
              <Text style={mode === 'shift' ? styles.segmentTexteActif : styles.segmentTexte}>Nouveau shift</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('absence')}
              style={[styles.segmentBouton, mode === 'absence' && styles.segmentBoutonActif]}
            >
              <Text style={mode === 'absence' ? styles.segmentTexteActif : styles.segmentTexte}>
                Nouvelle absence
              </Text>
            </Pressable>
          </View>

          {mode === 'shift' ? (
            <>
              <Text style={styles.label}>Salarié(s)</Text>
              {salariesChoisis.length > 0 && (
                <View style={styles.chipsRow}>
                  {salariesChoisis.map((s) => (
                    <View key={s.id} style={styles.chipPersonne}>
                      <Text style={styles.chipPersonneTexte}>{nomAffiche(s)}</Text>
                      <Pressable onPress={() => setSalariesChoisis((prev) => prev.filter((p) => p.id !== s.id))}>
                        <Ionicons name="close" size={12} color="#4338CA" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.rechercheWrapper}>
                <Ionicons name="search-outline" size={16} color="#94A3B8" style={styles.rechercheIcone} />
                <input
                  placeholder="Sélectionner un salarié"
                  value={rechercheSalarie}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setRechercheSalarie(e.target.value)}
                  style={styles.rechercheInputWeb as unknown as CSSProperties}
                />
              </View>
              {rechercheSalarie.length > 0 && (
                <View style={styles.listeSuggestions}>
                  {candidatsShift.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        setSalariesChoisis((prev) => [...prev, p]);
                        setRechercheSalarie('');
                      }}
                      style={styles.suggestionLigne}
                    >
                      <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                      <Text style={styles.suggestionTexte}>{nomAffiche(p)}</Text>
                    </Pressable>
                  ))}
                  {candidatsShift.length === 0 && <Text style={styles.suggestionVide}>Aucun résultat</Text>}
                </View>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Répéter ce shift sur plusieurs jours</Text>
              {joursChoisis.length > 0 && (
                <View style={styles.chipsRow}>
                  {joursChoisis.map((dateIso) => (
                    <View key={dateIso} style={styles.chipPersonne}>
                      <Text style={styles.chipPersonneTexte}>{formatDateCourte(dateIso)}</Text>
                      <Pressable onPress={() => retirerJour(dateIso)}>
                        <Ionicons name="close" size={12} color="#4338CA" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              <input
                type="date"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  if (e.target.value) ajouterJour(e.target.value);
                  e.target.value = '';
                }}
                style={styles.rechercheInputWeb as unknown as CSSProperties}
              />

              <Pressable onPress={() => setPlageOuverte((v) => !v)} style={{ marginTop: 8 }}>
                <Text style={styles.lienTexte}>
                  {plageOuverte ? 'Masquer' : '+ Ajouter une plage (ex. un jour sur deux)'}
                </Text>
              </Pressable>
              {plageOuverte && (
                <View style={{ marginTop: 8 }}>
                  <View style={styles.ligneChamps}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sousLabel}>Du</Text>
                      <input
                        type="date"
                        value={plageDebut}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setPlageDebut(e.target.value)}
                        style={styles.champInputWeb as unknown as CSSProperties}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sousLabel}>Au</Text>
                      <input
                        type="date"
                        value={plageFin}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setPlageFin(e.target.value)}
                        style={styles.champInputWeb as unknown as CSSProperties}
                      />
                    </View>
                  </View>
                  <Pressable onPress={() => setPlageUnJourSurDeux((v) => !v)} style={[styles.ligneCase, { marginTop: 8 }]}>
                    <View style={[styles.case, plageUnJourSurDeux && styles.caseCochee]}>
                      {plageUnJourSurDeux && <Ionicons name="checkmark" size={12} color="white" />}
                    </View>
                    <Text style={styles.caseTexte}>Un jour sur deux (sinon, tous les jours de la plage)</Text>
                  </Pressable>
                  <Pressable
                    onPress={ajouterPlage}
                    disabled={!plageDebut || !plageFin || plageFin < plageDebut}
                    style={[
                      styles.boutonValider,
                      { marginTop: 8 },
                      (!plageDebut || !plageFin || plageFin < plageDebut) && { opacity: 0.5 },
                    ]}
                  >
                    <Text style={styles.boutonValiderTexte}>Ajouter ces jours</Text>
                  </Pressable>
                </View>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Lieu</Text>
              <Pressable onPress={() => setPopUpOuvert((v) => !v)} style={styles.champSelect}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {popUpChoisiId && (
                    <View
                      style={[
                        styles.pastille,
                        { backgroundColor: popUps.find((p) => p.id === popUpChoisiId)?.couleur ?? '#6366F1' },
                      ]}
                    />
                  )}
                  <Text style={styles.champSelectTexte}>
                    {popUps.find((p) => p.id === popUpChoisiId)?.nom ?? 'Choisir un lieu'}
                  </Text>
                </View>
                <Ionicons name={popUpOuvert ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
              </Pressable>
              {popUpOuvert && (
                <View style={styles.listeSuggestions}>
                  {popUps.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        setPopUpChoisiId(p.id);
                        setPopUpOuvert(false);
                      }}
                      style={styles.suggestionLigne}
                    >
                      <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                      <Text style={styles.suggestionTexte}>{p.nom}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Étiquette</Text>
              <Pressable onPress={() => setEtiquetteOuverte((v) => !v)} style={styles.champSelect}>
                <Text style={styles.champSelectTexte}>{etiquette || 'Aucune étiquette'}</Text>
                <Ionicons name={etiquetteOuverte ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
              </Pressable>
              {etiquetteOuverte && (
                <View style={styles.listeSuggestions}>
                  <Pressable
                    onPress={() => {
                      setEtiquette('');
                      setEtiquetteOuverte(false);
                    }}
                    style={styles.suggestionLigne}
                  >
                    <Text style={styles.suggestionTexte}>Aucune étiquette</Text>
                  </Pressable>
                  {ETIQUETTES_SHIFT.map((et) => (
                    <Pressable
                      key={et}
                      onPress={() => {
                        setEtiquette(et);
                        setEtiquetteOuverte(false);
                      }}
                      style={styles.suggestionLigne}
                    >
                      <Text style={styles.suggestionTexte}>{et}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Horaires</Text>
              <View style={styles.ligneChamps}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sousLabel}>De</Text>
                  <input
                    type="time"
                    value={heureDebut}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureDebut(e.target.value)}
                    style={styles.champInputWeb as unknown as CSSProperties}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sousLabel}>À</Text>
                  <input
                    type="time"
                    value={heureFin}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureFin(e.target.value)}
                    style={styles.champInputWeb as unknown as CSSProperties}
                  />
                </View>
              </View>

              <Pressable onPress={() => setPauseActive((v) => !v)} style={styles.ligneCase}>
                <View style={[styles.case, pauseActive && styles.caseCochee]}>
                  {pauseActive && <Ionicons name="checkmark" size={12} color="white" />}
                </View>
                <Text style={styles.caseTexte}>Pause déjeuner</Text>
              </Pressable>
              {pauseActive && (
                <View style={[styles.ligneChamps, { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sousLabel}>De</Text>
                    <input
                      type="time"
                      value={heureDebutPause}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureDebutPause(e.target.value)}
                      style={styles.champInputWeb as unknown as CSSProperties}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sousLabel}>À</Text>
                    <input
                      type="time"
                      value={heureFinPause}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureFinPause(e.target.value)}
                      style={styles.champInputWeb as unknown as CSSProperties}
                    />
                  </View>
                </View>
              )}

              <View style={styles.ligneBoutons}>
                <Pressable onPress={onClose} style={styles.boutonAnnulerFlex}>
                  <Text style={styles.boutonAnnulerTexte}>Annuler</Text>
                </Pressable>
                <Pressable onPress={handleCreerShift} style={styles.boutonValider}>
                  <Text style={styles.boutonValiderTexte}>{envoiEnCours ? 'Ajout...' : 'Ajouter'}</Text>
                </Pressable>
              </View>
              {shiftsExistants && shiftsExistants.length > 0 && (
                <Pressable
                  onPress={handleSupprimerShifts}
                  style={styles.boutonSupprimerShift}
                  disabled={suppressionEnCours}
                >
                  <Text style={styles.boutonSupprimerShiftTexte}>
                    {suppressionEnCours
                      ? 'Suppression...'
                      : shiftsExistants.length === 1
                        ? 'Supprimer ce shift'
                        : `Supprimer ces ${shiftsExistants.length} shifts`}
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Text style={styles.label}>Salarié</Text>
              {salarieAbsence ? (
                <View style={styles.chipsRow}>
                  <View style={styles.chipPersonne}>
                    <Text style={styles.chipPersonneTexte}>{nomAffiche(salarieAbsence)}</Text>
                    <Pressable onPress={() => setSalarieAbsence(null)}>
                      <Ionicons name="close" size={12} color="#4338CA" />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.rechercheWrapper}>
                    <Ionicons name="search-outline" size={16} color="#94A3B8" style={styles.rechercheIcone} />
                    <input
                      placeholder="Sélectionner un salarié"
                      value={rechercheSalarieAbsence}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setRechercheSalarieAbsence(e.target.value)}
                      style={styles.rechercheInputWeb as unknown as CSSProperties}
                    />
                  </View>
                  <View style={styles.listeSuggestions}>
                    {candidatsAbsence.map((p) => (
                      <Pressable key={p.id} onPress={() => setSalarieAbsence(p)} style={styles.suggestionLigne}>
                        <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                        <Text style={styles.suggestionTexte}>{nomAffiche(p)}</Text>
                      </Pressable>
                    ))}
                    {candidatsAbsence.length === 0 && <Text style={styles.suggestionVide}>Aucun résultat</Text>}
                  </View>
                </>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Type d'absence</Text>
              <View style={styles.segment}>
                <Pressable
                  onPress={() => setTypeAbsence('conge')}
                  style={[styles.segmentBouton, typeAbsence === 'conge' && styles.segmentBoutonActif]}
                >
                  <Text style={typeAbsence === 'conge' ? styles.segmentTexteActif : styles.segmentTexte}>
                    {LIBELLE_TYPE_CONGE.conge}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTypeAbsence('indisponibilite')}
                  style={[styles.segmentBouton, typeAbsence === 'indisponibilite' && styles.segmentBoutonActif]}
                >
                  <Text style={typeAbsence === 'indisponibilite' ? styles.segmentTexteActif : styles.segmentTexte}>
                    {LIBELLE_TYPE_CONGE.indisponibilite}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTypeAbsence('repos')}
                  style={[styles.segmentBouton, typeAbsence === 'repos' && styles.segmentBoutonActif]}
                >
                  <Text style={typeAbsence === 'repos' ? styles.segmentTexteActif : styles.segmentTexte}>
                    {LIBELLE_TYPE_CONGE.repos}
                  </Text>
                </Pressable>
              </View>

              <View style={[styles.segment, { marginTop: 16 }]}>
                <Pressable
                  onPress={() => setModeDureeAbsence('journee')}
                  style={[styles.segmentBouton, modeDureeAbsence === 'journee' && styles.segmentBoutonActif]}
                >
                  <Text style={modeDureeAbsence === 'journee' ? styles.segmentTexteActif : styles.segmentTexte}>
                    Journée(s) complète(s)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setModeDureeAbsence('creneau')}
                  style={[styles.segmentBouton, modeDureeAbsence === 'creneau' && styles.segmentBoutonActif]}
                >
                  <Text style={modeDureeAbsence === 'creneau' ? styles.segmentTexteActif : styles.segmentTexte}>
                    Un créneau
                  </Text>
                </Pressable>
              </View>

              {modeDureeAbsence === 'journee' ? (
                <View style={styles.ligneChamps}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sousLabel}>Du</Text>
                    <input
                      type="date"
                      value={dateDebutAbsence}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setDateDebutAbsence(e.target.value)}
                      style={styles.champInputWeb as unknown as CSSProperties}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sousLabel}>Au</Text>
                    <input
                      type="date"
                      value={dateFinAbsence}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setDateFinAbsence(e.target.value)}
                      style={styles.champInputWeb as unknown as CSSProperties}
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.sousLabel}>Jour</Text>
                  <input
                    type="date"
                    value={dateDebutAbsence}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setDateDebutAbsence(e.target.value)}
                    style={{ ...styles.champInputWeb, marginBottom: 12 } as unknown as CSSProperties}
                  />
                  <View style={styles.ligneChamps}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sousLabel}>De</Text>
                      <input
                        type="time"
                        value={heureDebutAbsence}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureDebutAbsence(e.target.value)}
                        style={styles.champInputWeb as unknown as CSSProperties}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sousLabel}>À</Text>
                      <input
                        type="time"
                        value={heureFinAbsence}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setHeureFinAbsence(e.target.value)}
                        style={styles.champInputWeb as unknown as CSSProperties}
                      />
                    </View>
                  </View>
                </>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Notes</Text>
              <textarea
                value={noteAbsence}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNoteAbsence(e.target.value)}
                style={styles.textareaWeb as unknown as CSSProperties}
                rows={3}
              />

              <View style={styles.ligneBoutons}>
                <Pressable onPress={onClose} style={styles.boutonAnnulerFlex}>
                  <Text style={styles.boutonAnnulerTexte}>Annuler</Text>
                </Pressable>
                <Pressable onPress={handleCreerAbsence} style={styles.boutonValider}>
                  <Text style={styles.boutonValiderTexte}>{ajouter.isPending ? 'Ajout...' : 'Ajouter'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fond: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.35)',
    zIndex: 20,
  },
  panneau: {
    width: 420,
    maxWidth: '100%',
    height: '100%',
    backgroundColor: 'white',
    padding: 20,
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: -4, height: 0 },
    elevation: 8,
  },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  titre: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  fermerBouton: { padding: 6, borderRadius: 999, backgroundColor: '#F1F5F9' },
  segment: { marginBottom: 16, flexDirection: 'row', borderRadius: 12, backgroundColor: '#F1F5F9', padding: 4 },
  segmentBouton: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 8 },
  segmentBoutonActif: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentTexte: { color: '#64748B', fontWeight: '600' },
  segmentTexteActif: { fontWeight: '600', color: '#4F46E5' },
  label: { marginBottom: 6, fontSize: 13, fontWeight: '600', color: '#334155' },
  lienTexte: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },
  sousLabel: { marginBottom: 4, fontSize: 12, color: '#94A3B8' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chipPersonne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipPersonneTexte: { fontSize: 12, fontWeight: '600', color: '#4338CA' },
  rechercheWrapper: { position: 'relative', justifyContent: 'center', marginBottom: 4 },
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
  listeSuggestions: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    maxHeight: 180,
    overflow: 'hidden',
  },
  suggestionLigne: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  suggestionTexte: { fontSize: 13, color: '#1E293B' },
  suggestionVide: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, color: '#94A3B8' },
  pastille: { height: 9, width: 9, borderRadius: 5 },
  champSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  champSelectTexte: { fontSize: 13, color: '#1E293B' },
  ligneChamps: { flexDirection: 'row', gap: 12 },
  ligneCase: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  case: {
    height: 18,
    width: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseCochee: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  caseTexte: { fontSize: 13, fontWeight: '600', color: '#334155' },
  champInputWeb: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 11,
    textAlign: 'center',
    color: '#1E293B',
    fontSize: 13,
  },
  textareaWeb: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    color: '#1E293B',
    fontSize: 13,
  },
  ligneBoutons: { marginTop: 20, flexDirection: 'row', gap: 12 },
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
  boutonSupprimerShift: {
    marginTop: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 12,
  },
  boutonSupprimerShiftTexte: { fontWeight: '600', color: '#DC2626' },
});
