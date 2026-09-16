// Cf. retour utilisateur du 2026-09-15 : "il faut un tableau qui demande tout seul le montant de
// cette date à ce pop-up si il n'a jamais été rempli... on est le 12 septembre, le 11 est terminé,
// tu affiches tous les résultats espèce des 3 pop-up, je rentre les enveloppes, je mets OK et ça va
// dans l'historique. Si je fais ça le 14, tu me mets le 11, 12 et 13... si je ne veux pas remplir
// une case, j'ai la possibilité de la supprimer. On commence à partir du 8 septembre." — remplace
// la saisie manuelle libre (pop-up + date choisis à la main) par une file d'attente générée toute
// seule : un pop-up (hors "Local") × un jour terminé (hier ou avant, depuis le 8 septembre) sans
// trou de caisse déjà enregistré ni ignoré = une case à traiter.
import { eachDayOfInterval, format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useAuthStore } from '@/store/useAuthStore';
import { fetchPersonnelJour } from '@/api/trouCaisse';
import { useGererTrouCaisse, useTrousCaisse, useTrousCaisseIgnores } from '@/hooks/useTrouCaisse';
import { usePopUps } from '@/hooks/usePopUps';
import { useVentesEspecesPeriode } from '@/hooks/useVentesEspeces';
import { useVentesSumupPeriode } from '@/hooks/useVentesSumup';
import type { PopUp } from '@/types/database.types';

// Date de départ du suivi — fixée une fois pour toutes (retour utilisateur explicite), pas de sens
// de faire remonter la file d'attente avant cette date.
const DATE_DEBUT_SUIVI = '2026-09-08';

