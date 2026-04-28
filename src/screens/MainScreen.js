import { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler } from 'react-native';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { theme } from '../theme';
import SubstancesPage from './SubstancesPage';
import GlobalCalendarPage from './GlobalCalendarPage';

export default function MainScreen() {
  const navigation = useNavigation();
  const pagerRef = useRef(null);
  const [page, setPage] = useState(0);

  const titles = ['Substances', 'Global'];

  // Intercepte le bouton retour Android : si on est sur la page Calendrier (1),
  // on ramène à la page Substances (0) au lieu de quitter l'app.
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (page === 1) {
          pagerRef.current?.setPage(0);
          return true; // consomme l'event
        }
        return false; // laisse le système gérer (= sortie de l'app)
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [page])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.appName}>almanac</Text>
        </View>

        <View style={styles.headerCenter}>
          {titles.map((t, i) => (
            <TouchableOpacity
              key={t}
              onPress={() => pagerRef.current?.setPage(i)}
              style={styles.titleTab}
            >
              <Text
                style={[styles.titleText, page === i && styles.titleTextActive]}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.iconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.indicator}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.dot, page === i && styles.dotActive]} />
        ))}
      </View>

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        <View key="1" style={styles.page}>
          <SubstancesPage />
        </View>
        <View key="2" style={styles.page}>
          <GlobalCalendarPage />
        </View>
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingBottom: theme.spacing.sm, paddingHorizontal: theme.spacing.md,
  },
  headerLeft: { flex: 1 },
  headerCenter: { flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  headerRight: { flex: 1, alignItems: 'flex-end' },
  appName: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, letterSpacing: 2, textTransform: 'lowercase' },
  titleTab: { paddingHorizontal: theme.spacing.sm },
  titleText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  titleTextActive: { color: theme.colors.text },
  iconButton: { padding: theme.spacing.xs },
  indicator: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: theme.spacing.xs, gap: 6 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.textFaint },
  dotActive: { backgroundColor: theme.colors.text },
  pager: { flex: 1 },
  page: { flex: 1 },
});
