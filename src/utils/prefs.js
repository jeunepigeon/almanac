// Petites préférences locales (JSON) via AsyncStorage, avec repli mémoire si le module manque.
// Utilisé pour les bandeaux par couleur (1.22). Hors base SQLite : pas inclus dans les exports.
let AsyncStorage;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  const mem = new Map();
  AsyncStorage = {
    async getItem(k) { return mem.has(k) ? mem.get(k) : null; },
    async setItem(k, v) { mem.set(k, v); },
  };
}

export async function getJSON(key, fallback) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}

export async function setJSON(key, value) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* best effort */ }
}
