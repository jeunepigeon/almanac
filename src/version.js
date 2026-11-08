// Version du CODE de l'app (JavaScript), distincte de la version de l'APK (app.json).
// Les mises à jour sans build (EAS Update) changent ce numéro SANS toucher à app.json :
// modifier la version dans app.json changerait l'empreinte native et l'APK installé refuserait la mise à jour.
export const JS_VERSION = '1.52';

// Nouveautés affichées UNE fois après une mise à jour (message « Almanac mis à jour »).
// À réécrire à chaque version (quelques lignes courtes).
export const JS_NOTES = [
  'En-têtes, onglets et titres accrochés aux pages pendant le glisser (plus de décalage ni de scintillement)',
  'Fermeture d’une substance ou de Global : la page glisse à droite d’un bloc, la liste est déjà dessous',
  'Logo du compteur d’une substance à gauche',
  'Fenêtre « + » des bandeaux : les lignes ne bougent plus pendant qu’on coche',
  'Aperçu des colonnes en haut de l’écran, même en bas de la liste',
  'En réorganisation, l’en-tête est assombri',
];
