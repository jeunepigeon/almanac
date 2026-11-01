import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
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
    if (!navRef.isReady()) { pendingTargetRef.current = t; return; }
    const st = useStore.getState();
    if (t.target === 'sub') {
      if (st.substances.some((s) => s.id === t.key)) navRef.navigate('Substance', { substanceId: t.key });
      return;
    }
    // « Toutes » / catégorie : liste des substances, flash du bandeau concerné
    navRef.navigate('Main');
    st.requestNotifFocus(t.target === 'color' ? 'color' : 'all', t.target === 'color' ? t.key : null);
  };
  const handleResponse = (response) => {
    const t = readNotificationTarget(response);
    if (!t) return;
    if (t.id && handledIdsRef.current.has(t.id)) return;
    if (t.id) handledIdsRef.current.add(t.id);
    try { Notifications.clearLastNotificationResponse?.(); } catch (e) { /* rien */ }
    openTarget(t);
  };
  useEffect(() => {
    if (!booted) return;
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    // App lancée par un tap sur une notification ; on efface ensuite pour ne pas la rejouer
    try { handleResponse(Notifications.getLastNotificationResponse?.()); } catch (e) { /* rien */ }
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
    </GestureHandlerRootView>
  );
}
