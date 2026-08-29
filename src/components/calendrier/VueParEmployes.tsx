/** @jsxImportSource react */
// Vue "par employé" : une carte par salarié (nom en entier, puis une ligne de cases colorées — une
// par jour de la semaine — puis un résumé "École / Travail / Congé" calculé sur la semaine
// affichée). Utilisée sur web (admin/calendrier.tsx, calendrier.web.tsx) ET sur mobile
// (PlanningMobile.tsx, onglet Équipe(s) — bouton dédié), pas web-only. La carte remplit toute la
// hauteur restante de l'écran (flex:1, fournie par le parent) : en-tête des jours fixe en haut,
// liste des salariés qui scrolle verticalement en dessous, légende des couleurs fixe en bas —
// plutôt que de laisser la page entière grandir et scroller.
// Cases sans texte (juste une couleur par statut/créneau, cf. légende) — décision explicite pour
// rester lisible même avec beaucoup de monde sur la même semaine ; en revanche le nom du salarié et
// le résumé École/Travail/Congé restent en toutes lettres (cf. retour utilisateur du 2026-08-23 :
// "il faut voir le prénom de la personne en entier").
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import type { Conge, JourEcoleAlternant, PlanningShift, PopUp, Profile } from '@/types/database.types';
import { couleurCaseNomSalarie, trierParPopUpAttribue } from '@/utils/affectations';
import {
  dateEnISO,
  estAujourdhui,
  formatDureeHeures,
  nomJourCourt,
  numeroJour,
  totalHeuresSemaineAvecEcole,
} from '@/utils/dateUtils';

const HAUTEUR_CASE = 40;
// Distinct des couleurs de pop-up existantes (cf. table pop_ups : #6366F1, #F97316, #EC4899,
// #10B981) — l'ancien violet (#8B5CF6) était trop proche de l'indigo de Créteil Soleil pour bien
// distinguer les deux au premier coup d'œil (retour utilisateur du 2026-08-24).
const COULEUR_ECOLE = '#06B6D4';
const COULEUR_TRAVAIL_DEFAUT = '#6366F1';

// "Repos" est un jour off normal (décidé à l'avance), pas un problème comme une absence/
// indisponibilité — teinte neutre plutôt que le rouge utilisé pour les autres types.
const COULEUR_CONGE: Record<Conge['type'], { fond: string; texte: string }> = {
  conge: { fond: '#FEE2E2', texte: '#DC2626' },
  indisponibilite: { fond: '#FEE2E2', texte: '#DC2626' },
  absence: { fond: '#FEE2E2', texte: '#DC2626' },
  repos: { fond: '#F1F5F9', texte: '#64748B' },
};

// `nom_complet` est stocké "Prénom Nom" — on n'affiche que le premier mot (retour utilisateur du
// 2026-08-24 : "juste le prénom stp"), avec repli sur l'email si le nom n'est pas renseigné.
function prenom(p: Profile): string {
  return (p.nom_complet || p.email).trim().split(/\s+/)[0];
}

