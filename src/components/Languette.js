// 1.55 — Languette de bascule 1 ↔ 2 colonnes (bord droit, fixe à l'écran).
//  - pastille ronde blanche, à moitié sortie du bord, visible dès l'entrée en réorganisation ;
//  - bandeau attrapé (bascule possible) : elle grossit un peu et 16 petits rayons tournent lentement
//    autour (un tour en 6 s) ;
//  - survol aimanté : rien de plus (l'aimant et l'aperçu en pointillés suffisent).
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { LANGUETTE } from './BannerGrid';

const SIZE = LANGUETTE.size;
const RAYS = 16;
const RAY_GAP = 5;     // espace entre la pastille et les rayons
const RAY_LEN = 6;
const TURN_MS = 6000;  // un tour complet
const BOX = SIZE + 2 * (RAY_GAP + RAY_LEN) + 4;

export default function Languette({ visible, active, cols }) {
  const [W, setW] = useState(0);
  const x = useRef(new Animated.Value(1)).current;      // 0 = en place, 1 = sortie à droite
  const accent = useRef(new Animated.Value(0)).current; // 0 = repos, 1 = bandeau tenu
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(x, { toValue: visible ? 0 : 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, x]);

  useEffect(() => {
    Animated.timing(accent, { toValue: active ? 1 : 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (!active) { spin.stopAnimation(); return undefined; }
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, accent, spin]);

  const scale = accent.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [0, LANGUETTE.visible + 8] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      {W > 0 && (
        <Animated.View
          style={[styles.wrap, {
            left: W - LANGUETTE.visible - (BOX - SIZE) / 2,
            top: LANGUETTE.top - (BOX - SIZE) / 2,
            transform: [{ translateX }, { scale }],
          }]}
        >
          {/* Rayons (derrière la pastille) */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: accent, transform: [{ rotate }] }]}>
            {Array.from({ length: RAYS }, (_, k) => (
              <View
                key={k}
                style={[styles.rayBox, { transform: [{ rotate: `${(k * 360) / RAYS}deg` }] }]}
              >
                <View style={styles.ray} />
              </View>
            ))}
          </Animated.View>
          <View style={styles.dot}>
            <MaterialCommunityIcons name={cols === 1 ? 'view-grid-outline' : 'view-agenda-outline'} size={18} color={theme.colors.background} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center', zIndex: 20, elevation: 20 },
  // Chaque rayon : une boîte de la taille du cadre, tournée ; le trait est posé en haut, au centre
  rayBox: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  ray: { marginTop: (BOX - SIZE) / 2 - RAY_GAP - RAY_LEN, width: 2, height: RAY_LEN, borderRadius: 1, backgroundColor: theme.colors.text, opacity: 0.85 },
  // Pastille : l'icône est placée dans la moitié visible (à gauche du bord de l'écran)
  dot: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: theme.colors.text,
    alignItems: 'flex-start', justifyContent: 'center', paddingLeft: Math.max(1, (LANGUETTE.visible - 18) / 2),
  },
});
