// Écran Finance : CA/pop-up/salarié à partir des ventes SumUp synchronisées (cf.
// supabase/functions/sync-ventes-sumup). Réservé aux admins (route admin/finance.web.tsx,
// gate géré par admin/_layout.tsx) — Finance reste strictement admin-only, aucun droit ne peut
// être accordé pour ça (décision explicite, migration 0035). Extrait en composant à part pour
// garder l'écran facile à relire, pas pour être partagé avec une autre route. StyleSheet (pas de
// className) : le filtre "Personnalisé" utilise un <input type="date"> natif, même contournement
// du bug NativeWind que equipe.web.tsx/PanneauCreationShift.tsx (cf. leurs en-têtes).
//
// Couleurs : la teinte "brand" du graphique de tendance et les gris neutres reprennent la palette
// déjà utilisée partout dans l'app (indigo #4F46E5, slate) plutôt que la palette par défaut de la
// skill dataviz — c'est la substitution de marque que la skill demande elle-même. Les barres de
// répartition par pop-up/salarié reprennent la couleur déjà propre à chaque pop-up/profil
// (PopUp.couleur / Profile.couleur), cohérent avec le reste de l'app (calendrier, etc.) plutôt
// qu'une palette catégorielle générique.
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { useSynchroniserVentesSumup, useVentesSumupLignesPeriode, useVentesSumupPeriode } from '@/hooks/useVentesSumup';
import type { VenteSumup, VenteSumupLigne } from '@/types/database.types';

type PeriodePreset = 'jour' | 'semaine' | 'mois' | 'personnalise';

const PRESETS: { value: PeriodePreset; label: string }[] = [
  { value: 'jour', label: "Aujourd'hui" },
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'mois', label: 'Ce mois' },
  { value: 'personnalise', label: 'Personnalisé' },
];

const COULEUR_PRIMAIRE = '#4F46E5';
const COULEUR_NEUTRE = '#94A3B8';

function calculerPeriode(preset: PeriodePreset, debutPerso: string, finPerso: string): { debut: Date; fin: Date } {
  const maintenant = new Date();
  if (preset === 'jour') return { debut: startOfDay(maintenant), fin: endOfDay(maintenant) };
  if (preset === 'mois') return { debut: startOfMonth(maintenant), fin: endOfMonth(maintenant) };
  if (preset === 'personnalise') {
    return { debut: new Date(`${debutPerso}T00:00:00`), fin: new Date(`${finPerso}T23:59:59`) };
  }
  return { debut: startOfWeek(maintenant, { weekStartsOn: 1 }), fin: endOfWeek(maintenant, { weekStartsOn: 1 }) };
}

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function nomAffiche(p: { nom_complet: string; email: string } | undefined): string {
  return p ? p.nom_complet || p.email : 'Inconnu';
}

function TuileKpi({ label, valeur, sousTexte }: { label: string; valeur: string; sousTexte?: string }) {
  return (
    <View style={styles.tuile}>
      <Text style={styles.tuileLabel}>{label}</Text>
      <Text style={styles.tuileValeur}>{valeur}</Text>
      {sousTexte && <Text style={styles.tuileSousTexte}>{sousTexte}</Text>}
    </View>
  );
}

function BarreRepartition({ label, couleur, montant, total }: { label: string; couleur: string; montant: number; total: number }) {
  const pourcentage = total > 0 ? Math.round((montant / total) * 100) : 0;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={styles.barreEntete}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.pastille, { backgroundColor: couleur }]} />
          <Text style={styles.barreLabel}>{label}</Text>
        </View>
        <Text style={styles.barreMontant}>{formatMontant(montant)}</Text>
      </View>
      <View style={styles.barreFond}>
        <View style={[styles.barreRemplie, { width: `${pourcentage}%`, backgroundColor: couleur }]} />
      </View>
    </View>
  );
}

const LIBELLE_STATUT: Record<string, string> = {
  SUCCESSFUL: 'Réussie',
  REFUNDED: 'Remboursée',
  FAILED: 'Échouée',
  CANCELLED: 'Annulée',
};

/** Une transaction de l'historique — repliée par défaut, dépliable pour voir le détail produit
 * (cf. ventes_sumup_lignes, migration 0068) quand la vente est passée par le catalogue SumUp. */
