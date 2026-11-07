// Snapshot serialization / deserialization en JSON.
// Format compatible avec l'export (mais en JSON, plus simple à traiter en mémoire).

import * as Crypto from 'expo-crypto';
import { dbGetAllConsumptions, dbInsertSnapshot, dbGetAllSnapshots, dbGetSnapshotData, dbGetSnapshotSize } from '../db';

const SCHEMA_VERSION = 1;

import { JS_VERSION } from '../version';

const APP_VERSION = JS_VERSION; // version du code (1.31 : suit les mises à jour sans build)

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
// 1.48 : `banners` (entrées gardées, cf. filterBannersForSubs) → garde aussi les notifications du
// record et des bandeaux personnalisés sauvegardés
export function filterNotifsForSubs(notifs = [], subs = [], banners = null) {
  const ids = new Set(subs.map((s) => s.id));
  const count = {};
  for (const s of subs) count[s.color] = (count[s.color] || 0) + 1;
  const kept = new Set(banners || []);
  return (notifs || [])
    .filter((r) => r.target === 'all'
      || (r.target === 'sub' && ids.has(r.key))
      || (r.target === 'color' && (count[r.key] || 0) >= 2)
      || (r.target === 'record' && kept.has('record'))
      || (r.target === 'custom' && kept.has(`custom:${r.key}`)))
    .map((r) => ({ target: r.target, key: r.key ?? null, palier: r.palier }));
}

// 1.48 — Bandeaux sauvegardés / exportés avec les substances choisies : catégories dont la couleur a
// une substance sauvegardée, « Sobre de tout », record, 24 h, et bandeaux personnalisés qui gardent
// au moins 2 de leurs substances (réduits à celles-ci). Renvoie { banners, customBanners }.
export function filterBannersForSubs(banners = [], subs = [], customBanners = []) {
  const ids = new Set(subs.map((s) => s.id));
  const colors = new Set(subs.map((s) => s.color));
  const customs = (customBanners || [])
    .map((b) => ({ id: b.id, name: b.name, subIds: (b.subIds || []).filter((id) => ids.has(id)) }))
    .filter((b) => b.subIds.length >= 2);
  const customIds = new Set(customs.map((b) => b.id));
  const kept = (banners || []).filter((c) => (
    c.startsWith('#') ? colors.has(c)
      : c.startsWith('custom:') ? customIds.has(c.slice(7))
        : c === '__sobre' || c === 'record' || c === 'last24'
  ));
  const used = new Set(kept.filter((c) => c.startsWith('custom:')).map((c) => c.slice(7)));
  return { banners: kept, customBanners: customs.filter((b) => used.has(b.id)) };
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
// 1.31 : renvoie aussi les compteurs (stockés avec la sauvegarde)
export function serializeSnapshotWithCounts(args, substanceIds = null) {
  const data = serializeSnapshot(args, substanceIds, true);
  return data;
}

export function serializeSnapshot({ substances, archivedSubstances, consumptions, banners = [], notifs = [], customBanners = [], bannerColumns = null }, substanceIds = null, withCounts = false) {
  const allSubs = [...(substances || []), ...(archivedSubstances || [])];
  const filteredSubs = substanceIds
    ? allSubs.filter((s) => substanceIds.includes(s.id))
    : allSubs;
  const filteredIds = new Set(filteredSubs.map((s) => s.id));
  const kept = filterBannersForSubs(banners, filteredSubs, customBanners);
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
    // 1.48 : toutes les entrées (couleurs, __sobre, record, last24, custom:<id>) + définitions des
    // bandeaux personnalisés + disposition (1 ou 2 colonnes)
    banners: kept.banners.map((color, position) => ({ color, position })),
    customBanners: kept.customBanners,
    bannerColumns: bannerColumns === 2 ? 2 : bannerColumns === 1 ? 1 : null,
    notifs: filterNotifsForSubs(notifs, filteredSubs, kept.banners),
  };
  const json = JSON.stringify(payload);
  if (withCounts) return { json, subsCount: payload.substances.length, consCount: payload.consumptions.length };
  return json;
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
    customBanners: Array.isArray(obj.customBanners) ? obj.customBanners : [],
    bannerColumns: obj.bannerColumns ?? null,
  };
}

// Crée un snapshot en DB depuis l'état actuel du store.
// name = nom déjà finalisé avec date (ex "remise-a-zero-27-07-2026").
// substanceIds = optionnel pour filtrer.
export async function createSnapshot({ substances, archivedSubstances, consumptions, banners = [], notifs = [], customBanners = [], bannerColumns = null }, name, substanceIds = null) {
  const { json: data, subsCount, consCount } = serializeSnapshotWithCounts({ substances, archivedSubstances, consumptions, banners, notifs, customBanners, bannerColumns }, substanceIds);
  const id = await Crypto.randomUUID();
  const snap = {
    id,
    name,
    created_at: Date.now(),
    data,
    subs_count: subsCount,
    cons_count: consCount,
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
