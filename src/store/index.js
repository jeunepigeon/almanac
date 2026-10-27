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
import { createSnapshot, makeUniqueSnapshotName, fmtDateTiret, parseSnapshot } from '../utils/snapshots';

// Normalise un nom de substance pour matching lors de la fusion (trim + lowercase)
function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}
import { dbGetSnapshotData } from '../db';
import * as Crypto from 'expo-crypto';

export const useStore = create((set, get) => ({
  substances: [],
  archivedSubstances: [],
  lastTimestamps: {},
  consumptionsBySubstance: {},
  snapshots: [],
  hasUnconsultedSnapshots: false,
  // Signal pour switcher vers Global > Stats depuis n'importe quel écran
  // (incrément d'un tick pour déclencher useEffect)
  gotoGlobalStatsTick: 0,
  requestGotoGlobalStats: () => set((s) => ({ gotoGlobalStatsTick: s.gotoGlobalStatsTick + 1 })),
  pagerLocked: false,
  setPagerLocked: (locked) => set({ pagerLocked: !!locked }),
  ready: false,

  loadAll: async () => {
    const all = await dbGetSubstances({ includeArchived: true });
    const lastTimestamps = await dbGetLastTimestampBySubstance();
    const snapshots = await dbGetAllSnapshots();
    const hasUnconsulted = snapshots.some((s) => !s.consulted);
    set({
      substances: all.filter((s) => !s.archived),
      archivedSubstances: all.filter((s) => s.archived),
      lastTimestamps,
      consumptionsBySubstance: {},
      snapshots,
      hasUnconsultedSnapshots: hasUnconsulted,
      ready: true,
    });
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
    // On récupère TOUTES les consos (pas seulement celles en mémoire)
    const dbAllCons = [];
    for (const s of [...state.substances, ...state.archivedSubstances]) {
      const list = state.consumptionsBySubstance[s.id]
        ?? (await dbGetConsumptionsBySubstance(s.id));
      dbAllCons.push(...list);
    }
    const uniqueName = await makeUniqueSnapshotName(baseName);
    const snap = await createSnapshot(
      { substances: state.substances, archivedSubstances: state.archivedSubstances, consumptions: dbAllCons },
      uniqueName,
      substanceIds
    );
    const snapshots = await dbGetAllSnapshots();
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
    await get().createSnapshotFromLive(`avant-fusion-${fmtDateTiret()}`);

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

  loadConsumptionsForSubstance: async (substanceId) => {
    const list = await dbGetConsumptionsBySubstance(substanceId);
    set((state) => ({
      consumptionsBySubstance: {
        ...state.consumptionsBySubstance,
        [substanceId]: list,
      },
    }));
  },

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
    set((state) => ({ substances: [created, ...state.substances] }));
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
  },

  // Suppression d'une substance = archivage via snapshot + wipe de la DB
  // Snapshot nommé "archivage-<nom>-DD-MM-YYYY" contenant uniquement cette substance et ses consos
  deleteSubstance: async (id) => {
    const sub = [...get().substances, ...get().archivedSubstances].find((s) => s.id === id);
    if (sub) {
      // Nom du snapshot : slug depuis le nom de la substance
      const slug = sub.name.trim().replace(/\s+/g, '-').toLowerCase();
      await get().createSnapshotFromLive(`archivage-${slug}-${fmtDateTiret()}`, [id]);
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
    }));
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

  createConsumption: async ({ substanceId, timestamp, dosage, notes }) => {
    const created = await dbCreateConsumption({ substanceId, timestamp, dosage, notes });

    // MàJ liste des consos ET lastTimestamps immédiatement
    set((state) => {
      const existing = state.consumptionsBySubstance[substanceId] || [];
      const newList = [...existing, created].sort((a, b) => b.timestamp - a.timestamp);
      const currentLast = state.lastTimestamps[substanceId] || 0;
      const newLast = timestamp > currentLast ? timestamp : currentLast;

      return {
        consumptionsBySubstance: {
          ...state.consumptionsBySubstance,
          [substanceId]: newList,
        },
        lastTimestamps: {
          ...state.lastTimestamps,
          [substanceId]: newLast,
        },
      };
    });

    return created;
  },

  updateConsumption: async (id, substanceId, { timestamp, dosage, notes }) => {
    await dbUpdateConsumption(id, { timestamp, dosage, notes });

    set((state) => {
      const list = state.consumptionsBySubstance[substanceId] || [];
      const updated = list
        .map((c) => (c.id === id ? { ...c, timestamp, dosage, notes } : c))
        .sort((a, b) => b.timestamp - a.timestamp);

      const newMax = updated.length > 0 ? updated[0].timestamp : null;

      return {
        consumptionsBySubstance: {
          ...state.consumptionsBySubstance,
          [substanceId]: updated,
        },
        lastTimestamps: {
          ...state.lastTimestamps,
          [substanceId]: newMax,
        },
      };
    });
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
    await get().createSnapshotFromLive(`remise-a-zero-${fmtDateTiret()}`);
    await dbWipeAll();
    set({
      substances: [],
      archivedSubstances: [],
      lastTimestamps: {},
      consumptionsBySubstance: {},
    });
  },

  deleteConsumption: async (id, substanceId) => {
    await dbDeleteConsumption(id);

    set((state) => {
      const list = state.consumptionsBySubstance[substanceId] || [];
      const filtered = list.filter((c) => c.id !== id);

      const newMax = filtered.length > 0 ? filtered[0].timestamp : null;
      const newLastTimestamps = { ...state.lastTimestamps };
      if (newMax) {
        newLastTimestamps[substanceId] = newMax;
      } else {
        delete newLastTimestamps[substanceId];
      }

      return {
        consumptionsBySubstance: {
          ...state.consumptionsBySubstance,
          [substanceId]: filtered,
        },
        lastTimestamps: newLastTimestamps,
      };
    });
  },
}));
