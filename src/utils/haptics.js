// Wrapper safe pour expo-haptics.
// Si le package n'est pas installé, on no-op (évite les crashs).
// Install : npx expo install expo-haptics

let H = null;
try {
  // eslint-disable-next-line global-require
  H = require('expo-haptics');
} catch (e) {
  H = null;
}

function safe(fn) {
  try {
    if (H && typeof fn === 'function') fn();
  } catch {}
}

export const haptics = {
  light: () => safe(() => H.impactAsync(H.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => H.impactAsync(H.ImpactFeedbackStyle.Medium)),
  heavy: () => safe(() => H.impactAsync(H.ImpactFeedbackStyle.Heavy)),
  success: () => safe(() => H.notificationAsync(H.NotificationFeedbackType.Success)),
  warning: () => safe(() => H.notificationAsync(H.NotificationFeedbackType.Warning)),
  error: () => safe(() => H.notificationAsync(H.NotificationFeedbackType.Error)),
  selection: () => safe(() => H.selectionAsync()),
};

export default haptics;
