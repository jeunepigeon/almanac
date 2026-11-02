import { create } from 'zustand';
import {
  dbGetSubstances,
  dbCreateSubstance,
  dbUpdateSubstance,
  dbDeleteSubstance,
  dbArchiveSubstance,
  dbRestoreSubstance,
  dbFindSubstanceByName,
  dbGetLastTimestampBySubstance,
  dbGetLastTimestampFor,
  dbGetAllConsumptions,
  dbCreateConsumption,
  dbUpdateConsumption,
  dbDeleteConsumption,
  dbGetConsumptionsBySubstance,
  dbWipeAll,
  dbReorderSubstances,
  dbGetAllSnapshots,
  dbDeleteSnapshot,
  dbMarkSnapshotsConsulted,
  dbInsertSubstanceRaw,
  dbInsertConsumptionRaw,
} from '../db';
import { createSnapshot, makeUniqueSnapshotName, fmtDateTiret, fmtDateTiretHM, parseSnapshot } from '../utils/snapshots';

// Normalise un nom de substance pour matching lors de la fusion (trim + lowercase)
function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}
import { dbGetSnapshotData } from '../db';
import * as Crypto from 'expo-crypto';
import { getJSON, setJSON } from '../utils/prefs';
import { formatDayKey } from '../utils/dates';

// --- Stock central des prises (1.31) ---
// Toutes les prises sont lues UNE fois (au chargement), puis tenues à jour en mémoire à chaque
// ajout / modification / suppression. Chaque prise porte sa clé de jour (dayKey « AAAA-MM-JJ »)
// calculée une seule fois. Plus de rechargements complets de la base par les écrans.
export const EMPTY_LIST = [];
const SAFETY_PREFIXES = ['avant-import-', 'avant-restauration-', 'avant-fusion-'];
const SAFETY_KEEP = 10; // référence stable (un sélecteur qui renvoie [] neuf ferait boucler le rendu)
const byTsDesc = (a, b) => b.timestamp - a.timestamp;
function withDayKey(c) { return { ...c, dayKey: formatDayKey(c.timestamp) }; }
function indexConsumptions(all) {
  const bySub = {};
  const last = {};
  for (const c of all) { // `all` trié du plus récent au plus ancien
    const sid = c.substanceId;
    (bySub[sid] || (bySub[sid] = [])).push(c);
    if (last[sid] == null) last[sid] = c.timestamp;
  }
  return { bySub, last };
}

const COLOR_BANNERS_KEY = 'almanac.colorBanners';
const NOTIF_RULES_KEY = 'almanac.notifRules';
const APP_LOCK_KEY = 'almanac.appLock';

// Notifications de paliers (1.25). Une règle = { target: 'all' | 'color' | 'sub', key, palier }
//  - key : null pour 'all', la couleur pour 'color', l'id de substance pour 'sub'
//  - palier : '24h' | '48h' | '7d' | '15d' | 'monthly'
export const notifRuleId = (r) => `${r.target}:${r.key || ''}:${r.palier}`;
function normalizeRules(list) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || !r.target || !r.palier) continue;
    const rule = { target: r.target, key: r.target === 'all' ? null : (r.key || null), palier: r.palier };
    if (rule.target !== 'all' && !rule.key) continue;
    const id = notifRuleId(rule);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(rule);
  }
  return out;
}

// Applique un changement aux listes d'une substance + liste globale, retrie, recalcule sa dernière prise
function applyConsumptionChange(state, substanceId, updateSubList, updateAll) {
  const list = updateSubList(state.consumptionsBySubstance[substanceId] || []).sort(byTsDesc);
  const bySub = { ...state.consumptionsBySubstance, [substanceId]: list };
  const lastTimestamps = { ...state.lastTimestamps };
  if (list.length > 0) lastTimestamps[substanceId] = list[0].timestamp;
  else { delete lastTimestamps[substanceId]; delete bySub[substanceId]; }
  return {
    consumptionsBySubstance: bySub,
    allConsumptions: updateAll(state.allConsumptions).sort(byTsDesc),
    lastTimestamps,
  };
}

