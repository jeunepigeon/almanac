// Wrapper safe autour d'expo-keep-awake.
// Si la lib n'est pas installée, on no-op pour éviter de crasher l'app.

let useKeepAwake = () => {};
try {
  // eslint-disable-next-line global-require
  const mod = require('expo-keep-awake');
  if (mod && typeof mod.useKeepAwake === 'function') {
    useKeepAwake = mod.useKeepAwake;
  }
} catch (e) {
  // Lib pas installée, on no-op
  // Pour l'activer : npx expo install expo-keep-awake
}

export { useKeepAwake };
