// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.56';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Languette de colonnes à gauche, plus petite ; liseré au survol aimanté',
  'Rayons de la languette un peu plus lents',
  'Retour d’une substance plus fluide',
  'Calendrier d’une substance sans décalage à l’ouverture',
];
