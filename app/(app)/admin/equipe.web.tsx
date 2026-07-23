/** @jsxImportSource react */
// Web uniquement (fichier .web.tsx, résolu automatiquement par Metro à la place de
// equipe.tsx sur le build web) : la fiche RH détaillée n'a pas d'équivalent mobile pour
// l'instant, l'app mobile garde l'écran Équipe existant tel quel.
//
// Écran admin : accès total (tous les membres, toutes les sections y compris bancaire/médical,
// onglet Droits). Le socle (liste + fiche détail) est partagé avec l'écran manager scopé
// (app/(app)/equipe.web.tsx, droit "équipe" — migration 0038) via EquipeEcranBase.
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { EquipeEcranBase, Section, styles as stylesBase } from '@/components/equipe/EquipeEcranBase';
import { usePopUps } from '@/hooks/usePopUps';
import {
  useActiveProfiles,
  useAffectationsPopUp,
  useAjouterAffectationPopUp,
  useRetirerAffectationPopUp,
} from '@/hooks/useProfiles';
import { useAjouterDroit, useDroitsEmploye, useSupprimerDroit } from '@/hooks/useDroits';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import type { DroitEmploye, Fonctionnalite, PopUp, Profile } from '@/types/database.types';

// --- Onglet Droits (Stock suit l'attribution existante ; Calendrier/Équipe sont des droits
// éventuellement scopés à un seul pop-up — cf. migrations 0034/0038. Finance reste admin-only,
// migration 0035, pas de section ici) ---

function nomPopUpOuTous(popUps: PopUp[], popUpId: string | null): string {
  if (popUpId === null) return 'Tous les pop-up';
  return popUps.find((p) => p.id === popUpId)?.nom ?? 'Pop-up supprimé';
}

