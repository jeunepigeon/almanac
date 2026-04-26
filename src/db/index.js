import * as SQLite from 'expo-sqlite';

const DB_NAME = 'almanac.db';

let dbInstance = null;

export async function getDb() {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbInstance;
}

export async function initDb() {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS substances (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS consumptions (
      id TEXT PRIMARY KEY NOT NULL,
      substance_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      dosage TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (substance_id) REFERENCES substances(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_consumptions_substance
      ON consumptions(substance_id);
    CREATE INDEX IF NOT EXISTS idx_consumptions_timestamp
      ON consumptions(timestamp);
  `);
}

// Génération d'UUID v4 simple sans dépendance native
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- Substances ----------

export async function dbGetSubstances({ includeArchived = false } = {}) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    includeArchived
      ? 'SELECT * FROM substances ORDER BY created_at DESC'
      : 'SELECT * FROM substances WHERE archived = 0 ORDER BY created_at DESC'
  );
  return rows.map(rowToSubstance);
}

export async function dbCreateSubstance({ name, color, icon }) {
  const db = await getDb();
  const id = uuid();
  const createdAt = Date.now();
  await db.runAsync(
    'INSERT INTO substances (id, name, color, icon, created_at, archived) VALUES (?, ?, ?, ?, ?, 0)',
    [id, name, color, icon, createdAt]
  );
  return { id, name, color, icon, createdAt, archived: false };
}

export async function dbDeleteSubstance(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM substances WHERE id = ?', [id]);
}

export async function dbArchiveSubstance(id) {
  const db = await getDb();
  await db.runAsync('UPDATE substances SET archived = 1 WHERE id = ?', [id]);
}

export async function dbRestoreSubstance(id) {
  const db = await getDb();
  await db.runAsync('UPDATE substances SET archived = 0 WHERE id = ?', [id]);
}

function rowToSubstance(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    createdAt: row.created_at,
    archived: row.archived === 1,
  };
}