function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function formatDateCourte(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function debutJourDe(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00`);
}
function finJourDe(dateIso: string): Date {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setHours(23, 59, 59, 999);
  return d;
}

interface CasePendante {
  popUpId: string;
  popUpNom: string;
  popUpCouleur: string;
  dateIso: string;
  montantAttendu: number;
}

/** Une case en attente : montant attendu affiché, saisie du montant compté, OK (enregistre — la
 * personnel/fermeture est déduite du planning au moment de valider) ou ✕ (ignore définitivement
 * cette case sans créer de trou). */
function LignePendante({
  cas,
  onValider,
  onIgnorer,
}: {
  cas: CasePendante;
  onValider: (montantCompte: number) => Promise<void>;
  onIgnorer: () => void;
}) {
  const [montantCompte, setMontantCompte] = useState('');
  const [enCours, setEnCours] = useState(false);

  const montantNombre = Number(montantCompte.replace(',', '.'));
  const valide = montantCompte.trim() !== '' && Number.isFinite(montantNombre);
  const ecart = valide ? montantNombre - cas.montantAttendu : null;

  const valider = async () => {
    if (!valide || enCours) return;
    setEnCours(true);
    try {
      await onValider(montantNombre);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Échec de l'enregistrement.");
      setEnCours(false);
    }
  };

  return (
    <View style={styles.lignePendante}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.puceCouleur, { backgroundColor: cas.popUpCouleur }]} />
        <Text style={styles.lignePendanteTitre}>
          {formatDateCourte(cas.dateIso)} · {cas.popUpNom}
        </Text>
        <Pressable
          onPress={() =>
            Alert.alert('Ignorer cette case', `${formatDateCourte(cas.dateIso)} · ${cas.popUpNom} ne sera plus jamais demandé.`, [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Ignorer', style: 'destructive', onPress: onIgnorer },
            ])
          }
          hitSlop={8}
          style={{ marginLeft: 'auto' }}
        >
          <Text style={styles.lienIgnorer}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.lignePendanteAttendu}>Attendu : {formatMontant(cas.montantAttendu)}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <TextInput
          value={montantCompte}
          onChangeText={setMontantCompte}
          placeholder="Montant compté"
          keyboardType="decimal-pad"
          style={styles.inputMontantPendant}
        />
        <Pressable onPress={valider} disabled={!valide || enCours} style={[styles.boutonOkPendant, (!valide || enCours) && styles.boutonOkPendantDesactive]}>
          <Text style={[styles.boutonOkPendantTexte, (!valide || enCours) && styles.boutonOkPendantTexteDesactive]}>
            {enCours ? '…' : 'OK'}
          </Text>
        </Pressable>
      </View>
      {ecart !== null && Math.abs(ecart) >= 0.01 && (
        <Text style={styles.lignePendanteEcart}>
          Écart {ecart > 0 ? '+' : ''}
          {formatMontant(ecart)}
        </Text>
      )}
    </View>
  );
}

/** "Trou de caisse" (Profil > admin) : file d'attente auto-générée d'un pop-up × un jour terminé
 * sans trou déjà enregistré depuis le 8 septembre — montant attendu (SumUp espèce + espèces appli
 * confirmées) calculé tout seul, il ne reste qu'à saisir le montant compté. Personnel présent et
 * fermeture déduits du planning au moment de valider (même logique que Hub > Finance > Trou, qui
 * partage la même table `trous_caisse`). */
export function TrouCaisseEcran({ onRetour }: { onRetour: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const popUps = useMemo(() => (popUpsTous ?? []).filter((p) => !p.est_local), [popUpsTous]);

  const hier = useMemo(() => subDays(new Date(new Date().setHours(0, 0, 0, 0)), 1), []);
  const debutSuivi = useMemo(() => new Date(`${DATE_DEBUT_SUIVI}T00:00:00`), []);
  const joursAControler = useMemo(
    () => (hier < debutSuivi ? [] : eachDayOfInterval({ start: debutSuivi, end: hier }).map((d) => format(d, 'yyyy-MM-dd'))),
    [debutSuivi, hier],
  );

  const { data: ventesSumup, isLoading: chargementSumup } = useVentesSumupPeriode(
    debutSuivi.toISOString(),
    finJourDe(joursAControler[joursAControler.length - 1] ?? DATE_DEBUT_SUIVI).toISOString(),
  );
  const { data: ventesEspeces, isLoading: chargementEspeces } = useVentesEspecesPeriode(
    debutSuivi.toISOString(),
    finJourDe(joursAControler[joursAControler.length - 1] ?? DATE_DEBUT_SUIVI).toISOString(),
  );
  const { data: trous, isLoading: chargementTrous } = useTrousCaisse();
  const { data: ignores, isLoading: chargementIgnores } = useTrousCaisseIgnores();
  const { ajouter, supprimer, ignorer } = useGererTrouCaisse();

  const chargement = chargementPopUps || chargementSumup || chargementEspeces || chargementTrous || chargementIgnores;

  // Montant attendu par pop-up et par jour (clé "popUpId|dateIso") — un seul passage sur toute la
  // période plutôt qu'une requête par case en attente.
  const attenduParCle = useMemo(() => {
    const carte = new Map<string, number>();
    for (const v of ventesSumup ?? []) {
      if (v.statut !== 'SUCCESSFUL' || v.moyen_paiement !== 'CASH' || !v.pop_up_id) continue;
      const jour = format(new Date(v.horodatage), 'yyyy-MM-dd');
      const cle = `${v.pop_up_id}|${jour}`;
      carte.set(cle, (carte.get(cle) ?? 0) + v.montant);
    }
    for (const v of ventesEspeces ?? []) {
      if (v.statut !== 'confirmee') continue;
      const jour = format(new Date(v.created_at), 'yyyy-MM-dd');
      const cle = `${v.pop_up_id}|${jour}`;
      carte.set(cle, (carte.get(cle) ?? 0) + v.montant);
    }
    return carte;
  }, [ventesSumup, ventesEspeces]);

  const clesRemplies = useMemo(() => new Set((trous ?? []).map((t) => `${t.popUpId}|${t.date}`)), [trous]);
  const clesIgnorees = useMemo(() => new Set((ignores ?? []).map((i) => `${i.popUpId}|${i.date}`)), [ignores]);

  const casesEnAttente = useMemo(() => {
    const liste: CasePendante[] = [];
    for (const jour of joursAControler) {
      for (const p of popUps as PopUp[]) {
        if (p.date_debut && jour < p.date_debut) continue;
        if (p.date_fin && jour > p.date_fin) continue;
        const cle = `${p.id}|${jour}`;
        if (clesRemplies.has(cle) || clesIgnorees.has(cle)) continue;
        liste.push({ popUpId: p.id, popUpNom: p.nom, popUpCouleur: p.couleur, dateIso: jour, montantAttendu: attenduParCle.get(cle) ?? 0 });
      }
    }
    return liste;
  }, [joursAControler, popUps, clesRemplies, clesIgnorees, attenduParCle]);

  const [erreur, setErreur] = useState<string | null>(null);
  // Cf. retour utilisateur du 2026-09-16 : "dans le trou espèce l'historique rajoute-moi un filtre
  // par pop up".
  const [filtreHistoriquePopUpId, setFiltreHistoriquePopUpId] = useState<string>('tous');
  const trousFiltres = useMemo(
    () => (trous ?? []).filter((t) => filtreHistoriquePopUpId === 'tous' || t.popUpId === filtreHistoriquePopUpId),
    [trous, filtreHistoriquePopUpId],
  );

  const validerCase = async (cas: CasePendante, montantCompte: number) => {
    if (!profile) return;
    setErreur(null);
    const personnel = await fetchPersonnelJour(cas.popUpId, cas.dateIso).catch(() => ({ personnesPresentes: [], fermetureSuggereeId: null }));
    await ajouter.mutateAsync({
      popUpId: cas.popUpId,
      date: cas.dateIso,
      montantCompte,
      montantAttendu: cas.montantAttendu,
      personneFermetureId: personnel.fermetureSuggereeId,
      personnesPresentesIds: personnel.personnesPresentes.map((p) => p.id),
      note: '',
      profileId: profile.id,
    });
  };

  const ignorerCase = (cas: CasePendante) => {
    if (!profile) return;
    ignorer.mutate(
      { popUpId: cas.popUpId, date: cas.dateIso, profileId: profile.id },
      { onError: (e) => setErreur(e instanceof Error ? e.message : "Échec de l'ignorance.") },
    );
  };

  const supprimerTrou = (id: string, libelle: string) => {
    Alert.alert('Supprimer ce trou de caisse', libelle, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => supprimer.mutate(id) },
    ]);
  };

  return (
    <View style={styles.ecran}>
      <EnteteRetour titre="Trou de caisse" onRetour={onRetour} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.titreSection}>
          En attente {casesEnAttente.length > 0 && `(${casesEnAttente.length})`}
        </Text>
        {erreur && <Text style={styles.texteErreur}>{erreur}</Text>}
        {chargement ? (
          <ActivityIndicator color="#6366F1" />
        ) : casesEnAttente.length === 0 ? (
          <Text style={styles.texteAide}>Rien en attente — tout est à jour depuis le {formatDateCourte(DATE_DEBUT_SUIVI)}.</Text>
        ) : (
          casesEnAttente.map((cas) => (
            <LignePendante
              key={`${cas.popUpId}-${cas.dateIso}`}
              cas={cas}
              onValider={(montant) => validerCase(cas, montant)}
              onIgnorer={() => ignorerCase(cas)}
            />
          ))
        )}

        <Text style={styles.titreSection}>Historique</Text>
        <View style={styles.ligneChipsFiltre}>
          <Pressable
            onPress={() => setFiltreHistoriquePopUpId('tous')}
            style={[styles.chipFiltre, filtreHistoriquePopUpId === 'tous' && styles.chipFiltreActif]}
          >
            <Text style={[styles.chipFiltreTexte, filtreHistoriquePopUpId === 'tous' && styles.chipFiltreTexteActif]}>
              Tous
            </Text>
          </Pressable>
          {popUps.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setFiltreHistoriquePopUpId(p.id)}
              style={[styles.chipFiltre, filtreHistoriquePopUpId === p.id && styles.chipFiltreActif]}
            >
              <Text style={[styles.chipFiltreTexte, filtreHistoriquePopUpId === p.id && styles.chipFiltreTexteActif]}>
                {p.nom}
              </Text>
            </Pressable>
          ))}
        </View>
        {chargementTrous ? (
          <ActivityIndicator color="#6366F1" />
        ) : trousFiltres.length === 0 ? (
          <Text style={styles.texteAide}>Aucun trou enregistré.</Text>
        ) : (
          trousFiltres.map((t) => {
            const aUnEcart = Math.abs(t.montant) >= 0.01;
            return (
              <View key={t.id} style={styles.ligneHistorique}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.ligneHistoriqueTitre}>
                      {formatDateCourte(t.date)} · {t.popUpNom}
                    </Text>
                    {aUnEcart && (
                      <View style={styles.badgeEcart}>
                        <Text style={styles.badgeEcartTexte}>
                          {t.montant > 0 ? '+' : ''}
                          {formatMontant(t.montant)}
                        </Text>
                      </View>
                    )}
                  </View>
                  {(t.montantCompte !== null || t.montantAttendu !== null) && (
                    <Text style={styles.ligneHistoriqueSousTexte}>
                      Compté {t.montantCompte !== null ? formatMontant(t.montantCompte) : '—'} · Attendu{' '}
                      {t.montantAttendu !== null ? formatMontant(t.montantAttendu) : '—'}
                    </Text>
                  )}
                  <Text style={styles.ligneHistoriqueSousTexte}>
                    Clôture : {t.personneFermetureNom ?? '—'}
                    {t.personnesPresentes.length > 0 ? ` · Présents : ${t.personnesPresentes.map((p) => p.nomComplet).join(', ')}` : ''}
                  </Text>
                  {t.note && <Text style={styles.ligneHistoriqueNote}>{t.note}</Text>}
                  <Text style={styles.ligneHistoriqueCreateur}>Enregistré par {t.creeParNom}</Text>
                </View>
                <Pressable
                  onPress={() => supprimerTrou(t.id, `${formatDateCourte(t.date)} · ${t.popUpNom}`)}
                  hitSlop={8}
                >
                  <Text style={styles.lienSupprimer}>Supprimer</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  texteAide: { marginTop: 4, marginBottom: 8, fontSize: 12, color: '#94A3B8' },
  texteErreur: { marginBottom: 8, fontSize: 12, color: '#DC2626' },
  titreSection: { marginBottom: 8, marginTop: 20, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  puceCouleur: { height: 8, width: 8, borderRadius: 4 },
  lignePendante: { marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', padding: 12 },
  lignePendanteTitre: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  lignePendanteAttendu: { marginTop: 4, fontSize: 12, color: '#92400E' },
  lignePendanteEcart: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#DC2626' },
  inputMontantPendant: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, fontWeight: '700', color: '#0F172A' },
  boutonOkPendant: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#059669', paddingHorizontal: 18, paddingVertical: 10 },
  boutonOkPendantDesactive: { backgroundColor: '#E2E8F0' },
  boutonOkPendantTexte: { fontSize: 13, fontWeight: '700', color: 'white' },
  boutonOkPendantTexteDesactive: { color: '#94A3B8' },
  lienIgnorer: { fontSize: 15, fontWeight: '700', color: '#94A3B8', paddingHorizontal: 4 },
  ligneChipsFiltre: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chipFiltre: { borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 6 },
  chipFiltreActif: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },
  chipFiltreTexte: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  chipFiltreTexteActif: { color: 'white' },
  ligneHistorique: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 12 },
  ligneHistoriqueTitre: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  ligneHistoriqueSousTexte: { marginTop: 3, fontSize: 11, color: '#94A3B8' },
  ligneHistoriqueNote: { marginTop: 4, fontSize: 12, fontStyle: 'italic', color: '#64748B' },
  ligneHistoriqueCreateur: { marginTop: 4, fontSize: 10, color: '#CBD5E1' },
  badgeEcart: { borderRadius: 999, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 2 },
  badgeEcartTexte: { fontSize: 11, fontWeight: '800', color: '#DC2626' },
  lienSupprimer: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
});
