// Carte substance V2b partagée : utilisée dans SubstanceSelectModal, ExportWizard,
// ImportWizard, RestoreWizard. Animation bubble courte + nombres bold.

import { useRef } from 'react';
import { Animated, View, Pressable, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const DIM_BORDER = '#2F2F2F';
const DIM_TEXT = '#3A3A3A';

export default function SubCard({ sub, isChecked, onToggle, stats }) {
  const scale = useRef(new Animated.Value(1)).current;

  const triggerBubble = () => {
    scale.setValue(0.96);
    Animated.spring(scale, {
      toValue: 1, useNativeDriver: true, speed: 30, bounciness: 14,
    }).start();
  };

  const handlePress = () => {
    haptics.light();
    triggerBubble();
    onToggle();
  };

  const borderColor = isChecked ? sub.color : DIM_BORDER;
  const nameColor = isChecked ? theme.colors.text : DIM_TEXT;
  const statsColor = isChecked ? theme.colors.textMuted : DIM_TEXT;
  const iconColor = isChecked ? sub.color : DIM_TEXT;

  const consCount = stats?.consCount ?? 0;
  const days = stats?.days ?? 0;

  return (
    <View style={styles.outer}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable onPress={handlePress} style={[styles.card, { borderColor }]}>
          <View style={[styles.iconWrap, { borderColor: iconColor }]}>
            <View style={[styles.iconDot, { backgroundColor: iconColor }]} />
          </View>
          <View style={styles.middle}>
            <Text style={[styles.name, { color: nameColor }]} numberOfLines={1}>{sub.name}</Text>
            <Text style={[styles.stats, { color: statsColor }]}>
              <Text style={styles.bold}>{consCount}</Text>
              {` prises · `}
              <Text style={styles.bold}>{days}</Text>
              {' jours'}
            </Text>
          </View>
          {isChecked && (
            <MaterialCommunityIcons name="check" size={22} color={sub.color} style={styles.check} />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    gap: 12,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  iconDot: { width: 12, height: 12, borderRadius: 6 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },
  stats: { fontSize: 11, fontWeight: '400', marginTop: 2, letterSpacing: 0.5, textAlign: 'center' },
  bold: { fontWeight: '700' },
  check: { marginLeft: 4 },
});
