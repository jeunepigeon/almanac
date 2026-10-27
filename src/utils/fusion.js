// Logique de fusion partagée entre fusion snapshot et import fichier.
// v1.1.17 : SIMPLIFIÉE — plus de pop-up conflits. Fusion automatique par nom
// (même nom → fusion dans la substance active, dédoublonnage par timestamp exact).
// Les timestamps déjà présents sont ignorés silencieusement.
//
// `onProgress(current, total)` optionnel pour afficher une barre de progression.

import {
  dbInsertSubstanceRaw,
  dbInsertConsumptionRaw,
  dbGetConsumptionsBySubstance,
  uuid,
} from '../db';

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

  // Pré-charge timestamps existants
  const existingTsBySub = {};
  for (const destId of new Set(Object.values(idMap))) {
    const list = await dbGetConsumptionsBySubstance(destId);
    existingTsBySub[destId] = new Set(list.map((c) => c.timestamp));
  }

  const consosToImport = parsed.consumptions.filter((c) => {
    if (substanceIds && !substanceIds.has(c.substanceId)) return false;
    return !!idMap[c.substanceId];
  });

  // Compteurs par substance ancienne : combien de consos ajoutées ?
  const addedBySrcSub = {};

  let consosAdded = 0, consosSkipped = 0;
  const total = consosToImport.length;
  for (let i = 0; i < total; i++) {
    const c = consosToImport[i];
    const destSubId = idMap[c.substanceId];
    const seen = existingTsBySub[destSubId];
    if (seen.has(c.timestamp)) {
      consosSkipped++;
    } else {
      await dbInsertConsumptionRaw({
        id: uuid(), substanceId: destSubId, timestamp: c.timestamp,
        dosage: c.dosage, notes: c.notes, createdAt: c.createdAt || c.timestamp,
      });
      seen.add(c.timestamp);
      consosAdded++;
      addedBySrcSub[c.substanceId] = (addedBySrcSub[c.substanceId] || 0) + 1;
    }
    if (onProgress && (i % 25 === 0 || i === total - 1)) {
      onProgress(i + 1, total);
    }
  }

  // Pour chaque sub existante (subIsNew = false) : "fusionnée" si on a ajouté ≥1 conso,
  // sinon "déjà présente".
  let merged = 0, alreadyPresent = 0;
  for (const srcId of Object.keys(subIsNew)) {
    if (subIsNew[srcId]) continue; // sub nouvelle, pas comptée ici
    if ((addedBySrcSub[srcId] || 0) > 0) merged++;
    else alreadyPresent++;
  }

  return { added, merged, alreadyPresent, consosAdded, consosSkipped };
}
