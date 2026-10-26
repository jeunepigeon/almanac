// Logique de fusion partagée entre fusion snapshot et import fichier.
// Prend un callback onConflict(parsedSub) qui retourne une Promise résolvant à 'merge' | 'number' | 'ignore'.

import {
  dbInsertSubstanceRaw,
  dbInsertConsumptionRaw,
  dbGetConsumptionsBySubstance,
  uuid,
} from '../db';

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

function makeNumberedName(baseName, takenNames) {
  let n = 2;
  while (takenNames.has(normalizeName(`${baseName} (${n})`))) n++;
  return `${baseName} (${n})`;
}

/**
 * Fusionne un objet parsé (substances + consumptions) avec les données actives.
 * @param {object} parsed - { substances: [], consumptions: [] }
 * @param {array} activeSubs - liste des substances actives (de n'importe où)
 * @param {Set} substanceIds - set des substance IDs à inclure (du parsed)
 * @param {function} onConflict - callback(parsedSub) → Promise<'merge'|'number'|'ignore'>
 * @returns {Promise<{added, merged, numbered, ignored, consosAdded}>}
 */
export async function performFusion({ parsed, activeSubs, substanceIds, onConflict }) {
  const activeByName = new Map();
  const takenNames = new Set();
  for (const s of activeSubs) {
    activeByName.set(normalizeName(s.name), s);
    takenNames.add(normalizeName(s.name));
  }

  const idMap = {};
  let added = 0, merged = 0, numbered = 0, ignored = 0;

  for (const sub of parsed.substances) {
    if (substanceIds && !substanceIds.has(sub.id)) continue;
    const key = normalizeName(sub.name);
    const existing = activeByName.get(key);

    if (!existing) {
      // Pas de conflit
      const newId = sub.id || uuid();
      await dbInsertSubstanceRaw({
        id: newId, name: sub.name, color: sub.color, icon: sub.icon,
        createdAt: sub.createdAt, archived: !!sub.archived, position: sub.position ?? 9999,
      });
      idMap[sub.id] = newId;
      takenNames.add(key);
      added++;
    } else {
      // Conflit : demander choix
      const choice = await onConflict(sub);
      if (choice === 'merge') {
        idMap[sub.id] = existing.id;
        merged++;
      } else if (choice === 'number') {
        const newName = makeNumberedName(sub.name, takenNames);
        const newId = uuid();
        await dbInsertSubstanceRaw({
          id: newId, name: newName, color: sub.color, icon: sub.icon,
          createdAt: sub.createdAt, archived: !!sub.archived, position: sub.position ?? 9999,
        });
        idMap[sub.id] = newId;
        takenNames.add(normalizeName(newName));
        numbered++;
      } else {
        ignored++;
      }
    }
  }

  let consosAdded = 0;
  for (const c of parsed.consumptions) {
    if (substanceIds && !substanceIds.has(c.substanceId)) continue;
    const destSubId = idMap[c.substanceId];
    if (!destSubId) continue;
    const existingList = await dbGetConsumptionsBySubstance(destSubId);
    const dup = existingList.some((ec) => ec.timestamp === c.timestamp);
    if (dup) continue;
    await dbInsertConsumptionRaw({
      id: uuid(), substanceId: destSubId, timestamp: c.timestamp,
      dosage: c.dosage, notes: c.notes, createdAt: c.createdAt || c.timestamp,
    });
    consosAdded++;
  }

  return { added, merged, numbered, ignored, consosAdded };
}
