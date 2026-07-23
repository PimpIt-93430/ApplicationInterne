/** @jsxImportSource react */
// Écran en StyleSheet (pas de className) : ce fichier utilise des éléments HTML natifs
// (input, select) au même titre que le sélecteur de date/heure web ailleurs dans l'app —
// même convention, cf. commentaire équivalent dans admin/calendrier.tsx.
//
// Web uniquement (fichier .web.tsx, résolu automatiquement par Metro à la place de
// equipe.tsx sur le build web) : la fiche RH détaillée n'a pas d'équivalent mobile pour
// l'instant, l'app mobile garde l'écran Équipe existant tel quel.
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { obtenirUrlDocumentEmploye } from '@/api/documentsEmploye';
import { inviterEmploye } from '@/api/invitations';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { HoraireRecurrentJourCard } from '@/components/reglages/HoraireRecurrentJourCard';
import { useCongesProfile, useGererConges } from '@/hooks/useConges';
import { useDocumentsEmploye, useSupprimerDocumentEmploye, useUploaderDocumentEmploye } from '@/hooks/useDocumentsEmploye';
import { useEnregistrerHoraireRecurrent, useHorairesRecurrents } from '@/hooks/useHorairesRecurrents';
import { useEnregistrerInformationsRh, useInformationsRh } from '@/hooks/useInformationsRh';
import { usePopUps } from '@/hooks/usePopUps';
import {
  useActiveProfiles,
  useAffectationsPopUp,
  useAjouterAffectationPopUp,
  useModifierProfil,
  useRetirerAffectationPopUp,
} from '@/hooks/useProfiles';
import { useAjouterDroit, useDroitsEmploye, useSupprimerDroit } from '@/hooks/useDroits';
import { useAuthStore } from '@/store/useAuthStore';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import { formatHeure, JOURS_LABELS } from '@/utils/dateUtils';
import type { Conge, DroitEmploye, Fonctionnalite, InformationsRh, PopUp, Profile, Role, TypeContrat } from '@/types/database.types';

const LIBELLE_TYPE_CONTRAT: Record<TypeContrat, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

type Onglet = 'infos' | 'contrat' | 'planification' | 'conges' | 'documents' | 'droits';

const ONGLETS: { value: Onglet; label: string }[] = [
  { value: 'infos', label: 'Informations personnelles' },
  { value: 'contrat', label: 'Contrat' },
  { value: 'planification', label: 'Planification' },
  { value: 'conges', label: 'Congés' },
  { value: 'documents', label: 'Documents' },
  { value: 'droits', label: 'Droits' },
];

type NomIcone = keyof typeof Ionicons.glyphMap;

const ICONES_SECTION: Record<string, NomIcone> = {
  'État civil': 'person-outline',
  Coordonnées: 'call-outline',
  "Contact d'urgence": 'medkit-outline',
  'Informations bancaires': 'card-outline',
  'Informations médicales': 'fitness-outline',
  'Autorisations de travail': 'briefcase-outline',
  Contrat: 'document-text-outline',
};
const ICONE_SECTION_PAR_DEFAUT: NomIcone = 'information-circle-outline';

function initiales(nom: string | null | undefined, email: string): string {
  const source = (nom ?? '').trim();
  if (source) {
    const mots = source.split(/\s+/).filter(Boolean);
    if (mots.length >= 2) return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
    return mots[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// --- Petits composants réutilisables (avatar/badge) ---

function AvatarInitiales({
  nom,
  email,
  couleur,
  taille = 36,
}: {
  nom?: string | null;
  email: string;
  couleur: string;
  taille?: number;
}) {
  return (
    <View style={[styles.avatar, { width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleur }]}>
      <Text style={[styles.avatarTexte, { fontSize: taille * 0.38 }]}>{initiales(nom, email)}</Text>
    </View>
  );
}

function BadgeRole({ role, typeContrat }: { role: Role; typeContrat: TypeContrat }) {
  return (
    <View style={styles.badgesLigne}>
      <View style={styles.badgeContrat}>
        <Text style={styles.badgeContratTexte}>{LIBELLE_TYPE_CONTRAT[typeContrat] ?? typeContrat}</Text>
      </View>
      {role === 'admin' && (
        <View style={styles.badgeAdmin}>
          <Text style={styles.badgeAdminTexte}>Admin</Text>
        </View>
      )}
    </View>
  );
}

// --- Petits champs réutilisables (StyleSheet + éléments HTML pour date/select) ---

function Champ({
  label,
  valeur,
  onChangeText,
  clavier,
}: {
  label: string;
  valeur: string;
  onChangeText: (v: string) => void;
  clavier?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
}) {
  return (
    <View style={styles.champBloc}>
      <Text style={styles.champLabel}>{label}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChangeText}
        keyboardType={clavier}
        style={styles.champInput}
      />
    </View>
  );
}

function ChampDate({ label, valeur, onChange }: { label: string; valeur: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.champBloc}>
      <Text style={styles.champLabel}>{label}</Text>
      <input
        type="date"
        value={valeur}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        style={styles.champInputWeb as unknown as React.CSSProperties}
      />
    </View>
  );
}

function ChampSelect({
  label,
  valeur,
  options,
  onChange,
}: {
  label: string;
  valeur: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.champBloc}>
      <Text style={styles.champLabel}>{label}</Text>
      <select
        value={valeur}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        style={styles.champInputWeb as unknown as React.CSSProperties}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </View>
  );
}

