// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.43';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Compteurs ajoutés : réorganisation identique à la liste (appui long, saisie, barre « Terminé »)',
  'Page d’une substance : logo réduit, plus de place pour le calendrier',
  'Crayon d’une prise : modification directe ; poubelle dans les listes de prises',
  'Messages de retrait des bandeaux harmonisés',
];
