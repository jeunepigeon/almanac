// Icône "Exporter / Télécharger" (E2) : flèche bas pleine + barre horizontale dessous
// Style universel "download"
import { View, StyleSheet } from 'react-native';

export default function ExportIcon({ size = 18, color = '#EDEDED' }) {
  const s = size;
  const stem = s * 0.08;      // épaisseur du trait vertical
  const headSize = s * 0.5;   // largeur de la tête de flèche
  const barHeight = s * 0.12; // barre dessous
  const padBottom = s * 0.1;

  return (
    <View style={{ width: s, height: s, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: padBottom }}>
      {/* Tige verticale */}
      <View style={{
        position: 'absolute',
        top: s * 0.05,
        width: stem,
        height: s * 0.55,
        backgroundColor: color,
        borderRadius: stem / 2,
      }} />
      {/* Tête triangle vers le bas */}
      <View style={{
        position: 'absolute',
        top: s * 0.4,
        width: 0, height: 0,
        borderLeftWidth: headSize / 2,
        borderRightWidth: headSize / 2,
        borderTopWidth: headSize * 0.65,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: color,
      }} />
      {/* Barre bas */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        width: s * 0.75,
        height: barHeight,
        backgroundColor: color,
        borderRadius: barHeight / 2,
      }} />
    </View>
  );
}
