// Flash unique de l'app (1.36) : MÊME durée, MÊME courbe, MÊME intensité partout
//  - ligne de substance (tap sur un bandeau → la dernière substance prise)
//  - bandeaux « Sobre de tout » / catégorie (tap sur une notification)
//  - jour du calendrier (saut vers un jour)
// Couleur : celle de l'élément (substance, catégorie) ; blanc pour « Sobre de tout » et le calendrier global.
// Pour régler l'effet partout, il suffit de changer les 3 constantes ci-dessous.
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

export const FLASH_IN_MS = 150;   // montée
export const FLASH_OUT_MS = 650;  // fondu (ralenti en fin de course)
export const FLASH_PEAK = 0.55;   // opacité maximale de la couleur

// Lance le flash sur une Animated.Value (0 → 1 → 0)
export function runFlash(value, { useNativeDriver = false, onEnd } = {}) {
  value.stopAnimation();
  value.setValue(0);
  Animated.sequence([
    Animated.timing(value, { toValue: 1, duration: FLASH_IN_MS, useNativeDriver }),
    Animated.timing(value, {
      toValue: 0, duration: FLASH_OUT_MS, useNativeDriver, easing: Easing.out(Easing.quad),
    }),
  ]).start(onEnd);
}

export function hexToRgba(hex, a) {
  const h = (hex || '#FFFFFF').replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// Fond animé (pilote JS) : rejoue le flash à chaque nouveau `tick` (≠ 0).
// La couleur passe de transparente à FLASH_PEAK dans SA teinte (pas de passage par le noir).
export function useFlashBackground(tick, color, onStart) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tick) return;
    onStart?.();
    runFlash(v);
  }, [tick]); // eslint-disable-line
  return v.interpolate({ inputRange: [0, 1], outputRange: [hexToRgba(color, 0), hexToRgba(color, FLASH_PEAK)] });
}
