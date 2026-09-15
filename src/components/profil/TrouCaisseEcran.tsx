// Cf. retour utilisateur du 2026-09-15 : "un endroit où je compte chaque jour combien il y a en
// espèce... j'ai un historique avec qui a travaillé ce jour-là, qui a clôturé, le montant demandé
// espèce (SumUp + espèce appli), je vois si y'a un jour où j'ai pas l'enveloppe" — même contournement
// du bug NativeWind que DepotsEspecesEcran.tsx/PanneauAbsences.tsx pour le champ date (StyleSheet
// plutôt que className sur les parties concernées).
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createElement, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { Dropdown } from '@/components/ui/Dropdown';
import { useAuthStore } from '@/store/useAuthStore';
import { usePersonnelJour, useGererTrouCaisse, useTrousCaisse } from '@/hooks/useTrouCaisse';
import { usePopUps } from '@/hooks/usePopUps';
import { useVentesEspecesPeriode } from '@/hooks/useVentesEspeces';
import { useVentesSumupPeriode } from '@/hooks/useVentesSumup';

function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function formatDateCourte(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function debutJour(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function finJour(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

/** Champ date unique, web (input natif) ou natif (bouton + DateTimePicker) — cf. en-tête. */
function ChampDate({ valeur, onChange }: { valeur: Date; onChange: (d: Date) => void }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <View>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'date',
          value: format(valeur, 'yyyy-MM-dd'),
          max: format(new Date(), 'yyyy-MM-dd'),
          onChange: (e: ChangeEvent<HTMLInputElement>) => {
            if (e.target.value) onChange(new Date(`${e.target.value}T00:00:00`));
          },
          style: styles.inputDateWeb as unknown as CSSProperties,
        })
      ) : (
        <Pressable onPress={() => setOuvert(true)} style={styles.boutonDateNatif}>
          <Text style={styles.boutonDateNatifTexte}>{format(valeur, 'EEEE d MMM yyyy', { locale: fr })}</Text>
        </Pressable>
      )}
      {ouvert &&
        Platform.OS !== 'web' &&
        createElement(DateTimePicker, {
          value: valeur,
          mode: 'date',
          maximumDate: new Date(),
          display: Platform.OS === 'ios' ? 'spinner' : 'default',
          onChange: (event: { type: string }, d?: Date) => {
            if (Platform.OS === 'android') setOuvert(false);
            if (event.type === 'dismissed' || !d) return;
            onChange(d);
          },
        })}
      {Platform.OS === 'ios' && ouvert && (
        <Pressable onPress={() => setOuvert(false)} style={styles.boutonOk}>
          <Text style={styles.boutonOkTexte}>OK</Text>
        </Pressable>
      )}
    </View>
  );
}

/** "Trou de caisse" (Profil > admin) : pour un pop-up et un jour donnés, calcule le montant
 * attendu (SumUp espèce + espèces appli confirmées de ce pop-up ce jour-là) à comparer au montant
 * réellement compté dans l'enveloppe — l'écart est calculé automatiquement (pas de calcul à la
 * main). Personnel présent et suggestion de fermeture pré-remplis depuis le planning (même logique
 * que Hub > Finance > Trou, qui partage la même table `trous_caisse` : un trou saisi ici apparaît
 * aussi côté Hub et inversement). */
