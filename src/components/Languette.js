// 1.55 — Languette de bascule 1 ↔ 2 colonnes (fixe à l'écran).
//  - pastille ronde blanche, à moitié sortie du bord, visible dès l'entrée en réorganisation ;
//  - bandeau attrapé (bascule possible) : elle grossit un peu et 16 petits rayons tournent lentement
//    autour ;
//  - 1.56 : bord GAUCHE, 32 px, un tour en 8 s ; survol aimanté : les rayons s'effacent, un liseré fin
//    détaché les remplace.
//  - 1.60 : transition « tracé » (350 ms) : les rayons s'effacent pendant que le liseré se dessine, du
//    haut vers le bas (la moitié visible) ; à l'envers quand le bandeau quitte la languette.
import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Reanimated, { useSharedValue, useAnimatedProps, withTiming, Easing as REasing } from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { LANGUETTE } from './BannerGrid';

const SIZE = LANGUETTE.size;
const RAYS = 16;
const RAY_GAP = 5;     // espace entre la pastille et les rayons
const RAY_LEN = 6;
const TURN_MS = 8000;  // un tour complet (1.56 : un peu plus lent)
const RING_GAP = 6;    // liseré du survol aimanté : écart et épaisseur
const RING_W = 1.5;
const ICON = 14;
const TRACE_MS = 350;  // 1.60 : rayons → liseré
const RING_R = SIZE / 2 + RING_GAP;
const HALF_C = Math.PI * RING_R; // demi-cercle visible (l'autre moitié est hors écran)
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);
const BOX = SIZE + 2 * (RAY_GAP + RAY_LEN) + 4;

// 1.61 : mise en avant (bandeau tenu) et survol aimanté pilotés DIRECTEMENT par la grille (ref) :
// l'animation part tout de suite, sans attendre un nouveau rendu de la liste.
const Languette = forwardRef(function Languette({ visible, cols }, ref) {
  const [W, setW] = useState(0);
  const x = useRef(new Animated.Value(1)).current;      // 0 = en place, 1 = sortie à droite
  const accent = useRef(new Animated.Value(0)).current; // 0 = repos, 1 = bandeau tenu
  const spin = useRef(new Animated.Value(0)).current;
  const hov = useRef(new Animated.Value(0)).current;    // 1 = survol aimanté
  const trace = useSharedValue(0); // 0 = rien, 1 = liseré entièrement dessiné
  const loopRef = useRef(null);
  const state = useRef({ active: false, hover: false });
  useImperativeHandle(ref, () => ({
    setHover: (on) => {
      if (state.current.hover === on) return;
      state.current.hover = on;
      Animated.timing(hov, { toValue: on ? 1 : 0, duration: TRACE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
      trace.value = withTiming(on ? 1 : 0, { duration: TRACE_MS, easing: REasing.inOut(REasing.cubic) });
    },
    setActive: (on) => {
      if (state.current.active === on) return;
      state.current.active = on;
      Animated.timing(accent, { toValue: on ? 1 : 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      loopRef.current?.stop(); loopRef.current = null;
      if (on) {
        spin.setValue(0);
        loopRef.current = Animated.loop(Animated.timing(spin, { toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: true }));
        loopRef.current.start();
      }
    },
  }), []); // eslint-disable-line
  useEffect(() => () => loopRef.current?.stop(), []);
  // Le trait part du haut et descend le long de la moitié visible
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: HALF_C * (1 - trace.value) }));
  const raysOpacity = useMemo(() => Animated.multiply(accent, Animated.subtract(1, hov)), [accent, hov]);

  useEffect(() => {
    Animated.timing(x, { toValue: visible ? 0 : 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, x]);

  const scale = accent.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [0, -(LANGUETTE.visible + 8)] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      {W > 0 && (
        <Animated.View
          style={[styles.wrap, {
            left: LANGUETTE.visible - SIZE - (BOX - SIZE) / 2,
            top: LANGUETTE.top - (BOX - SIZE) / 2,
            transform: [{ translateX }, { scale }],
          }]}
        >
          {/* Rayons (derrière la pastille) */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: raysOpacity, transform: [{ rotate }] }]}>
            {Array.from({ length: RAYS }, (_, k) => (
              <View
                key={k}
                style={[styles.rayBox, { transform: [{ rotate: `${(k * 360) / RAYS}deg` }] }]}
              >
                <View style={styles.ray} />
              </View>
            ))}
          </Animated.View>
          {/* Liseré du survol aimanté, tracé progressivement */}
          <Svg width={BOX} height={BOX} style={StyleSheet.absoluteFill}>
            <AnimatedCircle
              cx={BOX / 2} cy={BOX / 2} r={RING_R}
              fill="none" stroke={theme.colors.text} strokeWidth={RING_W}
              strokeDasharray={[HALF_C, 2 * Math.PI * RING_R]}
              animatedProps={ringProps}
              transform={`rotate(-90 ${BOX / 2} ${BOX / 2})`}
            />
          </Svg>
          <View style={styles.dot}>
            <MaterialCommunityIcons name={cols === 1 ? 'view-grid-outline' : 'view-agenda-outline'} size={ICON} color={theme.colors.background} />
          </View>
        </Animated.View>
      )}
    </View>
  );
});

export default Languette;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center', zIndex: 20, elevation: 20 },
  // Chaque rayon : une boîte de la taille du cadre, tournée ; le trait est posé en haut, au centre
  rayBox: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  ray: { marginTop: (BOX - SIZE) / 2 - RAY_GAP - RAY_LEN, width: 2, height: RAY_LEN, borderRadius: 1, backgroundColor: theme.colors.text, opacity: 0.85 },
  // Pastille : l'icône est placée dans la moitié visible (à droite du bord gauche de l'écran)
  dot: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: theme.colors.text,
    alignItems: 'flex-end', justifyContent: 'center', paddingRight: Math.max(0, (LANGUETTE.visible - ICON) / 2),
  },
});
