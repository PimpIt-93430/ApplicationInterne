import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Dropdown } from '@/components/ui/Dropdown';
import { usePopUps } from '@/hooks/usePopUps';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import { useGererVentesEspeces, useVentesEspecesPopUp } from '@/hooks/useVentesEspeces';
import type { VenteEspece } from '@/types/database.types';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

// Après validation, l'écran de confirmation reste imposé ce nombre de secondes avant de pouvoir
// revenir à la saisie — décision explicite (cf. discussion) : laisse le temps à quelqu'un qui
// contrôle à distance de voir que le montant a bien été enregistré, empêche de valider une vente
// et de filer aussitôt.
const DELAI_RETOUR_SECONDES = 3;

function LigneVente({ vente, onAnnuler }: { vente: VenteEspece; onAnnuler: () => void }) {
  const annulee = vente.statut === 'annulee';
  return (
    <View className="mb-2 flex-row items-center justify-between rounded-xl border border-slate-100 bg-white px-3.5 py-3">
      <View className="flex-1">
        <Text className={`text-base font-semibold ${annulee ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
          {formatMontant(vente.montant)}
        </Text>
        <Text className="mt-0.5 text-xs text-slate-400">
          {format(new Date(vente.created_at), 'd MMM yyyy à HH:mm', { locale: fr })}
          {annulee ? ' · Annulée' : ''}
        </Text>
      </View>
      {!annulee && (
        <Pressable onPress={onAnnuler} className="rounded-lg bg-red-50 px-3 py-1.5">
          <Text className="text-xs font-semibold text-red-600">Annuler</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Écran "Ventes" (managers et admins) : encaissement en espèces déclaré manuellement (bouton "OK"
 * → confirmation immédiate, pas de validation ultérieure) + historique, avec possibilité d'annuler
 * une vente — une vente annulée n'est jamais retirée de la liste, juste barrée/grisée (cf.
 * migration 0048 : verrouillée en base, toujours visible pour l'admin). Un manager n'a qu'un lieu
 * (pas de sélecteur) ; un admin choisit le pop-up concerné avant d'enregistrer. */
export function VentesEcran() {
  const profile = useProfilEffectif();
  const estAdmin = profile?.role === 'admin';
  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const mesPopUps = useMemo(
    () => (profile ? popUpsAttribues(profile, mapAffectations, popUpsTous ?? []) : []),
    [profile, mapAffectations, popUpsTous],
  );

  // Un admin choisit explicitement à quel pop-up rattacher la vente (il n'en a pas "un" par défaut
  // — mesPopUps renvoie tous les lieux pour lui, cf. popUpsAttribues) ; un manager garde son unique
  // lieu attribué, pas de sélecteur nécessaire.
  const [popUpSelectionne, setPopUpSelectionne] = useState<string | undefined>(undefined);
  const popUpActifId = estAdmin ? (popUpSelectionne ?? mesPopUps[0]?.id) : mesPopUps[0]?.id;
  const popUpActif = mesPopUps.find((p) => p.id === popUpActifId);

  const { data: ventes, isLoading } = useVentesEspecesPopUp(popUpActif?.id);
  const { ajouter, annuler } = useGererVentesEspeces(popUpActif?.id);

  const [montant, setMontant] = useState('');
  // Montant de la vente qui vient d'être enregistrée — remplace tout l'écran par la confirmation
  // pleine page tant que non-null (cf. DELAI_RETOUR_SECONDES).
  const [venteConfirmee, setVenteConfirmee] = useState<{ montant: number } | null>(null);
  const [secondesRestantes, setSecondesRestantes] = useState(DELAI_RETOUR_SECONDES);

  useEffect(() => {
    if (!venteConfirmee) return;
    setSecondesRestantes(DELAI_RETOUR_SECONDES);
    const interval = setInterval(() => {
      setSecondesRestantes((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [venteConfirmee]);

  const montantSaisi = Number(montant.replace(',', '.'));
  const peutValider = montant.trim() !== '' && !Number.isNaN(montantSaisi) && montantSaisi > 0;

  const handleValider = () => {
    if (!peutValider || !profile || !popUpActif) return;
    ajouter.mutate(
      { profileId: profile.id, montant: montantSaisi },
      {
        onSuccess: () => {
          setVenteConfirmee({ montant: montantSaisi });
          setMontant('');
        },
      },
    );
  };

  if (venteConfirmee) {
    const peutRevenir = secondesRestantes === 0;
    return (
      <View className="flex-1 items-center justify-center bg-emerald-600 px-8">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-white/15">
          <Text className="text-4xl text-white">✓</Text>
        </View>
        <Text className="mt-6 text-xs font-semibold uppercase tracking-widest text-emerald-100">
          Vente enregistrée
        </Text>
        <Text className="mt-2 text-6xl font-bold text-white">{formatMontant(venteConfirmee.montant)}</Text>
        {!!popUpActif && <Text className="mt-1 text-sm text-emerald-100">{popUpActif.nom}</Text>}

        <Pressable
          onPress={() => peutRevenir && setVenteConfirmee(null)}
          disabled={!peutRevenir}
          className={`mt-14 w-full items-center rounded-2xl py-5 ${peutRevenir ? 'bg-white' : 'bg-emerald-500'}`}
        >
          <Text className={`text-base font-bold ${peutRevenir ? 'text-emerald-700' : 'text-emerald-100'}`}>
            {peutRevenir ? 'Revenir aux ventes' : `Revenir aux ventes (${secondesRestantes}s)`}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pb-2 pt-14">
        <Text className="text-2xl font-bold text-slate-900">Ventes</Text>
      </View>

      {estAdmin && mesPopUps.length > 0 && (
        <View className="px-4 pb-2">
          <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Pop-up
          </Text>
          <Dropdown
            value={popUpActifId}
            options={mesPopUps.map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
            onChange={setPopUpSelectionne}
          />
        </View>
      )}

      {!profile || !popUpActif ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
      ) : (
        <ScrollView className="flex-1 px-4 pt-2" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="mb-5 rounded-2xl bg-slate-50 p-4">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Nouvelle vente en espèces
            </Text>
            <TextInput
              value={montant}
              onChangeText={setMontant}
              placeholder="0,00 €"
              keyboardType="decimal-pad"
              className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-2xl font-bold text-slate-900"
            />
            <Pressable
              onPress={handleValider}
              disabled={!peutValider || ajouter.isPending}
              className={`items-center justify-center rounded-2xl py-5 ${peutValider ? 'bg-indigo-600' : 'bg-slate-200'}`}
            >
              <Text className={`text-xl font-bold ${peutValider ? 'text-white' : 'text-slate-400'}`}>
                {ajouter.isPending ? 'Enregistrement…' : 'OK'}
              </Text>
            </Pressable>
          </View>

          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Historique</Text>
          {isLoading ? (
            <ActivityIndicator color="#6366F1" style={{ marginTop: 12 }} />
          ) : (ventes ?? []).length === 0 ? (
            <Text className="text-sm text-slate-400">Aucune vente enregistrée.</Text>
          ) : (
            (ventes ?? []).map((v) => (
              <LigneVente key={v.id} vente={v} onAnnuler={() => annuler.mutate(v.id)} />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
