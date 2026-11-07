// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.49';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Languette des colonnes à droite, sous la barre ; passage en 2 colonnes toujours vers une petite case',
  'Le bandeau tenu reste centré sous le doigt',
  'Crayon, poubelle et cloche plus grands dans les petites cases',
  'Glissements plus doux pendant le fondu',
  'Écrans qui glissent depuis la droite ; retour en glissant (depuis Calendrier pour une substance)',
  'Global : glisser entre Calendrier, Recherche et Stats, puis vers la liste',
];
