// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.46';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Page d’une substance et page Global : même disposition (onglets en haut, petit compteur dessous)',
  'Compteurs ajoutés d’une substance : dans son onglet Stats, comme au global',
  'Correction : la réorganisation des compteurs d’une substance ne fait plus planter l’app',
  'Bandeau personnalisé : info « au moins 2 substances », en rouge si on insiste',
];
