// 1.51 — Onglets Calendrier · Recherche · Stats, communs à Global et aux substances (même code).
// 1.52 : calculés sur le fil d'affichage (Reanimated) depuis `pos`, la position du défilement
// principal (0 = liste, 1 = Calendrier, 2 = Recherche, 3 = Stats) : le trait et la couleur des
// textes restent accrochés à la page à chaque image (glisser au doigt ou tap sur un onglet).
import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, interpolateColor, Extrapolation } from 'react-native-reanimated';
import { theme } from '../theme';

const LABELS = ['Calendrier', 'Recherche', 'Stats'];
const C_FAINT = theme.colors.textFaint; // couleurs lues sur le fil d'affichage
const C_TEXT = theme.colors.text;
const LINE_BASE = 100; // largeur de base du trait (mis à l'échelle)

function TabText({ pos, i, label }) {
  const style = useAnimatedStyle(() => {
    const p = i + 1;
    const p0 = Math.max(0, Math.min(1, 1 - Math.abs(pos.value - p))); // 1 sur l'onglet, 0 à 1 page
    const atEdge = (i === 0 && pos.value < p) || (i === LABELS.length - 1 && pos.value > p);
    return { color: interpolateColor(atEdge ? 1 : p0, [0, 1], [C_FAINT, C_TEXT]) };
  }, [i]);
  return <Animated.Text style={[styles.tabText, style]}>{label}</Animated.Text>;
}

export default function AnimatedTabs({ pos, onPress, dimmed = false }) {
  const [lay, setLay] = useState([null, null, null]); // { x, w } de chaque onglet
  const ready = lay.every(Boolean);
  const xs = ready ? lay.map((l) => l.x) : [0, 0, 0];
  const ws = ready ? lay.map((l) => l.w) : [0, 0, 0];

  const lineStyle = useAnimatedStyle(() => {
    const x = interpolate(pos.value, [1, 2, 3], xs, Extrapolation.CLAMP);
    const w = interpolate(pos.value, [1, 2, 3], ws, Extrapolation.CLAMP);
    return { transform: [{ translateX: x }, { scaleX: w / LINE_BASE }] };
  }, [xs[0], xs[1], xs[2], ws[0], ws[1], ws[2]]);

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
          <TabText pos={pos} i={i} label={label} />
          <View style={styles.lineSpace} />
        </TouchableOpacity>
      ))}
      {ready && <Animated.View pointerEvents="none" style={[styles.line, lineStyle]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.lg, justifyContent: 'center' },
  dimmed: { opacity: theme.dim },
  tab: { paddingBottom: theme.spacing.sm },
  tabText: { fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  // Place du trait (mêmes dimensions qu'avant : le texte ne bouge pas)
  lineSpace: { height: 2, marginTop: theme.spacing.xs },
  // Trait : largeur de base mise à l'échelle depuis son bord gauche
  line: { position: 'absolute', left: 0, bottom: theme.spacing.sm, width: LINE_BASE, height: 2, backgroundColor: theme.colors.text, transformOrigin: 'left' },
});
