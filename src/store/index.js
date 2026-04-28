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
} from '../db';

export const useStore = create((set, get) => ({
  substances: [],
  archivedSubstances: [],
  lastTimestamps: {},
  consumptionsBySubstance: {},
  ready: false,

  loadAll: async () => {
    const all = await dbGetSubstances({ includeArchived: true });
    const lastTimestamps = await dbGetLastTimestampBySubstance();
    set({
      substances: all.filter((s) => !s.archived),
      archivedSubstances: all.filter((s) => s.archived),
      lastTimestamps,
      consumptionsBySubstance: {},
      ready: true,
    });
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

  deleteSubstance: async (id) => {
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