export function TrouCaisseEcran({ onRetour }: { onRetour: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const { data: popUpsTous } = usePopUps();
  const popUps = useMemo(() => (popUpsTous ?? []).filter((p) => !p.est_local), [popUpsTous]);

  const [popUpId, setPopUpId] = useState<string>('');
  useEffect(() => {
    if (!popUpId && popUps.length > 0) setPopUpId(popUps[0].id);
  }, [popUps, popUpId]);

  const [date, setDate] = useState(() => startOfDay(new Date()));
  const dateIso = format(date, 'yyyy-MM-dd');

  const { data: ventesSumup, isLoading: chargementSumup } = useVentesSumupPeriode(
    debutJour(date).toISOString(),
    finJour(date).toISOString(),
  );
  const { data: ventesEspeces, isLoading: chargementEspeces } = useVentesEspecesPeriode(
    debutJour(date).toISOString(),
    finJour(date).toISOString(),
  );
  const { data: personnelJour, isLoading: chargementPersonnel } = usePersonnelJour(popUpId, dateIso);
  const { data: trous, isLoading: chargementTrous } = useTrousCaisse();
  const { ajouter, supprimer } = useGererTrouCaisse();

  const [personneFermetureId, setPersonneFermetureId] = useState<string>('');
  const [personnesCochees, setPersonnesCochees] = useState<Set<string>>(new Set());
  const [montantCompte, setMontantCompte] = useState('');
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  // Pré-remplissage automatique depuis le planning dès que pop-up + date sont choisis — reste
  // modifiable ensuite avant d'enregistrer (même principe que Hub > Trou).
  useEffect(() => {
    if (!personnelJour) return;
    setPersonneFermetureId(personnelJour.fermetureSuggereeId ?? '');
    setPersonnesCochees(new Set(personnelJour.personnesPresentes.map((p) => p.id)));
  }, [personnelJour]);

  const montantAttendu = useMemo(() => {
    const sumupCash = (ventesSumup ?? [])
      .filter((v) => v.pop_up_id === popUpId && v.statut === 'SUCCESSFUL' && v.moyen_paiement === 'CASH')
      .reduce((s, v) => s + v.montant, 0);
    const especeAppli = (ventesEspeces ?? [])
      .filter((v) => v.pop_up_id === popUpId && v.statut === 'confirmee')
      .reduce((s, v) => s + v.montant, 0);
    return sumupCash + especeAppli;
  }, [ventesSumup, ventesEspeces, popUpId]);

  const chargementAttendu = chargementSumup || chargementEspeces;
  const montantCompteNombre = Number(montantCompte.replace(',', '.'));
  const montantCompteValide = montantCompte.trim() !== '' && Number.isFinite(montantCompteNombre);
  const ecart = montantCompteValide ? montantCompteNombre - montantAttendu : null;

  const basculerPersonne = (id: string) => {
    setPersonnesCochees((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  };

  const peutValider = !!profile && !!popUpId && montantCompteValide && !chargementAttendu;

  const valider = () => {
    if (!peutValider || !profile) return;
    setErreur(null);
    ajouter.mutate(
      {
        popUpId,
        date: dateIso,
        montantCompte: montantCompteNombre,
        montantAttendu,
        personneFermetureId: personneFermetureId || null,
        personnesPresentesIds: Array.from(personnesCochees),
        note,
        profileId: profile.id,
      },
      {
        onSuccess: () => {
          setMontantCompte('');
          setNote('');
        },
        onError: (e) => setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement."),
      },
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
        <Text style={styles.titreSection}>Pop-up et jour</Text>
        <View style={styles.carte}>
          <Text style={styles.champLabel}>Pop-up</Text>
          <Dropdown
            value={popUpId || undefined}
            options={popUps.map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
            onChange={setPopUpId}
          />
          <Text style={[styles.champLabel, { marginTop: 12 }]}>Jour</Text>
          <ChampDate valeur={date} onChange={setDate} />
        </View>

        <Text style={styles.titreSection}>Montant attendu</Text>
        <View style={styles.tuile}>
          {chargementAttendu ? (
            <ActivityIndicator color="#6366F1" style={{ marginTop: 6 }} />
          ) : (
            <Text style={styles.tuileValeur}>{formatMontant(montantAttendu)}</Text>
          )}
          <Text style={styles.tuileSousTexte}>SumUp espèce + espèces appli de ce pop-up ce jour-là.</Text>
        </View>

        <Text style={styles.titreSection}>Montant compté dans l&apos;enveloppe</Text>
        <View style={styles.carte}>
          <TextInput
            value={montantCompte}
            onChangeText={setMontantCompte}
            placeholder="0,00 €"
            keyboardType="decimal-pad"
            style={styles.inputMontant}
          />
          {ecart !== null && (
            <View style={[styles.tuileEcart, Math.abs(ecart) < 0.01 ? styles.tuileEcartOk : styles.tuileEcartKo]}>
              <Text style={styles.tuileEcartLabel}>Écart</Text>
              <Text
                style={[
                  styles.tuileEcartValeur,
                  Math.abs(ecart) < 0.01 ? styles.tuileEcartValeurOk : styles.tuileEcartValeurKo,
                ]}
              >
                {ecart > 0 ? '+' : ''}
                {formatMontant(ecart)}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.titreSection}>
          Personnel présent {chargementPersonnel && '(chargement…)'}
        </Text>
        {!personnelJour || personnelJour.personnesPresentes.length === 0 ? (
          <Text style={styles.texteAide}>Aucun créneau trouvé pour ce pop-up à cette date.</Text>
        ) : (
          <View style={styles.ligneChips}>
            {personnelJour.personnesPresentes.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => basculerPersonne(p.id)}
                style={[styles.chip, personnesCochees.has(p.id) && styles.chipActive]}
              >
                <Text style={[styles.chipTexte, personnesCochees.has(p.id) && styles.chipTexteActive]}>
                  {p.nomComplet}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.champLabel, { marginTop: 14 }]}>Qui a clôturé</Text>
        <Dropdown
          value={personneFermetureId || undefined}
          options={(personnelJour?.personnesPresentes ?? []).map((p) => ({ value: p.id, label: p.nomComplet }))}
          onChange={setPersonneFermetureId}
          placeholder="—"
        />

        <Text style={[styles.champLabel, { marginTop: 14 }]}>Note (optionnel)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Contexte, hypothèse sur la cause…"
          multiline
          numberOfLines={2}
          style={styles.inputNote}
        />

        {erreur && <Text style={styles.texteErreur}>{erreur}</Text>}

        <Pressable
          onPress={valider}
          disabled={!peutValider || ajouter.isPending}
          style={[styles.boutonValider, !peutValider && styles.boutonValiderDesactive]}
        >
          <Text style={[styles.boutonValiderTexte, !peutValider && styles.boutonValiderTexteDesactive]}>
            {ajouter.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Text>
        </Pressable>

        <Text style={styles.titreSection}>Historique</Text>
        {chargementTrous ? (
          <ActivityIndicator color="#6366F1" />
        ) : (trous ?? []).length === 0 ? (
          <Text style={styles.texteAide}>Aucun trou enregistré.</Text>
        ) : (
          (trous ?? []).map((t) => {
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
  champLabel: { marginBottom: 6, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  inputDateWeb: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1E293B',
  },
  boutonDateNatif: { borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  boutonDateNatifTexte: { fontSize: 13, fontWeight: '600', color: '#1E293B', textTransform: 'capitalize' },
  boutonOk: { alignItems: 'center', marginTop: 4 },
  boutonOkTexte: { fontSize: 15, fontWeight: '700', color: '#4F46E5' },
  texteAide: { marginTop: 4, marginBottom: 8, fontSize: 12, color: '#94A3B8' },
  titreSection: { marginBottom: 8, marginTop: 20, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  tuile: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 16 },
  tuileValeur: { fontSize: 26, fontWeight: 'bold', color: '#0F172A' },
  tuileSousTexte: { marginTop: 6, fontSize: 12, color: '#94A3B8' },
  carte: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 16 },
  inputMontant: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: '#0F172A' },
  tuileEcart: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 12 },
  tuileEcartOk: { backgroundColor: '#ECFDF5' },
  tuileEcartKo: { backgroundColor: '#FEF2F2' },
  tuileEcartLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  tuileEcartValeur: { fontSize: 18, fontWeight: '800' },
  tuileEcartValeurOk: { color: '#059669' },
  tuileEcartValeurKo: { color: '#DC2626' },
  ligneChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { borderColor: '#818CF8', backgroundColor: '#EEF2FF' },
  chipTexte: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  chipTexteActive: { color: '#4338CA' },
  inputNote: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A', textAlignVertical: 'top', minHeight: 60 },
  texteErreur: { marginTop: 10, fontSize: 12, color: '#DC2626' },
  boutonValider: { marginTop: 16, alignItems: 'center', borderRadius: 12, backgroundColor: '#4F46E5', paddingVertical: 14 },
  boutonValiderDesactive: { backgroundColor: '#E2E8F0' },
  boutonValiderTexte: { fontSize: 14, fontWeight: '700', color: 'white' },
  boutonValiderTexteDesactive: { color: '#94A3B8' },
  ligneHistorique: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 12 },
  ligneHistoriqueTitre: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  ligneHistoriqueSousTexte: { marginTop: 3, fontSize: 11, color: '#94A3B8' },
  ligneHistoriqueNote: { marginTop: 4, fontSize: 12, fontStyle: 'italic', color: '#64748B' },
  ligneHistoriqueCreateur: { marginTop: 4, fontSize: 10, color: '#CBD5E1' },
  badgeEcart: { borderRadius: 999, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 2 },
  badgeEcartTexte: { fontSize: 11, fontWeight: '800', color: '#DC2626' },
  lienSupprimer: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
});
