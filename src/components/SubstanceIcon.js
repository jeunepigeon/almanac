// Icône de substance : icônes MaterialCommunityIcons + icônes dessinées sur mesure (absentes de MDI).
// « xXx » : glyphes x / X de Roboto Bold (police système Android) convertis en tracés SVG,
// petits x centrés verticalement sur le X central et légèrement glissés derrière lui.
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getIconById } from '../icons';

const XXX_W = 27.11; // largeur du viewBox (hauteur 24) ; X central haut de 12.5/24 (1.23 : réduit, avant 15.5)
const XXX_SMALL_LEFT = 'M4.31 10.13 5.87 7.36H8.53L5.88 11.91L8.64 16.64H5.98L4.32 13.73L2.67 16.64H0L2.76 11.91L0.12 7.36H2.78Z';
const XXX_SMALL_RIGHT = 'M22.78 10.13 24.34 7.36H26.99L24.35 11.91L27.11 16.64H24.44L22.79 13.73L21.14 16.64H18.47L21.22 11.91L18.59 7.36H21.25Z';
const XXX_BIG = 'M13.55 10.06 15.9 5.75H18.86L15.22 11.95L18.95 18.25H15.96L13.55 13.87L11.15 18.25H8.15L11.89 11.95L8.25 5.75H11.21Z';

function XxxIcon({ size, color }) {
  return (
    <Svg width={(size * XXX_W) / 24} height={size} viewBox={`0 0 ${XXX_W} 24`}>
      {/* Petits x d'abord : le X central passe devant */}
      <Path d={XXX_SMALL_LEFT} fill={color} />
      <Path d={XXX_SMALL_RIGHT} fill={color} />
      <Path d={XXX_BIG} fill={color} />
    </Svg>
  );
}

// iconId : id du catalogue (src/icons.js)
export default function SubstanceIcon({ iconId, size = 18, color, style }) {
  const entry = getIconById(iconId);
  if (entry.custom === 'xxx') return <XxxIcon size={size} color={color} />;
  return <MaterialCommunityIcons name={entry.icon} size={size} color={color} style={style} />;
}
