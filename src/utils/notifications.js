// Notifications de paliers de sobriété (1.25) — 100 % locales, aucune connexion.
//
// Principe : pour chaque règle (cible + palier), on calcule l'instant du palier à partir de la
// DERNIÈRE PRISE de la cible et on programme une notification locale à cet instant.
// Chaque nouvelle prise / modification du calendrier → tout est reprogrammé (rescheduleAll).
//
//  - Cibles : 'all' (toutes les substances), 'color' (catégorie = couleur ≥ 2 substances), 'sub',
//    'custom' (bandeau personnalisé, 1.41) et 'record' (record de sobriété de tout battu, 1.41).
//  - Paliers : 24 h, 48 h, 7 j, 15 j (une fois par période de sobriété) et « Tous les mois »
//    (1 mois, 2 mois… sans fin ; on programme les 12 prochains, reprogrammés à chaque ouverture).
//  - Pas rétroactif : un palier déjà dépassé ne part pas.
//  - Anti-doublon : UNE prise ne déclenche qu'UNE notification par palier. Si la substance, sa
//    catégorie et « Toutes » tombent pile au même instant (même prise), seule la plus précise part :
//    substance > catégorie > Toutes.
//  - Silencieuses : canal Android sans son ni vibration.
//  - Heure : sans l'autorisation « Alarmes et rappels », Android peut livrer jusqu'à ~1 h après
//    (expo-notifications passe en alarme exacte seulement si l'autorisation est accordée).
//  - Redémarrage du téléphone : expo-notifications reprogramme (BOOT_COMPLETED) ; on reprogramme
//    aussi à chaque ouverture de l'app.

import { Platform, ToastAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';

const MS_HOUR = 3600 * 1000;
const MS_DAY = 24 * MS_HOUR;
const MS_MONTH = 30.4375 * MS_DAY; // même valeur que les compteurs (utils/duration.js)
const MONTHS_AHEAD = 12;
const MAX_SCHEDULED = 200;         // marge sous la limite d'alarmes Android
const CHANNEL_ID = 'paliers';

export const PALIERS = [
  { id: '24h', label: '24 heures', ms: 24 * MS_HOUR },
  { id: '48h', label: '48 heures', ms: 48 * MS_HOUR },
  { id: '7d', label: '7 jours', ms: 7 * MS_DAY },
  { id: '15d', label: '15 jours', ms: 15 * MS_DAY },
  { id: 'monthly', label: 'Tous les mois', ms: null },
];
export const palierLabel = (id) => PALIERS.find((p) => p.id === id)?.label || id;
export const PALIER_ORDER = PALIERS.map((p) => p.id);

const PRIORITY = { sub: 3, color: 2, custom: 2, all: 1 };

// --- Configuration (au démarrage) ---
export async function configureNotifications() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Paliers de sobriété',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
        enableVibrate: false,
        vibrationPattern: null,
        showBadge: false,
      });
    }
  } catch (e) { /* best effort */ }
}

export async function hasNotifPermission() {
  try {
    const p = await Notifications.getPermissionsAsync();
    return !!p.granted;
  } catch (e) { return false; }
}

// Demande l'autorisation (Android 13+) — appelée à la création d'une notification
export async function ensureNotifPermission() {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (cur.canAskAgain === false) return false;
    const req = await Notifications.requestPermissionsAsync();
    return !!req.granted;
  } catch (e) { return false; }
}

// Dernière prise d'une cible → { ts, subId }
function lastFor(rule, substances, lastTimestamps, customBanners = []) {
  let best = { ts: 0, subId: null };
  const custom = rule.target === 'custom' ? customBanners.find((b) => b.id === rule.key) : null;
  if (rule.target === 'custom' && !custom) return best;
  for (const s of substances) {
    if (rule.target === 'sub' && s.id !== rule.key) continue;
    if (rule.target === 'color' && s.color !== rule.key) continue;
    if (custom && !custom.subIds.includes(s.id)) continue;
    const ts = lastTimestamps[s.id] || 0;
    if (ts > best.ts) best = { ts, subId: s.id };
  }
  return best;
}

