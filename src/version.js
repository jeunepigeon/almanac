// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.32';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'Le mode réorganisation reste ouvert après une suppression ou un changement de couleur / d’icône',
  'Un seul tap suffit sur une prise dans le détail d’un jour',
  'Paramètres : plus de retour en haut pendant le défilement',
  'Renommer : le clavier s’ouvre directement',
];