function ChampBool({ label, valeur, onChange }: { label: string; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.champBoolLigne}>
      <Text style={styles.champLabel}>{label}</Text>
      <Switch value={valeur} onValueChange={onChange} />
    </View>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  const icone = ICONES_SECTION[titre] ?? ICONE_SECTION_PAR_DEFAUT;
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitreLigne}>
        <View style={styles.sectionIconeBadge}>
          <Ionicons name={icone} size={16} color="#4F46E5" />
        </View>
        <Text style={styles.sectionTitre}>{titre}</Text>
      </View>
      <View style={styles.sectionGrille}>{children}</View>
    </View>
  );
}

// --- Onglet Informations personnelles + Contrat (partagent le même état informations_rh) ---

type FormRh = Partial<InformationsRh>;

function texte(v: string | null | undefined): string {
  return v ?? '';
}

function OngletInfosPersonnelles({
  profil,
  lieuxAttribues,
  form,
  onChange,
}: {
  profil: Profile;
  lieuxAttribues: PopUp[];
  form: FormRh;
  onChange: (patch: FormRh) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.identiteBloc}>
        <AvatarInitiales nom={profil.nom_complet} email={profil.email} couleur={profil.couleur} taille={52} />
        <View style={{ flex: 1 }}>
          <Text style={styles.panneauNom}>{profil.nom_complet || profil.email}</Text>
          <Text style={styles.panneauEmail}>{profil.email}</Text>
          <View style={styles.panneauMetaLigne}>
            <BadgeRole role={profil.role} typeContrat={profil.type_contrat} />
            {lieuxAttribues.length > 0 && <Text style={styles.panneauMetaTexte}>· {lieuxAttribues[0].nom}</Text>}
          </View>
        </View>
      </View>

      <Section titre="État civil">
        <ChampSelect
          label="Genre"
          valeur={texte(form.genre)}
          onChange={(v) => onChange({ genre: v })}
          options={[
            { value: 'femme', label: 'Femme' },
            { value: 'homme', label: 'Homme' },
            { value: 'autre', label: 'Autre' },
          ]}
        />
        <ChampDate label="Date de naissance" valeur={texte(form.date_naissance)} onChange={(v) => onChange({ date_naissance: v || null })} />
        <Champ label="Nationalité" valeur={texte(form.nationalite)} onChangeText={(v) => onChange({ nationalite: v })} />
        <Champ label="Pays de naissance" valeur={texte(form.pays_naissance)} onChangeText={(v) => onChange({ pays_naissance: v })} />
        <Champ label="Département de naissance" valeur={texte(form.departement_naissance)} onChangeText={(v) => onChange({ departement_naissance: v })} />
        <Champ label="Commune de naissance" valeur={texte(form.commune_naissance)} onChangeText={(v) => onChange({ commune_naissance: v })} />
        <Champ label="Situation familiale" valeur={texte(form.situation_familiale)} onChangeText={(v) => onChange({ situation_familiale: v })} />
        <Champ
          label="Personnes à charge"
          valeur={form.nombre_personnes_charge != null ? String(form.nombre_personnes_charge) : ''}
          onChangeText={(v) => onChange({ nombre_personnes_charge: v ? Number(v) : null })}
          clavier="numeric"
        />
      </Section>

      <Section titre="Coordonnées">
        <Champ label="Tél. mobile" valeur={texte(form.tel_mobile)} onChangeText={(v) => onChange({ tel_mobile: v })} clavier="phone-pad" />
        <Champ label="Tél. fixe" valeur={texte(form.tel_fixe)} onChangeText={(v) => onChange({ tel_fixe: v })} clavier="phone-pad" />
        <ChampBool label="Notifications SMS" valeur={form.notifications_sms ?? false} onChange={(v) => onChange({ notifications_sms: v })} />
        <Champ label="Adresse" valeur={texte(form.adresse)} onChangeText={(v) => onChange({ adresse: v })} />
        <Champ label="Complément d'adresse" valeur={texte(form.complement_adresse)} onChangeText={(v) => onChange({ complement_adresse: v })} />
        <Champ label="Code postal" valeur={texte(form.code_postal)} onChangeText={(v) => onChange({ code_postal: v })} clavier="numeric" />
        <Champ label="Ville" valeur={texte(form.ville)} onChangeText={(v) => onChange({ ville: v })} />
        <Champ label="Pays" valeur={texte(form.pays)} onChangeText={(v) => onChange({ pays: v })} />
      </Section>

      <Section titre="Contact d'urgence">
        <Champ label="Prénom" valeur={texte(form.contact_urgence_prenom)} onChangeText={(v) => onChange({ contact_urgence_prenom: v })} />
        <Champ label="Nom" valeur={texte(form.contact_urgence_nom)} onChangeText={(v) => onChange({ contact_urgence_nom: v })} />
        <Champ label="Lien" valeur={texte(form.contact_urgence_lien)} onChangeText={(v) => onChange({ contact_urgence_lien: v })} />
        <Champ label="Tél. mobile" valeur={texte(form.contact_urgence_tel_mobile)} onChangeText={(v) => onChange({ contact_urgence_tel_mobile: v })} clavier="phone-pad" />
        <Champ label="Tél. fixe" valeur={texte(form.contact_urgence_tel_fixe)} onChangeText={(v) => onChange({ contact_urgence_tel_fixe: v })} clavier="phone-pad" />
      </Section>

      <Section titre="Informations bancaires">
        <Champ label="Nom du titulaire du compte" valeur={texte(form.nom_titulaire_compte)} onChangeText={(v) => onChange({ nom_titulaire_compte: v })} />
        <Champ label="IBAN" valeur={texte(form.iban)} onChangeText={(v) => onChange({ iban: v })} />
        <Champ label="BIC" valeur={texte(form.bic)} onChangeText={(v) => onChange({ bic: v })} />
      </Section>

      <Section titre="Informations médicales">
        <Champ label="Numéro de sécurité sociale" valeur={texte(form.numero_secu)} onChangeText={(v) => onChange({ numero_secu: v })} clavier="numeric" />
        <ChampBool label="Personne en situation de handicap" valeur={form.handicap ?? false} onChange={(v) => onChange({ handicap: v })} />
        {form.handicap && (
          <Champ label="Type de handicap" valeur={texte(form.type_handicap)} onChangeText={(v) => onChange({ type_handicap: v })} />
        )}
        <ChampDate
          label="Dernière visite médicale"
          valeur={texte(form.date_derniere_visite_medicale)}
          onChange={(v) => onChange({ date_derniere_visite_medicale: v || null })}
        />
        <ChampBool
          label="Visite médicale renforcée"
          valeur={form.visite_medicale_renforcee ?? false}
          onChange={(v) => onChange({ visite_medicale_renforcee: v })}
        />
        <ChampDate
          label="Prochaine visite médicale"
          valeur={texte(form.prochaine_visite_medicale)}
          onChange={(v) => onChange({ prochaine_visite_medicale: v || null })}
        />
      </Section>

      <Section titre="Autorisations de travail">
        <ChampBool
          label="Travailleur étranger avec autorisation de travail"
          valeur={form.travailleur_etranger ?? false}
          onChange={(v) => onChange({ travailleur_etranger: v })}
        />
        {form.travailleur_etranger && (
          <Champ label="Autorisation de travail" valeur={texte(form.autorisation_travail)} onChangeText={(v) => onChange({ autorisation_travail: v })} />
        )}
      </Section>
    </ScrollView>
  );
}

