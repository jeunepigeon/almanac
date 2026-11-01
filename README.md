# Almanac

**Tracker de consommation neutre et privé** pour Android : substances, habitudes, médicaments, n'importe quel comportement répété.

Tout reste **sur le téléphone** (SQLite local). Pas de compte, pas de serveur, pas de tracking. Les seules données qui sortent de l'appareil sont les exports que tu crées toi-même, chiffrés par un code PIN.

**Version actuelle : 1.22** · Android · build APK via EAS · développement démarré le 26 avril 2026.

---

## Fonctionnalités

### Substances
- Liste des substances avec compteur en direct « sobre depuis » pour chacune, et bandeau **« Sobre de tout depuis »** en haut. Un tap sur le bandeau fait défiler jusqu'à la substance de la dernière prise et la met en surbrillance.
- Chaque substance a un nom, une couleur (palette de 12) et une icône (grille de 40, dont une xXx dessinée sur mesure).
- **Bandeaux par couleur** : sous « Sobre de tout », un bandeau « Sobre depuis » par couleur choisie (couleurs ayant au moins 2 substances), ajouté via la pilule **+**. Tap → défile jusqu'à la dernière substance consommée de cette couleur ; appui long → Réorganiser (entre bandeaux, « Sobre de tout » reste en tête) / Supprimer.
- Appui long sur une substance → menu : **Réorganiser** · Renommer · Changer la couleur · Changer l'icône · Supprimer.
- **Réorganisation par glisser-déposer** : appui long pour saisir, défilement automatique près des bords, retour haptique à chaque changement de place.
- Supprimer une substance crée d'abord une sauvegarde automatique, ce qui la rend récupérable.

### Prises
- Ajout depuis le bouton **+** : date et heure, dosage (optionnel) et commentaire (optionnel).
- Modification et suppression depuis le calendrier ou la recherche.

### Vue par substance et vue Global
- Trois onglets : **Calendrier**, **Recherche** (historique filtrable) et **Stats**.
- **Calendrier défilant** qui s'ouvre sur le mois en cours et commence à la première prise. Il propose un menu déroulant des mois, des chevrons mois par mois, un retour au présent, et des chevrons « prise précédente / suivante » avec surbrillance de la case.
- **Stats** sur des fenêtres glissantes (30 j, 90 j, 180 j, 365 j, Tout ou période perso) :
  - total, jours avec / sans, pause en cours, plus longue pause, plus longue série, intervalle moyen, prises par semaine ;
  - courbe d’activité dans le temps (prises ou dosage), statistiques de dosage, répartition par heure de la journée et par jour de la semaine, camembert ;
  - en vue Global : plusieurs courbes (une par substance cochée) et jours sobres consécutifs.

### Sauvegardes, export et import
- **Gestionnaire de sauvegardes** interne (snapshots), à restaurer ou fusionner avec les données actuelles.
- Une sauvegarde automatique est faite avant chaque import, restauration ou suppression.
- **Export chiffré `.almanac`** : choix des substances, code PIN à 4 chiffres, puis choix de l'emplacement du fichier à chaque export. Le fichier écrit est relu et sa taille vérifiée.
- **Import** avec déchiffrement automatique au 4e chiffre du PIN, choix des substances et barre de progression.
- **Fusion intelligente** : les substances de même nom sont fusionnées et les prises en double ignorées.
- Noms de fichiers horodatés : `nom-JJ-MM-AAAA-HHhMM.almanac`.

### Divers
- Retours haptiques sur toute l'app.
- Dons via le Play Store (Palier 1 à 6).
- Zone de danger : remise à zéro complète, avec les données conservées dans le gestionnaire de sauvegardes.

---

## Chiffrement des exports

- **AES-256-CBC**, clé dérivée du code PIN par **PBKDF2-SHA256, 10 000 itérations**, avec un sel et un IV aléatoires pour chaque fichier.
- Le sel, l'IV et le nombre d'itérations sont dans l'en-tête du fichier, donc les anciens exports restent lisibles si le nombre d'itérations change.
- Un PIN oublié rend le fichier illisible : il n'existe aucune porte dérobée.
- La base SQLite locale n'est pas chiffrée. Seuls les exports le sont.

---

## Stack technique

| Rôle | Librairie |
|---|---|
| Framework | React Native 0.81 + **Expo SDK 54** |
| Base de données | `expo-sqlite` |
| État global | `zustand` |
| Navigation | `@react-navigation/native` + `native-stack`, `react-native-pager-view` |
| Gestes (réorganisation) | `react-native-gesture-handler` |
| Graphiques | `react-native-svg` (composants maison) |
| Chiffrement | `crypto-js`, `expo-crypto` |
| Fichiers | `expo-file-system` (Storage Access Framework), `expo-document-picker` |
| Préférences | `@react-native-async-storage/async-storage` |
| Haptique | `expo-haptics` |
| Dons | `expo-iap` |
| Divers | `@react-native-community/datetimepicker`, `expo-keep-awake`, `@expo/vector-icons` (Material Community Icons) |

---

## Build

```bash
eas build --platform android --profile production
```

- Le profil `production` produit un **APK** (`eas.json` → `buildType: "apk"`).
- À chaque version, il faut incrémenter `version` **et** `versionCode` dans `app.json`. La version affichée dans Paramètres est lue depuis `app.json`.

---

## Structure du projet

