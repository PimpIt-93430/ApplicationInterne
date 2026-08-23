import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { JourReglageCard } from '@/components/reglages/JourReglageCard';
import {
  useCreerPopUp,
  useModifierCoordonneesPopUp,
  useModifierCreneauxPredefinisPopUp,
  useModifierDatesPopUp,
  usePopUps,
  useRenommerPopUp,
  useSupprimerPopUp,
} from '@/hooks/usePopUps';
import {
  useActiveProfiles,
  useAffectationsPopUp,
  useAjouterAffectationPopUp,
  useRetirerAffectationPopUp,
} from '@/hooks/useProfiles';
import { useEnregistrerHoraireOuverture, useHorairesOuverture } from '@/hooks/useReglesMetier';
import { JOURS_LABELS } from '@/utils/dateUtils';
import type { PopUp, Profile } from '@/types/database.types';

/** Une ligne de créneau prédéfini (Matin ou Après-midi) avec pause optionnelle — factorisé car
 * utilisé deux fois à l'identique dans CartePopUp. */
function CreneauPredefiniLigne({
  label,
  debut,
  fin,
  onDebutChange,
  onFinChange,
  placeholderDebut,
  placeholderFin,
  pauseActive,
  onPauseActiveChange,
  pauseDebut,
  pauseFin,
  onPauseDebutChange,
  onPauseFinChange,
  onBlur,
}: {
  label: string;
  debut: string;
  fin: string;
  onDebutChange: (v: string) => void;
  onFinChange: (v: string) => void;
  placeholderDebut: string;
  placeholderFin: string;
  pauseActive: boolean;
  onPauseActiveChange: (v: boolean) => void;
  pauseDebut: string;
  pauseFin: string;
  onPauseDebutChange: (v: string) => void;
  onPauseFinChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <View className="mb-2">
      <View className="mb-1.5 flex-row items-center gap-2">
        <Text className="w-24 text-xs text-slate-500">{label}</Text>
        <TextInput
          value={debut}
          onChangeText={onDebutChange}
          onBlur={onBlur}
          placeholder={placeholderDebut}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm"
        />
        <Text className="text-slate-400">à</Text>
        <TextInput
          value={fin}
          onChangeText={onFinChange}
          onBlur={onBlur}
          placeholder={placeholderFin}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm"
        />
      </View>
      <View className="flex-row items-center gap-2 pl-24">
        <Switch
          value={pauseActive}
          onValueChange={(v) => {
            onPauseActiveChange(v);
            onBlur();
          }}
        />
        <Text className="text-xs text-slate-500">Pause</Text>
        {pauseActive && (
          <>
            <TextInput
              value={pauseDebut}
              onChangeText={onPauseDebutChange}
              onBlur={onBlur}
              placeholder="13:00"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm"
            />
            <Text className="text-slate-400">à</Text>
            <TextInput
              value={pauseFin}
              onChangeText={onPauseFinChange}
              onBlur={onBlur}
              placeholder="14:00"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm"
            />
          </>
        )}
      </View>
    </View>
  );
}

