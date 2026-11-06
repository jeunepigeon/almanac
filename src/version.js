// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.40';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  '« Sobre de tout » devient un bandeau comme les autres : à cocher dans le « + » de la liste',
  'Le « + » de la liste coche et décoche les bandeaux',
  'Notifications « toutes » et par catégorie : cloche à gauche de leur bandeau',
  'Page d’une substance et stats globales : « + » sous le compteur pour ajouter la sobriété précédente et la plus longue',
];
