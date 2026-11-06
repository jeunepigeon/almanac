// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.45';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Compteurs en réorganisation : butées haut / bas, pilule « + » fixe, page entière bloquée jusqu’à « Terminé »',
  'Recherche d’une substance : la ligne ouvre la carte du jour',
  'Modification d’une prise ou d’une substance : bouton actif seulement après un changement',
  'Bandeau personnalisé : « Suivant » actif à partir de 2 substances',
  'Calendrier d’une substance : boutons de navigation plus compacts',
];
