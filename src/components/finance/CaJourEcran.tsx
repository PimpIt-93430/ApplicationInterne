import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { useCaJourShopify } from '@/hooks/useCaJour';
import { usePopUps } from '@/hooks/usePopUps';
import { useSumupEmailsPopUp } from '@/hooks/useSumupEmailsPopUp';
import { useVentesEspecesPeriode } from '@/hooks/useVentesEspeces';
import { useVentesSumupPeriode } from '@/hooks/useVentesSumup';

function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function debutJour(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function finJour(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function Carte({
  titre,
  valeur,
  couleurFond,
  couleurTexte,
  grande,
}: {
  titre: string;
  valeur: string;
  couleurFond: string;
  couleurTexte: string;
  grande?: boolean;
}) {
  return (
    <View
      style={{ backgroundColor: couleurFond, borderRadius: 20, padding: grande ? 24 : 18, flexGrow: 1, minWidth: grande ? '100%' : 150 }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: couleurTexte, opacity: 0.8 }}>
        {titre}
      </Text>
      <Text style={{ marginTop: 6, fontSize: grande ? 34 : 22, fontWeight: '800', color: couleurTexte }}>{valeur}</Text>
    </View>
  );
}

/** "CA du jour" — vue d'atterrissage des admins (cf. retour utilisateur du 2026-09-15 : "une vue
 * avec le CA global de la journée, le CA par pop up et sur le site"), même agrégation que le
 * tableau de bord du Hub (SumUp + espèces déclarées côté pop-up, Shopify + TikTok Shop côté site,
 * cf. Pimp It Hub/app/(hub)/page.tsx) — ici passée par la fonction Edge ca-jour-shopify plutôt que
 * l'API Shopify en direct : l'app mobile ne détient jamais les identifiants Shopify. */
export function CaJourEcran() {
  const debut = useMemo(() => debutJour(), []);
  const fin = useMemo(() => finJour(), []);

  const { data: ventesSumup, isLoading: chargementSumup } = useVentesSumupPeriode(debut.toISOString(), fin.toISOString());
  const { data: ventesEspeces, isLoading: chargementEspeces } = useVentesEspecesPeriode(debut.toISOString(), fin.toISOString());
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: emailsSumUp } = useSumupEmailsPopUp();
  const { data: caSite, isLoading: chargementSite, isError: erreurSite, error: erreurSiteDetail } = useCaJourShopify();

  const chargement = chargementSumup || chargementEspeces || chargementPopUps;

  const { chiffresParPopUp, sumupHorsPopUp, caPopUps } = useMemo(() => {
    const popUpIdParEmail = new Map((emailsSumUp ?? []).map((e) => [e.email, e.pop_up_id]));
    const sumupParPopUp = new Map<string, number>();
    let sumupHorsPopUp = 0;
    for (const v of ventesSumup ?? []) {
      if (v.statut !== 'SUCCESSFUL') continue;
      const popUpId = v.sumup_email ? popUpIdParEmail.get(v.sumup_email) : undefined;
      if (popUpId) sumupParPopUp.set(popUpId, (sumupParPopUp.get(popUpId) ?? 0) + v.montant);
      else sumupHorsPopUp += v.montant;
    }
    const especesParPopUp = new Map<string, number>();
    for (const v of ventesEspeces ?? []) {
      if (v.statut !== 'confirmee') continue;
      especesParPopUp.set(v.pop_up_id, (especesParPopUp.get(v.pop_up_id) ?? 0) + v.montant);
    }
    const chiffresParPopUp = (popUps ?? [])
      .filter((p) => !p.est_local)
      .map((p) => ({ nom: p.nom, sumup: sumupParPopUp.get(p.id) ?? 0, appli: especesParPopUp.get(p.id) ?? 0 }))
      .filter((p) => p.sumup > 0 || p.appli > 0);
    const caPopUps = chiffresParPopUp.reduce((s, p) => s + p.sumup + p.appli, 0) + sumupHorsPopUp;
    return { chiffresParPopUp, sumupHorsPopUp, caPopUps };
  }, [ventesSumup, ventesEspeces, popUps, emailsSumUp]);

  const caSiteTotal = (caSite?.shopify ?? 0) + (caSite?.tiktok ?? 0);
  const caGlobal = caPopUps + caSiteTotal;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <EnteteMenu titre="CA du jour" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 16 }}>
        {chargement ? (
          <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />
        ) : (
          <>
            <Carte titre="CA global de la journée" valeur={formatMontant(caGlobal)} couleurFond="#ECFDF5" couleurTexte="#065F46" grande />

            <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8', marginTop: 4 }}>
              Par pop-up
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {chiffresParPopUp.map((p) => (
                <View key={p.nom} style={{ backgroundColor: 'white', borderRadius: 18, padding: 16, flexGrow: 1, minWidth: 160, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' }} numberOfLines={1}>
                    {p.nom}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' }}>SumUp</Text>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A' }}>{formatMontant(p.sumup)}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' }}>Appli</Text>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A' }}>{formatMontant(p.appli)}</Text>
                    </View>
                  </View>
                </View>
              ))}
              {chiffresParPopUp.length === 0 && (
                <View style={{ backgroundColor: 'white', borderRadius: 18, padding: 16, flexGrow: 1 }}>
                  <Text style={{ fontSize: 13, color: '#94A3B8' }}>Aucune vente pop-up aujourd&apos;hui.</Text>
                </View>
              )}
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8', marginTop: 8 }}>
              Sur le site
            </Text>
            {chargementSite ? (
              <ActivityIndicator color="#0EA5E9" />
            ) : erreurSite ? (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 16, padding: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#B91C1C' }}>
                  Chiffres du site indisponibles : {erreurSiteDetail instanceof Error ? erreurSiteDetail.message : 'erreur inconnue'}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Carte titre="Shopify" valeur={formatMontant(caSite?.shopify ?? 0)} couleurFond="#F0F9FF" couleurTexte="#0C4A6E" />
                <Carte titre="TikTok Shop" valeur={formatMontant(caSite?.tiktok ?? 0)} couleurFond="#F5F3FF" couleurTexte="#4C1D95" />
              </View>
            )}

            {sumupHorsPopUp > 0 && (
              <Carte titre="SumUp hors pop-up" valeur={formatMontant(sumupHorsPopUp)} couleurFond="#FFFBEB" couleurTexte="#92400E" />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
