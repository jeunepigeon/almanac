# Almanac

**Tracker de consommation neutre et privé** pour Android : substances, habitudes, médicaments, n'importe quel comportement répété.

Tout reste **sur le téléphone** (SQLite local). Pas de compte, pas de serveur, pas de tracking. Les seules données qui sortent de l'appareil sont les exports que tu crées toi-même, chiffrés par un code PIN.

**Version actuelle : 1.28** · Android · build APK via EAS · développement démarré le 26 avril 2026.

---

## Fonctionnalités

### Substances
- Liste des substances avec compteur en direct « sobre depuis » pour chacune, et bandeau **« Sobre de tout depuis »** en haut. Un tap sur le bandeau fait défiler jusqu'à la substance de la dernière prise et la met en surbrillance.
- Chaque substance a un nom, une couleur (palette de 12) et une icône (grille de 40, dont une xXx dessinée sur mesure).
- **Bandeaux par couleur** : sous « Sobre de tout », un bandeau « Sobre depuis » par couleur choisie (couleurs ayant au moins 2 substances), ajouté via la pilule **+**. Tap → défile jusqu'à la dernière substance consommée de cette couleur. « Sobre de tout » reste toujours en tête. Les bandeaux et leur ordre sont inclus dans les sauvegardes et les exports.
- **Appui long** (substance ou bandeau) → **mode réorganisation** : icônes, noms et compteurs vibrent ; à droite, un **crayon** (substances : renommer, couleur, icône) et une **poubelle** (suppression avec confirmation). Appui long pour saisir puis glisser ; bandeaux et substances restent chacun dans leur section, avec butées en haut / en bas ; défilement automatique près des bords.
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

### Notifications de paliers
- Paliers **24 h, 48 h, 7 jours, 15 jours, tous les mois**, comptés depuis la dernière prise ; chaque nouvelle prise relance le compteur. Pas rétroactif.
- Cibles : **toutes les substances**, une **catégorie** (couleur avec au moins 2 substances) ou une **substance**.
- Une prise ne déclenche qu'une notification par palier (priorité substance > catégorie > toutes).
- Notifications **silencieuses** (ni son ni vibration), texte neutre ; un tap ouvre le compteur concerné.
- Accès : cloche sous « settings » (liste et Global), cloche colorée dans le calendrier d'une substance, et Paramètres. Cloche pleine dès qu'une notification est active.
- 100 % locales (pas de serveur) ; sans l'autorisation « Alarmes et rappels », Android peut les livrer jusqu'à ~1 h après le palier.

### Verrouillage (option)
- Désactivé par défaut. Demande l'empreinte ou le code **du téléphone** à l'ouverture, puis après 5 min hors de l'app.

### Divers
- Retours haptiques sur toute l'app.
- Dons via le Play Store (Palier 1 à 6).
- Zone de danger : remise à zéro complète, avec les données conservées dans le gestionnaire de sauvegardes.

---

## Chiffrement des exports

- **AES-256-CBC**, clé dérivée du code PIN par **PBKDF2-SHA256, 10 000 itérations** (calcul natif via `react-native-quick-crypto`, repli JavaScript), avec un sel et un IV aléatoires pour chaque fichier.
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
| Chiffrement | `react-native-quick-crypto` (PBKDF2 natif), `crypto-js` (AES), `expo-crypto` |
| Fichiers | `expo-file-system` (Storage Access Framework), `expo-document-picker` |
| Préférences | `@react-native-async-storage/async-storage` |
| Haptique | `expo-haptics` |
| Notifications | `expo-notifications` (locales) |
| Verrouillage | `expo-local-authentication` |
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

### 1.28
- Flash du bandeau au tap sur une notification : calque monté seulement pendant le flash + filet de sécurité si le retour au premier plan est manqué ; Debug affiche le dernier flash.
- Nouvelle notification : la sélection ne propose que les cibles sans notification et mène directement au choix du palier, puis à l'écran de la cible.
- Contenu des fenêtres de notifications centré verticalement.
- Retours à la ligne dans trois messages (permission refusée, sauvegarde créée, base verrouillée).

### 1.27
- Tap sur une notification : prise en charge renforcée (app lancée ou ramenée) et flash du bandeau plus visible ; Debug affiche le dernier tap reçu.
- Assistant notifications : même taille pour tous les écrans (sauf la sélection d'une cible), chevron « < » toujours au même endroit, plus de bouton Fermer ; « Toutes les substances » dans la sélection.
- Cloche de nouveau sur la liste des substances ; pilule + plus petite ; icône de notification agrandie.
- Bandeau supprimé : fondu puis la place se referme en douceur.
- Noms de substances : 20 caractères max, plus de place à l'affichage ; retour à la ligne des noms avec le séparateur en début de ligne.

### 1.26
- **Déchiffrement / chiffrement quasi instantanés** : PBKDF2 en natif (`react-native-quick-crypto`), format de fichier inchangé.
- Assistant notifications : lignes plus fines à fond pâle + liseré, « Toutes substances » / « Toutes les ● », bouton + rond centré.
- Cloches vides / pleines ; plus de cloche sur la liste des substances.
- Paramètres épurés (titres seulement pour Gestionnaire, Debug, À propos) ; Debug : notifications de test réelles (10 s) et état du chiffrement natif.
- Menu du crayon : croix de fermeture, titre centré.
- Bandeaux supprimés en fondu ; pilule + toujours au-dessus d'un bandeau saisi ; retour à la ligne propre des noms.
- Compteurs : « 1 jour 59 min » au lieu de « 1 jour 0 heure » (même règle pour heures, mois, années).

### 1.25
- **Notifications de paliers de sobriété** (voir plus haut), incluses dans les sauvegardes et exports.
- **Verrouillage de l'app** (option, déverrouillage du téléphone).
- Réorganisation : crayon + poubelle fixes (seuls icône / nom / compteur vibrent) ; plus de bouton ⋯ en mode normal ; la copie saisie ne masque plus les séparateurs ; barre blanche sur les séparateurs ; une seule vibration en butée.
- Une couleur qui passe sous 2 substances n'est plus une catégorie : bandeau et notifications supprimés.
- Pilule + plus longue et plus basse, utilisable en réorganisation. Le point est la 1re icône et celle par défaut.

### 1.24
- Compteurs centrés dans une colonne (liste des substances et fenêtre d'un jour du calendrier).
- Réorganisation : repère et haptique quand l'élément saisi arrive en butée de sa section.
- Confirmation de suppression d'un bandeau avec sa pastille de couleur ; textes du choix de bandeau corrigés.
- Création de substance : icône par défaut = la première de la liste.

### 1.23
- **Un seul mode réorganisation**, ouvert par appui long sur une substance ou un bandeau, avec **poubelle** à droite (confirmation ; sauvegarde automatique avant suppression d'une substance). Le menu ⋯ ne garde que Renommer / Couleur / Icône.
- Glisser-déposer : un élément saisi ne peut pas sortir de sa section (butées).
- **Bandeaux et leur ordre inclus dans les sauvegardes et les exports** ; ajoutés à l'import / la restauration s'ils manquent.
- Pilule + plus petite (blanche, + noir) ; séparateurs plus visibles dans le choix d'un bandeau.
- Icône xXx réduite. Grille 5×8 pour « Changer l'icône », 8×5 à la création.

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

- **Verrouillage natif à l'extinction de l'écran** (petit module Android) si les 5 min ne suffisent pas.
- **Session d'optimisation** : cache central des prises, statistiques précalculées, nettoyage du code hérité.

---

Licence MIT.
