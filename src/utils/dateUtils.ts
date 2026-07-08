import { addDays, format, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

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
