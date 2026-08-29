import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { CarteShiftJournee } from './CarteShiftJournee';
import { PanneauEditionShiftEquipe } from './PanneauEditionShiftEquipe';
import { SelecteurSemaineCombo } from './SelecteurSemaineCombo';
import { VueParEmployes } from './VueParEmployes';
import { BarreOnglets } from '@/components/ui/BarreOnglets';
import { Dropdown } from '@/components/ui/Dropdown';
import { useJoursEcolePeriode } from '@/hooks/useAlternance';
import { useCongesPeriode, useCongesProfile } from '@/hooks/useConges';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp, useActiveProfiles } from '@/hooks/useProfiles';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useHorairesOuverture } from '@/hooks/useReglesMetier';
import { useAuthStore } from '@/store/useAuthStore';
import { useSemaineStore } from '@/store/useSemaineStore';
import type { Conge, PlanningShift, Profile, RegleHoraireOuverture } from '@/types/database.types';
import { construireMapAffectations, estAttribueA, popUpsAttribues } from '@/utils/affectations';
import { dateEnISO, formatCreneauShift, jourSemaineISO, joursDeLaSemaine, libelleJourCourt } from '@/utils/dateUtils';
import { versMinutes } from '@/utils/timelineLayout';

type Onglet = 'mes_shifts' | 'equipe';

type Couverture = 'ferme' | 'couvert' | 'trou';

/** Le pop-up est-il couvert sans trou sur toute sa plage d'ouverture ce jour-là ? Fusionne les
 * créneaux de l'équipe (triés par heure de début) et vérifie qu'ils s'enchaînent sans blanc entre
 * l'ouverture et la fermeture — sert d'indicateur rapide "c'est bon"/"il manque du monde" dans la
 * vue équipe (cf. demande manager : voir en un coup d'œil si quelqu'un couvre bien toute la
 * journée, plutôt que de devoir comparer les horaires un par un). */
function calculerCouverture(
  regleJour: RegleHoraireOuverture | undefined,
  shiftsJour: PlanningShift[],
): Couverture {
  if (!regleJour || !regleJour.actif) return 'ferme';
  const ouvertureMin = versMinutes(regleJour.heure_ouverture);
  const fermetureMin = versMinutes(regleJour.heure_fermeture);
  const intervalles = shiftsJour
    .map((s) => [versMinutes(s.heure_debut), versMinutes(s.heure_fin)] as const)
    .sort((a, b) => a[0] - b[0]);
  let curseur = ouvertureMin;
  for (const [debut, fin] of intervalles) {
    if (debut > curseur) return 'trou';
    curseur = Math.max(curseur, fin);
    if (curseur >= fermetureMin) return 'couvert';
  }
  return curseur >= fermetureMin ? 'couvert' : 'trou';
}

// "Repos hebdomadaire" ne doit s'afficher que quand il n'y a vraiment rien (aucun congé/absence/
// indispo/repos ce jour) — sinon le vrai motif prime, cf. bug remonté le 2026-07-27 ("le 28 il est
// indispo mais c'est écrit repos hebdomadaire").
const LIBELLE_CONGE_JOUR: Record<Conge['type'], string> = {
  conge: 'Congé',
  indisponibilite: 'Indisponible',
  absence: 'Absence',
  repos: 'Repos',
};
const COULEUR_CONGE_JOUR: Record<Conge['type'], string> = {
  conge: '#F87171',
  indisponibilite: '#F87171',
  absence: '#F87171',
  repos: '#CBD5E1',
};

/** Écran "Planning" mobile façon Combo (onglet de la barre de navigation basse non-admin) :
 * toggle "Mes shifts"/"Équipe(s)", navigation semaine en 3 pastilles, cartes de shifts groupées
 * par jour. Distinct de CalendrierPersonnelEcran.tsx (non touché, reste utilisé sur web et par
 * l'admin) — cf. plan pour le détail de cette séparation. */