function SectionDroit({
  droits,
  popUps,
  onAjouter,
  onSupprimer,
}: {
  droits: DroitEmploye[];
  popUps: PopUp[];
  onAjouter: (popUpId: string | null) => void;
  onSupprimer: (id: string) => void;
}) {
  const [choix, setChoix] = useState('');
  const dejaTous = droits.some((d) => d.pop_up_id === null);
  const popUpsDejaAccordes = new Set(droits.map((d) => d.pop_up_id));
  const optionsRestantes = dejaTous ? [] : popUps.filter((p) => !popUpsDejaAccordes.has(p.id));

  const ajouter = () => {
    if (!choix) return;
    onAjouter(choix === '__tous__' ? null : choix);
    setChoix('');
  };

  return (
    <View>
      <View style={stylesBase.chipsRowDroits}>
        {droits.map((d) => (
          <View key={d.id} style={stylesBase.chipDroit}>
            <Text style={stylesBase.chipDroitTexte}>{nomPopUpOuTous(popUps, d.pop_up_id)}</Text>
            <Pressable onPress={() => onSupprimer(d.id)}>
              <Ionicons name="close" size={12} color="#4338CA" />
            </Pressable>
          </View>
        ))}
        {droits.length === 0 && <Text style={stylesBase.texteAlerte}>Aucun accès.</Text>}
      </View>
      {!dejaTous && (
        <View style={stylesBase.ligneAjoutDroit}>
          <View style={{ flex: 1 }}>
            <select
              value={choix}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setChoix(e.target.value)}
              style={stylesBase.champInputWeb as unknown as React.CSSProperties}
            >
              <option value="">Ajouter un accès...</option>
              <option value="__tous__">Tous les pop-up</option>
              {optionsRestantes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </View>
          <Pressable onPress={ajouter} style={stylesBase.boutonAjoutDroit}>
            <Text style={stylesBase.boutonAjoutDroitTexte}>Ajouter</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function OngletDroits({ profil, popUps }: { profil: Profile; popUps: PopUp[] }) {
  const { data: affectations } = useAffectationsPopUp();
  const ajouterAffectation = useAjouterAffectationPopUp();
  const retirerAffectation = useRetirerAffectationPopUp();
  const { data: droits } = useDroitsEmploye(profil.id);
  const ajouterDroit = useAjouterDroit(profil.id);
  const supprimerDroit = useSupprimerDroit(profil.id);
  const [popUpAjoutLieu, setPopUpAjoutLieu] = useState('');

  const lieuxAttribuesIds = new Set(
    (affectations ?? []).filter((a) => a.profile_id === profil.id).map((a) => a.pop_up_id),
  );
  const lieuxDisponibles = popUps.filter((p) => !lieuxAttribuesIds.has(p.id));

  const parFonctionnalite = (f: Fonctionnalite) => (droits ?? []).filter((d) => d.fonctionnalite === f);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <Section titre="Lieux attribués (planning & stock)">
        <View style={stylesBase.chipsRowDroits}>
          {popUps
            .filter((p) => lieuxAttribuesIds.has(p.id))
            .map((p) => (
              <View key={p.id} style={stylesBase.chipDroit}>
                <Text style={stylesBase.chipDroitTexte}>{p.nom}</Text>
                <Pressable onPress={() => retirerAffectation.mutate({ profileId: profil.id, popUpId: p.id })}>
                  <Ionicons name="close" size={12} color="#4338CA" />
                </Pressable>
              </View>
            ))}
          {lieuxAttribuesIds.size === 0 && <Text style={stylesBase.texteAlerte}>Aucun lieu attribué.</Text>}
        </View>
        {lieuxDisponibles.length > 0 && (
          <View style={stylesBase.ligneAjoutDroit}>
            <View style={{ flex: 1 }}>
              <select
                value={popUpAjoutLieu}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setPopUpAjoutLieu(e.target.value)}
                style={stylesBase.champInputWeb as unknown as React.CSSProperties}
              >
                <option value="">Ajouter un lieu...</option>
                {lieuxDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </View>
            <Pressable
              onPress={() => {
                if (!popUpAjoutLieu) return;
                ajouterAffectation.mutate({ profileId: profil.id, popUpId: popUpAjoutLieu });
                setPopUpAjoutLieu('');
              }}
              style={stylesBase.boutonAjoutDroit}
            >
              <Text style={stylesBase.boutonAjoutDroitTexte}>Ajouter</Text>
            </Pressable>
          </View>
        )}
      </Section>

      <Section titre="Calendrier">
        <Text style={stylesBase.texteAlerte}>
          Donne la gestion complète du planning (créer/modifier/supprimer des shifts, gérer les
          absences) pour le(s) pop-up choisi(s) — pas juste la consultation.
        </Text>
        <SectionDroit
          droits={parFonctionnalite('calendrier')}
          popUps={popUps}
          onAjouter={(popUpId) => ajouterDroit.mutate({ fonctionnalite: 'calendrier', popUpId })}
          onSupprimer={(id) => supprimerDroit.mutate(id)}
        />
      </Section>

      <Section titre="Équipe">
        <Text style={stylesBase.texteAlerte}>
          Donne accès à la fiche des membres du/des pop-up choisi(s) : infos générales (hors
          bancaire/médical, réservés à l'admin), contrat, planification, congés et documents — en
          lecture et en édition.
        </Text>
        <SectionDroit
          droits={parFonctionnalite('equipe')}
          popUps={popUps}
          onAjouter={(popUpId) => ajouterDroit.mutate({ fonctionnalite: 'equipe', popUpId })}
          onSupprimer={(id) => supprimerDroit.mutate(id)}
        />
      </Section>
    </ScrollView>
  );
}

// --- Écran principal ---

export default function EquipeWebScreen() {
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations, isLoading: chargementAffectations } = useAffectationsPopUp();

  const mapAffectations = construireMapAffectations(affectations ?? []);

  if (chargementProfils || chargementPopUps || chargementAffectations) {
    return (
      <View style={[stylesEcran.ecran, stylesEcran.centre]}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <EquipeEcranBase
      profils={profils ?? []}
      popUps={popUps ?? []}
      lieuxAttribuesDe={(profil) => popUpsAttribues(profil, mapAffectations, popUps ?? [])}
      estAdmin
      montrerInvite
      contenuDroits={(profil) => <OngletDroits profil={profil} popUps={popUps ?? []} />}
    />
  );
}

const stylesEcran = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  centre: { alignItems: 'center', justifyContent: 'center', gap: 12 },
});
