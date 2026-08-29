import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import type { HoraireRecurrentProfil, PopUp } from '@/types/database.types';

export interface HoraireAEnregistrer {
  profile_id: string;
  pop_up_id: string;
  jour_semaine: number;
  heure_debut: string;
  heure_fin: string;
  actif: boolean;
  pause_debut: string | null;
  pause_fin: string | null;
  semaine_reference: 'toutes' | 'premiere' | 'deuxieme';
}

interface Props {
  profileId: string;
  jourSemaine: number;
  label: string;
  /** 0, 1 ou 2 lignes pour ce jour de semaine : une seule "toutes" en rythme normal, ou une
   * "premiere" et/ou une "deuxieme" (avec des heures potentiellement différentes) en rythme "un
   * jour sur deux" — cf. migration 0063. */
  regles: HoraireRecurrentProfil[];
  popUpsDisponibles: PopUp[];
  onEnregistrer: (horaire: HoraireAEnregistrer) => void;
  onSupprimer: (id: string) => void;
}

type ModeCreneau = 'matin' | 'apres-midi' | 'personnalise';

const MODES_CRENEAU: { value: ModeCreneau; label: string }[] = [
  { value: 'matin', label: 'Matin' },
  { value: 'apres-midi', label: 'Après-midi' },
  { value: 'personnalise', label: 'Personnalisé' },
];

export function HoraireRecurrentJourCard({
  profileId,
  jourSemaine,
  label,
  regles,
  popUpsDisponibles,
  onEnregistrer,
  onSupprimer,
}: Props) {
  const reglePremiere = regles.find((r) => r.semaine_reference === 'premiere');
  const regleDeuxieme = regles.find((r) => r.semaine_reference === 'deuxieme');
  const [unJourSurDeux, setUnJourSurDeux] = useState(!!reglePremiere || !!regleDeuxieme);

  // Si le parent recharge les règles (ex: après "Copier les horaires du pop-up"), on suit.
  useEffect(() => {
    setUnJourSurDeux(!!reglePremiere || !!regleDeuxieme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regles]);

  const basculerUnJourSurDeux = (v: boolean) => {
    setUnJourSurDeux(v);
    // La ligne de l'ancien mode devient hors-sujet : elle disparaît plutôt que de rester active
    // en silence en plus des nouvelles (cf. supprimerHoraireRecurrent).
    if (v) {
      const regleToutes = regles.find((r) => r.semaine_reference === 'toutes');
      if (regleToutes) onSupprimer(regleToutes.id);
    } else {
      if (reglePremiere) onSupprimer(reglePremiere.id);
      if (regleDeuxieme) onSupprimer(regleDeuxieme.id);
    }
  };

  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
      <Text className="mb-2 text-sm font-semibold text-slate-800">{label}</Text>

      {unJourSurDeux ? (
        <View className="gap-2">
          <EditeurHoraireSemaine
            titre="1ère semaine (depuis l'ouverture)"
            profileId={profileId}
            jourSemaine={jourSemaine}
            semaineReference="premiere"
            regle={reglePremiere}
            popUpsDisponibles={popUpsDisponibles}
            onEnregistrer={onEnregistrer}
          />
          <EditeurHoraireSemaine
            titre="2e semaine"
            profileId={profileId}
            jourSemaine={jourSemaine}
            semaineReference="deuxieme"
            regle={regleDeuxieme}
            popUpsDisponibles={popUpsDisponibles}
            onEnregistrer={onEnregistrer}
          />
        </View>
      ) : (
        <EditeurHoraireSemaine
          titre={null}
          profileId={profileId}
          jourSemaine={jourSemaine}
          semaineReference="toutes"
          regle={regles.find((r) => r.semaine_reference === 'toutes')}
          popUpsDisponibles={popUpsDisponibles}
          onEnregistrer={onEnregistrer}
        />
      )}

      <View className="mt-2 flex-row items-center gap-2 border-t border-slate-100 pt-2">
        <Switch value={unJourSurDeux} onValueChange={basculerUnJourSurDeux} disabled={popUpsDisponibles.length === 0} />
        <Text className="text-xs text-slate-500">Un jour sur deux (heures différentes possibles chaque semaine)</Text>
      </View>
    </View>
  );
}

/** Un seul créneau éditable (actif, heures, pause, lieu) pour une semaine donnée — "toutes" en
 * rythme normal, "premiere"/"deuxieme" en rythme un jour sur deux. Autonome : possède son propre
 * bouton Enregistrer, pour permettre des heures différentes d'une semaine à l'autre. */
