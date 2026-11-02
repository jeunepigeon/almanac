// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.39';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Partage : bouton Enregistrer (image dans un dossier du téléphone ; appui long pour changer de dossier)',
  'Partage : l’en-tête ne passe plus sous l’heure et la caméra, plus de saut quand on décoche',
];