function CartePopUp({
  popUp,
  profils,
  mapAffectations,
}: {
  popUp: PopUp;
  profils: Profile[];
  mapAffectations: Map<string, Set<string>>;
}) {
  const [horairesOuverts, setHorairesOuverts] = useState(false);
  const [ajoutMembreOuvert, setAjoutMembreOuvert] = useState(false);
  const [editionNom, setEditionNom] = useState(false);
  const [nom, setNom] = useState(popUp.nom);
  const [dateDebut, setDateDebut] = useState(popUp.date_debut ?? '');
  const [dateFin, setDateFin] = useState(popUp.date_fin ?? '');
  const [lat, setLat] = useState(popUp.lat != null ? String(popUp.lat) : '');
  const [lon, setLon] = useState(popUp.lon != null ? String(popUp.lon) : '');
  const [matinDebut, setMatinDebut] = useState(popUp.matin_debut?.slice(0, 5) ?? '');
  const [matinFin, setMatinFin] = useState(popUp.matin_fin?.slice(0, 5) ?? '');
  const [matinPauseActive, setMatinPauseActive] = useState(!!(popUp.matin_pause_debut && popUp.matin_pause_fin));
  const [matinPauseDebut, setMatinPauseDebut] = useState(popUp.matin_pause_debut?.slice(0, 5) ?? '13:00');
  const [matinPauseFin, setMatinPauseFin] = useState(popUp.matin_pause_fin?.slice(0, 5) ?? '14:00');
  const [apresMidiDebut, setApresMidiDebut] = useState(popUp.apres_midi_debut?.slice(0, 5) ?? '');
  const [apresMidiFin, setApresMidiFin] = useState(popUp.apres_midi_fin?.slice(0, 5) ?? '');
  const [apresMidiPauseActive, setApresMidiPauseActive] = useState(
    !!(popUp.apres_midi_pause_debut && popUp.apres_midi_pause_fin),
  );
  const [apresMidiPauseDebut, setApresMidiPauseDebut] = useState(popUp.apres_midi_pause_debut?.slice(0, 5) ?? '13:00');
  const [apresMidiPauseFin, setApresMidiPauseFin] = useState(popUp.apres_midi_pause_fin?.slice(0, 5) ?? '14:00');

  // Les admins sont considérés attribués à tous les lieux implicitement (cf. Équipe) : cette
  // liste sert à gérer qui d'autre peut être planifié ici, pas les admins eux-mêmes.
  const profilsNonAdmin = profils.filter((p) => p.role !== 'admin');
  const membres = profilsNonAdmin.filter((p) => mapAffectations.get(p.id)?.has(popUp.id));
  const disponibles = profilsNonAdmin.filter((p) => !mapAffectations.get(p.id)?.has(popUp.id));

  const { data: horaires, isLoading: chargementHoraires } = useHorairesOuverture(
    horairesOuverts ? popUp.id : undefined,
  );
  const enregistrerHoraire = useEnregistrerHoraireOuverture();
  const ajouterAffectation = useAjouterAffectationPopUp();
  const retirerAffectation = useRetirerAffectationPopUp();
  const renommer = useRenommerPopUp();
  const supprimer = useSupprimerPopUp();
  const modifierDates = useModifierDatesPopUp();
  const modifierCoordonnees = useModifierCoordonneesPopUp();
  const modifierCreneaux = useModifierCreneauxPredefinisPopUp();

  const handleSupprimer = () => {
    Alert.alert(
      'Supprimer ce pop-up',
      `Supprimer ${popUp.nom} ? Le planning et les horaires liés seront aussi supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => supprimer.mutate(popUp.id) },
      ],
    );
  };

  const validerNom = () => {
    const nomPropre = nom.trim();
    if (nomPropre && nomPropre !== popUp.nom) {
      renommer.mutate({ id: popUp.id, nom: nomPropre });
    } else {
      setNom(popUp.nom);
    }
    setEditionNom(false);
  };

  const validerDates = () => {
    const debut = dateDebut.trim() || null;
    const fin = dateFin.trim() || null;
    if (debut !== popUp.date_debut || fin !== popUp.date_fin) {
      modifierDates.mutate({ id: popUp.id, dateDebut: debut, dateFin: fin });
    }
  };

  // Coordonnées saisies à la main (ex. copiées depuis Google Maps) — servent à retrouver quel
  // pop-up a fait une vente SumUp par proximité GPS (cf. écran Finance).
  const validerCoordonnees = () => {
    const latNombre = lat.trim() ? Number(lat.trim().replace(',', '.')) : null;
    const lonNombre = lon.trim() ? Number(lon.trim().replace(',', '.')) : null;
    if (lat.trim() && Number.isNaN(latNombre)) return;
    if (lon.trim() && Number.isNaN(lonNombre)) return;
    if (latNombre !== popUp.lat || lonNombre !== popUp.lon) {
      modifierCoordonnees.mutate({ id: popUp.id, lat: latNombre, lon: lonNombre });
    }
  };

  // Créneaux Matin/Après-midi prédéfinis pour ce lieu — lus ensuite par les boutons Matin/
  // Après-midi de l'horaire récurrent d'un employé (Équipe > Planification).
  const validerCreneaux = () => {
    modifierCreneaux.mutate({
      id: popUp.id,
      matinDebut: matinDebut.trim() || null,
      matinFin: matinFin.trim() || null,
      matinPauseDebut: matinPauseActive ? matinPauseDebut.trim() || null : null,
      matinPauseFin: matinPauseActive ? matinPauseFin.trim() || null : null,
      apresMidiDebut: apresMidiDebut.trim() || null,
      apresMidiFin: apresMidiFin.trim() || null,
      apresMidiPauseDebut: apresMidiPauseActive ? apresMidiPauseDebut.trim() || null : null,
      apresMidiPauseFin: apresMidiPauseActive ? apresMidiPauseFin.trim() || null : null,
    });
  };

  return (
    <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <View className="mb-3 flex-row items-center gap-2">
        <View className="h-3 w-3 rounded-full" style={{ backgroundColor: popUp.couleur }} />
        {editionNom ? (
          <TextInput
            value={nom}
            onChangeText={setNom}
            autoFocus
            onSubmitEditing={validerNom}
            onBlur={validerNom}
            className="flex-1 border-b border-indigo-300 pb-0.5 text-lg font-bold text-slate-900"
          />
        ) : (
          <Pressable onPress={() => setEditionNom(true)} className="flex-1 flex-row items-center gap-2">
            <Text className="text-lg font-bold text-slate-900">{popUp.nom}</Text>
            <Text className="text-sm text-slate-300">✎</Text>
          </Pressable>
        )}
        <Pressable onPress={handleSupprimer} className="px-2 py-1">
          <Text className="text-sm text-red-400">Supprimer</Text>
        </Pressable>
      </View>

      <View className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <Text className="mb-2 text-sm font-semibold text-slate-700">Dates du pop-up</Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            value={dateDebut}
            onChangeText={setDateDebut}
            onBlur={validerDates}
            placeholder="Début (AAAA-MM-JJ)"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          />
          <Text className="text-slate-400">→</Text>
          <TextInput
            value={dateFin}
            onChangeText={setDateFin}
            onBlur={validerDates}
            placeholder="Fin prévue (AAAA-MM-JJ)"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          />
        </View>
      </View>

      <View className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <Text className="mb-2 text-sm font-semibold text-slate-700">Coordonnées GPS</Text>
        <Text className="mb-2 text-xs text-slate-400">
          Sert à rattacher les ventes SumUp à ce pop-up (Écran Finance) — copiez-les depuis Google Maps.
        </Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            value={lat}
            onChangeText={setLat}
            onBlur={validerCoordonnees}
            placeholder="Latitude"
            keyboardType="numeric"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          />
          <TextInput
            value={lon}
            onChangeText={setLon}
            onBlur={validerCoordonnees}
            placeholder="Longitude"
            keyboardType="numeric"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          />
        </View>
      </View>

      <View className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <Text className="mb-2 text-sm font-semibold text-slate-700">Créneaux Matin / Après-midi prédéfinis</Text>
        <Text className="mb-2 text-xs text-slate-400">
          Utilisés par les boutons Matin/Après-midi dans Équipe {'>'} Planification, pour cette personne à ce lieu.
        </Text>
        <CreneauPredefiniLigne
          label="Matin"
          debut={matinDebut}
          fin={matinFin}
          onDebutChange={setMatinDebut}
          onFinChange={setMatinFin}
          placeholderDebut="10:00"
          placeholderFin="14:00"
          pauseActive={matinPauseActive}
          onPauseActiveChange={setMatinPauseActive}
          pauseDebut={matinPauseDebut}
          pauseFin={matinPauseFin}
          onPauseDebutChange={setMatinPauseDebut}
          onPauseFinChange={setMatinPauseFin}
          onBlur={validerCreneaux}
        />
        <CreneauPredefiniLigne
          label="Après-midi"
          debut={apresMidiDebut}
          fin={apresMidiFin}
          onDebutChange={setApresMidiDebut}
          onFinChange={setApresMidiFin}
          placeholderDebut="14:00"
          placeholderFin="20:00"
          pauseActive={apresMidiPauseActive}
          onPauseActiveChange={setApresMidiPauseActive}
          pauseDebut={apresMidiPauseDebut}
          pauseFin={apresMidiPauseFin}
          onPauseDebutChange={setApresMidiPauseDebut}
          onPauseFinChange={setApresMidiPauseFin}
          onBlur={validerCreneaux}
        />
      </View>

      <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">
        Effectifs attribués (une personne peut être attribuée à plusieurs lieux)
      </Text>
      <View className="mb-2 flex-row flex-wrap gap-2">
        {membres.length === 0 && <Text className="text-sm text-slate-400">Personne pour l'instant</Text>}
        {membres.map((m) => (
          <Pressable
            key={m.id}
            onPress={() =>
              Alert.alert('Retirer', `Retirer ${m.nom_complet || m.email} de ${popUp.nom} ?`, [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Retirer',
                  style: 'destructive',
                  onPress: () => retirerAffectation.mutate({ profileId: m.id, popUpId: popUp.id }),
                },
              ])
            }
            className="rounded-full bg-slate-100 px-3 py-1.5"
          >
            <Text className="text-sm text-slate-700">{m.nom_complet || m.email} ✕</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => setAjoutMembreOuvert((v) => !v)} className="mb-2">
        <Text className="text-sm font-semibold text-indigo-600">
          {ajoutMembreOuvert ? 'Fermer' : '+ Attribuer quelqu\'un'}
        </Text>
      </Pressable>

      {ajoutMembreOuvert && (
        <View className="mb-3 gap-1 rounded-xl bg-slate-50 p-2">
          {disponibles.length === 0 ? (
            <Text className="p-2 text-sm text-slate-400">Tout le monde est déjà attribué ici.</Text>
          ) : (
            disponibles.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  ajouterAffectation.mutate({ profileId: p.id, popUpId: popUp.id });
                  setAjoutMembreOuvert(false);
                }}
                className="rounded-lg bg-white px-3 py-2"
              >
                <Text className="text-sm text-slate-700">{p.nom_complet || p.email}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      <Pressable onPress={() => setHorairesOuverts((v) => !v)} className="mb-2">
        <Text className="text-sm font-semibold text-indigo-600">
          {horairesOuverts ? 'Masquer les horaires' : 'Voir / modifier les horaires'}
        </Text>
      </Pressable>

      {horairesOuverts &&
        (chargementHoraires ? (
          <ActivityIndicator color="#6366F1" />
        ) : (
          // Grille horizontale lundi→dimanche, même largeur/disposition que la planification des
          // personnes (cf. HoraireRecurrentJourCard dans Équipe) plutôt qu'une pile verticale.
          <View className="flex-row flex-wrap gap-3">
            {JOURS_LABELS.map((label, jourSemaine) => (
              <View key={jourSemaine} className="grow basis-[140px] max-w-[200px]">
                <JourReglageCard
                  popUpId={popUp.id}
                  jourSemaine={jourSemaine}
                  label={label}
                  regle={horaires?.find((h) => h.jour_semaine === jourSemaine)}
                  onEnregistrer={(horaire) => enregistrerHoraire.mutate(horaire)}
                />
              </View>
            ))}
          </View>
        ))}
    </View>
  );
}

export default function PopUpsScreen() {
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const { data: affectations, isLoading: chargementAffectations } = useAffectationsPopUp();
  const creerPopUp = useCreerPopUp();

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [ouverture, setOuverture] = useState('10:00');
  const [fermeture, setFermeture] = useState('20:00');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  const mapAffectations = new Map<string, Set<string>>();
  for (const a of affectations ?? []) {
    const ensemble = mapAffectations.get(a.profile_id) ?? new Set<string>();
    ensemble.add(a.pop_up_id);
    mapAffectations.set(a.profile_id, ensemble);
  }

  const handleCreer = () => {
    if (!nom.trim()) return;
    creerPopUp.mutate(
      {
        nom: nom.trim(),
        heureOuverture: ouverture,
        heureFermeture: fermeture,
        dateDebut: dateDebut.trim() || null,
        dateFin: dateFin.trim() || null,
      },
      {
        onSuccess: () => {
          setNom('');
          setDateDebut('');
          setDateFin('');
          setFormulaireOuvert(false);
        },
      },
    );
  };

  if (chargementPopUps || chargementProfils || chargementAffectations) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Pop-up" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>

      {(popUps ?? []).map((popUp) => (
        <CartePopUp key={popUp.id} popUp={popUp} profils={profils ?? []} mapAffectations={mapAffectations} />
      ))}

      <View className="rounded-2xl border border-dashed border-indigo-300 bg-white p-4">
        <Pressable onPress={() => setFormulaireOuvert((v) => !v)}>
          <Text className="text-center text-sm font-semibold text-indigo-600">
            {formulaireOuvert ? 'Annuler' : '+ Ajouter un pop-up'}
          </Text>
        </Pressable>

        {formulaireOuvert && (
          <View className="mt-3">
            <TextInput
              value={nom}
              onChangeText={setNom}
              placeholder="Nom du pop-up"
              className="mb-3 rounded-lg border border-slate-200 px-3 py-2"
            />
            <View className="mb-3 flex-row items-center justify-center gap-2">
              <TextInput
                value={ouverture}
                onChangeText={setOuverture}
                placeholder="10:00"
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
              <Text className="text-slate-400">à</Text>
              <TextInput
                value={fermeture}
                onChangeText={setFermeture}
                placeholder="20:00"
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
            </View>
            <View className="mb-3 flex-row items-center justify-center gap-2">
              <TextInput
                value={dateDebut}
                onChangeText={setDateDebut}
                placeholder="Début (AAAA-MM-JJ)"
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
              <Text className="text-slate-400">→</Text>
              <TextInput
                value={dateFin}
                onChangeText={setDateFin}
                placeholder="Fin prévue (AAAA-MM-JJ)"
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-center"
              />
            </View>
            <Pressable onPress={handleCreer} className="items-center rounded-lg bg-indigo-600 py-2">
              <Text className="text-sm font-semibold text-white">Créer le pop-up</Text>
            </Pressable>
          </View>
        )}
      </View>
      </ScrollView>
    </View>
  );
}
