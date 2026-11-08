// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.53';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Retour (flèche ou Android) = le même glisser que depuis Calendrier, plus de flash noir',
  'Logo de la substance toujours affiché dans son compteur, logo par défaut compris',
  'Bascule de colonnes depuis le bas de la liste : la liste remonte d’abord en haut',
  'Réorganisation : même assombrissement partout (en-tête, onglets, compteur)',
];
