// Module d'export/import des données.
//
// Utilise expo-crypto pour la génération de bytes aléatoires (RN n'a pas
// de crypto.getRandomValues natif), et crypto-js pour AES + PBKDF2.

import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

const HEADER_VERSION = 'ALMANAC_EXPORT_v1';
const ITERATIONS = 10_000;
const KEY_SIZE_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 16;

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvParseLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        result.push(cur);
        cur = '';
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  result.push(cur);
  return result;
}

function buildCsvPayload(substances, consumptions) {
  const subHeader = 'id,name,color,icon,created_at,archived,position';
  const subRows = substances.map((s) => [
    csvEscape(s.id), csvEscape(s.name), csvEscape(s.color), csvEscape(s.icon),
    csvEscape(s.createdAt), csvEscape(s.archived ? 1 : 0),
    csvEscape(s.position ?? 0),
  ].join(','));

  const consHeader = 'id,substance_id,timestamp,dosage,notes,created_at';
  const consRows = consumptions.map((c) => [
    csvEscape(c.id), csvEscape(c.substanceId), csvEscape(c.timestamp),
    csvEscape(c.dosage), csvEscape(c.notes), csvEscape(c.createdAt),
  ].join(','));

  return [
    '# SUBSTANCES', subHeader, ...subRows,
    '',
    '# CONSUMPTIONS', consHeader, ...consRows,
  ].join('\n');
}

function parseCsvPayload(text) {
  const lines = text.split(/\r?\n/);
  let mode = null;
  let header = null;
  const substances = [];
  const consumptions = [];

  for (const raw of lines) {
    const line = raw;
    if (!line.trim()) continue;
    if (line.startsWith('# SUBSTANCES')) { mode = 'sub'; header = null; continue; }
    if (line.startsWith('# CONSUMPTIONS')) { mode = 'cons'; header = null; continue; }
    if (header === null) { header = csvParseLine(line); continue; }
    const fields = csvParseLine(line);
    const obj = {};
    header.forEach((h, i) => { obj[h] = fields[i]; });
    if (mode === 'sub') {
      substances.push({
        id: obj.id, name: obj.name, color: obj.color, icon: obj.icon,
        createdAt: parseInt(obj.created_at, 10),
        archived: obj.archived === '1',
        position: obj.position != null ? parseInt(obj.position, 10) : 0,
      });
    } else if (mode === 'cons') {
      consumptions.push({
        id: obj.id, substanceId: obj.substance_id,
        timestamp: parseInt(obj.timestamp, 10),
        dosage: obj.dosage || null, notes: obj.notes || null,
        createdAt: parseInt(obj.created_at, 10),
      });
    }
  }
  return { substances, consumptions };
}

// Convertit un Uint8Array en CryptoJS WordArray
function uint8ToWordArray(u8) {
  const words = [];
  for (let i = 0; i < u8.length; i += 4) {
    words.push(
      ((u8[i] || 0) << 24) |
      ((u8[i + 1] || 0) << 16) |
      ((u8[i + 2] || 0) << 8) |
      (u8[i + 3] || 0)
    );
  }
  return CryptoJS.lib.WordArray.create(words, u8.length);
}

// Génère un WordArray aléatoire en utilisant expo-crypto.
async function randomWordArrayAsync(bytes) {
  const arr = await Crypto.getRandomBytesAsync(bytes);
  return uint8ToWordArray(arr);
}

// Crée le contenu complet du fichier export chiffré.
export async function buildExportFile(substances, consumptions, password) {
  const payload = buildCsvPayload(substances, consumptions);

  const salt = await randomWordArrayAsync(SALT_BYTES);
  const iv = await randomWordArrayAsync(IV_BYTES);

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE_BITS / 32,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });

  const encrypted = CryptoJS.AES.encrypt(payload, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const cipherB64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  const saltB64 = CryptoJS.enc.Base64.stringify(salt);
  const ivB64 = CryptoJS.enc.Base64.stringify(iv);

  const note = "Ce fichier contient des donnees personnelles chiffrees. Pour les lire, demande a l'utilisateur le mot de passe defini lors de l'export, puis applique le dechiffrement AES-256-CBC avec les parametres ci-dessus (cle derivee via PBKDF2-SHA256). Le contenu dechiffre est un texte tabulaire lisible (deux tables CSV : substances et consumptions).";

  const header = [
    HEADER_VERSION,
    'algo: AES-256-CBC',
    'kdf: PBKDF2-SHA256',
    `iterations: ${ITERATIONS}`,
    `salt: ${saltB64}`,
    `iv: ${ivB64}`,
    `note: ${note}`,
    '---',
  ].join('\n');

  return header + '\n' + cipherB64 + '\n';
}

export function parseExportFile(content, password) {
  const lines = content.split(/\r?\n/);
  if (!lines[0]?.startsWith('ALMANAC_EXPORT')) {
    throw new Error('Format de fichier invalide');
  }

  let saltB64 = null;
  let ivB64 = null;
  let iterations = ITERATIONS;
  let bodyStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('salt: ')) saltB64 = line.slice(6).trim();
    else if (line.startsWith('iv: ')) ivB64 = line.slice(4).trim();
    else if (line.startsWith('iterations: ')) iterations = parseInt(line.slice(12).trim(), 10);
    else if (line === '---') { bodyStart = i + 1; break; }
  }

  if (bodyStart < 0 || !saltB64 || !ivB64) throw new Error('En-tête de fichier invalide');

  const cipherB64 = lines.slice(bodyStart).join('').trim();

  const salt = CryptoJS.enc.Base64.parse(saltB64);
  const iv = CryptoJS.enc.Base64.parse(ivB64);
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE_BITS / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });

  const ciphertext = CryptoJS.enc.Base64.parse(cipherB64);
  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });

  let decrypted;
  try {
    decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    });
  } catch (e) {
    throw new Error('Mot de passe incorrect ou fichier corrompu');
  }

  let plain;
  try {
    plain = decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    throw new Error('Mot de passe incorrect');
  }

  if (!plain || !plain.includes('# SUBSTANCES')) {
    throw new Error('Mot de passe incorrect');
  }

  return parseCsvPayload(plain);
}
