import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import type { ResultatPointage } from '@/api/pointages';
import { usePointer } from '@/hooks/usePointages';

// Contenu des QR imprimés depuis le Hub (Pointage) : "pimpit-pointage:<code secret>".
const PREFIXE_QR = 'pimpit-pointage:';

type Etat =
  | { etape: 'scan' }
  | { etape: 'verification' }
  | { etape: 'ok'; resultat: ResultatPointage }
  | { etape: 'erreur'; message: string };

/** Pointage arrivée/départ : scan du QR affiché au pop-up, puis position GPS envoyée au serveur
 * qui vérifie les deux (cf. migration 0130) — arrivée ou départ est déduit côté serveur. */
export default function PointageScreen() {
  const [permissionCamera, demanderPermissionCamera] = useCameraPermissions();
  const [etat, setEtat] = useState<Etat>({ etape: 'scan' });
  // onBarcodeScanned se déclenche en rafale tant que le QR est dans le cadre : verrou synchrone
  // (un state ne serait mis à jour qu'au rendu suivant).
  const verrou = useRef(false);
  const pointerMutation = usePointer();

  const surScan = async ({ data }: BarcodeScanningResult) => {
    if (verrou.current) return;
    verrou.current = true;
    setEtat({ etape: 'verification' });
    try {
      if (!data.startsWith(PREFIXE_QR)) throw new Error("Ce QR code n'est pas un QR de pointage Pimp It.");
      // Jamais bloquant (retour utilisateur du 2026-11-02) : sans position, le pointage est quand
      // même enregistré, le serveur le marque juste "GPS pas OK" pour l'écran Pointages.
      let position: Location.LocationObject | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        }
      } catch {
        position = null;
      }
      const resultat = await pointerMutation.mutateAsync({
        code: data.slice(PREFIXE_QR.length),
        lat: position?.coords.latitude ?? null,
        lon: position?.coords.longitude ?? null,
        positionSimulee: position?.mocked ?? false,
      });
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
            La caméra sert à scanner le QR code de pointage affiché au pop-up.
          </Text>
          <Pressable onPress={demanderPermissionCamera} className="rounded-2xl bg-indigo-600 px-6 py-3.5">
            <Text className="font-bold text-white">Autoriser la caméra</Text>
          </Pressable>
        </View>
      ) : etat.etape === 'scan' ? (
        <View className="flex-1 px-4 pb-8">
          <Text className="mb-3 text-center text-sm text-slate-500">
            Scanne le QR code du pop-up — à l’arrivée comme au départ.
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
      ) : etat.etape === 'verification' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
          <Text className="mt-3 text-sm text-slate-500">Vérification de ta position…</Text>
        </View>
      ) : etat.etape === 'ok' ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <Ionicons name="checkmark" size={44} color="#059669" />
          </View>
          <Text className="text-2xl font-bold text-slate-900">
            {etat.resultat.type === 'arrivee' ? 'Arrivée' : 'Départ'} {etat.resultat.deja_fait ? 'déjà ' : ''}pointé{etat.resultat.type === 'arrivee' ? 'e' : ''}
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
          <Text className="mb-1 text-xl font-bold text-slate-900">Pointage refusé</Text>
          <Text className="text-center text-sm text-slate-600">{etat.message}</Text>
          <Pressable onPress={recommencer} className="mt-8 rounded-2xl bg-indigo-600 px-8 py-3.5">
            <Text className="font-bold text-white">Réessayer</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
