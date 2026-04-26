import { create } from 'zustand';
import {
  dbGetSubstances,
  dbCreateSubstance,
  dbDeleteSubstance,
  dbArchiveSubstance,
  dbRestoreSubstance,
} from '../db';

export const useStore = create((set, get) => ({
  substances: [],
  archivedSubstances: [],
  ready: false,

  loadAll: async () => {
    const all = await dbGetSubstances({ includeArchived: true });
    set({
      substances: all.filter((s) => !s.archived),
      archivedSubstances: all.filter((s) => s.archived),
      ready: true,
    });
  },

  createSubstance: async ({ name, color, icon }) => {
    const created = await dbCreateSubstance({ name, color, icon });
    set({ substances: [created, ...get().substances] });
    return created;
  },

  deleteSubstance: async (id) => {
    await dbDeleteSubstance(id);
    set({
      substances: get().substances.filter((s) => s.id !== id),
      archivedSubstances: get().archivedSubstances.filter((s) => s.id !== id),
    });
  },

  archiveSubstance: async (id) => {
    await dbArchiveSubstance(id);
    const sub = get().substances.find((s) => s.id === id);
    if (sub) {
      set({
        substances: get().substances.filter((s) => s.id !== id),
        archivedSubstances: [{ ...sub, archived: true }, ...get().archivedSubstances],
      });
    }
  },

  restoreSubstance: async (id) => {
    await dbRestoreSubstance(id);
    const sub = get().archivedSubstances.find((s) => s.id === id);
    if (sub) {
      set({
        archivedSubstances: get().archivedSubstances.filter((s) => s.id !== id),
        substances: [{ ...sub, archived: false }, ...get().substances],
      });
    }
  },
}));