function LigneHistoriqueVente({
  vente,
  lignes,
  nomPopUp,
  nomSalarie,
}: {
  vente: VenteSumup;
  lignes: VenteSumupLigne[];
  nomPopUp: string;
  nomSalarie: string;
}) {
  const [deplie, setDeplie] = useState(false);
  return (
    <Pressable
      onPress={() => lignes.length > 0 && setDeplie((v) => !v)}
      style={styles.ligneHistorique}
    >
      <View style={styles.ligneHistoriqueEntete}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ligneHistoriqueTitre}>
            {format(new Date(vente.horodatage), 'd MMM yyyy à HH:mm', { locale: fr })}
          </Text>
          <Text style={styles.ligneHistoriqueSousTitre}>
            {nomPopUp} · {nomSalarie}
            {vente.statut !== 'SUCCESSFUL' ? ` · ${LIBELLE_STATUT[vente.statut] ?? vente.statut}` : ''}
          </Text>
        </View>
        <Text style={styles.ligneHistoriqueMontant}>{formatMontant(vente.montant)}</Text>
        {lignes.length > 0 && <Text style={styles.chevron}>{deplie ? '︿' : '⌄'}</Text>}
      </View>
      {deplie && lignes.length > 0 && (
        <View style={styles.ligneHistoriqueDetail}>
          {lignes.map((l) => (
            <View key={l.id} style={styles.ligneProduit}>
              <Text style={styles.ligneProduitNom}>{l.nom_produit}</Text>
              <Text style={styles.ligneProduitQuantite}>× {l.quantite}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

export function FinanceEcran() {
  const [preset, setPreset] = useState<PeriodePreset>('semaine');
  const [debutPerso, setDebutPerso] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [finPerso, setFinPerso] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [popUpFiltreId, setPopUpFiltreId] = useState('tous');
  const [profileFiltreId, setProfileFiltreId] = useState('tous');

  const { debut, fin } = calculerPeriode(preset, debutPerso, finPerso);
  const { data: ventes, isLoading, isError, error } = useVentesSumupPeriode(debut.toISOString(), fin.toISOString());
  const { data: lignesVentes } = useVentesSumupLignesPeriode(debut.toISOString(), fin.toISOString());
  const { data: popUps } = usePopUps();
  const { data: profils } = useActiveProfiles();
  const synchroniser = useSynchroniserVentesSumup();

  // Pas de vrai cron pour l'instant (cf. TODO) : la synchro se déclenche à l'ouverture de l'écran,
  // plus le bouton "Actualiser" pour un rafraîchissement à la demande.
  useEffect(() => {
    synchroniser.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const popUpParId = useMemo(() => new Map((popUps ?? []).map((p) => [p.id, p])), [popUps]);
  const profilParId = useMemo(() => new Map((profils ?? []).map((p) => [p.id, p])), [profils]);

  const ventesFiltrees = (ventes ?? []).filter((v: VenteSumup) => {
    if (popUpFiltreId !== 'tous' && v.pop_up_id !== popUpFiltreId) return false;
    if (profileFiltreId !== 'tous' && v.profile_id !== profileFiltreId) return false;
    return true;
  });

  const ventesReussies = ventesFiltrees.filter((v) => v.statut === 'SUCCESSFUL');
  const caTotal = ventesReussies.reduce((s, v) => s + v.montant, 0);
  const fraisTotal = ventesReussies.reduce((s, v) => s + (v.frais_montant ?? 0), 0);
  const pourboireTotal = ventesReussies.reduce((s, v) => s + (v.pourboire_montant ?? 0), 0);
  const nbVentes = ventesReussies.length;
  const panierMoyen = nbVentes > 0 ? caTotal / nbVentes : 0;
  const nbRembourse = ventesFiltrees.filter((v) => v.statut === 'REFUNDED').length;
  const tauxRemboursement = ventesFiltrees.length > 0 ? Math.round((nbRembourse / ventesFiltrees.length) * 100) : 0;

  // Tendance quotidienne : série unique, une seule teinte — pas de légende nécessaire (cf. skill
  // dataviz, "a single series needs no legend box"), le titre du graphique nomme déjà la série.
  const parJour = new Map<string, number>();
  for (const v of ventesReussies) {
    const jour = v.horodatage.slice(0, 10);
    parJour.set(jour, (parJour.get(jour) ?? 0) + v.montant);
  }
  const donneesTendance = Array.from(parJour.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([jour, montant]) => ({ jour: format(new Date(`${jour}T00:00:00`), 'd MMM', { locale: fr }), montant }));

  const parPopUp = new Map<string, number>();
  for (const v of ventesReussies) {
    const cle = v.pop_up_id ?? '__non_attribue__';
    parPopUp.set(cle, (parPopUp.get(cle) ?? 0) + v.montant);
  }
  const repartitionPopUp = Array.from(parPopUp.entries())
    .map(([id, montant]) => ({
      id,
      label: id === '__non_attribue__' ? 'Non attribué' : (popUpParId.get(id)?.nom ?? 'Pop-up supprimé'),
      couleur: id === '__non_attribue__' ? COULEUR_NEUTRE : (popUpParId.get(id)?.couleur ?? COULEUR_NEUTRE),
      montant,
    }))
    .sort((a, b) => b.montant - a.montant);

  const parSalarie = new Map<string, number>();
  for (const v of ventesReussies) {
    const cle = v.profile_id ?? '__non_attribue__';
    parSalarie.set(cle, (parSalarie.get(cle) ?? 0) + v.montant);
  }
  const repartitionSalarie = Array.from(parSalarie.entries())
    .map(([id, montant]) => ({
      id,
      label: id === '__non_attribue__' ? 'Non attribué' : nomAffiche(profilParId.get(id)),
      couleur: id === '__non_attribue__' ? COULEUR_NEUTRE : (profilParId.get(id)?.couleur ?? COULEUR_NEUTRE),
      montant,
    }))
    .sort((a, b) => b.montant - a.montant);

  const ventesNonAttribuees = ventesFiltrees.filter((v) => !v.pop_up_id || !v.profile_id);

  const lignesParVente = useMemo(() => {
    const map = new Map<string, VenteSumupLigne[]>();
    for (const l of lignesVentes ?? []) {
      const liste = map.get(l.vente_id) ?? [];
      liste.push(l);
      map.set(l.vente_id, liste);
    }
    return map;
  }, [lignesVentes]);

  return (
    <View style={styles.ecran}>
      <EnteteMenu titre="Finance" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={styles.enteteSynchro}>
          <Text style={styles.synchroTexte}>
            {synchroniser.isPending
              ? 'Synchronisation en cours...'
              : synchroniser.isSuccess
                ? `Dernière synchro : ${synchroniser.data.transactions_vues} vente(s) vue(s), ${synchroniser.data.nouvelles_ou_modifiees} nouvelle(s)/modifiée(s)${synchroniser.data.plafond_details_atteint ? ' — encore des détails à rattraper, cliquez "Actualiser" à nouveau' : ''}`
                : synchroniser.isError
                  ? `Échec de la synchro : ${synchroniser.error instanceof Error ? synchroniser.error.message : 'erreur inconnue'}`
                  : ''}
          </Text>
          <Pressable
            onPress={() => synchroniser.mutate(undefined)}
            style={styles.boutonActualiser}
            disabled={synchroniser.isPending}
          >
            <Text style={styles.boutonActualiserTexte}>{synchroniser.isPending ? '...' : 'Actualiser'}</Text>
          </Pressable>
        </View>

        <View style={styles.segment}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.value}
              onPress={() => setPreset(p.value)}
              style={[styles.segmentBouton, preset === p.value && styles.segmentBoutonActif]}
            >
              <Text style={preset === p.value ? styles.segmentTexteActif : styles.segmentTexte}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        {preset === 'personnalise' && (
          <View style={styles.ligneChamps}>
            <input
              type="date"
              value={debutPerso}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDebutPerso(e.target.value)}
              style={styles.inputDateWeb as unknown as CSSProperties}
            />
            <Text style={{ color: '#94A3B8' }}>→</Text>
            <input
              type="date"
              value={finPerso}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFinPerso(e.target.value)}
              style={styles.inputDateWeb as unknown as CSSProperties}
            />
          </View>
        )}

        <View style={styles.filtresRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Pressable onPress={() => setPopUpFiltreId('tous')} style={[styles.chipFiltre, popUpFiltreId === 'tous' && styles.chipFiltreActif]}>
              <Text style={popUpFiltreId === 'tous' ? styles.chipFiltreTexteActif : styles.chipFiltreTexte}>Tous les pop-up</Text>
            </Pressable>
            {(popUps ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setPopUpFiltreId(p.id)}
                style={[styles.chipFiltre, popUpFiltreId === p.id && styles.chipFiltreActif]}
              >
                <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                <Text style={popUpFiltreId === p.id ? styles.chipFiltreTexteActif : styles.chipFiltreTexte}>{p.nom}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.filtresRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Pressable onPress={() => setProfileFiltreId('tous')} style={[styles.chipFiltre, profileFiltreId === 'tous' && styles.chipFiltreActif]}>
              <Text style={profileFiltreId === 'tous' ? styles.chipFiltreTexteActif : styles.chipFiltreTexte}>Tous les salariés</Text>
            </Pressable>
            {(profils ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setProfileFiltreId(p.id)}
                style={[styles.chipFiltre, profileFiltreId === p.id && styles.chipFiltreActif]}
              >
                <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                <Text style={profileFiltreId === p.id ? styles.chipFiltreTexteActif : styles.chipFiltreTexte}>{nomAffiche(p)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {isError ? (
          <Text style={styles.texteErreur}>
            Erreur de chargement des ventes : {error instanceof Error ? error.message : 'erreur inconnue'}
          </Text>
        ) : isLoading ? (
          <ActivityIndicator color="#4F46E5" style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.tuilesRow}>
              <TuileKpi label="CA total" valeur={formatMontant(caTotal)} sousTexte={`${nbVentes} vente(s)`} />
              <TuileKpi label="CA net" valeur={formatMontant(caTotal - fraisTotal)} sousTexte="Après frais SumUp" />
              <TuileKpi label="Panier moyen" valeur={formatMontant(panierMoyen)} />
              <TuileKpi label="Frais SumUp" valeur={formatMontant(fraisTotal)} />
              <TuileKpi label="Pourboires" valeur={formatMontant(pourboireTotal)} />
              <TuileKpi label="Taux de remboursement" valeur={`${tauxRemboursement}%`} sousTexte={`${nbRembourse} vente(s)`} />
            </View>

            <Text style={styles.titreSection}>Évolution du CA</Text>
            <View style={styles.carteGraphique}>
              {donneesTendance.length === 0 ? (
                <Text style={styles.texteVide}>Aucune vente sur cette période.</Text>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={donneesTendance} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="jour" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={{ stroke: '#CBD5E1' }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#94A3B8' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}€`}
                    />
                    <Tooltip
                      formatter={(value) => [formatMontant(Number(value)), 'CA']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }}
                    />
                    <Bar dataKey="montant" fill={COULEUR_PRIMAIRE} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </View>

            <View style={styles.colonnes}>
              <View style={styles.colonne}>
                <Text style={styles.titreSection}>Par pop-up</Text>
                <View style={styles.carteRepartition}>
                  {repartitionPopUp.length === 0 ? (
                    <Text style={styles.texteVide}>Aucune vente sur cette période.</Text>
                  ) : (
                    repartitionPopUp.map((r) => (
                      <BarreRepartition key={r.id} label={r.label} couleur={r.couleur} montant={r.montant} total={caTotal} />
                    ))
                  )}
                </View>
              </View>

              <View style={styles.colonne}>
                <Text style={styles.titreSection}>Par salarié</Text>
                <View style={styles.carteRepartition}>
                  {repartitionSalarie.length === 0 ? (
                    <Text style={styles.texteVide}>Aucune vente sur cette période.</Text>
                  ) : (
                    repartitionSalarie.map((r) => (
                      <BarreRepartition key={r.id} label={r.label} couleur={r.couleur} montant={r.montant} total={caTotal} />
                    ))
                  )}
                </View>
              </View>
            </View>

            {ventesNonAttribuees.length > 0 && (
              <>
                <Text style={styles.titreSection}>
                  Ventes non attribuées ({ventesNonAttribuees.length})
                </Text>
                <View style={styles.carteRepartition}>
                  <Text style={styles.texteVide}>
                    Manque le pop-up (coordonnées GPS non renseignées ou vente hors de tout pop-up connu) et/ou le
                    salarié (email SumUp non mappé dans sa fiche) pour ces ventes.
                  </Text>
                  {ventesNonAttribuees.slice(0, 20).map((v) => (
                    <View key={v.id} style={styles.ligneNonAttribuee}>
                      <Text style={styles.ligneNonAttribueeTexte}>
                        {format(new Date(v.horodatage), 'd MMM HH:mm', { locale: fr })} — {formatMontant(v.montant)}
                        {!v.pop_up_id ? ' · pop-up ?' : ''}
                        {!v.profile_id ? ' · salarié ?' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.titreSection}>Historique ({ventesFiltrees.length})</Text>
            <View style={styles.carteHistorique}>
              {ventesFiltrees.length === 0 ? (
                <Text style={styles.texteVide}>Aucune vente sur cette période.</Text>
              ) : (
                ventesFiltrees.map((v) => (
                  <LigneHistoriqueVente
                    key={v.id}
                    vente={v}
                    lignes={lignesParVente.get(v.id) ?? []}
                    nomPopUp={v.pop_up_id ? (popUpParId.get(v.pop_up_id)?.nom ?? 'Pop-up supprimé') : 'Non attribué'}
                    nomSalarie={v.profile_id ? nomAffiche(profilParId.get(v.profile_id)) : 'Non attribué'}
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  enteteSynchro: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  synchroTexte: { flex: 1, fontSize: 12, color: '#94A3B8' },
  boutonActualiser: { borderRadius: 10, backgroundColor: '#4F46E5', paddingHorizontal: 14, paddingVertical: 8 },
  boutonActualiserTexte: { fontSize: 13, fontWeight: '600', color: 'white' },
  segment: { marginBottom: 12, flexDirection: 'row', gap: 4, borderRadius: 12, backgroundColor: '#F1F5F9', padding: 4 },
  segmentBouton: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 8 },
  segmentBoutonActif: { backgroundColor: 'white' },
  segmentTexte: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  segmentTexteActif: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  ligneChamps: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  inputDateWeb: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1E293B',
  },
  filtresRow: { marginBottom: 10 },
  chipFiltre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipFiltreActif: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  chipFiltreTexte: { fontSize: 12, color: '#475569' },
  chipFiltreTexteActif: { fontSize: 12, fontWeight: '600', color: '#4338CA' },
  pastille: { height: 8, width: 8, borderRadius: 4 },
  tuilesRow: { marginTop: 8, marginBottom: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tuile: { minWidth: 160, flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 16 },
  tuileLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  tuileValeur: { marginTop: 4, fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  tuileSousTexte: { marginTop: 2, fontSize: 12, color: '#94A3B8' },
  titreSection: { marginBottom: 10, fontSize: 15, fontWeight: 'bold', color: '#0F172A' },
  carteGraphique: { marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 16 },
  colonnes: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  colonne: { flex: 1, minWidth: 320 },
  carteRepartition: { marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 16 },
  barreEntete: { marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barreLabel: { fontSize: 13, fontWeight: '500', color: '#334155' },
  barreMontant: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  barreFond: { height: 8, borderRadius: 999, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  barreRemplie: { height: 8, borderRadius: 999 },
  texteVide: { fontSize: 13, color: '#94A3B8' },
  texteErreur: { marginTop: 24, fontSize: 13, color: '#DC2626' },
  ligneNonAttribuee: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  ligneNonAttribueeTexte: { fontSize: 12, color: '#64748B' },
  carteHistorique: { marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', overflow: 'hidden' },
  ligneHistorique: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  ligneHistoriqueEntete: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ligneHistoriqueTitre: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  ligneHistoriqueSousTitre: { marginTop: 2, fontSize: 12, color: '#94A3B8' },
  ligneHistoriqueMontant: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  chevron: { fontSize: 13, color: '#94A3B8', width: 14, textAlign: 'center' },
  ligneHistoriqueDetail: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 4 },
  ligneProduit: { flexDirection: 'row', justifyContent: 'space-between' },
  ligneProduitNom: { fontSize: 12, color: '#475569' },
  ligneProduitQuantite: { fontSize: 12, fontWeight: '600', color: '#334155' },
});