function EditeurHoraireSemaine({
  titre,
  profileId,
  jourSemaine,
  semaineReference,
  regle,
  popUpsDisponibles,
  onEnregistrer,
}: {
  titre: string | null;
  profileId: string;
  jourSemaine: number;
  semaineReference: 'toutes' | 'premiere' | 'deuxieme';
  regle: HoraireRecurrentProfil | undefined;
  popUpsDisponibles: PopUp[];
  onEnregistrer: (horaire: HoraireAEnregistrer) => void;
}) {
  const [actif, setActif] = useState(regle?.actif ?? false);
  const [debut, setDebut] = useState(regle?.heure_debut?.slice(0, 5) ?? '10:00');
  const [fin, setFin] = useState(regle?.heure_fin?.slice(0, 5) ?? '19:00');
  const [pauseActive, setPauseActive] = useState(!!(regle?.pause_debut && regle?.pause_fin));
  const [pauseDebut, setPauseDebut] = useState(regle?.pause_debut?.slice(0, 5) ?? '13:00');
  const [pauseFin, setPauseFin] = useState(regle?.pause_fin?.slice(0, 5) ?? '14:00');
  const [popUpId, setPopUpId] = useState(regle?.pop_up_id ?? popUpsDisponibles[0]?.id);
  const [mode, setMode] = useState<ModeCreneau>('personnalise');

  useEffect(() => {
    setActif(regle?.actif ?? false);
    setDebut(regle?.heure_debut?.slice(0, 5) ?? '10:00');
    setFin(regle?.heure_fin?.slice(0, 5) ?? '19:00');
    setPauseActive(!!(regle?.pause_debut && regle?.pause_fin));
    setPauseDebut(regle?.pause_debut?.slice(0, 5) ?? '13:00');
    setPauseFin(regle?.pause_fin?.slice(0, 5) ?? '14:00');
    setPopUpId(regle?.pop_up_id ?? popUpsDisponibles[0]?.id);
    setMode('personnalise');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regle]);

  // Préréglages Matin/Après-midi réglés une fois pour toutes par lieu (écran Pop-up), pas par
  // jour de semaine — chaque pop-up a les siens, pause comprise.
  const presetsPourPopUp = (id: string | undefined) => {
    const p = popUpsDisponibles.find((pu) => pu.id === id);
    return {
      matin:
        p?.matin_debut && p?.matin_fin
          ? {
              debut: p.matin_debut.slice(0, 5),
              fin: p.matin_fin.slice(0, 5),
              pause:
                p.matin_pause_debut && p.matin_pause_fin
                  ? { debut: p.matin_pause_debut.slice(0, 5), fin: p.matin_pause_fin.slice(0, 5) }
                  : undefined,
            }
          : undefined,
      apresMidi:
        p?.apres_midi_debut && p?.apres_midi_fin
          ? {
              debut: p.apres_midi_debut.slice(0, 5),
              fin: p.apres_midi_fin.slice(0, 5),
              pause:
                p.apres_midi_pause_debut && p.apres_midi_pause_fin
                  ? { debut: p.apres_midi_pause_debut.slice(0, 5), fin: p.apres_midi_pause_fin.slice(0, 5) }
                  : undefined,
            }
          : undefined,
    };
  };
  const { matin: presetMatin, apresMidi: presetApresMidi } = presetsPourPopUp(popUpId);

  const appliquerMode = (nouveauMode: ModeCreneau, idPopUp: string | undefined = popUpId) => {
    setMode(nouveauMode);
    if (nouveauMode === 'personnalise') return;
    const preset = presetsPourPopUp(idPopUp)[nouveauMode === 'matin' ? 'matin' : 'apresMidi'];
    if (!preset) return;
    setDebut(preset.debut);
    setFin(preset.fin);
    setPauseActive(!!preset.pause);
    if (preset.pause) {
      setPauseDebut(preset.pause.debut);
      setPauseFin(preset.pause.fin);
    }
  };

  // Changer de pop-up alors qu'un préréglage est actif recalcule sur les créneaux du nouveau lieu
  // — l'id du nouveau lieu est passé explicitement, `popUpId` (state) n'étant pas encore à jour.
  const choisirPopUp = (id: string) => {
    setPopUpId(id);
    if (mode !== 'personnalise') appliquerMode(mode, id);
  };

  // Une modification manuelle des heures/pause alors qu'un préréglage était sélectionné retombe
  // en "Personnalisé" : les valeurs affichées ne correspondent plus au préréglage.
  const modifierDebut = (v: string) => {
    setDebut(v);
    setMode('personnalise');
  };
  const modifierFin = (v: string) => {
    setFin(v);
    setMode('personnalise');
  };
  const modifierPauseActive = (v: boolean) => {
    setPauseActive(v);
    setMode('personnalise');
  };
  const modifierPauseDebut = (v: string) => {
    setPauseDebut(v);
    setMode('personnalise');
  };
  const modifierPauseFin = (v: string) => {
    setPauseFin(v);
    setMode('personnalise');
  };

  const enregistrer = () => {
    if (!popUpId) return;
    onEnregistrer({
      profile_id: profileId,
      pop_up_id: popUpId,
      jour_semaine: jourSemaine,
      heure_debut: `${debut}:00`,
      heure_fin: `${fin}:00`,
      actif,
      pause_debut: pauseActive ? `${pauseDebut}:00` : null,
      pause_fin: pauseActive ? `${pauseFin}:00` : null,
      semaine_reference: semaineReference,
    });
  };

  const popUpChoisi = popUpsDisponibles.find((p) => p.id === popUpId);

  return (
    <View className={titre ? 'rounded-lg bg-slate-50 p-2' : undefined}>
      <View className="mb-2 flex-row items-center justify-between">
        {titre ? <Text className="text-xs font-semibold text-slate-600">{titre}</Text> : <View />}
        <Switch value={actif} onValueChange={setActif} disabled={popUpsDisponibles.length === 0} />
      </View>

      {actif && popUpsDisponibles.length === 0 && (
        <Text className="mb-2 text-xs text-red-500">
          Aucun lieu attribué — attribue d'abord cette personne à un lieu dans Pop-up.
        </Text>
      )}

      {actif && popUpsDisponibles.length > 0 && (
        <>
          {popUpsDisponibles.length > 1 && (
            <View className="mb-2 flex-row flex-wrap gap-1.5">
              {popUpsDisponibles.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => choisirPopUp(p.id)}
                  className={`rounded-full px-3 py-1 ${popUpId === p.id ? '' : 'bg-slate-100'}`}
                  style={popUpId === p.id ? { backgroundColor: p.couleur } : undefined}
                >
                  <Text className={`text-xs font-semibold ${popUpId === p.id ? 'text-white' : 'text-slate-600'}`}>
                    {p.nom}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {popUpsDisponibles.length === 1 && (
            <Text className="mb-2 text-xs text-slate-400">Lieu : {popUpChoisi?.nom}</Text>
          )}

          <View className="mb-2 flex-row flex-wrap gap-1.5">
            {MODES_CRENEAU.map((m) => {
              const indisponible = m.value === 'matin' ? !presetMatin : m.value === 'apres-midi' ? !presetApresMidi : false;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => appliquerMode(m.value)}
                  disabled={indisponible}
                  className={`rounded-full px-3 py-1 ${mode === m.value ? 'bg-indigo-600' : 'bg-slate-100'}`}
                  style={indisponible ? { opacity: 0.4 } : undefined}
                >
                  <Text className={`text-xs font-semibold ${mode === m.value ? 'text-white' : 'text-slate-600'}`}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!presetMatin && !presetApresMidi && (
            <Text className="mb-2 text-xs text-slate-400">
              Aucun créneau prédéfini pour {popUpChoisi?.nom ?? 'ce lieu'} — réglable dans Pop-up.
            </Text>
          )}

          <View className="mb-2 flex-row items-center gap-2">
            <TextInput
              value={debut}
              onChangeText={modifierDebut}
              placeholder="10:00"
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
            />
            <Text className="text-slate-400">à</Text>
            <TextInput
              value={fin}
              onChangeText={modifierFin}
              placeholder="19:00"
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
            />
          </View>

          <View className="flex-row flex-wrap items-center gap-2">
            <View className="flex-row items-center gap-2">
              <Switch value={pauseActive} onValueChange={modifierPauseActive} />
              <Text className="text-xs text-slate-500">Pause</Text>
            </View>
            {pauseActive && (
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={pauseDebut}
                  onChangeText={modifierPauseDebut}
                  placeholder="13:00"
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
                />
                <Text className="text-slate-400">à</Text>
                <TextInput
                  value={pauseFin}
                  onChangeText={modifierPauseFin}
                  placeholder="14:00"
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
                />
              </View>
            )}
          </View>
        </>
      )}

      <Pressable
        onPress={enregistrer}
        disabled={actif && !popUpId}
        style={actif && !popUpId ? { opacity: 0.5 } : undefined}
        className="mt-2 items-center rounded-lg bg-indigo-600 py-1.5"
      >
        <Text className="text-xs font-semibold text-white">Enregistrer</Text>
      </Pressable>
    </View>
  );
}
