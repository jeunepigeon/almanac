// Position FIXE des fenêtres avec clavier (ne bougent pas à l'ouverture/fermeture du clavier).
// Réglé pour le téléphone de dev : clavier ≈ 34 % de la hauteur d'écran (685 px / 2000 sur les screenshots).
// À rendre adaptatif plus tard si besoin (autres tailles d'écran / claviers).

import { useState } from 'react';
import { Dimensions, StatusBar } from 'react-native';

const KEYBOARD_RATIO = 0.343; // hauteur clavier estimée / hauteur écran
const HEADER_HEIGHT = 56;     // en-tête Android standard (native-stack)

function metrics() {
  const H = Dimensions.get('screen').height;
  const statusBar = StatusBar.currentHeight || 24;
  return {
    H,
    headerBottom: statusBar + HEADER_HEIGHT,     // bas du bandeau « Paramètres »
    keyboardTop: Math.round(H * (1 - KEYBOARD_RATIO)), // haut du clavier (estimé)
  };
}

// mode 'betweenHeaderAndKeyboard' : centré entre le bas du bandeau et le haut du clavier (export)
// mode 'screenCenter'             : centré dans l'écran, sans jamais passer sous le clavier (import)
// Retourne { onLayout, overlayStyle, cardStyle } à appliquer ; la carte reste invisible le temps
// d'être mesurée (1 frame) pour éviter un saut à l'affichage.
export function useFixedModalTop(mode) {
  const [cardH, setCardH] = useState(0);
  const { H, headerBottom, keyboardTop } = metrics();

  let top = headerBottom;
  if (cardH > 0) {
    if (mode === 'betweenHeaderAndKeyboard') {
      top = headerBottom + Math.max(0, (keyboardTop - headerBottom - cardH) / 2);
    } else {
      const centered = (H - cardH) / 2;
      const maxTop = keyboardTop - cardH - 16; // reste au-dessus du clavier
      top = Math.max(headerBottom, Math.min(centered, maxTop));
    }
  }

  return {
    onLayout: (e) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (Math.abs(h - cardH) > 1) setCardH(h);
    },
    overlayStyle: { justifyContent: 'flex-start', paddingTop: Math.round(top) },
    cardStyle: cardH > 0 ? null : { opacity: 0 },
  };
}
