// Icône "Importer" (I4) : 2 flèches horizontales opposées (↔ échange)
import { View, StyleSheet } from 'react-native';

export default function ImportIcon({ size = 18, color = '#EDEDED' }) {
  const s = size;
  const stem = s * 0.08;
  const headSize = s * 0.3;
  const gap = s * 0.14;
  const arrowLength = s * 0.75;

  // Flèche vers la gauche (ligne du haut)
  // Flèche vers la droite (ligne du bas)
  return (
    <View style={{ width: s, height: s, justifyContent: 'center', alignItems: 'center' }}>
      {/* FLÈCHE HAUT : vers la gauche */}
      <View style={{
        position: 'absolute',
        top: s * 0.5 - gap - stem,
        left: s * 0.5 - arrowLength / 2,
        width: arrowLength,
        height: stem,
        backgroundColor: color,
        borderRadius: stem / 2,
      }} />
      {/* Tête triangle gauche (pointe vers la gauche) */}
      <View style={{
        position: 'absolute',
        top: s * 0.5 - gap - stem / 2 - headSize * 0.4,
        left: s * 0.5 - arrowLength / 2 - headSize * 0.1,
        width: 0, height: 0,
        borderTopWidth: headSize * 0.4,
        borderBottomWidth: headSize * 0.4,
        borderRightWidth: headSize * 0.5,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderRightColor: color,
      }} />

      {/* FLÈCHE BAS : vers la droite */}
      <View style={{
        position: 'absolute',
        top: s * 0.5 + gap,
        left: s * 0.5 - arrowLength / 2,
        width: arrowLength,
        height: stem,
        backgroundColor: color,
        borderRadius: stem / 2,
      }} />
      {/* Tête triangle droite (pointe vers la droite) */}
      <View style={{
        position: 'absolute',
        top: s * 0.5 + gap + stem / 2 - headSize * 0.4,
        right: s * 0.5 - arrowLength / 2 - headSize * 0.1,
        width: 0, height: 0,
        borderTopWidth: headSize * 0.4,
        borderBottomWidth: headSize * 0.4,
        borderLeftWidth: headSize * 0.5,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }} />
    </View>
  );
}
