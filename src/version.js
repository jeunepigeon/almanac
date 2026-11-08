// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.54';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Une substance s’ouvre par-dessus la liste, qui ne bouge plus dessous',
  'Fermeture d’une substance : glisser depuis Calendrier, flèche ou retour — la page part telle quelle',
  'Paramètres s’ouvrent et se ferment à la même vitesse que le reste',
  'Logo de la substance centré dans la marge de son compteur',
  'Pointillés de la bascule de colonnes retirés dès le lâcher',
];
