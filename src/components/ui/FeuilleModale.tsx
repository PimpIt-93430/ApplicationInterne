import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { Animated, PanResponder, Pressable, View } from 'react-native';

/** Feuille modale ancrée en bas d'écran : se ferme en tapant le fond assombri ou en glissant
 * la poignée vers le bas (au lieu de forcer à passer par un bouton "Fermer"/"Annuler"). */
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
