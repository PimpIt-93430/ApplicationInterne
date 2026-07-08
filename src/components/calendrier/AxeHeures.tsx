/** @jsxImportSource react */
import { StyleSheet, Text, View } from 'react-native';

import { HAUTEUR_ENTETE, LARGEUR_AXE, PX_PAR_HEURE } from './timelineConstants';

export function AxeHeures({ heureOuverture, heureFermeture }: { heureOuverture: string; heureFermeture: string }) {
  const heureDebut = Number(heureOuverture.split(':')[0]);
  const heureFin = Number(heureFermeture.split(':')[0]);
  const heures = Array.from({ length: heureFin - heureDebut + 1 }, (_, i) => heureDebut + i);

  return (
    <View style={{ width: LARGEUR_AXE }}>
      <View style={{ height: HAUTEUR_ENTETE }} />
      <View>
        {heures.map((h) => (
          <View key={h} style={[styles.ligne, { top: (h - heureDebut) * PX_PAR_HEURE }]}>
            <Text style={styles.texte}>{String(h).padStart(2, '0')}h</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { position: 'absolute', right: 6, transform: [{ translateY: -7 }] },
  texte: { fontSize: 11, color: '#94A3B8' },
});
