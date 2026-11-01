// Icône de substance : icônes MaterialCommunityIcons + icônes dessinées sur mesure (absentes de MDI).
// « xXx » : glyphes x / X de Roboto Bold (police système Android) convertis en tracés SVG,
// petits x centrés verticalement sur le X central et légèrement glissés derrière lui.
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getIconById } from '../icons';

const XXX_W = 33.61; // largeur du viewBox (hauteur 24) → l'icône est ~1,4× plus large que haute
const XXX_SMALL_LEFT = 'M5.34 9.68 7.28 6.24H10.57L7.29 11.88L10.71 17.76H7.41L5.35 14.14L3.31 17.76H0L3.42 11.88L0.15 6.24H3.45Z';
const XXX_SMALL_RIGHT = 'M28.25 9.68 30.18 6.24H33.47L30.19 11.88L33.61 17.76H30.31L28.26 14.14L26.21 17.76H22.9L26.32 11.88L23.05 6.24H26.35Z';
const XXX_BIG = 'M16.81 9.59 19.71 4.25H23.38L18.87 11.94L23.5 19.75H19.79L16.81 14.32L13.82 19.75H10.11L14.74 11.94L10.23 4.25H13.9Z';

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
