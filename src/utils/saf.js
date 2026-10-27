// Helpers Storage Access Framework (SAF) v1.1.18
// - Capture la dernière erreur pour debug (debugLastError())
// - Persist URI dans AsyncStorage (ou fallback mémoire)
// - Si la permission persistée est révoquée, redemande automatiquement

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import CryptoJS from 'crypto-js';

let AsyncStorage;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  const mem = new Map();
  AsyncStorage = {
    async getItem(k) { return mem.has(k) ? mem.get(k) : null; },
    async setItem(k, v) { mem.set(k, v); },
    async removeItem(k) { mem.delete(k); },
  };
}

const STORAGE_KEY = 'almanac.exportDirUri';

let _lastErr = null;
function recordErr(ctx, e) {
  _lastErr = `[${ctx}] ${e?.message || e}`;
  console.warn('SAF', ctx, e);
}
export function debugLastError() { return _lastErr; }

async function getPersistedDirUri() {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v || null;
  } catch (e) { recordErr('getPersisted', e); return null; }
}
async function setPersistedDirUri(uri) {
  try {
    if (uri) await AsyncStorage.setItem(STORAGE_KEY, uri);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) { recordErr('setPersisted', e); }
}

async function isDirUsable(uri) {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF || !uri) return false;
  try {
    await SAF.readDirectoryAsync(uri);
    return true;
  } catch (e) { recordErr('isDirUsable', e); return false; }
}

export async function getOrPickExportDir({ forcePick = false } = {}) {
  _lastErr = null;
  if (Platform.OS !== 'android') {
    _lastErr = 'SAF non disponible (plateforme non-Android)';
    return null;
  }
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF) { _lastErr = 'FileSystem.StorageAccessFramework indisponible'; return null; }

  if (!forcePick) {
    const persisted = await getPersistedDirUri();
    if (persisted) {
      const usable = await isDirUsable(persisted);
      if (usable) return persisted;
      // Permission révoquée → redemande
      await setPersistedDirUri(null);
    }
  }

  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (perm.granted && perm.directoryUri) {
      await setPersistedDirUri(perm.directoryUri);
      return perm.directoryUri;
    }
    _lastErr = 'Permission dossier refusée par l\'utilisateur';
    return null;
  } catch (e) {
    recordErr('requestDir', e);
    return null;
  }
}

// Écrit le fichier via SAF en BASE64 (plus fiable que UTF8 sur certains Android :
// des fichiers créés mais vides ont été observés en UTF8).
export async function writeFileToDir(dirUri, filename, content, mimeType = 'application/octet-stream') {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF) { _lastErr = 'SAF indisponible'; return null; }
  if (!dirUri) { _lastErr = 'URI du dossier null'; return null; }
  let fileUri = null;
  try {
    fileUri = await SAF.createFileAsync(dirUri, filename, mimeType);
  } catch (e) {
    recordErr('createFile', e);
    return null;
  }
  try {
    const b64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(content));
    await SAF.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
    return fileUri;
  } catch (e) {
    recordErr('writeBase64', e);
    // 2e tentative en UTF8
    try {
      await SAF.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
      return fileUri;
    } catch (e2) {
      recordErr('writeUtf8', e2);
      return null;
    }
  }
}

// Relit le fichier et renvoie sa taille (0 si vide / illisible).
export async function readBackLength(fileUri) {
  if (!fileUri) return 0;
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF) return 0;
  try {
    const content = await SAF.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
    return content ? content.length : 0;
  } catch (e) { recordErr('readBack', e); return 0; }
}

export async function verifyFileExists(fileUri) {
  return (await readBackLength(fileUri)) > 0;
}

export async function listDirFileNames(dirUri) {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF || !dirUri) return [];
  try {
    const uris = await SAF.readDirectoryAsync(dirUri);
    return uris.map((u) => {
      try {
        const decoded = decodeURIComponent(u);
        const parts = decoded.split('/');
        return parts[parts.length - 1];
      } catch { return u; }
    });
  } catch (e) { recordErr('readDir', e); return []; }
}

export async function makeUniqueFilename(dirUri, desiredName) {
  const names = await listDirFileNames(dirUri);
  if (!names.includes(desiredName)) return desiredName;
  const dot = desiredName.lastIndexOf('.');
  const base = dot > 0 ? desiredName.slice(0, dot) : desiredName;
  const ext = dot > 0 ? desiredName.slice(dot) : '';
  let n = 2;
  while (names.includes(`${base}-${n}${ext}`)) n++;
  return `${base}-${n}${ext}`;
}

export async function clearExportDir() {
  await setPersistedDirUri(null);
}
