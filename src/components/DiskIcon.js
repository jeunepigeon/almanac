// Icône disquette D1 (outline simple) pour "Exporter"
// SVG-like en React Native avec View
import { View, StyleSheet } from 'react-native';

export default function DiskIcon({ size = 18, color = '#EDEDED' }) {
  const s = size;
  const bw = 1.3; // bordure
  return (
    <View style={{ width: s, height: s, justifyContent: 'center', alignItems: 'center' }}>
      {/* Corps carré */}
      <View style={{
        width: s * 0.9,
        height: s * 0.9,
        borderWidth: bw,
        borderColor: color,
        borderRadius: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
      }}>
        {/* Volet haut */}
        <View style={{
          width: s * 0.55,
          height: s * 0.25,
          borderWidth: bw * 0.9,
          borderColor: color,
          marginTop: 1,
          position: 'relative',
          justifyContent: 'center',
          alignItems: 'flex-end',
        }}>
          {/* Fente interne (vertical ligne droite) */}
          <View style={{
            width: bw * 0.9,
            height: s * 0.2,
            backgroundColor: color,
            marginRight: s * 0.14,
          }} />
        </View>
        {/* Étiquette */}
        <View style={{
          width: s * 0.65,
          height: s * 0.45,
          borderWidth: bw * 0.8,
          borderColor: color,
          marginTop: s * 0.07,
        }} />
      </View>
    </View>
  );
}