function OngletContrat({
  profil,
  form,
  onChange,
  popUps,
  membres,
}: {
  profil: Profile;
  form: FormRh;
  onChange: (patch: FormRh) => void;
  popUps: PopUp[];
  membres: Profile[];
}) {
  const modifierProfil = useModifierProfil();

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <Section titre="Contrat">
        <Champ label="Matricule" valeur={texte(form.matricule)} onChangeText={(v) => onChange({ matricule: v })} />
        <ChampDate
          label="Date de début de contrat"
          valeur={texte(form.date_debut_contrat)}
          onChange={(v) => onChange({ date_debut_contrat: v || null })}
        />
        <Champ
          label="Heure de début de contrat"
          valeur={texte(form.heure_debut_contrat).slice(0, 5)}
          onChangeText={(v) => onChange({ heure_debut_contrat: v ? `${v}:00` : null })}
        />
        <ChampSelect
          label="Type de contrat"
          valeur={profil.type_contrat}
          onChange={(v) => modifierProfil.mutate({ id: profil.id, changes: { type_contrat: v as TypeContrat } })}
          options={Object.entries(LIBELLE_TYPE_CONTRAT).map(([value, label]) => ({ value, label }))}
        />
        <Champ
          label="Temps de travail hebdomadaire (heures)"
          valeur={profil.heures_max_semaine != null ? String(profil.heures_max_semaine) : ''}
          onChangeText={(v) => modifierProfil.mutate({ id: profil.id, changes: { heures_max_semaine: v ? Number(v) : null } })}
          clavier="numeric"
        />
        <ChampSelect
          label="Établissement par défaut"
          valeur={texte(form.etablissement_par_defaut_id)}
          onChange={(v) => onChange({ etablissement_par_defaut_id: v || null })}
          options={popUps.map((p) => ({ value: p.id, label: p.nom }))}
        />
        <ChampSelect
          label="Responsable hiérarchique"
          valeur={texte(form.responsable_hierarchique_id)}
          onChange={(v) => onChange({ responsable_hierarchique_id: v || null })}
          options={membres.filter((m) => m.id !== profil.id).map((m) => ({ value: m.id, label: m.nom_complet || m.email }))}
        />
        <Champ
          label="Email SumUp"
          valeur={texte(form.sumup_email)}
          onChangeText={(v) => onChange({ sumup_email: v })}
          clavier="email-address"
        />
      </Section>
    </ScrollView>
  );
}

