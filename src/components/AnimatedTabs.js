// 1.51 — Onglets Calendrier · Recherche · Stats, communs à Global et aux substances (même code).
// Le trait blanc et la couleur des textes suivent le doigt pendant le glisser (et le défilement
// automatique quand on touche un onglet éloigné) : ils sont calculés depuis `progress`, la position
// du défilement principal (0 = liste, 1 = Calendrier, 2 = Recherche, 3 = Stats).
import { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { theme } from '../theme';

const LABELS = ['Calendrier', 'Recherche', 'Stats'];

export default function AnimatedTabs({ progress, onPress, dimmed = false }) {
  const [lay, setLay] = useState([null, null, null]); // { x, w } de chaque onglet
  const ready = lay.every(Boolean);

  const colors = useMemo(() => LABELS.map((_, i) => {
    const p = i + 1;
    return progress.interpolate({
      inputRange: [p - 1, p, p + 1],
      outputRange: [i === 0 ? theme.colors.text : theme.colors.textFaint, theme.colors.text, i === LABELS.length - 1 ? theme.colors.text : theme.colors.textFaint],
      extrapolate: 'clamp',
    });
  }), [progress]);

  const line = useMemo(() => {
    if (!ready) return null;
    return {
      left: progress.interpolate({ inputRange: [1, 2, 3], outputRange: lay.map((l) => l.x), extrapolate: 'clamp' }),
      width: progress.interpolate({ inputRange: [1, 2, 3], outputRange: lay.map((l) => l.w), extrapolate: 'clamp' }),
    };
  }, [ready, lay, progress]);

  return (
    <View style={[styles.tabs, dimmed && styles.dimmed]} pointerEvents={dimmed ? 'none' : 'auto'}>
      {LABELS.map((label, i) => (
        <TouchableOpacity
          key={label}
          onPress={() => onPress(i)}
          style={styles.tab}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            setLay((cur) => (cur[i] && cur[i].x === x && cur[i].w === width ? cur : cur.map((v, k) => (k === i ? { x, w: width } : v))));
          }}
        >
          <Animated.Text style={[styles.tabText, { color: colors[i] }]}>{label}</Animated.Text>
          <View style={styles.lineSpace} />
        </TouchableOpacity>
      ))}
      {line && <Animated.View pointerEvents="none" style={[styles.line, line]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.lg, justifyContent: 'center' },
  dimmed: { opacity: 0.25 },
  tab: { paddingBottom: theme.spacing.sm },
  tabText: { fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  // Place du trait (mêmes dimensions qu'avant : le texte ne bouge pas)
  lineSpace: { height: 2, marginTop: theme.spacing.xs },
  line: { position: 'absolute', bottom: theme.spacing.sm, height: 2, backgroundColor: theme.colors.text },
});