export function PlanningMobile() {
  const profile = useProfilEffectif();
  // Le vrai utilisateur connecté (pas le profil "effectif" de prévisualisation admin) : sert de
  // created_by sur les shifts créés depuis la grille équipe, RLS vérifie auth.uid() (même règle
  // que traitePar pour la validation des congés, cf. PanneauValidationEquipe).
  const profileReel = useAuthStore((s) => s.profile);
  const [onglet, setOnglet] = useState<Onglet>('mes_shifts');
  const [popUpSelectionne, setPopUpSelectionne] = useState<string | undefined>(undefined);
  const [celluleEditee, setCelluleEditee] = useState<{ profil: Profile; dateIso: string } | null>(null);
  // Le manager voit par défaut exactement la même vue équipe qu'un alternant (lecture seule,
  // façon Combo) — "Modifier" bascule vers la liste éditable par personne (cf. rendu plus bas).
  const [modeEdition, setModeEdition] = useState(false);
  // Vue "par jour" (façon Combo, historique) par défaut — "par employé" (grille avec École/heures,
  // cf. VueParEmployes) accessible via le bouton dédié, pas affichée d'entrée.
  const [vueEquipe, setVueEquipe] = useState<'jour' | 'employes'>('jour');
  // Décoché par défaut (cf. commentaire sur profilsEquipe) : ne s'affiche qu'en mode édition, pour
  // pouvoir malgré tout attribuer un admin à un pop-up sans personne d'autre dessus.
  const [voirAdmins, setVoirAdmins] = useState(false);
  const { dateReference, semaineSuivante, semainePrecedente, revenirAujourdhui } = useSemaineStore();
  const jours = joursDeLaSemaine(dateReference);
  const dateDebut = dateEnISO(jours[0]);
  const dateFin = dateEnISO(jours[6]);

  const { data: shifts, isLoading: chargementShifts } = useShiftsSemaine(dateDebut, dateFin);
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const { data: profils } = useActiveProfiles();
  const { data: affectations } = useAffectationsPopUp();
  const { data: conges } = useCongesProfile(profile?.id);
  // Congés de toute l'équipe (pas seulement les siens) — utilisés uniquement par la grille manager
  // ci-dessous ; RLS ne renvoie de toute façon que ce que le profil connecté peut voir.
  const { data: congesEquipe } = useCongesPeriode(dateDebut, dateFin);
  // Jours d'école : uniquement pour la vue "Équipe(s)" en lecture (cf. VueParEmployes plus bas,
  // résumé École/Travail par personne).
  const { data: joursEcole } = useJoursEcolePeriode(dateDebut, dateFin);

  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const mesPopUps = useMemo(
    () => (profile ? popUpsAttribues(profile, mapAffectations, popUpsTous ?? []) : []),
    [profile, mapAffectations, popUpsTous],
  );
  const profilParId = useMemo(() => new Map((profils ?? []).map((p) => [p.id, p])), [profils]);
  const popUpParId = useMemo(() => new Map((popUpsTous ?? []).map((p) => [p.id, p])), [popUpsTous]);

  const popUpEquipe = popUpSelectionne ?? mesPopUps[0]?.id;
  const estManager = profile?.type_contrat === 'manager';
  // Un admin a aussi accès au mode édition de la vue équipe (comme un manager), avec le sélecteur
  // de pop-up déjà fonctionnel puisque `mesPopUps` retourne tous les lieux pour un admin (cf.
  // popUpsAttribues) — pas besoin d'un chemin séparé, juste d'élargir la condition d'affichage.
  const estAdmin = profile?.role === 'admin';
  // Les admins sont considérés "attribués à tous les lieux" (cf. estAttribueA) mais n'ont pas leur
  // place dans l'équipe d'un pop-up au sens planning — le manager veut voir son équipe (3-4
  // personnes en général), pas la liste de tous les admins de l'app. "Voir les admins" (mode
  // édition uniquement) les révèle malgré tout, pour pouvoir en attribuer un explicitement à un
  // pop-up sans personne d'autre dessus (ex. dépanner).
  const profilsEquipe = useMemo(
    () =>
      popUpEquipe
        ? (profils ?? []).filter(
            (p) => (voirAdmins || p.role !== 'admin') && estAttribueA(p, popUpEquipe, mapAffectations),
          )
        : [],
    [profils, popUpEquipe, mapAffectations, voirAdmins],
  );
  // Horaires d'ouverture du pop-up affiché — sert uniquement à l'indicateur de couverture de la
  // vue équipe (cf. calculerCouverture) ; `enabled: !!popUpId` dans le hook évite une requête
  // inutile côté "Mes shifts" (aucun popUpEquipe pertinent dans cet onglet).
  const { data: horaires } = useHorairesOuverture(onglet === 'equipe' ? popUpEquipe : undefined);

  const shiftsAffiches = useMemo(() => {
    if (onglet === 'mes_shifts') return (shifts ?? []).filter((s) => s.profile_id === profile?.id);
    return (shifts ?? []).filter((s) => s.pop_up_id === popUpEquipe);
  }, [shifts, onglet, profile?.id, popUpEquipe]);

  // Dérivé en direct de `shifts` (pas figé au clic) : après un ajout/suppression depuis la feuille
  // ci-dessous, la liste affichée doit refléter le changement sans avoir à fermer/rouvrir.
  const shiftsCelluleEditee = useMemo(() => {
    if (!celluleEditee) return [];
    return (shifts ?? []).filter(
      (s) => s.profile_id === celluleEditee.profil.id && s.date === celluleEditee.dateIso,
    );
  }, [shifts, celluleEditee]);

  const shiftsParJour = useMemo(() => {
    const map = new Map<string, PlanningShift[]>();
    for (const jour of jours) map.set(dateEnISO(jour), []);
    for (const shift of shiftsAffiches) {
      map.get(shift.date)?.push(shift);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftsAffiches, dateDebut, dateFin]);

  const chargement = chargementShifts || chargementPopUps;

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pb-2 pt-14">
        <Text className="text-2xl font-bold text-slate-900">Planning</Text>
      </View>

      <View className="mx-4 mb-3">
        <BarreOnglets
          valeur={onglet}
          onChange={setOnglet}
          options={[
            { valeur: 'mes_shifts', label: 'Mes shifts' },
            { valeur: 'equipe', label: 'Équipe(s)' },
          ]}
        />
      </View>

      <SelecteurSemaineCombo
        dateReference={dateReference}
        onPrecedente={semainePrecedente}
        onSuivante={semaineSuivante}
        onRevenirAujourdhui={revenirAujourdhui}
      />

      {onglet === 'equipe' && (
        <View className="mb-3 flex-row items-center gap-2 px-4">
          {mesPopUps.length > 1 && (
            <View className="flex-1">
              <Dropdown
                value={popUpEquipe}
                options={mesPopUps.map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
                onChange={setPopUpSelectionne}
              />
            </View>
          )}
          {!modeEdition && (
            <Pressable
              onPress={() => setVueEquipe((v) => (v === 'jour' ? 'employes' : 'jour'))}
              className={`h-9 w-9 items-center justify-center rounded-full ${vueEquipe === 'employes' ? 'bg-indigo-600' : 'bg-slate-100'}`}
            >
              <Ionicons
                name={vueEquipe === 'employes' ? 'people' : 'people-outline'}
                size={18}
                color={vueEquipe === 'employes' ? 'white' : '#4F46E5'}
              />
            </Pressable>
          )}
          {(estManager || estAdmin) && (
            <Pressable
              onPress={() => setModeEdition((v) => !v)}
              className={`rounded-full px-4 py-2 ${modeEdition ? 'bg-indigo-600' : 'bg-slate-100'}`}
            >
              <Text className={`text-sm font-semibold ${modeEdition ? 'text-white' : 'text-indigo-600'}`}>
                {modeEdition ? 'Terminé' : 'Modifier'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {onglet === 'equipe' && (estManager || estAdmin) && modeEdition && (
        <Pressable
          onPress={() => setVoirAdmins((v) => !v)}
          className="mb-3 flex-row items-center gap-1.5 px-4"
        >
          <View
            className={`h-4 w-4 items-center justify-center rounded ${
              voirAdmins ? 'bg-indigo-600' : 'border border-slate-300'
            }`}
          >
            {voirAdmins && <Text className="text-[10px] font-bold text-white">✓</Text>}
          </View>
          <Text className="text-xs font-semibold text-slate-500">Voir les admins</Text>
        </Pressable>
      )}

      {chargement ? (
        <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 24 }} />
      ) : onglet === 'equipe' && !modeEdition && vueEquipe === 'employes' ? (
        // Vue par employé (lecture) : une ligne par personne, une colonne par jour, avec École/
        // Congé/Repos et le total d'heures travail+école de la semaine — cf. demande "voir
        // rapidement combien d'heures ils font". Taper une cellule ouvre le même panneau d'édition
        // que le mode "Modifier" (PanneauEditionShiftEquipe), pas de flux séparé.
        <VueParEmployes
          jours={jours}
          profils={profilsEquipe}
          shifts={shiftsAffiches}
          onPressCellule={(profil, dateIso) => setCelluleEditee({ profil, dateIso })}
          popUpParId={popUpParId}
          joursEcole={joursEcole ?? []}
          conges={congesEquipe ?? []}
          mapAffectations={mapAffectations}
          popUps={popUpsTous ?? []}
          couleurPopUpSelectionne={popUpParId.get(popUpEquipe ?? '')?.couleur}
          hauteurLigne={36}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {jours.map((jour) => {
            const dateIso = dateEnISO(jour);
            const shiftsJour = [...(shiftsParJour.get(dateIso) ?? [])].sort((a, b) =>
              a.heure_debut.localeCompare(b.heure_debut),
            );
            const congeJour = (conges ?? []).find((c) => dateIso >= c.date_debut && dateIso <= c.date_fin);
            const regleJour = horaires?.find((h) => h.jour_semaine === jourSemaineISO(jour));
            const couverture: Couverture | null =
              onglet === 'equipe' && popUpEquipe ? calculerCouverture(regleJour, shiftsJour) : null;

            return (
              <View key={dateIso} className="mb-4">
                <View className="mb-2 flex-row items-center gap-2">
                  <View className="h-px flex-1 bg-slate-200" />
                  <Text className="text-xs font-semibold uppercase text-slate-400">
                    {libelleJourCourt(jour)}
                  </Text>
                  {couverture === 'couvert' && (
                    <View className="rounded-full bg-emerald-50 px-2 py-0.5">
                      <Text className="text-[10px] font-bold text-emerald-600">✓ Couvert</Text>
                    </View>
                  )}
                  {couverture === 'trou' && (
                    <View className="rounded-full bg-amber-50 px-2 py-0.5">
                      <Text className="text-[10px] font-bold text-amber-600">⚠ Trou</Text>
                    </View>
                  )}
                  <View className="h-px flex-1 bg-slate-200" />
                </View>

                {onglet === 'equipe' && (estManager || estAdmin) && modeEdition ? (
                  profilsEquipe.length === 0 ? (
                    <Text className="text-sm text-slate-400">Aucun membre dans cette équipe.</Text>
                  ) : (
                    profilsEquipe.map((membre) => {
                      const shiftsMembre = shiftsJour.filter((s) => s.profile_id === membre.id);
                      const congeMembre = (congesEquipe ?? []).find(
                        (c) => c.profile_id === membre.id && dateIso >= c.date_debut && dateIso <= c.date_fin,
                      );
                      return (
                        <Pressable
                          key={membre.id}
                          onPress={() => setCelluleEditee({ profil: membre, dateIso })}
                          className="mb-2 flex-row items-center justify-between rounded-2xl bg-white px-3.5 py-3 shadow-sm"
                        >
                          <View className="flex-row items-center gap-2.5">
                            <View
                              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: membre.couleur }}
                            />
                            <Text className="text-sm font-semibold text-slate-800">
                              {membre.nom_complet || membre.email}
                            </Text>
                          </View>
                          {congeMembre ? (
                            <View className="rounded-full bg-red-50 px-2.5 py-1">
                              <Text className="text-xs font-semibold text-red-600">
                                {LIBELLE_CONGE_JOUR[congeMembre.type]}
                              </Text>
                            </View>
                          ) : shiftsMembre.length > 0 ? (
                            <Text className="text-xs font-semibold text-indigo-600">
                              {shiftsMembre.map((s) => formatCreneauShift(s)).join(', ')}
                            </Text>
                          ) : (
                            <Text className="text-xs text-slate-400">Repos</Text>
                          )}
                        </Pressable>
                      );
                    })
                  )
                ) : shiftsJour.length === 0 ? (
                  onglet === 'mes_shifts' && (
                    <View className="flex-row overflow-hidden rounded-2xl bg-white shadow-sm">
                      <View
                        style={{
                          width: 4,
                          backgroundColor: congeJour ? COULEUR_CONGE_JOUR[congeJour.type] : '#CBD5E1',
                        }}
                      />
                      <View className="flex-1 p-3">
                        <Text className="text-sm font-semibold text-slate-400">
                          {congeJour ? LIBELLE_CONGE_JOUR[congeJour.type] : 'Repos hebdomadaire'}
                        </Text>
                      </View>
                    </View>
                  )
                ) : (
                  shiftsJour.map((shift) => (
                    <CarteShiftJournee
                      key={shift.id}
                      heureDebut={shift.heure_debut}
                      heureFin={shift.heure_fin}
                      pauseDebut={shift.pause_debut}
                      pauseFin={shift.pause_fin}
                      etiquette={shift.etiquette}
                      couleur={
                        onglet === 'mes_shifts'
                          ? (popUpParId.get(shift.pop_up_id)?.couleur ?? '#6366F1')
                          : (profilParId.get(shift.profile_id)?.couleur ?? '#6366F1')
                      }
                      libelleDroite={
                        onglet === 'mes_shifts'
                          ? (popUpParId.get(shift.pop_up_id)?.nom ?? '?')
                          : (profilParId.get(shift.profile_id)?.nom_complet ?? '?')
                      }
                    />
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <PanneauEditionShiftEquipe
        visible={!!celluleEditee}
        onClose={() => setCelluleEditee(null)}
        profil={celluleEditee?.profil ?? null}
        dateIso={celluleEditee?.dateIso ?? ''}
        popUpId={popUpEquipe}
        popUp={popUpParId.get(popUpEquipe ?? '')}
        shiftsExistants={shiftsCelluleEditee}
        conge={
          celluleEditee
            ? (congesEquipe ?? []).find(
                (c) =>
                  c.profile_id === celluleEditee.profil.id &&
                  celluleEditee.dateIso >= c.date_debut &&
                  celluleEditee.dateIso <= c.date_fin,
              )
            : undefined
        }
        creeParId={profileReel?.id}
      />
    </View>
  );
}
