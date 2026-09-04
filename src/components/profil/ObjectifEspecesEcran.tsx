// Écran "Objectif espèces" (Profil, manager/admin uniquement — cf. lien conditionnel dans
// profil.tsx) : pour chaque pop-up, le % du total espèces du mois qui est passé par la
// déclaration appli (ventes_especes) plutôt que resté en CASH côté SumUp sans déclaration — cf.
// retour utilisateur du 2026-09-04 : "un objectif de pourcentage sur un mois de espece
// application... combien de pourcent de l'espece a été fait sur l'application et combien sur le
// compte sumup... dans RH je vais mettre objectif par pop up qu'il faut qu'il essaie de
// respecter", puis "je voudrai que ce soit sur l'application mobile dans le profil" (déplacé
// depuis l'onglet RH de Demande & RH vers Profil, sur demande explicite). L'objectif (%) est
// réglable par un admin (input, blur pour enregistrer — même pattern que CelluleStockInitial dans
// StockCibleEcran) ; un manager le voit en lecture seule. Un pop-up sans aucune vente espèces ce
// mois-ci affiche juste "Aucune vente espèces ce mois-ci." (rien à comparer).
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useMesDroits } from '@/hooks/useDroits';
import { useModifierObjectifEspecesPopUp, usePopUps } from '@/hooks/usePopUps';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useVentesEspecesPeriode } from '@/hooks/useVentesEspeces';
import { useVentesSumupPeriode } from '@/hooks/useVentesSumup';
import { aAccesFonctionnalite, popUpsCouverts } from '@/utils/permissions';
import type { PopUp } from '@/types/database.types';

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

/** Champ objectif éditable (admin) — s'enregistre au blur, vide = pas d'objectif. */
function ChampObjectif({ popUpId, objectif }: { popUpId: string; objectif: number | null }) {
  const { mutate } = useModifierObjectifEspecesPopUp();
  const [valeur, setValeur] = useState(objectif != null ? String(objectif) : '');
  const [focus, setFocus] = useState(false);

  // Reprend la valeur du serveur (ex. modifiée par un autre admin) sauf pendant la saisie, même
  // principe que CelluleStockInitial (StockCibleEcran).
  useEffect(() => {
    if (focus) return;
    setValeur(objectif != null ? String(objectif) : '');
  }, [objectif, focus]);

  const enregistrer = () => {
    if (valeur.trim() === '') {
      if (objectif != null) mutate({ id: popUpId, objectif: null });
      return;
    }
    const n = Math.round(Number(valeur));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setValeur(objectif != null ? String(objectif) : '');
      return;
    }
    if (n !== objectif) mutate({ id: popUpId, objectif: n });
  };

  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-xs text-slate-400">Objectif</Text>
      <TextInput
        value={valeur}
        onChangeText={setValeur}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          enregistrer();
        }}
        onSubmitEditing={enregistrer}
        keyboardType="number-pad"
        placeholder="—"
        className="h-8 w-14 rounded-lg border border-slate-200 bg-white text-center text-sm font-semibold text-slate-700"
      />
      <Text className="text-xs text-slate-400">%</Text>
    </View>
  );
}

function CarteObjectifPopUp({
  popUp,
  especeAppli,
  especeSumup,
  estAdmin,
}: {
  popUp: PopUp;
  especeAppli: number;
  especeSumup: number;
  estAdmin: boolean;
}) {
  const total = especeAppli + especeSumup;
  const pourcentage = total > 0 ? Math.round((especeAppli / total) * 100) : null;
  const objectif = popUp.objectif_pourcentage_espece_appli;
  const atteint = pourcentage != null && objectif != null ? pourcentage >= objectif : null;
  const couleurBarre = atteint === false ? '#DC2626' : atteint === true ? '#16A34A' : '#4F46E5';

  return (
    <View className="mb-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: popUp.couleur }} />
          <Text className="text-sm font-bold text-slate-900">{popUp.nom}</Text>
        </View>
        {estAdmin ? (
          <ChampObjectif popUpId={popUp.id} objectif={objectif} />
        ) : objectif != null ? (
          <Text className="text-xs font-semibold text-slate-400">Objectif {objectif}%</Text>
        ) : null}
      </View>

      {total === 0 ? (
        <Text className="text-xs text-slate-400">Aucune vente espèces ce mois-ci.</Text>
      ) : (
        <>
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-xs text-slate-500">
              Espèce appli {formatMontant(especeAppli)} · Espèce SumUp {formatMontant(especeSumup)}
            </Text>
            <Text className="text-sm font-bold" style={{ color: couleurBarre }}>
              {pourcentage}%
            </Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-slate-100">
            <View
              className="h-2 rounded-full"
              style={{ width: `${pourcentage ?? 0}%`, backgroundColor: couleurBarre }}
            />
          </View>
        </>
      )}
    </View>
  );
}

