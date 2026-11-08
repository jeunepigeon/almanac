// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.55';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Languette de colonnes blanche, visible dès la réorganisation, avec rayons quand un bandeau est tenu',
  'Aperçu de colonnes (pointillés et assombrissement) retiré dès le lâcher',
  'Ouverture et fermeture d’une substance plus fluides',
  'Calendrier d’une substance directement sur le mois en cours',
  'Logo du compteur un peu plus à gauche',
];
