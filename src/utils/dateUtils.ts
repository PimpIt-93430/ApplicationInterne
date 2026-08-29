import { addDays, format, getISOWeek, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

import type { JourEcoleAlternant } from '@/types/database.types';

export const JOURS_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Renvoie les 7 dates (lundi -> dimanche) de la semaine contenant `date`. */
export function joursDeLaSemaine(date: Date): Date[] {
  const debut = startOfWeek(date, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(debut, i));
}

export function dateEnISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function jourSemaineISO(date: Date): number {
  // 0 = lundi ... 6 = dimanche, pour matcher regles_horaires_ouverture.jour_semaine
  const jour = date.getDay();
  return jour === 0 ? 6 : jour - 1;
}

/** Un shift du dimanche (date ISO "AAAA-MM-JJ") — sert à l'exclure des heures comptées côté RH
 * pour les personnes dont `compter_heures_dimanche` est décoché (cf. SectionHeuresRH/
 * PanneauHistoriqueRH). */
export function estDimanche(dateIso: string): boolean {
  return new Date(`${dateIso}T00:00:00`).getDay() === 0;
}

export function libelleJourCourt(date: Date): string {
  return format(date, 'EEE d MMM', { locale: fr });
}

export function nomJourCourt(date: Date): string {
  return format(date, 'EEE', { locale: fr }).replace('.', '').toUpperCase();
}

export function numeroJour(date: Date): string {
  return format(date, 'd');
}

export function estAujourdhui(date: Date): boolean {
  return dateEnISO(date) === dateEnISO(new Date());
}

/** Format compact "20 juil. - 26 juil. 2026" façon Combo (barre de nav web resserrée, vue équipe
 * uniquement) — fonction additive : `libelleJourCourt` reste utilisée telle quelle partout ailleurs
 * (mobile + "Mon calendrier"), pour ne rien changer visuellement côté mobile. */
export function libellePeriodeCourte(debut: Date, fin: Date): string {
  const d = format(debut, 'd MMM', { locale: fr });
  const f = format(fin, 'd MMM yyyy', { locale: fr });
  return `${d} - ${f}`;
}

/** Numéro de semaine ISO (façon badge "S. 30" de Combo, au-dessus de la colonne du lundi). */
export function numeroSemaine(date: Date): number {
  return getISOWeek(date);
}

/** Additionne des minutes à une heure au format "HH:MM" ou "HH:MM:SS", renvoie "HH:MM:00". */
export function ajouterMinutes(heure: string, minutes: number): string {
  const [h, m] = heure.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

/** Différence en minutes entre deux heures "HH:MM[:SS]". */
export function differenceMinutes(debut: string, fin: string): number {
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

export function formatHeure(heure: string): string {
  return heure.slice(0, 5);
}

/** Durée effective d'un shift en minutes, pause déjeuner déduite (pause non payée/non travaillée)
 * quand elle est renseignée. */
export function dureeShiftMinutes(shift: {
  heure_debut: string;
  heure_fin: string;
  pause_debut?: string | null;
  pause_fin?: string | null;
}): number {
  const brut = differenceMinutes(shift.heure_debut, shift.heure_fin);
  if (!shift.pause_debut || !shift.pause_fin) return brut;
  return brut - differenceMinutes(shift.pause_debut, shift.pause_fin);
}

/** Formate l'horaire d'un shift pour affichage : segmenté de part et d'autre de la pause si elle
 * est renseignée ("10:00 – 13:00 · 14:00 – 18:00"), sinon la plage simple ("10:00 – 18:00"). */
export function formatCreneauShift(shift: {
  heure_debut: string;
  heure_fin: string;
  pause_debut?: string | null;
  pause_fin?: string | null;
}): string {
  if (!shift.pause_debut || !shift.pause_fin) {
    return `${formatHeure(shift.heure_debut)} – ${formatHeure(shift.heure_fin)}`;
  }
  return `${formatHeure(shift.heure_debut)} – ${formatHeure(shift.pause_debut)} · ${formatHeure(shift.pause_fin)} – ${formatHeure(shift.heure_fin)}`;
}

/** Total d'heures (décimal) d'une personne sur un ensemble de créneaux (ex. la semaine affichée),
 * pause déjeuner déduite quand elle est renseignée sur le shift. */
export function totalHeuresTravaillees(
  shifts: { profile_id: string; heure_debut: string; heure_fin: string; pause_debut?: string | null; pause_fin?: string | null }[],
  profileId: string,
): number {
  const minutes = shifts
    .filter((s) => s.profile_id === profileId)
    .reduce((total, s) => total + dureeShiftMinutes(s), 0);
  return minutes / 60;
}

/** Un jour d'école compte forfaitairement pour ce nombre d'heures (cf. retour utilisateur du
 * 2026-08-24 : "pour les jours d'école faut compter 7h stp") — plus simple et plus prévisible
 * qu'aller chercher l'horaire récurrent habituel de ce jour-là. */
const HEURES_ECOLE_PAR_JOUR = 7;

/** Total d'heures (décimal) d'une personne sur la semaine affichée, travail + école — un jour
 * d'école remplace ce qu'elle aurait normalement travaillé ce jour-là (elle est exclue de la
 * génération auto du planning ce jour précis, cf. genererPlanning), donc créditée d'un forfait
 * (HEURES_ECOLE_PAR_JOUR) plutôt que 0 : sans ça, la charge hebdo d'un alternant semblerait
 * anormalement basse les semaines chargées en cours. */
export function totalHeuresSemaineAvecEcole(
  jours: Date[],
  shifts: { profile_id: string; heure_debut: string; heure_fin: string; pause_debut?: string | null; pause_fin?: string | null }[],
  joursEcole: JourEcoleAlternant[],
  profileId: string,
): { heuresTravaillees: number; heuresEcole: number; total: number } {
  const heuresTravaillees = totalHeuresTravaillees(shifts, profileId);
  const joursEcoleCount = jours.filter((jour) =>
    joursEcole.some((j) => j.profile_id === profileId && j.date === dateEnISO(jour)),
  ).length;
  const heuresEcole = joursEcoleCount * HEURES_ECOLE_PAR_JOUR;
  return { heuresTravaillees, heuresEcole, total: heuresTravaillees + heuresEcole };
}

/** Total d'heures (décimal) d'un horaire récurrent pour chacune des deux semaines d'un rythme
 * "un jour sur deux" — un horaire "toutes" compte dans les deux, un horaire "premiere"/"deuxieme"
 * ne compte que dans celle-là (cf. génération auto du planning, qui applique la même règle). Sert
 * à vérifier d'un coup d'œil dans Équipe > Planification que le total hebdo visé (35h, etc.) est
 * bien atteint chaque semaine. */
export function totalHeuresRecurrentesParSemaine(
  horaires: {
    actif: boolean;
    heure_debut: string;
    heure_fin: string;
    pause_debut?: string | null;
    pause_fin?: string | null;
    semaine_reference: 'toutes' | 'premiere' | 'deuxieme';
  }[],
): { premiere: number; deuxieme: number } {
  let minutesPremiere = 0;
  let minutesDeuxieme = 0;
  for (const h of horaires) {
    if (!h.actif) continue;
    const minutes = dureeShiftMinutes(h);
    if (h.semaine_reference === 'toutes' || h.semaine_reference === 'premiere') minutesPremiere += minutes;
    if (h.semaine_reference === 'toutes' || h.semaine_reference === 'deuxieme') minutesDeuxieme += minutes;
  }
  return { premiere: minutesPremiere / 60, deuxieme: minutesDeuxieme / 60 };
}

/** Formate un nombre d'heures décimal en "12h" ou "12h30". */
export function formatDureeHeures(heures: number): string {
  const totalMinutes = Math.round(heures * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