// Liste des notifications à programmer (triées, dédoublonnées)
export function computeSchedule({ notifRules = [], substances = [], lastTimestamps = {}, customBanners = [], allConsumptions = [] }, now = Date.now()) {
  const byRecord = new Map(); // `${subId}:${instant}` → candidat le plus précis
  for (const rule of notifRules) {
    // 1.41 — « Record battu » : l'instant où la période sobre en cours (toutes substances)
    // dépasse la plus longue période passée. Rien si elle l'a déjà dépassée (pas rétroactif).
    if (rule.target === 'record') {
      const ids = new Set(substances.map((s) => s.id));
      const ts = allConsumptions.filter((c) => ids.has(c.substanceId)).map((c) => c.timestamp).sort((a, b) => a - b);
      if (ts.length < 2) continue;
      let best = 0;
      for (let i = 1; i < ts.length; i++) best = Math.max(best, ts[i] - ts[i - 1]);
      const t = ts[ts.length - 1] + best + 60 * 1000; // 1 min après l'égalité : record vraiment battu
      if (t > now + 5000) byRecord.set(`record:${Math.round(t)}`, { time: Math.round(t), priority: 0, data: { target: 'record', key: null, palier: 'record' } });
      continue;
    }
    const { ts, subId } = lastFor(rule, substances, lastTimestamps || {}, customBanners);
    if (!ts || !subId) continue; // aucune prise : rien ne part
    const times = [];
    if (rule.palier === 'monthly') {
      const k0 = Math.max(1, Math.floor((now - ts) / MS_MONTH) + 1);
      for (let j = 0; j < MONTHS_AHEAD; j++) times.push(ts + (k0 + j) * MS_MONTH);
    } else {
      const p = PALIERS.find((x) => x.id === rule.palier);
      if (p?.ms) times.push(ts + p.ms);
    }
    for (const t of times) {
      if (t <= now + 5000) continue; // pas rétroactif
      const recordKey = `${subId}:${Math.round(t)}`;
      const cand = { time: Math.round(t), priority: PRIORITY[rule.target] || 0, data: { target: rule.target, key: rule.key, palier: rule.palier } };
      const prev = byRecord.get(recordKey);
      if (!prev || cand.priority > prev.priority) byRecord.set(recordKey, cand);
    }
  }
  return [...byRecord.values()].sort((a, b) => a.time - b.time).slice(0, MAX_SCHEDULED);
}

// Contenu d'une notification de palier (texte neutre) — partagé avec le debug
function buildContent(data) {
  return {
    title: 'Almanac',
    body: data?.target === 'record'
      ? "Nouveau record atteint, cliquez pour plus d'info"
      : "Nouveau palier atteint, cliquez pour plus d'info",
    data,
  };
}

// Annule les notifications programmées, sauf celles de test du debug (elles doivent partir)
async function cancelScheduledPaliers() {
  const list = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of list) {
    if (n?.content?.data?.debugTest) continue;
    await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
}

// Debug (1.26) : vraie notification, même canal / texte / données, qui part dans `delaySec` secondes.
// target : { target: 'all' | 'color' | 'sub', key }
export async function scheduleTestNotification(target, delaySec = 10) {
  const ok = await ensureNotifPermission();
  if (!ok) return false;
  await configureNotifications();
  await Notifications.scheduleNotificationAsync({
    content: buildContent({ target: target.target, key: target.key ?? null, palier: 'debug', debugTest: true }),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: Date.now() + delaySec * 1000,
      channelId: CHANNEL_ID,
    },
  });
  return true;
}

// Reprogrammation complète (sérialisée : un seul passage à la fois)
let chain = Promise.resolve();
export function rescheduleAll(state) {
  chain = chain.then(async () => {
    try {
      await cancelScheduledPaliers();
      if (!state.notifRules || state.notifRules.length === 0) return;
      if (!(await hasNotifPermission())) return;
      const list = computeSchedule(state);
      for (const n of list) {
        await Notifications.scheduleNotificationAsync({
          content: buildContent(n.data),
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: n.time,
            channelId: CHANNEL_ID,
          },
        });
      }
    } catch (e) { /* best effort : on retentera au prochain changement / ouverture */ }
  });
  return chain;
}

// Suivi du store : prises, substances ou règles qui changent → reprogrammation (anti-rebond)
export function startNotificationSync(useStore) {
  let timer = null;
  const kick = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => rescheduleAll(useStore.getState()), 800);
  };
  kick();
  return useStore.subscribe((state, prev) => {
    if (!prev) return;
    if (state.lastTimestamps !== prev.lastTimestamps
      || state.substances !== prev.substances
      || state.notifRules !== prev.notifRules
      || state.customBanners !== prev.customBanners
      || state.allConsumptions !== prev.allConsumptions) kick();
  });
}

// Tap sur une notification → destination ({ target, key } contenu dans data)
export function readNotificationTarget(response) {
  const d = response?.notification?.request?.content?.data;
  if (!d || !d.target) return null;
  return { target: d.target, key: d.key ?? null, id: response?.notification?.request?.identifier };
}

// 1.41 — Message flottant Android à l'activation d'une notification (comme un réveil)
export function toastNotifOn(text) {
  try { if (Platform.OS === 'android') ToastAndroid.show(`Notification activée : ${text}`, ToastAndroid.SHORT); } catch (e) { /* rien */ }
}
