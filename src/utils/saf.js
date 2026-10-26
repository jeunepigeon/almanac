// Helpers Storage Access Framework (SAF) : demande l'autorisation d'un
// dossier la PREMIÈRE FOIS, puis persiste l'URI dans AsyncStorage.
// Les fois suivantes on vérifie que la permission est encore valide ;
// si elle a été révoquée (installation désinstallée, user clear), on redemande.
//
// Usage :
//   const dir = await getOrPickExportDir();  // null si refusé
//   const fileUri = await writeFileToDir(dir, filename, content, mime);
//   const exists = await verifyFileExists(fileUri);

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// Wrapper safe pour AsyncStorage : si non installé, fallback vers une Map en mémoire
// (SAF redemande à chaque export mais ne crash pas).
let AsyncStorage;
try {
  // eslint-disable-next-line global-require
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

async function getPersistedDirUri() {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v || null;
  } catch {
    return null;
  }
}

async function setPersistedDirUri(uri) {
  try {
    if (uri) await AsyncStorage.setItem(STORAGE_KEY, uri);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Vérifie qu'une URI SAF est encore utilisable (permission non révoquée).
async function isDirUsable(uri) {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF || !uri) return false;
  try {
    // Si on peut lister le contenu, la permission est bonne.
    await SAF.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

// Retourne l'URI du dossier d'export (persisté ou nouveau).
// Null si l'utilisateur a refusé la permission.
export async function getOrPickExportDir({ forcePick = false } = {}) {
  if (Platform.OS !== 'android') return null;
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF) return null;

  if (!forcePick) {
    const persisted = await getPersistedDirUri();
    if (persisted && (await isDirUsable(persisted))) {
      return persisted;
    }
  }

  // Demande la permission
  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (perm.granted && perm.directoryUri) {
      await setPersistedDirUri(perm.directoryUri);
      return perm.directoryUri;
    }
  } catch {}
  return null;
}

// Écrit un fichier dans le dossier SAF. Retourne l'URI du fichier créé,
// ou null si échec. Si collision de nom, on NE renomme PAS ici — le caller
// doit avoir déjà résolu le nom final avant.
export async function writeFileToDir(dirUri, filename, content, mimeType = 'application/octet-stream') {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF || !dirUri) return null;
  try {
    const fileUri = await SAF.createFileAsync(dirUri, filename, mimeType);
    await SAF.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    return fileUri;
  } catch (e) {
    return null;
  }
}

// Vérifie qu'un fichier SAF existe (post-écriture).
export async function verifyFileExists(fileUri) {
  if (!fileUri) return false;
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF) return false;
  try {
    const content = await SAF.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
    // Si la lecture retourne quelque chose de non-null, le fichier existe.
    return content != null && content.length > 0;
  } catch {
    return false;
  }
}

// Liste les noms des fichiers d'un dossier SAF (pour détection de collision).
export async function listDirFileNames(dirUri) {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF || !dirUri) return [];
  try {
    const uris = await SAF.readDirectoryAsync(dirUri);
    // Les URIs SAF sont encodées, on extrait le nom de fichier à la fin.
    return uris.map((u) => {
      try {
        const decoded = decodeURIComponent(u);
        // Format typique : .../tree/primary%3AFolder/document/primary%3AFolder%2Ffile.ext
        const parts = decoded.split('/');
        return parts[parts.length - 1];
      } catch {
        return u;
      }
    });
  } catch {
    return [];
  }
}

// Génère un nom unique dans le dossier (ajoute -2, -3, etc. si collision).
export async function makeUniqueFilename(dirUri, desiredName) {
  const names = await listDirFileNames(dirUri);
  if (!names.includes(desiredName)) return desiredName;
  // Extrait base et extension
  const dot = desiredName.lastIndexOf('.');
  const base = dot > 0 ? desiredName.slice(0, dot) : desiredName;
  const ext = dot > 0 ? desiredName.slice(dot) : '';
  let n = 2;
  while (names.includes(`${base}-${n}${ext}`)) n++;
  return `${base}-${n}${ext}`;
}

// Clear la permission persistée (utile pour debug).
export async function clearExportDir() {
  await setPersistedDirUri(null);
}
