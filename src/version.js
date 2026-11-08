// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.51';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Retour direct à la liste depuis une substance ou Global (la page part vers la droite d’un bloc)',
  'Onglets et titres qui suivent le doigt ; partager aussi sur Global',
  'Recherche de Global : une prise ouvre la carte du jour de Global ; même carte du jour partout',
  'Paramètres se ferment en glissant vers la droite',
  '« Sobre de tout » automatique dès 2 substances ; languette fixe à l’écran',
  'Réorganisation plus fluide (plus de clignotements ni d’icônes qui bougent)',
];
