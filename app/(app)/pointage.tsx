import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import type { ResultatPointage } from '@/api/pointages';
import { usePointer } from '@/hooks/usePointages';
import { useAuthStore } from '@/store/useAuthStore';

// Contenu des QR imprimés depuis le Hub (Pointage) : "pimpit-pointage:<code secret>".
const PREFIXE_QR = 'pimpit-pointage:';

type Etat =
  | { etape: 'scan' }
  | { etape: 'photo'; code: string }
  | { etape: 'envoi' }
  | { etape: 'ok'; resultat: ResultatPointage }
  | { etape: 'erreur'; message: string };

/** Pointage arrivée/départ (retour utilisateur du 2026-11-02, sans GPS) : scan du QR affiché au
 * pop-up, puis photo de la caisse — c'est la photo qui prouve que la personne est sur place,
 * visible par l'admin/le manager dans l'écran Pointages. Arrivée ou départ est déduit côté serveur. */
export default function PointageScreen() {
  // Vrai compte connecté (pas le profil d'aperçu admin) : la photo doit aller dans le dossier de
  // auth.uid(), vérifié côté serveur.
  const profile = useAuthStore((s) => s.profile);
  const [permissionCamera, demanderPermissionCamera] = useCameraPermissions();
  const [etat, setEtat] = useState<Etat>({ etape: 'scan' });
  // onBarcodeScanned se déclenche en rafale tant que le QR est dans le cadre : verrou synchrone
  // (un state ne serait mis à jour qu'au rendu suivant).
  const verrou = useRef(false);
  const refCamera = useRef<CameraView>(null);
  const pointerMutation = usePointer();

  const surScan = ({ data }: BarcodeScanningResult) => {
    if (verrou.current) return;
    verrou.current = true;
    if (!data.startsWith(PREFIXE_QR)) {
      setEtat({ etape: 'erreur', message: "Ce QR code n'est pas un QR de pointage Pimp It." });
      return;
    }
    setEtat({ etape: 'photo', code: data.slice(PREFIXE_QR.length) });
  };

  const prendrePhoto = async (code: string) => {
    if (!profile) return;
    try {
      // Qualité basse : la photo sert juste à voir la caisse, pas besoin de plusieurs Mo par pointage.
      const photo = await refCamera.current?.takePictureAsync({ base64: true, quality: 0.3 });
      if (!photo?.base64) throw new Error("La photo n'a pas pu être prise.");
      setEtat({ etape: 'envoi' });
      const resultat = await pointerMutation.mutateAsync({ code, profileId: profile.id, photoBase64: photo.base64 });
      setEtat({ etape: 'ok', resultat });
    } catch (e) {
      setEtat({ etape: 'erreur', message: e instanceof Error ? e.message : 'Pointage impossible.' });
    }
  };

  const recommencer = () => {
    verrou.current = false;
    setEtat({ etape: 'scan' });
  };

  return (
    <View className="flex-1 bg-white">
      <EnteteRetour titre="Pointer" onRetour={() => router.back()} />

      {!permissionCamera ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
      ) : !permissionCamera.granted ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="mb-4 text-center text-slate-600">
            La caméra sert à scanner le QR code de pointage du pop-up et à prendre la caisse en photo.
          </Text>
          <Pressable onPress={demanderPermissionCamera} className="rounded-2xl bg-indigo-600 px-6 py-3.5">
            <Text className="font-bold text-white">Autoriser la caméra</Text>
          </Pressable>
        </View>
      ) : etat.etape === 'scan' ? (
        <View className="flex-1 px-4 pb-8">
          <Text className="mb-3 text-center text-sm text-slate-500">
            1/2 · Scanne le QR code du pop-up — à l’arrivée comme au départ.
          </Text>
          <View className="flex-1 overflow-hidden rounded-3xl bg-black">
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={surScan}
            />
          </View>
        </View>
      ) : etat.etape === 'photo' ? (
        <View className="flex-1 px-4 pb-8">
          <Text className="mb-3 text-center text-sm font-semibold text-slate-700">
            2/2 · Prends la caisse en photo
          </Text>
          <View className="flex-1 overflow-hidden rounded-3xl bg-black">
            <CameraView ref={refCamera} style={{ flex: 1 }} facing="back" />
          </View>
          <Pressable
            onPress={() => prendrePhoto(etat.code)}
            className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4"
          >
            <Ionicons name="camera" size={20} color="white" />
            <Text className="text-base font-bold text-white">Prendre la photo</Text>
          </Pressable>
        </View>
      ) : etat.etape === 'envoi' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
          <Text className="mt-3 text-sm text-slate-500">Envoi du pointage…</Text>
        </View>
      ) : etat.etape === 'ok' ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <Ionicons name="checkmark" size={44} color="#059669" />
          </View>
          <Text className="text-2xl font-bold text-slate-900">
            {etat.resultat.type === 'arrivee' ? 'Arrivée' : 'Départ'} {etat.resultat.deja_fait ? 'déjà ' : ''}pointé
            {etat.resultat.type === 'arrivee' ? 'e' : ''}
          </Text>
          <Text className="mt-1 text-base text-slate-600">
            {new Date(etat.resultat.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
            {etat.resultat.pop_up_nom}
          </Text>
          <Pressable onPress={() => router.back()} className="mt-8 rounded-2xl bg-indigo-600 px-8 py-3.5">
            <Text className="font-bold text-white">Terminé</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-red-100">
            <Ionicons name="close" size={44} color="#DC2626" />
          </View>
          <Text className="mb-1 text-xl font-bold text-slate-900">Pointage impossible</Text>
          <Text className="text-center text-sm text-slate-600">{etat.message}</Text>
          <Pressable onPress={recommencer} className="mt-8 rounded-2xl bg-indigo-600 px-8 py-3.5">
            <Text className="font-bold text-white">Réessayer</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