export function VueParEmployes({
  jours,
  profils,
  shifts,
  popUpParId,
  onPressCellule,
  onPressCelluleConge,
  joursEcole,
  conges,
  mapAffectations,
  popUps,
  couleurPopUpSelectionne,
  hauteurLigne = HAUTEUR_CASE,
}: {
  jours: Date[];
  profils: Profile[];
  shifts: PlanningShift[];
  onPressCellule: (profil: Profile, dateIso: string, shiftsCellule: PlanningShift[]) => void;
  /** Cellule couvrant un congé/indisponibilité : on ne peut pas y planifier quelqu'un qui est
   * absent, donc un clic dessus propose plutôt de supprimer ce congé (cf. calendrier.tsx). Si
   * absent, on retombe sur le comportement normal (`onPressCellule`). */
  onPressCelluleConge?: (conge: Conge, profil: Profile) => void;
  /** Couleur par lieu : les créneaux sont colorés par pop-up (cette vue agrège tous les lieux, un
   * employé peut avoir des créneaux à des endroits différents la même semaine). */
  popUpParId: Map<string, PopUp>;
  joursEcole: JourEcoleAlternant[];
  /** Congés/indisponibilités déclarés — affichés en rouge sur la case concernée pour qu'on
   * comprenne tout de suite pourquoi la personne n'a pas de créneau ce jour-là. */
  conges: Conge[];
  /** Sert à colorer la pastille à côté du nom avec la couleur du pop-up auquel chaque salarié est
   * attribué (cf. couleurCaseNomSalarie). */
  mapAffectations: Map<string, Set<string>>;
  popUps: PopUp[];
  /** Couleur du pop-up actuellement sélectionné (ex. le sélecteur de lieu de PlanningMobile) — sert
   * uniquement à teinter la pastille "Pop-up" de la légende avec la vraie couleur de ce lieu plutôt
   * qu'une couleur générique, quand la vue est déjà filtrée sur un seul pop-up. Sans objet dans les
   * vues agrégées (tous les lieux confondus), qui gardent la couleur générique par défaut. */
  couleurPopUpSelectionne?: string | null;
  /** Hauteur (et donc largeur, cases carrées) des 7 cases par salarié — un manager mobile qui
   * regarde son équipe sur téléphone a besoin de cases plus compactes que sur un large écran web
   * (cf. PlanningMobile). */
  hauteurLigne?: number;
}) {
  // Regroupe les gens du même pop-up ensemble (cf. couleur de la pastille) plutôt qu'un ordre
  // arbitraire.
  const profilsTries = useMemo(
    () => trierParPopUpAttribue(profils, mapAffectations, popUps),
    [profils, mapAffectations, popUps],
  );

  // Nombre de jours (parmi `jours`) où le salarié a un congé/indisponibilité/absence déclaré — le
  // "repos" n'en fait pas partie (c'est un jour off normal, pas une absence à décompter).
  function joursCongeSemaine(profileId: string): number {
    return jours.filter((j) => {
      const dateIso = dateEnISO(j);
      return conges.some(
        (c) => c.profile_id === profileId && c.type !== 'repos' && dateIso >= c.date_debut && dateIso <= c.date_fin,
      );
    }).length;
  }

  return (
    <View style={styles.carte}>
      <View style={styles.enteteJoursRow}>
        {jours.map((j) => (
          <View
            key={dateEnISO(j)}
            style={[styles.enteteJour, estAujourdhui(j) && styles.enteteJourAujourdhui]}
          >
            <Text style={styles.enteteJourLabel}>{nomJourCourt(j)}</Text>
            <Text style={styles.enteteJourNumero}>{numeroJour(j)}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        {profilsTries.map((p) => {
          const couleurPopUp = couleurCaseNomSalarie(p, mapAffectations, popUps);
          const { heuresEcole, heuresTravaillees } = totalHeuresSemaineAvecEcole(jours, shifts, joursEcole, p.id);
          const joursConge = joursCongeSemaine(p.id);
          return (
            <View key={p.id} style={styles.blocEmploye}>
              <View style={styles.ligneNom}>
                <View
                  style={[
                    styles.pastille,
                    couleurPopUp ? { backgroundColor: couleurPopUp } : styles.pastilleNeutre,
                  ]}
                />
                <Text style={styles.nomTexte}>{prenom(p)}</Text>
              </View>

              <View style={styles.ligneCases}>
                {jours.map((j) => {
                  const dateIso = dateEnISO(j);
                  const shiftsCellule = shifts.filter((s) => s.profile_id === p.id && s.date === dateIso);
                  const aEcole = joursEcole.some((je) => je.profile_id === p.id && je.date === dateIso);
                  const congeCellule = conges.find(
                    (c) => c.profile_id === p.id && dateIso >= c.date_debut && dateIso <= c.date_fin,
                  );
                  // Jour sans rien du tout (pas de shift, pas de congé/absence, pas d'école) : pur
                  // affichage "Repos" pour que ce soit lisible d'un coup d'œil (ex. les dimanches non
                  // travaillés) — aucune ligne créée en base, cf. décision utilisateur du 2026-07-27.
                  const estRepos = !congeCellule && !aEcole && shiftsCellule.length === 0;
                  const couleurTravail = shiftsCellule[0] ? popUpParId.get(shiftsCellule[0].pop_up_id)?.couleur ?? COULEUR_TRAVAIL_DEFAUT : null;
                  const couleurCase = congeCellule
                    ? COULEUR_CONGE[congeCellule.type].texte
                    : aEcole
                      ? COULEUR_ECOLE
                      : estRepos
                        ? COULEUR_CONGE.repos.texte
                        : couleurTravail;
                  return (
                    <Pressable
                      key={dateIso}
                      onPress={() =>
                        congeCellule && onPressCelluleConge
                          ? onPressCelluleConge(congeCellule, p)
                          : onPressCellule(p, dateIso, shiftsCellule)
                      }
                      style={[
                        styles.case_,
                        { height: hauteurLigne, backgroundColor: couleurCase ?? '#F1F5F9', opacity: couleurCase ? 0.55 : 1 },
                      ]}
                    />
                  );
                })}
              </View>

              <Text style={styles.resumeTexte}>
                École : {formatDureeHeures(heuresEcole)} · Travail : {formatDureeHeures(heuresTravaillees)} · Congé :{' '}
                {joursConge} jour{joursConge > 1 ? 's' : ''}
              </Text>
            </View>
          );
        })}
        {profilsTries.length === 0 && (
          <View style={styles.videLigne}>
            <Text style={styles.videTexte}>Aucun membre.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.legende}>
        <View style={styles.legendeItem}>
          <View style={[styles.pointLegende, { backgroundColor: couleurPopUpSelectionne || COULEUR_TRAVAIL_DEFAUT }]} />
          <Text style={styles.legendeTexte}>Pop-up</Text>
        </View>
        <View style={styles.legendeItem}>
          <View style={[styles.pointLegende, { backgroundColor: COULEUR_ECOLE }]} />
          <Text style={styles.legendeTexte}>École</Text>
        </View>
        <View style={styles.legendeItem}>
          <View style={[styles.pointLegende, { backgroundColor: COULEUR_CONGE.conge.texte }]} />
          <Text style={styles.legendeTexte}>Congé</Text>
        </View>
        <View style={styles.legendeItem}>
          <View style={[styles.pointLegende, { backgroundColor: COULEUR_CONGE.repos.texte }]} />
          <Text style={styles.legendeTexte}>Repos</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  enteteJoursRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  enteteJour: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
  },
  enteteJourAujourdhui: { backgroundColor: '#EEF2FF' },
  enteteJourLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8' },
  enteteJourNumero: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  blocEmploye: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  ligneNom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nomTexte: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  pastille: { height: 10, width: 10, borderRadius: 5 },
  // Admin (attribué à tous les lieux, cf. estAttribueA) ou personne sans pop-up attribué : pas de
  // couleur de lieu pertinente, pastille neutre avec juste un contour pour rester visible sur fond
  // blanc (cf. couleurCaseNomSalarie).
  pastilleNeutre: { backgroundColor: 'white', borderWidth: 1, borderColor: '#CBD5E1' },
  ligneCases: { flexDirection: 'row', gap: 4 },
  case_: { flex: 1, borderRadius: 8 },
  resumeTexte: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  videLigne: { paddingHorizontal: 14, paddingVertical: 20 },
  videTexte: { fontSize: 13, color: '#94A3B8' },
  legende: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  legendeItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pointLegende: { height: 9, width: 9, borderRadius: 4.5 },
  legendeTexte: { fontSize: 11, fontWeight: '600', color: '#64748B' },
});
