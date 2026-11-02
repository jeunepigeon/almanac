import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MainScreen from './src/screens/MainScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SubstanceScreen from './src/screens/SubstanceScreen';
import DonationsScreen from './src/screens/DonationsScreen';
import { theme } from './src/theme';
import { initDb } from './src/db';
import { useStore } from './src/store';
import AppLock from './src/components/AppLock';
import UpdateNotice from './src/components/UpdateNotice';
import { configureNotifications, startNotificationSync, readNotificationTarget } from './src/utils/notifications';

const navRef = createNavigationContainerRef();

const Stack = createNativeStackNavigator();

export default function App() {
  const [booted, setBooted] = useState(false);
  const [navReady, setNavReady] = useState(false);
  const loadAll = useStore((s) => s.loadAll);
  const pendingTargetRef = useRef(null);
  const handledIdsRef = useRef(new Set());

  useEffect(() => {
    let unsub = null;
    (async () => {
      try {
        await initDb();
        await loadAll();
        await configureNotifications();
        unsub = startNotificationSync(useStore); // reprogramme les paliers à chaque changement
      } catch (e) {
        console.error('Boot error', e);
      } finally {
        setBooted(true);
      }
    })();
    return () => unsub?.();
  }, [loadAll]);

  // --- Tap sur une notification de palier (app ouverte ou lancée par la notification) ---
  const openTarget = (t) => {
    if (!t) return;
    if (!navRef.isReady()) { pendingTargetRef.current = t; useStore.getState().traceNotif('navigation pas prête', 'en attente'); return; }
    const st = useStore.getState();
    if (t.target === 'sub') {
      const ok = st.substances.some((s) => s.id === t.key);
      st.traceNotif(ok ? 'ouverture page substance' : 'substance introuvable', 'pas de flash (normal)');
      if (ok) navRef.navigate('Substance', { substanceId: t.key });
      return;
    }
    // « Toutes » / catégorie : liste des substances, flash du bandeau concerné
    st.traceNotif('retour liste + flash demandé', `écran avant : ${navRef.getCurrentRoute()?.name || '?'}`);
    navRef.navigate('Main');
    st.requestNotifFocus(t.target === 'color' ? 'color' : 'all', t.target === 'color' ? t.key : null);
  };
  const handleResponse = (response, via = 'listener') => {
    const t = readNotificationTarget(response);
    if (!t) return;
    if (t.id && handledIdsRef.current.has(t.id)) { useStore.getState().traceNotif('doublon ignoré', via); return; }
    useStore.getState().traceNotif('tap reçu', `${t.target}${t.key ? ` ${t.key}` : ''} · ${via} · app ${AppState.currentState}`, true);
    if (t.id) handledIdsRef.current.add(t.id);
    useStore.getState().setLastNotifTap({ target: t.target, key: t.key, at: Date.now(), via });
    try { Notifications.clearLastNotificationResponse?.(); } catch (e) { /* rien */ }
    openTarget(t);
  };
  // Deux chemins (dédoublonnés par identifiant) :
  //  - le hook officiel useLastNotificationResponse (app lancée OU ramenée par le tap) ;
  //  - l'écouteur de réponses (app déjà ouverte).
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (booted && lastResponse) handleResponse(lastResponse, 'hook');
  }, [booted, lastResponse]); // eslint-disable-line
  useEffect(() => {
    if (!booted) return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => handleResponse(r, 'listener'));
    return () => sub.remove();
  }, [booted]); // eslint-disable-line
  useEffect(() => {
    if (navReady && pendingTargetRef.current) {
      const t = pendingTargetRef.current;
      pendingTargetRef.current = null;
      openTarget(t);
    }
  }, [navReady]); // eslint-disable-line

  if (!booted) {
    return (
      <View style={{
        flex: 1, backgroundColor: theme.colors.background,
        justifyContent: 'center', alignItems: 'center',
      }}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  return (
    // Racine gesture-handler : nécessaire pour les gestes natifs (réorganisation par drag).
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <NavigationContainer ref={navRef} onReady={() => setNavReady(true)}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: '300', letterSpacing: 1 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="Main" component={MainScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Substance" component={SubstanceScreen} options={{ title: '' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Paramètres', animation: 'slide_from_right' }} />
        <Stack.Screen name="Donations" component={DonationsScreen} options={{ title: 'Soutenir le projet' }} />
      </Stack.Navigator>
    </NavigationContainer>
    {/* Verrouillage (option) : par-dessus toute l'app */}
    <AppLock />
    {/* Message « Almanac mis à jour » (une fois par version, après déverrouillage) */}
    <UpdateNotice />
    </GestureHandlerRootView>
  );
}
