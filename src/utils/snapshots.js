// Snapshot serialization / deserialization en JSON.
// Format compatible avec l'export (mais en JSON, plus simple à traiter en mémoire).

import * as Crypto from 'expo-crypto';
import { dbGetAllConsumptions, dbInsertSnapshot, dbGetAllSnapshots, dbGetSnapshotData, dbGetSnapshotSize } from '../db';

const SCHEMA_VERSION = 1;
const APP_VERSION = '1.1.16';

// Format DD-MM-YYYY (tirets partout)
export function fmtDateTiret(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// Format DD-MM-YYYY-HHhMM (ex 27-10-2026-21h45) — ':' interdit dans les noms de fichiers
export function fmtDateTiretHM(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}-${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

// Serialize substances + consumptions en JSON string.
// substanceIds optionnel : si fourni, ne sérialise que ces substances (et leurs consos).
export function serializeSnapshot({ substances, archivedSubstances, consumptions }, substanceIds = null) {
  const allSubs = [...(substances || []), ...(archivedSubstances || [])];
  const filteredSubs = substanceIds
    ? allSubs.filter((s) => substanceIds.includes(s.id))
    : allSubs;
  const filteredIds = new Set(filteredSubs.map((s) => s.id));
  const filteredCons = (consumptions || []).filter((c) => {
    const sid = c.substanceId ?? c.substance_id;
    return filteredIds.has(sid);
  });

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: Date.now(),
    substances: filteredSubs.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      icon: s.icon,
      createdAt: s.createdAt ?? s.created_at ?? Date.now(),
      archived: !!s.archived,
      position: s.position ?? 0,
    })),
    consumptions: filteredCons.map((c) => ({
      id: c.id,
      substanceId: c.substanceId ?? c.substance_id,
      timestamp: c.timestamp,
      dosage: c.dosage ?? null,
      notes: c.notes ?? null,
      createdAt: c.createdAt ?? c.created_at ?? Date.now(),
    })),
  };
  return JSON.stringify(payload);
}

// Parse snapshot JSON string en objet.
export function parseSnapshot(jsonStr) {
  const obj = JSON.parse(jsonStr);
  return {
    schemaVersion: obj.schemaVersion ?? 1,
    appVersion: obj.appVersion ?? 'unknown',
    createdAt: obj.createdAt ?? Date.now(),
    substances: obj.substances || [],
    consumptions: obj.consumptions || [],
  };
}

// Crée un snapshot en DB depuis l'état actuel du store.
// name = nom déjà finalisé avec date (ex "remise-a-zero-27-07-2026").
// substanceIds = optionnel pour filtrer.
export async function createSnapshot({ substances, archivedSubstances, consumptions }, name, substanceIds = null) {
  const data = serializeSnapshot({ substances, archivedSubstances, consumptions }, substanceIds);
  const id = await Crypto.randomUUID();
  const snap = {
    id,
    name,
    created_at: Date.now(),
    data,
  };
  await dbInsertSnapshot(snap);
  return snap;
}

// Nom de snapshot avec gestion des doublons du jour (suffixe -(2), -(3), etc.)
export async function makeUniqueSnapshotName(baseName) {
  const existing = await dbGetAllSnapshots();
  const names = new Set(existing.map((s) => s.name));
  if (!names.has(baseName)) return baseName;
  let n = 2;
  while (names.has(`${baseName}-(${n})`)) n++;
  return `${baseName}-(${n})`;
}

// Format taille lisible (Ko).
export function fmtSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} o`;
  return `${(bytes / 1024).toFixed(0)} Ko`;
}

// Récupère les infos d'affichage d'un snapshot (taille + count).
export async function getSnapshotStats(snapshotId) {
  const [data, size] = await Promise.all([
    dbGetSnapshotData(snapshotId),
    dbGetSnapshotSize(snapshotId),
  ]);
  if (!data) return null;
  try {
    const parsed = parseSnapshot(data);
    return {
      substancesCount: parsed.substances.length,
      consumptionsCount: parsed.consumptions.length,
      size,
    };
  } catch {
    return { substancesCount: 0, consumptionsCount: 0, size };
  }
}
