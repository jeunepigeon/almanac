// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.42';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Cloche sur chaque substance de la liste',
  'Carte « Dernières 24 h » au tap sur le bandeau, à jour dès une nouvelle prise',
  'Carte d’un jour : crayon et poubelle sur chaque prise',
  'Compteurs ajoutés : séparateurs, glisser-déposer après appui long',
  'Le verrouillage passe au-dessus de toutes les fenêtres',
];