function OngletPlanification({
  profil,
  lieuxAttribues,
  form,
  onChange,
}: {
  profil: Profile;
  lieuxAttribues: PopUp[];
  form: FormRh;
  onChange: (patch: FormRh) => void;
}) {
  const { data: horaires, isLoading } = useHorairesRecurrents(profil.id);
  const enregistrer = useEnregistrerHoraireRecurrent();

  if (isLoading) return <ActivityIndicator color="#6366F1" />;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <ChampDate
        label="Date de début (l'horaire ci-dessous ne génère aucun créneau avant cette date)"
        valeur={texte(form.date_debut_contrat)}
        onChange={(v) => onChange({ date_debut_contrat: v || null })}
      />
      {lieuxAttribues.length === 0 && (
        <Text style={styles.texteAlerte}>
          Aucun lieu attribué — attribue d'abord cette personne à un pop-up avant de fixer son horaire.
        </Text>
      )}
      <View style={styles.grillePlanification}>
        {JOURS_LABELS.map((label, jourSemaine) => (
          <View key={jourSemaine} style={styles.colonneJour}>
            <HoraireRecurrentJourCard
              profileId={profil.id}
              jourSemaine={jourSemaine}
              label={label}
              regle={horaires?.find((h) => h.jour_semaine === jourSemaine)}
              popUpsDisponibles={lieuxAttribues}
              onEnregistrer={(horaire) => enregistrer.mutate(horaire)}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function OngletConges({ profil }: { profil: Profile }) {
  const { data: conges, isLoading } = useCongesProfile(profil.id);
  const { supprimer } = useGererConges(profil.id);

  // Alert.alert ne fait rien sur web (no-op dans react-native-web) — ce fichier est de toute
  // façon web-only (.web.tsx), donc window.confirm fonctionne réellement.
  const handleSupprimer = (conge: Conge) => {
    const confirme = window.confirm(
      `Supprimer ${conge.type === 'conge' ? 'ce congé' : 'cette indisponibilité'} de ${profil.nom_complet || profil.email} ? Cette action est irréversible.`,
    );
    if (confirme) supprimer.mutate(conge);
  };

  if (isLoading) return <ActivityIndicator color="#6366F1" />;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      {(conges ?? []).length === 0 && <Text style={styles.texteAlerte}>Aucun congé/indisponibilité déclaré.</Text>}
      {(conges ?? []).map((c) => (
        <View key={c.id} style={styles.ligneConge}>
          <Text style={styles.ligneCongeTexte}>
            {c.date_debut}{c.date_fin !== c.date_debut ? ` → ${c.date_fin}` : ''}
            {c.heure_debut && c.heure_fin ? ` · ${formatHeure(c.heure_debut)}-${formatHeure(c.heure_fin)}` : ' · journée entière'}
          </Text>
          <View style={styles.ligneCongeDroite}>
            <Text style={styles.ligneCongeType}>{c.type === 'conge' ? 'Congé' : 'Indisponibilité'}</Text>
            <Pressable onPress={() => handleSupprimer(c)} hitSlop={8} style={styles.boutonSupprimerConge}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function OngletDocuments({ profil }: { profil: Profile }) {
  const { data: documents, isLoading } = useDocumentsEmploye(profil.id);
  const uploader = useUploaderDocumentEmploye(profil.id);
  const supprimer = useSupprimerDocumentEmploye(profil.id);
  const utilisateur = useAuthStore((s) => s.profile);

  const choisirFichier = (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier || !utilisateur) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const base64 = String(lecteur.result).split(',')[1] ?? '';
      uploader.mutate({
        profileId: profil.id,
        uploadedBy: utilisateur.id,
        nomFichier: fichier.name,
        base64,
        contentType: fichier.type || 'application/octet-stream',
      });
    };
    lecteur.readAsDataURL(fichier);
    e.target.value = '';
  };

  const ouvrirDocument = async (chemin: string) => {
    const url = await obtenirUrlDocumentEmploye(chemin);
    window.open(url, '_blank');
  };

  if (isLoading) return <ActivityIndicator color="#6366F1" />;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <label style={{ display: 'inline-block', alignSelf: 'flex-start' }}>
        <View style={styles.boutonAjoutDocument}>
          <Text style={styles.boutonAjoutDocumentTexte}>{uploader.isPending ? 'Envoi...' : '+ Ajouter un document'}</Text>
        </View>
        <input type="file" onChange={choisirFichier} style={{ display: 'none' }} />
      </label>

      {(documents ?? []).length === 0 && <Text style={styles.texteAlerte}>Aucun document.</Text>}
      {(documents ?? []).map((d) => (
        <View key={d.id} style={styles.ligneDocument}>
          <Pressable onPress={() => ouvrirDocument(d.chemin_stockage)} style={{ flex: 1 }}>
            <Text style={styles.ligneDocumentTexte}>{d.nom_fichier}</Text>
          </Pressable>
          <Pressable onPress={() => supprimer.mutate(d)}>
            <Text style={styles.ligneDocumentSupprimer}>Supprimer</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

// --- Onglet Droits (Stock suit l'attribution existante ; Finance/Calendrier sont de nouveaux
// droits, éventuellement scopés à un seul pop-up — cf. migration 0034) ---

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
      <View style={styles.chipsRowDroits}>
        {droits.map((d) => (
          <View key={d.id} style={styles.chipDroit}>
            <Text style={styles.chipDroitTexte}>{nomPopUpOuTous(popUps, d.pop_up_id)}</Text>
            <Pressable onPress={() => onSupprimer(d.id)}>
              <Ionicons name="close" size={12} color="#4338CA" />
            </Pressable>
          </View>
        ))}
        {droits.length === 0 && <Text style={styles.texteAlerte}>Aucun accès.</Text>}
      </View>
      {!dejaTous && (
        <View style={styles.ligneAjoutDroit}>
          <View style={{ flex: 1 }}>
            <select
              value={choix}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setChoix(e.target.value)}
              style={styles.champInputWeb as unknown as React.CSSProperties}
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
          <Pressable onPress={ajouter} style={styles.boutonAjoutDroit}>
            <Text style={styles.boutonAjoutDroitTexte}>Ajouter</Text>
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
        <View style={styles.chipsRowDroits}>
          {popUps
            .filter((p) => lieuxAttribuesIds.has(p.id))
            .map((p) => (
              <View key={p.id} style={styles.chipDroit}>
                <Text style={styles.chipDroitTexte}>{p.nom}</Text>
                <Pressable onPress={() => retirerAffectation.mutate({ profileId: profil.id, popUpId: p.id })}>
                  <Ionicons name="close" size={12} color="#4338CA" />
                </Pressable>
              </View>
            ))}
          {lieuxAttribuesIds.size === 0 && <Text style={styles.texteAlerte}>Aucun lieu attribué.</Text>}
        </View>
        {lieuxDisponibles.length > 0 && (
          <View style={styles.ligneAjoutDroit}>
            <View style={{ flex: 1 }}>
              <select
                value={popUpAjoutLieu}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setPopUpAjoutLieu(e.target.value)}
                style={styles.champInputWeb as unknown as React.CSSProperties}
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
              style={styles.boutonAjoutDroit}
            >
              <Text style={styles.boutonAjoutDroitTexte}>Ajouter</Text>
            </Pressable>
          </View>
        )}
      </Section>

      <Section titre="Calendrier">
        <Text style={styles.texteAlerte}>
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
    </ScrollView>
  );
}

// --- Panneau détail (droite) ---

function PanneauDetailMembre({ profil, popUps, membres, lieuxAttribues }: {
  profil: Profile;
  popUps: PopUp[];
  membres: Profile[];
  lieuxAttribues: PopUp[];
}) {
  const [onglet, setOnglet] = useState<Onglet>('infos');
  const { data: informationsRh } = useInformationsRh(profil.id);
  const enregistrerRh = useEnregistrerInformationsRh();
  const [form, setForm] = useState<FormRh>({});

  useEffect(() => {
    setForm(informationsRh ?? {});
  }, [informationsRh, profil.id]);

  const patcher = (patch: FormRh) => setForm((f) => ({ ...f, ...patch }));
  const enregistrer = () => enregistrerRh.mutate({ ...form, profile_id: profil.id });

  return (
    <View style={styles.panneau}>
      <View style={styles.onglets}>
        {ONGLETS.map((o) => (
          <Pressable key={o.value} onPress={() => setOnglet(o.value)} style={[styles.onglet, onglet === o.value && styles.ongletActif]}>
            <Text style={[styles.ongletTexte, onglet === o.value && styles.ongletTexteActif]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      {(onglet === 'infos' || onglet === 'contrat' || onglet === 'planification') && (
        <View style={styles.panneauActions}>
          <Pressable onPress={enregistrer} style={styles.boutonEnregistrer} disabled={enregistrerRh.isPending}>
            <Text style={styles.boutonEnregistrerTexte}>{enregistrerRh.isPending ? 'Enregistrement...' : 'Enregistrer'}</Text>
          </Pressable>
        </View>
      )}

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20 }}>
        {onglet === 'infos' && <OngletInfosPersonnelles profil={profil} lieuxAttribues={lieuxAttribues} form={form} onChange={patcher} />}
        {onglet === 'contrat' && <OngletContrat profil={profil} form={form} onChange={patcher} popUps={popUps} membres={membres} />}
        {onglet === 'planification' && (
          <OngletPlanification profil={profil} lieuxAttribues={lieuxAttribues} form={form} onChange={patcher} />
        )}
        {onglet === 'conges' && <OngletConges profil={profil} />}
        {onglet === 'documents' && <OngletDocuments profil={profil} />}
        {onglet === 'droits' && <OngletDroits profil={profil} popUps={popUps} />}
      </View>
    </View>
  );
}

// --- Modale "Nouvel employé" ---

function ModalNouveauMembre({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [nomComplet, setNomComplet] = useState('');
  const [role, setRole] = useState<Role>('employe');
  const [typeContrat, setTypeContrat] = useState<TypeContrat>('employe');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async () => {
    if (!email || !nomComplet) {
      setErreur('Email et nom complet requis.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await inviterEmploye({ email, nomComplet, role, typeContrat });
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de l\'invitation.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <View style={styles.modalFond}>
      <View style={styles.modalBoite}>
        <Text style={styles.modalTitre}>Nouvel employé</Text>
        <Champ label="Nom complet" valeur={nomComplet} onChangeText={setNomComplet} />
        <Champ label="Email" valeur={email} onChangeText={setEmail} clavier="email-address" />
        <ChampSelect
          label="Rôle"
          valeur={role}
          onChange={(v) => setRole(v as Role)}
          options={[
            { value: 'employe', label: 'Employé' },
            { value: 'admin', label: 'Admin' },
          ]}
        />
        <ChampSelect
          label="Type de contrat"
          valeur={typeContrat}
          onChange={(v) => setTypeContrat(v as TypeContrat)}
          options={Object.entries(LIBELLE_TYPE_CONTRAT).map(([value, label]) => ({ value, label }))}
        />
        {erreur && <Text style={styles.texteErreur}>{erreur}</Text>}
        <View style={styles.modalBoutons}>
          <Pressable onPress={onClose} style={styles.boutonAnnuler}>
            <Text style={styles.boutonAnnulerTexte}>Annuler</Text>
          </Pressable>
          <Pressable onPress={envoyer} style={styles.boutonEnregistrer} disabled={envoi}>
            <Text style={styles.boutonEnregistrerTexte}>{envoi ? 'Envoi...' : 'Inviter'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// --- Écran principal ---

export default function EquipeWebScreen() {
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations, isLoading: chargementAffectations } = useAffectationsPopUp();

  const [recherche, setRecherche] = useState('');
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [modalOuverte, setModalOuverte] = useState(false);

  const mapAffectations = construireMapAffectations(affectations ?? []);
  const membres = (profils ?? []).filter((p) =>
    `${p.nom_complet} ${p.email}`.toLowerCase().includes(recherche.toLowerCase()),
  );
  const selection = (profils ?? []).find((p) => p.id === selectionId) ?? null;

  if (chargementProfils || chargementPopUps || chargementAffectations) {
    return (
      <View style={[styles.ecran, styles.centre]}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.ecran}>
      <EnteteMenu titre="Équipe" />
      <View style={styles.corps}>
        <View style={styles.liste}>
          <View style={styles.listeEntete}>
            <View style={styles.rechercheWrapper}>
              <Ionicons name="search-outline" size={16} color="#94A3B8" style={styles.rechercheIcone} />
              <input
                placeholder="Rechercher par nom ou email"
                value={recherche}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRecherche(e.target.value)}
                style={styles.rechercheInput as unknown as React.CSSProperties}
              />
            </View>
            <Pressable onPress={() => setModalOuverte(true)} style={styles.boutonNouveau}>
              <Text style={styles.boutonNouveauTexte}>+ Nouvel employé</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {membres.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => setSelectionId(m.id)}
                style={[styles.ligneMembre, selectionId === m.id && styles.ligneMembreActive]}
              >
                <AvatarInitiales nom={m.nom_complet} email={m.email} couleur={m.couleur} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ligneMembreNom}>{m.nom_complet || m.email}</Text>
                  <BadgeRole role={m.role} typeContrat={m.type_contrat} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {selection ? (
          <PanneauDetailMembre
            key={selection.id}
            profil={selection}
            popUps={popUps ?? []}
            membres={profils ?? []}
            lieuxAttribues={popUpsAttribues(selection, mapAffectations, popUps ?? [])}
          />
        ) : (
          <View style={[styles.panneau, styles.centre]}>
            <Ionicons name="people-outline" size={40} color="#CBD5E1" />
            <Text style={styles.texteAlerte}>Sélectionnez un collaborateur dans la liste.</Text>
          </View>
        )}
      </View>

      {modalOuverte && <ModalNouveauMembre onClose={() => setModalOuverte(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  centre: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  corps: { flex: 1, flexDirection: 'row' },

  liste: { width: 320, borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: 'white' },
  listeEntete: { padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  rechercheWrapper: { position: 'relative', justifyContent: 'center' },
  rechercheIcone: { position: 'absolute', left: 12, zIndex: 1 },
  rechercheInput: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingLeft: 36,
    paddingRight: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 13,
    width: '100%',
  },
  boutonNouveau: { alignItems: 'center', borderRadius: 9999, backgroundColor: '#4F46E5', paddingVertical: 10 },
  boutonNouveauTexte: { fontSize: 13, fontWeight: '600', color: 'white' },
  ligneMembre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 8,
    marginBottom: 2,
    borderRadius: 14,
  },
  ligneMembreActive: { backgroundColor: '#EEF2FF' },
  ligneMembreNom: { fontSize: 14.5, fontWeight: '600', color: '#0F172A' },
  ligneMembreDetail: { fontSize: 12, color: '#94A3B8' },

  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarTexte: { fontWeight: '700', color: 'white' },

  badgesLigne: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  badgeContrat: { borderRadius: 9999, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2 },
  badgeContratTexte: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  badgeAdmin: { borderRadius: 9999, backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2 },
  badgeAdminTexte: { fontSize: 11, fontWeight: '600', color: '#4338CA' },

  panneau: { flex: 1 },
  // Bloc identité (avatar/nom/email/badge/lieu) : affiché uniquement dans l'onglet Informations
  // personnelles, cf. OngletInfosPersonnelles — plus une bannière persistante au-dessus des onglets.
  identiteBloc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  panneauNom: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  panneauEmail: { fontSize: 13, color: '#64748B' },
  panneauMetaLigne: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  panneauMetaTexte: { fontSize: 12, color: '#64748B' },
  panneauActions: { alignItems: 'flex-end', paddingHorizontal: 24, marginTop: 12 },

  onglets: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 9999,
    padding: 4,
    marginHorizontal: 24,
    marginTop: 20,
    gap: 2,
  },
  onglet: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999, alignItems: 'center' },
  ongletActif: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  ongletTexte: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  ongletTexteActif: { fontWeight: '700', color: '#4F46E5' },

  section: {
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitreLigne: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIconeBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  sectionTitre: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  sectionGrille: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },

  champBloc: { width: 240, marginBottom: 4 },
  champLabel: { marginBottom: 6, fontSize: 12, fontWeight: '600', color: '#475569' },
  champInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: '#1E293B',
  },
  champInputWeb: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 13.5,
    color: '#1E293B',
    width: '100%',
  },
  champBoolLigne: {
    width: 240,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },

  texteAlerte: { marginTop: 8, fontSize: 13.5, color: '#94A3B8', textAlign: 'center' },

  grillePlanification: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colonneJour: { flexGrow: 1, flexBasis: 140, maxWidth: 200 },

  ligneConge: {
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  ligneCongeTexte: { fontSize: 13, color: '#1E293B' },
  ligneCongeDroite: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ligneCongeType: { fontSize: 12, color: '#94A3B8' },
  boutonSupprimerConge: { padding: 2 },

  chipsRowDroits: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chipDroit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipDroitTexte: { fontSize: 12, fontWeight: '600', color: '#4338CA' },
  ligneAjoutDroit: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  boutonAjoutDroit: { borderRadius: 10, backgroundColor: '#4F46E5', paddingHorizontal: 14, paddingVertical: 9 },
  boutonAjoutDroitTexte: { fontSize: 13, fontWeight: '600', color: 'white' },

  boutonAjoutDocument: { alignSelf: 'flex-start', marginTop: 12, marginBottom: 12, alignItems: 'center', borderRadius: 9999, backgroundColor: '#4F46E5', paddingVertical: 10, paddingHorizontal: 16 },
  boutonAjoutDocumentTexte: { fontSize: 13, fontWeight: '600', color: 'white' },
  ligneDocument: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  ligneDocumentTexte: { fontSize: 13, color: '#1E293B' },
  ligneDocumentSupprimer: { fontSize: 12, fontWeight: '600', color: '#DC2626' },

  boutonEnregistrer: { borderRadius: 9999, backgroundColor: '#4F46E5', paddingHorizontal: 20, paddingVertical: 10 },
  boutonEnregistrerTexte: { fontSize: 13, fontWeight: '700', color: 'white' },

  modalFond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.4)' },
  modalBoite: {
    width: 360,
    borderRadius: 24,
    backgroundColor: 'white',
    padding: 28,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  modalTitre: { marginBottom: 16, fontSize: 18, fontWeight: '800', color: '#0F172A' },
  modalBoutons: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  boutonAnnuler: { borderRadius: 9999, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 10 },
  boutonAnnulerTexte: { fontSize: 13, fontWeight: '600', color: '#475569' },
  texteErreur: { marginTop: 8, fontSize: 12, color: '#DC2626' },
});