export const useStore = create((set, get) => ({
  substances: [],
  archivedSubstances: [],
  lastTimestamps: {},
  consumptionsBySubstance: {},
  allConsumptions: [],        // toutes les prises, de la plus récente à la plus ancienne
  consumptionsLoaded: false,
  snapshots: [],
  hasUnconsultedSnapshots: false,
  // Signal pour switcher vers Global > Stats depuis n'importe quel écran
  // (incrément d'un tick pour déclencher useEffect)
  gotoGlobalStatsTick: 0,
  requestGotoGlobalStats: () => set((s) => ({ gotoGlobalStatsTick: s.gotoGlobalStatsTick + 1 })),
  pagerLocked: false,
  setPagerLocked: (locked) => set({ pagerLocked: !!locked }),

  // --- Notifications (1.25) ---
  notifRules: [],
  setNotifRules: (list) => {
    const next = normalizeRules(list);
    set({ notifRules: next });
    setJSON(NOTIF_RULES_KEY, next);
  },
  addNotifRule: (rule) => get().setNotifRules([...get().notifRules, rule]),
  removeNotifRule: (rule) => get().setNotifRules(get().notifRules.filter((r) => notifRuleId(r) !== notifRuleId(rule))),
  // Import / restauration : ajoute les règles absentes (les doublons sont ignorés)
  mergeNotifRules: (list = []) => get().setNotifRules([...get().notifRules, ...list]),

  // Tap sur une notification « Toutes » / catégorie → liste des substances + flash du bandeau
  notifFocus: null, // { kind: 'all' | 'color', color, tick }
  lastNotifTap: null, // debug : { target, key, at, via }
  setLastNotifTap: (v) => set({ lastNotifTap: v }),
  lastBannerFlash: null, // debug : { id, at }
  setLastBannerFlash: (v) => set({ lastBannerFlash: v }),
  requestNotifFocus: (kind, color = null) => set((s) => ({
    notifFocus: { kind, color, tick: (s.notifFocus?.tick || 0) + 1 },
  })),

  // Verrouillage de l'app (1.25) : désactivé par défaut
  appLockEnabled: false,
  setAppLockEnabled: (on) => { set({ appLockEnabled: !!on }); setJSON(APP_LOCK_KEY, !!on); },

  // Catégorie = couleur avec au moins 2 substances. Si une couleur passe sous 2 (suppression,
  // changement de couleur, remise à zéro…), son bandeau et ses notifications sont SUPPRIMÉS.
  // Les notifications de substances qui n'existent plus sont supprimées aussi.
  pruneOrphans: () => {
    const { substances, colorBanners, notifRules } = get();
    const count = {};
    for (const sub of substances) count[sub.color] = (count[sub.color] || 0) + 1;
    const ids = new Set(substances.map((x) => x.id));
    const banners = colorBanners.filter((c) => (count[c] || 0) >= 2);
    const rules = notifRules.filter((r) => (
      r.target === 'all'
      || (r.target === 'color' && (count[r.key] || 0) >= 2)
      || (r.target === 'sub' && ids.has(r.key))
    ));
    if (banners.length !== colorBanners.length) { set({ colorBanners: banners }); setJSON(COLOR_BANNERS_KEY, banners); }
    if (rules.length !== notifRules.length) { set({ notifRules: rules }); setJSON(NOTIF_RULES_KEY, rules); }
  },

  // Bandeaux « Sobre depuis » par couleur (1.22) : liste ordonnée de couleurs.
  colorBanners: [],
  addColorBanner: (color) => {
    const cur = get().colorBanners;
    if (cur.includes(color)) return;
    const next = [...cur, color];
    set({ colorBanners: next });
    setJSON(COLOR_BANNERS_KEY, next);
  },
  // Import / restauration : ajoute à la fin les bandeaux absents (l'ordre actuel est conservé)
  mergeColorBanners: (colors = []) => {
    const cur = get().colorBanners;
    const add = colors.filter((c, i) => c && !cur.includes(c) && colors.indexOf(c) === i);
    if (add.length === 0) return;
    const next = [...cur, ...add];
    set({ colorBanners: next });
    setJSON(COLOR_BANNERS_KEY, next);
  },
  removeColorBanner: (color) => {
    const next = get().colorBanners.filter((c) => c !== color);
    set({ colorBanners: next });
    setJSON(COLOR_BANNERS_KEY, next);
  },
  // newOrder : couleurs visibles dans le nouvel ordre ; les couleurs masquées (0 substance) gardent leur place en fin
  reorderColorBanners: (newOrder) => {
    const rest = get().colorBanners.filter((c) => !newOrder.includes(c));
    const next = [...newOrder, ...rest];
    set({ colorBanners: next });
    setJSON(COLOR_BANNERS_KEY, next);
  },
  ready: false,

  loadAll: async () => {
    // Lectures en parallèle (avant : l'une après l'autre)
    const [all, rawCons, snapshots, colorBanners, notifRules, appLockEnabled] = await Promise.all([
      dbGetSubstances({ includeArchived: true }),
      dbGetAllConsumptions(),
      dbGetAllSnapshots(),
      getJSON(COLOR_BANNERS_KEY, []),
      getJSON(NOTIF_RULES_KEY, []),
      getJSON(APP_LOCK_KEY, false),
    ]);
    const hasUnconsulted = snapshots.some((s) => !s.consulted);
    const allConsumptions = rawCons.map(withDayKey); // déjà triées du plus récent au plus ancien
    const { bySub, last: lastTimestamps } = indexConsumptions(allConsumptions);
    set({
      allConsumptions,
      consumptionsLoaded: true,
      colorBanners: Array.isArray(colorBanners) ? colorBanners : [],
      notifRules: normalizeRules(notifRules),
      appLockEnabled: !!appLockEnabled,
      substances: all.filter((s) => !s.archived),
      archivedSubstances: all.filter((s) => s.archived),
      lastTimestamps,
      consumptionsBySubstance: bySub,
      snapshots,
      hasUnconsultedSnapshots: hasUnconsulted,
      ready: true,
    });
    get().pruneOrphans();
  },

  loadSnapshots: async () => {
    const snapshots = await dbGetAllSnapshots();
    const hasUnconsulted = snapshots.some((s) => !s.consulted);
    set({ snapshots, hasUnconsultedSnapshots: hasUnconsulted });
  },

  markSnapshotsConsulted: async () => {
    await dbMarkSnapshotsConsulted();
    const snapshots = await dbGetAllSnapshots();
    set({ snapshots, hasUnconsultedSnapshots: false });
  },

  deleteSnapshot: async (id) => {
    await dbDeleteSnapshot(id);
    const snapshots = await dbGetAllSnapshots();
    const hasUnconsulted = snapshots.some((s) => !s.consulted);
    set({ snapshots, hasUnconsultedSnapshots: hasUnconsulted });
  },

  createSnapshotFromLive: async (baseName, substanceIds = null) => {
    const state = get();
    // Toutes les prises : stock central (avant : une requête par substance)
    const dbAllCons = state.consumptionsLoaded ? state.allConsumptions : await dbGetAllConsumptions();
    const uniqueName = await makeUniqueSnapshotName(baseName);
    const snap = await createSnapshot(
      { substances: state.substances, archivedSubstances: state.archivedSubstances, consumptions: dbAllCons, banners: state.colorBanners, notifs: state.notifRules },
      uniqueName,
      substanceIds
    );
    // 1.31 : rétention — on garde les 10 dernières sauvegardes de SÉCURITÉ automatiques
    // (avant-import / avant-restauration / avant-fusion). Jamais touchées : sauvegardes manuelles,
    // « archivage-… » (substances supprimées) et « remise-a-zero-… ».
    let snapshots = await dbGetAllSnapshots();
    const safety = snapshots.filter((x) => SAFETY_PREFIXES.some((p) => (x.name || '').startsWith(p)));
    if (safety.length > SAFETY_KEEP) {
      for (const old of safety.slice(SAFETY_KEEP)) await dbDeleteSnapshot(old.id); // liste déjà du plus récent au plus ancien
      snapshots = await dbGetAllSnapshots();
    }
    set({ snapshots, hasUnconsultedSnapshots: true });
    return snap;
  },

  // Fusion d'un snapshot dans les données live.
  // Clé de matching : NOM (case-insensitive, trim) uniquement.
  // Si une substance du snapshot a le même nom qu'une substance active :
  //   → les consos manquantes sont ajoutées à la substance ACTIVE (son id est utilisé)
  //   → couleur/icône/dosage de l'actif sont CONSERVÉS
  // Si pas de match par nom → la substance du snapshot est créée (nouvelle entrée)
  // Dédup consos par timestamp exact (sur la substance de destination).
  fusionSnapshot: async (snapshotId, substanceIds = null) => {
    const state = get();
    const jsonStr = await dbGetSnapshotData(snapshotId);
    if (!jsonStr) return { added: 0 };
    const snap = parseSnapshot(jsonStr);

    // Auto-snapshot AVANT la fusion
    await get().createSnapshotFromLive(`avant-fusion-${fmtDateTiretHM()}`);

    const activeSubs = [...state.substances, ...state.archivedSubstances];
    // Map : nom normalisé → substance active
    const activeByName = new Map();
    for (const s of activeSubs) {
      activeByName.set(normalizeName(s.name), s);
    }

    // Pour chaque substance du snapshot : trouver son équivalent actif par nom, ou créer
    // Map : snapshot_substance_id → active_substance_id (pour rerouter les consos)
    const idMap = {};
    for (const s of snap.substances) {
      if (substanceIds && !substanceIds.includes(s.id)) continue;
      const key = normalizeName(s.name);
      const matched = activeByName.get(key);
      if (matched) {
        // Match par nom → on garde l'actif, on route les consos vers lui
        idMap[s.id] = matched.id;
      } else {
        // Pas de match → créer avec les propriétés du snapshot
        await dbInsertSubstanceRaw({
          id: s.id, name: s.name, color: s.color, icon: s.icon,
          createdAt: s.createdAt, archived: !!s.archived, position: s.position ?? 0,
        });
        idMap[s.id] = s.id;
      }
    }

    // Consos : ajouter celles qui n'existent pas déjà (dedup par timestamp exact sur dest)
    let added = 0;
    for (const c of snap.consumptions) {
      if (substanceIds && !substanceIds.includes(c.substanceId)) continue;
      const destSubId = idMap[c.substanceId];
      if (!destSubId) continue; // substance ignorée (non cochée)
      const existingList = await dbGetConsumptionsBySubstance(destSubId);
      const dup = existingList.some((ec) => ec.timestamp === c.timestamp);
      if (dup) continue;
      await dbInsertConsumptionRaw({
        id: c.id, substanceId: destSubId, timestamp: c.timestamp,
        dosage: c.dosage, notes: c.notes, createdAt: c.createdAt,
      });
      added++;
    }

    // Reload tout
    await get().loadAll();
    return { added };
  },

  refreshLastTimestamps: async () => {
    const lastTimestamps = await dbGetLastTimestampBySubstance();
    set({ lastTimestamps });
  },

  // Conservé pour compatibilité : les prises sont déjà toutes en mémoire (stock central)
  loadConsumptionsForSubstance: async () => {},

  findByName: async (name) => {
    return await dbFindSubstanceByName(name);
  },

  // Crée une substance, avec vérification de doublons case-insensitive
  createSubstance: async ({ name, color, icon }) => {
    const trimmed = name.trim();
    // Vérifie si une substance (active ou archivée) existe avec ce nom (case-insensitive)
    const existing = [...get().substances, ...get().archivedSubstances].find(
      (s) => s.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      throw new Error(`Une substance nommée "${existing.name}" existe déjà`);
    }
    const created = await dbCreateSubstance({ name: trimmed, color, icon });
    // En FIN de liste, comme en base (avant : en tête en mémoire, puis en bas au redémarrage)
    set((state) => ({ substances: [...state.substances, created] }));
    return created;
  },

  updateSubstance: async (id, fields) => {
    // Si on renomme, vérifier pas de doublon
    if (fields.name) {
      const trimmed = fields.name.trim();
      const existing = [...get().substances, ...get().archivedSubstances].find(
        (s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        throw new Error(`Une substance nommée "${existing.name}" existe déjà`);
      }
      fields.name = trimmed;
    }
    await dbUpdateSubstance(id, fields);
    const updateInArray = (arr) =>
      arr.map((s) => (s.id === id ? { ...s, ...fields } : s));
    set((state) => ({
      substances: updateInArray(state.substances),
      archivedSubstances: updateInArray(state.archivedSubstances),
    }));
    if (fields.color) get().pruneOrphans(); // une couleur peut passer sous 2 substances
  },

  // Suppression d'une substance = archivage via snapshot + wipe de la DB
  // Snapshot nommé "archivage-<nom>-DD-MM-YYYY" contenant uniquement cette substance et ses consos
  deleteSubstance: async (id) => {
    const sub = [...get().substances, ...get().archivedSubstances].find((s) => s.id === id);
    if (sub) {
      // Nom du snapshot : slug depuis le nom de la substance
      const slug = sub.name.trim().replace(/\s+/g, '-').toLowerCase();
      await get().createSnapshotFromLive(`archivage-${slug}-${fmtDateTiretHM()}`, [id]);
    }
    await dbDeleteSubstance(id);
    const newCons = { ...get().consumptionsBySubstance };
    delete newCons[id];
    const newLast = { ...get().lastTimestamps };
    delete newLast[id];
    set((state) => ({
      substances: state.substances.filter((s) => s.id !== id),
      archivedSubstances: state.archivedSubstances.filter((s) => s.id !== id),
      consumptionsBySubstance: newCons,
      lastTimestamps: newLast,
      allConsumptions: state.allConsumptions.filter((c) => c.substanceId !== id),
    }));
    get().pruneOrphans(); // notifs de la substance + catégorie éventuellement dissoute
  },

  archiveSubstance: async (id) => {
    await dbArchiveSubstance(id);
    const sub = get().substances.find((s) => s.id === id);
    if (sub) {
      set((state) => ({
        substances: state.substances.filter((s) => s.id !== id),
        archivedSubstances: [{ ...sub, archived: true }, ...state.archivedSubstances],
      }));
    }
  },

  restoreSubstance: async (id) => {
    await dbRestoreSubstance(id);
    const sub = get().archivedSubstances.find((s) => s.id === id);
    if (sub) {
      set((state) => ({
        archivedSubstances: state.archivedSubstances.filter((s) => s.id !== id),
        substances: [{ ...sub, archived: false }, ...state.substances],
      }));
    }
  },

  // ---- Consumptions ----

  // Ajout / modification / suppression : la base, puis le stock central en mémoire (1.31).
  // Chaque substance a TOUJOURS sa liste complète (plus de liste partielle ni de compteur à « — »).
  createConsumption: async ({ substanceId, timestamp, dosage, notes }) => {
    const created = withDayKey(await dbCreateConsumption({ substanceId, timestamp, dosage, notes }));
    set((state) => applyConsumptionChange(state, substanceId, (list) => [...list, created], (all) => [...all, created]));
    return created;
  },

  updateConsumption: async (id, substanceId, { timestamp, dosage, notes }) => {
    await dbUpdateConsumption(id, { timestamp, dosage, notes });
    const patch = (c) => (c.id === id ? withDayKey({ ...c, timestamp, dosage, notes }) : c);
    set((state) => applyConsumptionChange(state, substanceId, (list) => list.map(patch), (all) => all.map(patch)));
  },

  reorderSubstances: async (orderedIds) => {
    await dbReorderSubstances(orderedIds);
    // Réordonne le state immédiatement
    const current = get().substances;
    const byId = Object.fromEntries(current.map((s) => [s.id, s]));
    const reordered = orderedIds.map((id, i) => byId[id] && { ...byId[id], position: i }).filter(Boolean);
    // Ajoute à la fin celles qui n'auraient pas été dans orderedIds (sécurité)
    const seen = new Set(orderedIds);
    const rest = current.filter((s) => !seen.has(s.id));
    set({ substances: [...reordered, ...rest] });
  },

  // ---- Wipe ----

  wipeAll: async () => {
    // Auto-snapshot AVANT wipe
    await get().createSnapshotFromLive(`remise-a-zero-${fmtDateTiretHM()}`);
    await dbWipeAll();
    set({
      substances: [],
      archivedSubstances: [],
      lastTimestamps: {},
      consumptionsBySubstance: {},
      allConsumptions: [],
    });
    get().pruneOrphans();
  },

  deleteConsumption: async (id, substanceId) => {
    await dbDeleteConsumption(id);
    set((state) => applyConsumptionChange(
      state, substanceId,
      (list) => list.filter((c) => c.id !== id),
      (all) => all.filter((c) => c.id !== id),
    ));
  },
}));
