// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.33';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Supprimer, renommer ou changer la couleur / l’icône d’une substance termine la réorganisation',
  'Renommer : le clavier s’ouvre vraiment',
  'Tap sur une notification : le flash du bandeau attend le déverrouillage',
];
