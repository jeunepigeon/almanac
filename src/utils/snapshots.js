// Snapshot serialization / deserialization en JSON.
// Format compatible avec l'export (mais en JSON, plus simple à traiter en mémoire).

import * as Crypto from 'expo-crypto';
import { dbGetAllConsumptions, dbInsertSnapshot, dbGetAllSnapshots, dbGetSnapshotData, dbGetSnapshotSize } from '../db';

const SCHEMA_VERSION = 1;
import appJson from '../../app.json';

const APP_VERSION = appJson?.expo?.version || 'unknown'; // version réelle de l'app (avant : figée à 1.1.16)

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

// Règles de notification à garder pour un ensemble de substances sauvegardées :
// substance → si elle est sauvegardée ; catégorie → si ≥ 2 substances de sa couleur sont sauvegardées ; « Toutes » → toujours.
export function filterNotifsForSubs(notifs = [], subs = []) {
  const ids = new Set(subs.map((s) => s.id));
  const count = {};
  for (const s of subs) count[s.color] = (count[s.color] || 0) + 1;
  return (notifs || [])
    .filter((r) => r.target === 'all'
      || (r.target === 'sub' && ids.has(r.key))
      || (r.target === 'color' && (count[r.key] || 0) >= 2))
    .map((r) => ({ target: r.target, key: r.key ?? null, palier: r.palier }));
}

// Ajoute notifCount (règles de notification de chaque substance) aux stats des cartes de sélection
export function withNotifCounts(statsById = {}, notifs = []) {
  const out = { ...statsById };
  for (const r of notifs || []) {
    if (r.target !== 'sub' || !r.key) continue;
    out[r.key] = { consCount: 0, days: 0, ...(out[r.key] || {}) };
    out[r.key].notifCount = (out[r.key].notifCount || 0) + 1;
  }
  return out;
}

// Serialize substances + consumptions en JSON string.
// substanceIds optionnel : si fourni, ne sérialise que ces substances (et leurs consos).
// banners : couleurs des bandeaux dans l'ordre (1.23). Seuls ceux dont la couleur a une substance sauvegardée sont gardés.
// notifs (1.25) : règles de notification. Celles d'une substance suivent la substance ; « Toutes » et
// catégories (couleur avec ≥ 2 substances sauvegardées) sont sauvegardées à part.
export function serializeSnapshot({ substances, archivedSubstances, consumptions, banners = [], notifs = [] }, substanceIds = null) {
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
    banners: (() => {
      const colors = new Set(filteredSubs.map((s) => s.color));
      return (banners || []).filter((c) => colors.has(c)).map((color, position) => ({ color, position }));
    })(),
    notifs: filterNotifsForSubs(notifs, filteredSubs),
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
    // Bandeaux (1.23+) → liste de couleurs dans l'ordre ; absent des anciennes sauvegardes
    notifs: Array.isArray(obj.notifs) ? obj.notifs : [],
    banners: (obj.banners || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((b) => b.color).filter(Boolean),
  };
}

// Crée un snapshot en DB depuis l'état actuel du store.
// name = nom déjà finalisé avec date (ex "remise-a-zero-27-07-2026").
// substanceIds = optionnel pour filtrer.
export async function createSnapshot({ substances, archivedSubstances, consumptions, banners = [], notifs = [] }, name, substanceIds = null) {
  const data = serializeSnapshot({ substances, archivedSubstances, consumptions, banners, notifs }, substanceIds);
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
