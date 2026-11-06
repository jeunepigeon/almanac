// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.41';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Nouveaux bandeaux : personnalisé (tes substances, ton nom), plus longue sobriété de tout, dernières 24 h',
  'Dates sous tous les bandeaux et tous les compteurs',
  'Notifications : paliers à cocher, message à l’activation ; record battu sur son bandeau',
  'Appui long sur « Sobre de tout » et sur les compteurs ajoutés : réorganisation',
];
