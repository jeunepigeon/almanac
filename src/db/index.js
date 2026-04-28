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
      archived INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS consumptions (
      id TEXT PRIMARY KEY NOT NULL,
      substance_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      dosage REAL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (substance_id) REFERENCES substances(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_consumptions_substance ON consumptions(substance_id);
    CREATE INDEX IF NOT EXISTS idx_consumptions_timestamp ON consumptions(timestamp);
  `);

  // Migration : ajoute la colonne position si elle n'existe pas
  try {
    await db.execAsync('ALTER TABLE substances ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // Colonne déjà présente
  }

  // Initialise les positions pour les substances qui n'en ont pas (ou toutes à 0)
  // Si toutes les positions sont à 0, on les attribue selon l'ordre actuel created_at DESC
  try {
    const allZero = await db.getFirstAsync('SELECT COUNT(*) as n FROM substances WHERE position != 0');
    if (allZero && allZero.n === 0) {
      const subs = await db.getAllAsync('SELECT id FROM substances ORDER BY created_at DESC');
      for (let i = 0; i < subs.length; i++) {
        await db.runAsync('UPDATE substances SET position = ? WHERE id = ?', [i, subs[i].id]);
      }
    }
  } catch (e) {
    // ignore
  }

  // Migration : si la colonne dosage est en TEXT (anciennes versions),
  // on tente de la convertir en REAL. SQLite est laxiste sur les types
  // donc en pratique on peut juste laisser les anciennes valeurs string,
  // elles seront castées en NULL au parsing si pas numérique.
  // Pour les futures ajouts, on stockera des nombres.
  // On nettoie au passage : tout dosage qui n'est pas un nombre devient NULL.
  try {
    await db.execAsync(`
      UPDATE consumptions SET dosage = NULL
      WHERE dosage IS NOT NULL
        AND CAST(dosage AS REAL) = 0
        AND dosage != '0'
        AND dosage != 0;
    `);
  } catch (e) {
    // ignore
  }
}

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
      ? 'SELECT * FROM substances ORDER BY position ASC, created_at DESC'
      : 'SELECT * FROM substances WHERE archived = 0 ORDER BY position ASC, created_at DESC'
  );
  return rows.map(rowToSubstance);
}

export async function dbCreateSubstance({ name, color, icon }) {
  const db = await getDb();
  const id = uuid();
  const createdAt = Date.now();
  const maxPos = await db.getFirstAsync('SELECT MAX(position) as m FROM substances');
  const position = (maxPos?.m ?? -1) + 1;
  await db.runAsync(
    'INSERT INTO substances (id, name, color, icon, created_at, archived, position) VALUES (?, ?, ?, ?, ?, 0, ?)',
    [id, name, color, icon, createdAt, position]
  );
  return { id, name, color, icon, createdAt, archived: false, position };
}

// Met à jour les positions selon un nouvel ordre (array d'IDs).
export async function dbReorderSubstances(orderedIds) {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.runAsync('UPDATE substances SET position = ? WHERE id = ?', [i, orderedIds[i]]);
  }
}

export async function dbUpdateSubstance(id, fields) {
  const db = await getDb();
  const allowed = ['name', 'color', 'icon'];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return;
  const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db.runAsync(`UPDATE substances SET ${setClause} WHERE id = ?`, [...values, id]);
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

export async function dbFindSubstanceByName(name) {
  const db = await getDb();
  return await db.getFirstAsync(
    'SELECT * FROM substances WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [name]
  );
}

// ---------- Consumptions ----------

function normalizeDosage(d) {
  if (d == null || d === '') return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

export async function dbCreateConsumption({ substanceId, timestamp, dosage, notes }) {
  const db = await getDb();
  const id = uuid();
  const createdAt = Date.now();
  const normDosage = normalizeDosage(dosage);
  await db.runAsync(
    'INSERT INTO consumptions (id, substance_id, timestamp, dosage, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, substanceId, timestamp, normDosage, notes ?? null, createdAt]
  );
  return { id, substanceId, timestamp, dosage: normDosage, notes: notes ?? null, createdAt };
}

export async function dbUpdateConsumption(id, { timestamp, dosage, notes }) {
  const db = await getDb();
  const normDosage = normalizeDosage(dosage);
  await db.runAsync(
    'UPDATE consumptions SET timestamp = ?, dosage = ?, notes = ? WHERE id = ?',
    [timestamp, normDosage, notes ?? null, id]
  );
}

export async function dbDeleteConsumption(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM consumptions WHERE id = ?', [id]);
}

export async function dbGetConsumptionsBySubstance(substanceId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT * FROM consumptions WHERE substance_id = ? ORDER BY timestamp DESC',
    [substanceId]
  );
  return rows.map(rowToConsumption);
}

export async function dbGetConsumptionsBetween(start, end) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT * FROM consumptions WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
    [start, end]
  );
  return rows.map(rowToConsumption);
}

export async function dbGetAllConsumptions() {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM consumptions ORDER BY timestamp DESC');
  return rows.map(rowToConsumption);
}

export async function dbGetLastTimestampBySubstance() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT substance_id, MAX(timestamp) as last FROM consumptions GROUP BY substance_id'
  );
  const map = {};
  for (const r of rows) map[r.substance_id] = r.last;
  return map;
}

function rowToSubstance(row) {
  return {
    id: row.id, name: row.name, color: row.color, icon: row.icon,
    createdAt: row.created_at, archived: row.archived === 1,
    position: row.position ?? 0,
  };
}

function rowToConsumption(row) {
  return {
    id: row.id,
    substanceId: row.substance_id,
    timestamp: row.timestamp,
    dosage: normalizeDosage(row.dosage),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// Import en batch via une seule transaction (bien plus rapide).
// substances : array { id, name, color, icon, createdAt, archived }
// consumptions : array { id, substanceId, timestamp, dosage, notes, createdAt }
export async function dbImportBatch(substances, consumptions) {
  const db = await getDb();

  // Insert substances
  for (const s of substances) {
    await db.runAsync(
      'INSERT OR IGNORE INTO substances (id, name, color, icon, created_at, archived, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [s.id, s.name, s.color, s.icon, s.createdAt, s.archived ? 1 : 0, s.position ?? 0]
    );
  }

  // Insert consumptions par chunks de 100 dans des transactions séparées
  // pour éviter les timeouts sur de grosses bases
  const CHUNK = 100;
  for (let i = 0; i < consumptions.length; i += CHUNK) {
    const chunk = consumptions.slice(i, i + CHUNK);
    await db.withTransactionAsync(async () => {
      for (const c of chunk) {
        await db.runAsync(
          'INSERT OR IGNORE INTO consumptions (id, substance_id, timestamp, dosage, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [c.id, c.substanceId, c.timestamp, normalizeDosage(c.dosage), c.notes ?? null, c.createdAt ?? c.timestamp]
        );
      }
    });
  }
}

export async function dbGetFirstConsumptionTimestamp() {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT MIN(timestamp) as first FROM consumptions');
  return row?.first ?? null;
}

export async function dbWipeAll() {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM consumptions;
    DELETE FROM substances;
  `);
}
