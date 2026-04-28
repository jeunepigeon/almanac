// Catalogue d'icônes utilisable pour les substances.
// On utilise MaterialCommunityIcons (mdi) qui a un set très large
// et inclut nativement cannabis, smoking, pill, beer, etc.

export const ICONS = [
  // Plantes / fumée
  { id: 'cannabis', icon: 'cannabis' },
  { id: 'smoking', icon: 'smoking' },
  { id: 'leaf', icon: 'leaf' },
  { id: 'pipe', icon: 'pipe' },
  { id: 'fire', icon: 'fire' },

  // Médicaments / pilules
  { id: 'pill', icon: 'pill' },
  { id: 'pill-multiple', icon: 'pill-multiple' },
  { id: 'medical-bag', icon: 'medical-bag' },
  { id: 'iv-bag', icon: 'iv-bag' },

  // Poudres / cristaux / chimie
  { id: 'molecule', icon: 'molecule' },
  { id: 'flask', icon: 'flask' },
  { id: 'flask-round-bottom', icon: 'flask-round-bottom' },
  { id: 'diamond-stone', icon: 'diamond-stone' },
  { id: 'shaker', icon: 'shaker' },

  // Psychédéliques
  { id: 'mushroom', icon: 'mushroom' },
  { id: 'eye', icon: 'eye' },
  { id: 'star', icon: 'star' },

  // Injection
  { id: 'syringe', icon: 'needle' },

  // Alcool
  { id: 'glass-wine', icon: 'glass-wine' },
  { id: 'beer', icon: 'beer' },
  { id: 'glass-cocktail', icon: 'glass-cocktail' },
  { id: 'bottle-wine', icon: 'bottle-wine' },

  // Café / boissons
  { id: 'coffee', icon: 'coffee' },
  { id: 'cup', icon: 'cup' },

  // Inhalation
  { id: 'balloon', icon: 'balloon' },
  { id: 'air-filter', icon: 'air-filter' },

  // Comportements
  { id: 'heart', icon: 'heart' },
  { id: 'cards', icon: 'cards' },
  { id: 'dice', icon: 'dice-multiple' },
  { id: 'controller', icon: 'controller-classic' },
  { id: 'cellphone', icon: 'cellphone' },

  // Formes neutres / abstrait
  { id: 'circle', icon: 'circle' },
  { id: 'circle-outline', icon: 'circle-outline' },
  { id: 'triangle', icon: 'triangle' },
  { id: 'square', icon: 'square' },
  { id: 'hexagon', icon: 'hexagon' },
  { id: 'lightning-bolt', icon: 'lightning-bolt' },
  { id: 'water', icon: 'water' },
  { id: 'snowflake', icon: 'snowflake' },
];

export const DEFAULT_ICON_ID = 'circle';

export function getIconById(id) {
  return ICONS.find((i) => i.id === id) || ICONS.find((i) => i.id === DEFAULT_ICON_ID);
}
