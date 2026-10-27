// Hook : true quand le clavier est ouvert.
import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const h = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { s.remove(); h.remove(); };
  }, []);
  return visible;
}

// Hauteur du clavier (0 si fermé). Sert à centrer les modals dans la zone libre au-dessus.
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', (e) => setH(e.endCoordinates?.height || 0));
    const hd = Keyboard.addListener('keyboardDidHide', () => setH(0));
    return () => { s.remove(); hd.remove(); };
  }, []);
  return h;
}

// Laisse React dessiner (spinner) AVANT un calcul lourd synchrone (PBKDF2 bloque le thread JS).
export function yieldToUI() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30)));
  });
}
