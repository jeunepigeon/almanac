// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.48';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Bandeaux sur 2 colonnes : en réorganisation, glisser un bandeau sur la languette en haut à gauche',
  '« Sobre de tout » est un bandeau comme les autres, déplaçable',
  'Bandeaux moins hauts (même contenu)',
  'Suppression d’un bandeau : les autres et la pilule « + » glissent pendant le fondu',
  'Page d’une substance : glisser pour passer de Calendrier à Recherche et Stats',
  'Sauvegardes et exports : bandeaux personnalisés, record, 24 h et disposition inclus',
];
