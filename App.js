import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import MainScreen from './src/screens/MainScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SubstanceScreen from './src/screens/SubstanceScreen';
import ExportScreen from './src/screens/ExportScreen';
import ImportScreen from './src/screens/ImportScreen';
import DonationsScreen from './src/screens/DonationsScreen';
import { theme } from './src/theme';
import { initDb } from './src/db';
import { useStore } from './src/store';

const Stack = createNativeStackNavigator();

export default function App() {
  const [booted, setBooted] = useState(false);
  const loadAll = useStore((s) => s.loadAll);

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await loadAll();
      } catch (e) {
        console.error('Boot error', e);
      } finally {
        setBooted(true);
      }
    })();
  }, [loadAll]);

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
    <NavigationContainer>
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
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Paramètres' }} />
        <Stack.Screen name="Export" component={ExportScreen} options={{ title: 'Exporter' }} />
        <Stack.Screen name="Import" component={ImportScreen} options={{ title: 'Importer' }} />
        <Stack.Screen name="Donations" component={DonationsScreen} options={{ title: 'Soutenir le projet ❤️' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
