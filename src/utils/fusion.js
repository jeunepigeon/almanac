// Logique de fusion partagée entre fusion snapshot et import fichier.
// v1.1.17 : SIMPLIFIÉE — plus de pop-up conflits. Fusion automatique par nom
// (même nom → fusion dans la substance active, dédoublonnage par timestamp exact).
// Les timestamps déjà présents sont ignorés silencieusement.
//
// `onProgress(current, total)` optionnel pour afficher une barre de progression.

import {
  dbUpdateSubstance,
  dbInsertSubstanceRaw,
  dbInsertConsumptionsBatch,
  dbGetAllConsumptions,
  uuid,
} from '../db';
import { DEFAULT_ICON_ID } from '../icons';

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

/**
 * Fusion automatique :
 *   - Substance avec un nom qui existe déjà en actif → les consos sont ajoutées
 *     à la substance active, en ignorant celles dont le timestamp existe déjà.
 *   - Substance avec un nom qui n'existe pas → créée normalement.
 *   - Aucun pop-up, aucun choix à faire. Doublons par timestamp = ignorés.
 *
 * @param {object} parsed - { substances: [], consumptions: [] }
 * @param {array} activeSubs - substances actives (toutes)
 * @param {Set|null} substanceIds - IDs du parsed à inclure (null = tout)
 * @param {function} onProgress - (current, total) → void (optionnel)
 * @returns {Promise<{added, merged, consosAdded, consosSkipped}>}
 */
export async function performFusion({ parsed, activeSubs, substanceIds, onProgress }) {
  const activeByName = new Map();
  for (const s of activeSubs) {
    activeByName.set(normalizeName(s.name), s);
  }

  const idMap = {}; // parsed substance id → active (ou nouvellement créée) substance id
  // Track pour chaque sub du parsed si c'est "nouveau" ou "existant" (pour compter plus tard)
  const subIsNew = {};
  let added = 0;

  for (const sub of parsed.substances) {
    if (substanceIds && !substanceIds.has(sub.id)) continue;
    const key = normalizeName(sub.name);
    const existing = activeByName.get(key);
    if (existing) {
      idMap[sub.id] = existing.id;
      subIsNew[sub.id] = false;
      // Icône : on reprend celle de la source UNIQUEMENT si l'actuelle est celle par défaut (ou vide)
      const curIcon = existing.icon || '';
      const srcIcon = sub.icon || '';
      if ((curIcon === '' || curIcon === DEFAULT_ICON_ID) && srcIcon && srcIcon !== DEFAULT_ICON_ID) {
        await dbUpdateSubstance(existing.id, { icon: srcIcon });
      }
    } else {
      const newId = sub.id || uuid();
      await dbInsertSubstanceRaw({
        id: newId, name: sub.name, color: sub.color, icon: sub.icon,
        createdAt: sub.createdAt, archived: !!sub.archived, position: sub.position ?? 9999,
      });
      idMap[sub.id] = newId;
      subIsNew[sub.id] = true;
      added++;
    }
  }

  // Pré-charge les timestamps existants : UNE requête (avant : une par substance)
  const destIds = new Set(Object.values(idMap));
  const existingTsBySub = {};
  for (const id of destIds) existingTsBySub[id] = new Set();
  for (const c of await dbGetAllConsumptions()) {
    if (existingTsBySub[c.substanceId]) existingTsBySub[c.substanceId].add(c.timestamp);
  }

  const consosToImport = parsed.consumptions.filter((c) => {
    if (substanceIds && !substanceIds.has(c.substanceId)) return false;
    return !!idMap[c.substanceId];
  });

  // Compteurs par substance ancienne : combien de consos ajoutées ?
  const addedBySrcSub = {};

  // 1) Tri en mémoire (doublons = même timestamp exact sur la substance de destination)
  let consosAdded = 0, consosSkipped = 0;
  const toInsert = [];
  for (const c of consosToImport) {
    const destSubId = idMap[c.substanceId];
    const seen = existingTsBySub[destSubId];
    if (seen.has(c.timestamp)) {
      consosSkipped++;
    } else {
      toInsert.push({
        id: uuid(), substanceId: destSubId, timestamp: c.timestamp,
        dosage: c.dosage, notes: c.notes, createdAt: c.createdAt || c.timestamp,
      });
      seen.add(c.timestamp);
      consosAdded++;
      addedBySrcSub[c.substanceId] = (addedBySrcSub[c.substanceId] || 0) + 1;
    }
  }
  // 2) Écriture groupée (1.31) : paquets dans des transactions, progression par paquet
  const total = toInsert.length;
  if (onProgress) onProgress(0, Math.max(1, total));
  await dbInsertConsumptionsBatch(toInsert, (done) => onProgress?.(done, Math.max(1, total)));
  if (onProgress && total === 0) onProgress(1, 1);

  // Pour chaque sub existante (subIsNew = false) : "fusionnée" si on a ajouté ≥1 conso,
  // sinon "déjà présente".
  let merged = 0, alreadyPresent = 0;
  for (const srcId of Object.keys(subIsNew)) {
    if (subIsNew[srcId]) continue; // sub nouvelle, pas comptée ici
    if ((addedBySrcSub[srcId] || 0) > 0) merged++;
    else alreadyPresent++;
  }

  // Bandeaux de la source (1.23) : seulement ceux dont la couleur concerne une substance importée
  const importedColors = new Set(
    parsed.substances.filter((s) => !substanceIds || substanceIds.has(s.id)).map((s) => s.color)
  );
  // 1.48 : + « Sobre de tout », record, 24 h et bandeaux personnalisés (substances → nouveaux ids,
  // au moins 2 importées) ; leurs ids sont attribués par le store (mergeBannerSetup)
  const customBanners = [];
  for (const d of parsed.customBanners || []) {
    const subIds = (d.subIds || []).filter((id) => (!substanceIds || substanceIds.has(id)) && idMap[id]).map((id) => idMap[id]);
    if (d.id && subIds.length >= 2) customBanners.push({ id: d.id, name: d.name, subIds });
  }
  const customKept = new Set(customBanners.map((d) => d.id));
  const banners = (parsed.banners || []).filter((c) => (
    c.startsWith('#') ? importedColors.has(c)
      : c.startsWith('custom:') ? customKept.has(c.slice(7))
        : c === '__sobre' || c === 'record' || c === 'last24'
  ));

  // Notifications (1.25) : celles d'une substance suivent son nouvel id ; « Toutes » et catégories
  // telles quelles (une catégorie sans 2 substances après l'import est retirée par pruneOrphans).
  const notifs = [];
  for (const r of parsed.notifs || []) {
    if (r.target === 'sub') {
      if (substanceIds && !substanceIds.has(r.key)) continue;
      if (idMap[r.key]) notifs.push({ target: 'sub', key: idMap[r.key], palier: r.palier });
    } else if (r.target === 'color') {
      if (importedColors.has(r.key)) notifs.push({ target: 'color', key: r.key, palier: r.palier });
    } else if (r.target === 'all') {
      notifs.push({ target: 'all', key: null, palier: r.palier });
    } else if (r.target === 'record') {
      if (banners.includes('record')) notifs.push({ target: 'record', key: null, palier: r.palier });
    } else if (r.target === 'custom') {
      if (customKept.has(r.key)) notifs.push({ target: 'custom', key: r.key, palier: r.palier });
    }
  }

  return { added, merged, alreadyPresent, consosAdded, consosSkipped, banners, notifs, customBanners, bannerColumns: parsed.bannerColumns ?? null };
}