export function ObjectifEspecesEcran({ onRetour }: { onRetour: () => void }) {
  const profile = useProfilEffectif();
  const { data: droits } = useMesDroits(profile?.id);
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const [reference, setReference] = useState(new Date());

  const debut = startOfMonth(reference);
  const fin = endOfMonth(reference);
  const { data: ventesEspeces, isLoading: chargementEspeces } = useVentesEspecesPeriode(
    debut.toISOString(),
    fin.toISOString(),
  );
  const { data: ventesSumup, isLoading: chargementSumup } = useVentesSumupPeriode(debut.toISOString(), fin.toISOString());

  const estAdmin = profile?.role === 'admin';
  const moisEnCours = format(reference, 'yyyy-MM') === format(new Date(), 'yyyy-MM');

  const popUps = useMemo(() => {
    const tous = popUpsTous ?? [];
    if (estAdmin) return tous;
    if (!aAccesFonctionnalite(droits ?? [], 'equipe')) return [];
    const idsCouverts = popUpsCouverts(droits ?? [], 'equipe');
    if (idsCouverts === null) return tous;
    return tous.filter((p) => idsCouverts.includes(p.id));
  }, [popUpsTous, estAdmin, droits]);

  const parPopUp = useMemo(() => {
    const map = new Map<string, { appli: number; sumup: number }>();
    for (const p of popUps) map.set(p.id, { appli: 0, sumup: 0 });
    for (const v of ventesEspeces ?? []) {
      if (v.statut !== 'confirmee') continue;
      const entree = map.get(v.pop_up_id);
      if (entree) entree.appli += v.montant;
    }
    for (const v of ventesSumup ?? []) {
      if (v.statut !== 'SUCCESSFUL' || v.moyen_paiement !== 'CASH' || !v.pop_up_id) continue;
      const entree = map.get(v.pop_up_id);
      if (entree) entree.sumup += v.montant;
    }
    return map;
  }, [popUps, ventesEspeces, ventesSumup]);

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Objectif espèces" onRetour={onRetour} />
      <ScrollView className="flex-1 px-4 pt-2" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="mb-4 text-xs text-slate-400">
          Le % du total espèces du mois (appli + SumUp) qui est passé par la déclaration manuelle
          (écran Ventes), pop-up par pop-up.
        </Text>

        <View className="mb-3 flex-row items-center justify-center gap-4">
          <Pressable onPress={() => setReference((d) => subMonths(d, 1))} hitSlop={8}>
            <Text className="text-lg font-bold text-indigo-600">‹</Text>
          </Pressable>
          <Text className="text-sm font-semibold capitalize text-slate-700">{format(reference, 'MMMM yyyy', { locale: fr })}</Text>
          <Pressable onPress={() => !moisEnCours && setReference((d) => addMonths(d, 1))} hitSlop={8} disabled={moisEnCours}>
            <Text className={`text-lg font-bold ${moisEnCours ? 'text-slate-300' : 'text-indigo-600'}`}>›</Text>
          </Pressable>
        </View>

        {chargementPopUps || chargementEspeces || chargementSumup ? (
          <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
        ) : popUps.length === 0 ? (
          <Text className="text-sm text-slate-400">Aucun pop-up.</Text>
        ) : (
          popUps.map((p) => {
            const c = parPopUp.get(p.id) ?? { appli: 0, sumup: 0 };
            return (
              <CarteObjectifPopUp key={p.id} popUp={p} especeAppli={c.appli} especeSumup={c.sumup} estAdmin={estAdmin} />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
