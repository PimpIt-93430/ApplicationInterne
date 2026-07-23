import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { Animated, PanResponder, Platform, Pressable, Text, View } from 'react-native';

/** Sur mobile : feuille ancrée en bas d'écran, se ferme en tapant le fond assombri ou en glissant
 * la poignée vers le bas. Sur ordinateur, une feuille pleine largeur ancrée en bas d'un écran de
 * 1500+ px de large n'a plus aucun sens (ça donne une barre étirée collée en bas) — dialogue
 * centré classique à la place, avec une croix pour fermer (pas de geste de glissement à la
 * souris). */
export function FeuilleModale({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e: GestureResponderEvent, geste: PanResponderGestureState) =>
        Math.abs(geste.dy) > 6,
      onPanResponderMove: (_e, geste) => {
        if (geste.dy > 0) translateY.setValue(geste.dy);
      },
      onPanResponderRelease: (_e, geste) => {
        // Un simple tap (quasiment aucun mouvement) ferme aussi la feuille : toute la ligne de la
        // poignée est cliquable, pas seulement le petit trait gris qu'il faudrait viser précisément.
        if (Math.abs(geste.dy) < 6 && Math.abs(geste.dx) < 6) {
          onClose();
        } else if (geste.dy > 100 || geste.vy > 0.8) {
          Animated.timing(translateY, { toValue: 800, duration: 180, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  if (Platform.OS === 'web') {
    return (
      <View className="absolute inset-0 items-center justify-center p-6">
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/40" />
        <View className="max-h-[85vh] w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-xl">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="absolute right-4 top-4 z-10 h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
          >
            <Text className="text-lg text-slate-400">×</Text>
          </Pressable>
          {children}
        </View>
      </View>
    );
  }

  return (
    <View className="absolute inset-0 justify-end">
      <Pressable onPress={onClose} className="absolute inset-0 bg-black/40" />
      <Animated.View
        style={{ transform: [{ translateY }] }}
        className="max-h-[85%] rounded-t-3xl bg-white p-5 pb-8"
      >
        <View {...panResponder.panHandlers} className="items-center pb-4 pt-3">
          <View className="h-1.5 w-12 rounded-full bg-slate-200" />
        </View>
        {children}
      </Animated.View>
    </View>
  );
}
