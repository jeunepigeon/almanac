# Almanac

**Tracker neutre de consommation** — outil personnel et privé pour suivre n'importe quel comportement répété : substances, habitudes, prises de médicaments, etc.

Tout reste **local sur ton téléphone** (SQLite via expo-sqlite). Aucun compte, aucun serveur, aucun tracking.

**Version actuelle : v1.1.6** — Android only (build APK via EAS).

---

## Stack technique

- **React Native + Expo SDK 54**
- **expo-sqlite** — base de données locale
- **Zustand** — état global
- **expo-iap** — donations Play Store (palier 1 à 6)
- **react-native-svg** — graphiques custom (BarChart, LineChart, MultiLineChart, PieChart)
- **@react-navigation/native** + native-stack — navigation
- **crypto-js + expo-crypto** — chiffrement AES-256 des exports
- **expo-file-system + expo-sharing + expo-document-picker** — import/export

---

## Build

```bash
eas build --platform android --profile preview
```

À chaque nouvelle version, incrémenter **versionCode** dans `app.json` sinon Android peut ne pas considérer le build comme une mise à jour.

---

## Structure du projet

```
src/
├── components/
│   ├── Charts.js              # BarChart, LineChart, MultiLineChart, PieChart, ChartCard
│   ├── GlobalHistoryView.js   # Onglet Historique au global (avec pills multi-sélection)
│   ├── LiveCounter.js          # Compteur temps écoulé (s, min, heures, jours, mois, an/ans)
│   ├── LogConsumptionModal.js  # Modale ajout/édition conso
│   ├── MonthCalendar.js        # Calendrier mensuel avec cercle vert jours sobres
│   └── StatsView.js            # Vue stats (hero, grille 3x3, camembert, courbes)
├── screens/
│   ├── MainScreen.js           # Wrapper pager Substances/Global
│   ├── SubstancesPage.js       # Liste des substances avec compteur live
│   ├── GlobalCalendarPage.js   # Page Global avec onglets Calendrier/Historique/Stats
│   ├── SubstanceScreen.js      # Page d'une substance (Calendrier/Historique/Stats)
│   ├── SettingsScreen.js       # Paramètres
│   ├── ExportScreen.js         # Export AES-256
│   ├── ImportScreen.js         # Import AES-256
│   └── DonationsScreen.js      # 6 paliers de soutien
├── utils/
│   ├── stats.js                # WINDOWS, computeStats, computeGlobalStats, formatDaysLong
│   ├── duration.js             # formatDurationSince (mots complets fr)
│   ├── dates.js                # formatDateLong, formatTime, dayKeyOf
│   ├── exportImport.js         # Chiffrement export/import
│   └── useBilling.js           # Hook expo-iap
├── store/                       # Zustand store
├── db/                          # SQLite (init, migrations, requêtes)
└── theme.js                     # Palette 12 couleurs, espacements, typo
```

---

## Release notes

### v1.1.6 — actuelle
- **Courbes/points jamais à 0** : points isolés à 30 % de hauteur, courbes scalées entre 5 % (min positif) et 100 % (max). Un humain voit d'un coup d'œil que "consommé" est visuellement au-dessus du fond.
- **Liste substances** : layout sobre nom + compteur sur une ligne, weight light harmonisé.
- **Pills filtres historique** : `flex-wrap` au lieu de scroll horizontal, toutes visibles d'un coup, plus de mouvement bizarre quand "aucune conso".
- **Settings** : "fait par pigeon" → "développé par pigeon".

### v1.1.5
- **Calendrier global jours sobres** : cercle vert (liseret) autour du chiffre, dimensions parfaitement carrées (32×32) pour garantir le rond.
- **Pills historique = AND** : tap plusieurs substances → on ne voit que les jours où *toutes* ont été consommées. Sinon "Aucune conso correspondante".
- **Fenêtre 30 jours en mode points** : sur une si courte période, pas de tendance possible — tout est affiché en points avec jitter horizontal anti-overlap.
- **Liste substances layout D (temporaire)** : compteur dominant à droite.
- **Format temps en mots complets** : `45 min` / `3 heures 12 min` / `5 jours 3 heures` / `2 mois 5 jours` / `1 an 2 mois` / `2 ans 5 mois`. Pluriel correct.
- **Déduplication markers calendrier par couleur** : si 2 substances ont la même couleur, un seul point.

### v1.1.4
- **Courbes intelligentes** : ≥ 4 occurrences = courbe reliant tous les points actifs ; < 4 = points isolés.
- **Suppression Activity Detail + pinch zoom + hint "Cliquer pour explorer"** : allégement du code, suppression des deps `gesture-handler` et `reanimated`.

### v1.1.3
- **Onglet "Historique" au global** : Calendrier / Historique / Stats.
- **Capsule glissante** Prises/Dosage avec hitbox unique.
- **Format temps long** "1 mois 12 jours" dans la grille 3×3.
- **Liste substances** : compteur en plus gros.

### v1.1.2
- Fix rendu des courbes : segments propres, plus de cercles dispersés.
- Page Activité dans le temps charge ses propres données depuis la DB.

### v1.1.0 – v1.1.1
- Page dédiée Activité dans le temps avec pinch zoom (retirée en v1.1.4).
- Mode Doses sans dosage renseigné → plateau plat à 0.5.

### v1.0.9
- **Multi-courbes au global** : une courbe par substance cochée dans le camembert.
- **Hero global LiveCounter** "Temps depuis la dernière" toutes substances confondues.
- **Tendance → Jours consommés %** dans la grille 3×3.

### v1.0.8
- Switch Prises/Jours dans le titre du graphique d'activité.

### v1.0.7
- Graduations temporelles sous la courbe (3 dates).
- Hero "Jours sobres consécutifs" au global.

### v1.0.5 – v1.0.6
- Arc-en-ciel par segment au global (substance dominante par jour).
- Bandeau date harmonisé, plus bas pour centrage vertical.
- Checkboxes triées par couleur, sélection conservée au switch de fenêtre.

### v1.0.4
- Décocher une substance au global → exclue du timeline, heure, jour de semaine.
- Bouton "Perso" + date picker natif Android.
- Pause en cours + plus longue pause sur historique complet.

### v1.0.3
- Checkboxes camembert scrollables.
- Couleur dominante sur le timeline au global.

### v1.0.2
- Fenêtres glissantes : 30j / 90j / 180j / 365j / Tout.

### v1.0.1
- Logo final : "a" Termes serif + 4 points colorés.
- Donations renommées Palier 1 à 6.
- Vérification ADI via plugin `withDangerousMod`.

### v1.0.0
- Migration `expo-in-app-purchases` → `expo-iap`.
- Premier build prêt pour publication.

---

## Status Google Play Console

- [x] Vérification d'identité
- [x] Package `com.jeunepigeon.almanac` enregistré
- [x] Vérification ADI signée
- [x] Privacy policy hébergée (emilio.website/almanac/privacy)
- [ ] Créer les 6 in-app products (Palier 1 à 6, consumables)
- [ ] Upload APK en Internal Testing
- [ ] 12 testeurs pendant 14 jours
- [ ] Soumission publication publique

---

## Pour aller plus loin

- **i18n** FR/EN/IT/ES avec détection auto et fallback anglais
- **Bloquer la navigation future** dans les calendriers
- **Build local** comme alternative à EAS Cloud (limite 15 builds/mois)
- **SQLCipher** pour chiffrer la DB elle-même (actuellement seuls les exports sont AES-256)

---

Licence MIT.
