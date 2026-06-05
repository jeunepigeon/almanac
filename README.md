# Almanac v1.0.0 — Release candidate

## Installation des dépendances

**Avant de build**, dans ton projet, retire l'ancienne dep cassée et installe la nouvelle :

```bash
npm uninstall expo-in-app-purchases
npx expo install expo-iap
```

## Build

```bash
eas build --platform android --profile preview
```

---

## Fichiers livrés

- `app.json` — version 1.0.0, versionCode 100, icône intégrée
- `assets/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.png` — logo Almanac
- `src/utils/useBilling.js` — réécrit pour `expo-iap`
- `src/screens/DonationsScreen.js` — UI symétrique avec Settings
- `src/screens/SettingsScreen.js` — version 1.0.0
- `src/screens/ImportScreen.js`, `ExportScreen.js`, `SubstancesPage.js`, `GlobalCalendarPage.js`, `SubstanceScreen.js`, `MainScreen.js`
- `src/components/StatsView.js` — camembert avec checkboxes + ℹ️
- `src/utils/stats.js` — jours sobres
- `src/utils/exportImport.js` — position dans CSV
- `src/db/index.js` — colonne position + dbImportBatch + dbGetFirstConsumptionTimestamp
- `src/store/index.js` — reorderSubstances
- `src/theme.js` — palette 12 couleurs

---

## Checklist complète à tester sur l'appareil

### Substances et logging
- [ ] Création substance (nom + couleur + icône) fonctionne
- [ ] Long press sur une ligne → mode réorganisation, bandeau "RÉORGANISATION"
- [ ] Flèches haut/bas déplacent les lignes ; bouton "Terminé" sauvegarde
- [ ] Menu 3 points → Renommer / Couleur / Icône / Réorganiser / Supprimer
- [ ] Suppression → choix "Archiver" ou "Effacer définitivement"
- [ ] FAB "+" sur substance → modal log fonctionne
- [ ] Dosage numérique avec virgule décimale
- [ ] Date passée prise en compte

### Calendriers
- [ ] Calendrier individuel : points colorés sur jours actifs
- [ ] Tap jour avec consos → bottom sheet détail
- [ ] Tap jour vide → log direct
- [ ] Calendrier global : points multicolores par substance
- [ ] Tap conso dans global → navigue vers la bonne page substance

### Statistiques
- [ ] Onglet Stats sur substance → grille 3×3
- [ ] Changement de fenêtre → recalcul OK
- [ ] Stats globales : camembert affiché si au moins 1 substance avec consos
- [ ] **Camembert avec checkboxes à droite** ; "Jours sobres" en première position
- [ ] Toutes les checkboxes cochées par défaut, reset à chaque changement de fenêtre
- [ ] Décocher une substance → la tranche disparaît du camembert
- [ ] **Bouton ℹ️** ouvre la modale d'explication
- [ ] Note "En jours · Xj au total" sous le camembert

### Paramètres
- [ ] Section "Sauvegardes archivées" affiche les substances archivées avec menu
- [ ] Section "Soutenir le projet" → navigue vers DonationsScreen
- [ ] Section "Données" : Exporter / Importer
- [ ] Export → fichier partagé, mdp sans contraintes
- [ ] Import → **overlay loading** "Import en cours..." pendant le batch
- [ ] Import respecte l'ordre (positions) des substances exportées
- [ ] Section "Zone de danger" : Remise à zéro avec double confirmation
- [ ] Section "À propos" :
  - [ ] Version : **1.0.0**
  - [ ] **Consos enregistrées depuis [date]** (date de la plus ancienne conso)
- [ ] **Crédit "almanac — fait par pigeon"** en bas, gris faint, lettering en bas de casse

### Donations (DonationsScreen)
- [ ] 6 produits affichés : Small tip, Coffee, Beer, Meal, Legend, Ultra
- [ ] Connexion au store affichée pendant le chargement
- [ ] Si compte Play actif et produits configurés : tap → flow Google Play
- [ ] Modal "Merci pour ton soutien ❤️" après achat réussi

### Logo / icône
- [ ] L'icône de l'app sur l'écran d'accueil Android est le logo "a + 4 points"
- [ ] Splash screen reprend ce logo sur fond noir

### Import Quitzilla (si tu réimportes)
- [ ] 25 substances + 1481 consos
- [ ] Première conso de chaque substance datée du quitDate Quitzilla, note "date d'arrêt (Quitzilla)"
- [ ] Couleurs respectent la palette officielle (12 couleurs)

---

## Récapitulatif des nouveautés depuis la version installée

Si tu utilisais une version antérieure à v1.6.x sur ton tel, voici tout ce qui change :

- **v1.6.1** : Long press pour réorganiser la liste des substances (flèches up/down)
- **v1.6.2** : Nouvelle palette 12 couleurs (rouge vif, rose, vert vif, teal, bleu clair, bleu foncé, violet, cyan, jaune, orange, brun, gris bleu)
- **v1.6.3** : Import en transaction batch (rapide et atomique pour gros imports)
- **v1.6.4** : Import respecte l'ordre des substances ; "Consos enregistrées depuis"
- **v1.6.5** : Loading pendant l'import ; crédit "fait par pigeon" dans Settings
- **v1.6.6** : Camembert en jours (au lieu de prises) avec tranche "Jours sobres"
- **v1.6.7** : Camembert interactif (checkboxes + bouton ℹ️) ; section donations
- **v1.6.8** : Logo intégré (a + 4 points)
- **v1.0.0** : Migration `expo-iap`, build stable, release ready
