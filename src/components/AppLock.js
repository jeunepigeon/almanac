// Verrouillage de l'app (1.25) — option désactivée par défaut (Paramètres).
//
// Utilise la fenêtre de déverrouillage DU TÉLÉPHONE (empreinte / visage, ou code / schéma du
// téléphone en secours) via expo-local-authentication : aucun code propre à Almanac à retenir.
//
// Quand :
//  - à l'ouverture de l'app (démarrage à froid) ;
//  - au retour dans l'app après plus de 5 min en arrière-plan.
// Limite connue : JavaScript ne sait pas si l'écran a été éteint entre-temps ; verrouiller le
// téléphone 30 s ne reverrouille donc pas Almanac (version native prévue plus tard si besoin).

import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, Modal } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { useStore } from '../store';

const RELOCK_AFTER_MS = 5 * 60 * 1000;

// Le téléphone a-t-il un verrouillage (empreinte, visage, code, schéma) ?
export async function deviceHasLock() {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch (e) { return false; }
}

export async function authenticate(promptMessage = 'Déverrouiller Almanac') {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false, // code / schéma du téléphone acceptés en secours
    });
    return !!r.success;
  } catch (e) { return false; }
}

export default function AppLock() {
  const enabled = useStore((s) => s.appLockEnabled);
  // Démarrage à froid : verrouillé si l'option est active
  const [locked, setLocked] = useState(() => useStore.getState().appLockEnabled);
  const busyRef = useRef(false);
  const bgSinceRef = useRef(null);
  // Pendant la demande d'empreinte / code, la fenêtre du verrou se retire : sur les anciens Android
  // (9 et moins), la demande s'affiche DANS l'app et serait sinon cachée derrière (blocage).
  const [authing, setAuthing] = useState(false);

  const tryUnlock = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAuthing(true);
    const ok = await authenticate();
    busyRef.current = false;
    setAuthing(false);
    if (ok) setLocked(false);
  };

  // Signale au reste de l'app que l'écran de verrouillage est affiché (le message de mise à jour attend)
  const shown = !!(locked && enabled);
  useEffect(() => { useStore.getState().setLockActive(shown); }, [shown]);

  // Option désactivée → jamais verrouillé
  useEffect(() => { if (!enabled) setLocked(false); }, [enabled]);

  // Prompt automatique dès que l'écran de verrouillage apparaît
  useEffect(() => { if (locked && enabled) tryUnlock(); }, [locked]); // eslint-disable-line

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (!useStore.getState().appLockEnabled) return;
      if (st === 'background') {
        if (bgSinceRef.current == null) bgSinceRef.current = Date.now();
      } else if (st === 'active') {
        const since = bgSinceRef.current;
        bgSinceRef.current = null;
        if (since != null && Date.now() - since > RELOCK_AFTER_MS) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  if (!locked || !enabled) return null;

  const screen = (
    <View style={styles.overlay}>
      <MaterialCommunityIcons name="lock-outline" size={36} color={theme.colors.textMuted} />
      <Text style={styles.appName}>almanac</Text>
      <TouchableOpacity style={styles.btn} onPress={tryUnlock} activeOpacity={0.7}>
        <Text style={styles.btnText}>Déverrouiller</Text>
      </TouchableOpacity>
    </View>
  );
  // 1.42 : écran de verrouillage AUSSI dans une fenêtre (Modal) ouverte en dernier → au-dessus des
  // fenêtres déjà ouvertes (ex. assistant de notifications laissé ouvert avant de quitter l'app).
  // La vue simple reste dessous pour couvrir l'app sans délai au démarrage.
  return (
    <>
      {screen}
      <Modal visible={!authing} transparent={false} animationType="none" statusBarTranslucent onRequestClose={() => {}}>
        {screen}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, elevation: 1000,
  },
  appName: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.md,
    letterSpacing: 3, marginTop: theme.spacing.md, marginBottom: theme.spacing.xl,
  },
  btn: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xl,
  },
  btnText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '400', letterSpacing: 1 },
});
