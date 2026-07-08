import { useEffect, useMemo, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { PanResponder, Text, View } from 'react-native';

/** Curseur 0-100% sans dépendance native : suit le doigt via PanResponder, ne notifie qu'au relâché. */
export function GlisseurPourcentage({
  valeur,
  onChange,
}: {
  valeur: number;
  onChange: (valeur: number) => void;
}) {
  const [largeur, setLargeur] = useState(0);
  const [valeurAffichee, setValeurAffichee] = useState(valeur);

  useEffect(() => setValeurAffichee(valeur), [valeur]);

  const calculer = (x: number) => {
    if (largeur === 0) return valeurAffichee;
    const ratio = Math.min(1, Math.max(0, x / largeur));
    return Math.round(ratio * 100);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          setValeurAffichee(calculer(evt.nativeEvent.locationX));
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          setValeurAffichee(calculer(evt.nativeEvent.locationX));
        },
        onPanResponderRelease: (evt: GestureResponderEvent) => {
          const v = calculer(evt.nativeEvent.locationX);
          setValeurAffichee(v);
          onChange(v);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }),
    [largeur],
  );

  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-slate-500">Remplissage</Text>
        <Text className="text-lg font-bold text-slate-900">{valeurAffichee}%</Text>
      </View>
      <View
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        className="h-10 justify-center rounded-full bg-slate-100"
        {...panResponder.panHandlers}
      >
        <View
          className="h-10 rounded-full bg-indigo-500"
          style={{ width: `${valeurAffichee}%` }}
        />
        <View
          className="absolute h-6 w-6 rounded-full border-2 border-indigo-600 bg-white"
          style={{ left: `${valeurAffichee}%`, marginLeft: -12 }}
        />
      </View>
    </View>
  );
}