```
App.js                         # Navigation + GestureHandlerRootView
plugins/with-adi-registration.js
src/
├── screens/
│   ├── MainScreen.js           # Pager Substances / Global
│   ├── SubstancesPage.js       # Liste, bandeau « Sobre de tout », réorganisation
│   ├── GlobalCalendarPage.js   # Global : Calendrier / Recherche / Stats
│   ├── SubstanceScreen.js      # Substance : Calendrier / Recherche / Stats
│   ├── SettingsScreen.js       # Paramètres, sauvegardes, export / import
│   └── DonationsScreen.js      # Paliers de soutien
├── components/
│   ├── ScrollableCalendar.js   # Calendrier défilant + navigation entre prises
│   ├── StatsView.js, Charts.js # Stats et graphiques SVG
│   ├── GlobalHistoryView.js    # Recherche au global
│   ├── LiveCounter.js          # Compteurs « sobre depuis »
│   ├── SubstanceIcon.js        # Icône de substance (MDI + icônes sur mesure)
│   ├── ColorBannerAddModal.js  # Ajout d'un bandeau par couleur
│   ├── ReorderList.js          # Glisser-déposer (gesture-handler)
│   ├── ExportWizard.js         # Export chiffré
│   ├── ImportWizard.js         # Import + fusion
│   ├── RestoreWizard.js        # Restauration depuis le gestionnaire
│   ├── PinField.js             # Saisie du code PIN
│   ├── SubCard.js, SubstanceSelectModal.js
│   ├── SubstanceFormModal.js   # Création / modification de substance
│   ├── LogConsumptionModal.js, DayDetailModal.js
│   └── ActionSheet.js, ConfirmModal.js, InfoModal.js, ResultModal.js, …
├── utils/
│   ├── exportImport.js         # Format .almanac + chiffrement
│   ├── fusion.js               # Fusion import / restauration
│   ├── snapshots.js            # Sauvegardes internes
│   ├── saf.js                  # Écriture via Storage Access Framework
│   ├── stats.js, duration.js, dates.js
│   ├── prefs.js                # Préférences locales (bandeaux)
│   ├── haptics.js, useKeyboard.js, modalPosition.js, keepAwake.js
│   └── useBilling.js           # Dons (expo-iap)
├── store/index.js              # Store Zustand
├── db/index.js                 # SQLite : schéma, migrations, requêtes
├── icons.js                    # Les 40 icônes disponibles
└── theme.js                    # Palette, espacements, typo
```

---

## Historique

### 1.22
- **Bandeaux « Sobre depuis » par couleur** : ajout via la pilule +, tap pour aller à la dernière substance de la couleur, appui long pour réorganiser ou supprimer.
- Réorganisation plus fluide : seules les lignes qui bougent sont redessinées, et elles glissent au lieu de sauter.
- Icône xXx dessinée sur mesure (sans cadre).
- Grille d'icônes revenue en 8×5.
- Import : le champ PIN est vidé quand on revient à l'étape PIN.

### 1.21
- Export : la correspondance des deux PIN est vérifiée dès que les deux champs sont pleins. Effacer sur le 2e champ vide ramène au 1er. Les champs sont remis à zéro au retour vers la sélection.
- Import : déchiffrement automatique au 4e chiffre.

### 1.20
- Réorganisation refaite avec `react-native-gesture-handler` : glisser-déposer fiable, défilement normal dans le mode et défilement automatique près des bords.
- Le bandeau « Sobre de tout » centre la substance concernée à l'écran.
- Les exports contiennent de nouveau les substances complètes (icône, ordre, date de création). À l'import, l'icône est récupérée si la substance actuelle a l'icône par défaut.
- La grille d'icônes s'adapte pour que la création de substance tienne sans défiler. Correction d'une icône en double.

### 1.1.16 → 1.1.19
- Nouveaux **assistants d'export, d'import et de restauration** dans une fenêtre, avec sélection des substances par cartes.
- Saisie du PIN par points, avec retours d'erreur (secousse et haptique).
- Export via Storage Access Framework, avec choix de l'emplacement, relecture et vérification de la taille du fichier.
- Fusion automatique par nom, avec dédoublonnage des prises et compteurs de résultat.
- Le gestionnaire de sauvegardes est séparé des actions. Une sauvegarde automatique est faite avant import, restauration et suppression.
- Nouveau menu par appui long sur une substance, et nouveau mode réorganisation.
- Calendrier : ouverture sur le mois en cours, chevrons « prise précédente / suivante » relatifs au mois affiché, surbrillance des cases, butées.
- Retours haptiques dans toute l'app. Horodatage `JJ-MM-AAAA-HHhMM`.

### 1.1.7 → 1.1.15
- Système de **sauvegardes internes** (snapshots), **calendrier défilant**, courbes segmentées, bouton flottant **+** et premier **export chiffré par code PIN**.

### 1.0.0 → 1.1.6
- Base de l'app : SQLite local, substances et prises, calendrier mensuel, stats sur fenêtres glissantes, courbes, camembert, vue Global, dons via `expo-iap`, logo, vérification ADI.

---

## Prévu

- **Chiffrement natif** (`react-native-quick-crypto`) pour un déchiffrement quasi instantané.
- **Notifications de paliers de sobriété** (24 h, 48 h, 1 semaine, 15 jours, puis chaque mois), par substance ou pour « Sobre de tout ».
- **Session d'optimisation** : cache central des prises, statistiques précalculées, nettoyage du code hérité.

---

Licence MIT.
