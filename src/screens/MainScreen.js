import { useRef, useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Animated, useWindowDimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import NotifWizard from '../components/NotifWizard';
import ShareModal from '../components/ShareModal';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { theme } from '../theme';
import { useStore } from '../store';
import SubstancesPage from './SubstancesPage';
import { useGlobalPages } from './GlobalCalendarPage';

// 1.49 : un seul défilement Liste · Calendrier · Recherche · Stats (onglets de Global = pages)
const AnimatedPager = Animated.createAnimatedComponent(PagerView);
const GTABS = ['calendar', 'history', 'stats'];

export default function MainScreen() {
  const navigation = useNavigation();
  const pagerRef = useRef(null);
  const [page, setPage] = useState(0);
  const [lastGlobal, setLastGlobal] = useState(1); // dernier onglet de Global affiché (page 1 à 3)
  // Pages de Global construites à la 1re visite, puis toutes peu après l'ouverture (prêtes au glisser)
  const [visited, setVisited] = useState({ calendar: true });
  useEffect(() => {
    const t = setTimeout(() => setVisited({ calendar: true, history: true, stats: true }), 600);
    return () => clearTimeout(t);
  }, []);
  const { width: winW } = useWindowDimensions();
  const scrollPos = useRef(new Animated.Value(0)).current;
  const scrollOff = useRef(new Animated.Value(0)).current;
  const onPageScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { position: scrollPos, offset: scrollOff } }], { useNativeDriver: true },
  ), [scrollPos, scrollOff]);
  // Onglets + petit compteur de Global : fixes entre ses 3 pages, glissent avec la page vers la liste
  const headerX = useMemo(() => Animated.add(scrollPos, scrollOff).interpolate({
    inputRange: [0, 1], outputRange: [winW, 0], extrapolate: 'clamp',
  }), [scrollPos, scrollOff, winW]);
  const [gHeaderH, setGHeaderH] = useState(96);
  const globalTab = GTABS[(page >= 1 ? page : lastGlobal) - 1];
  const goGlobalTab = (t) => pagerRef.current?.setPage(1 + GTABS.indexOf(t));
  const g = useGlobalPages({ activeTab: globalTab, goTab: goGlobalTab, visited });
  const hasUnconsulted = useStore((s) => s.hasUnconsultedSnapshots);
  const gotoGlobalStatsTick = useStore((s) => s.gotoGlobalStatsTick);
  const pagerLocked = useStore((s) => s.pagerLocked);
  const notifFocus = useStore((s) => s.notifFocus);
  const [notifOpen, setNotifOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 1.40 : la cloche principale ne concerne que les substances (les bandeaux ont leur cloche)
  const hasAnyNotif = useStore((s) => s.notifRules.some((r) => r.target === 'sub'));

  // Tap sur une notification « Toutes » / catégorie → page Substances
  useEffect(() => {
    if (notifFocus?.tick) pagerRef.current?.setPage(0);
  }, [notifFocus?.tick]);

  // Switcher vers la page Global quand le store signale un gotoGlobalStats
  useEffect(() => {
    if (gotoGlobalStatsTick > 0) {
      pagerRef.current?.setPage(3); // onglet Stats de Global
    }
  }, [gotoGlobalStatsTick]);

  const titles = ['Substances', 'Global'];

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (page >= 1) {
          pagerRef.current?.setPage(0);
          return true;
        }
        return false;
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
          {titles.map((t, i) => {
            // Réorganisation en cours : la page affichée reste normale, l'autre est assombrie (1.44)
            const cur = page === 0 ? 0 : 1;
            const dim = pagerLocked && i !== cur;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => !pagerLocked && pagerRef.current?.setPage(i === 0 ? 0 : lastGlobal)}
                style={styles.titleTab}
                disabled={pagerLocked}
              >
                <Text
                  style={[
                    styles.titleText,
                    cur === i && styles.titleTextActive,
                    dim && { opacity: 0.3 },
                  ]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => !pagerLocked && navigation.navigate('Settings')}
            style={[styles.settingBtn, pagerLocked && { opacity: 0.3 }]}
            disabled={pagerLocked}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.settingText}>settings</Text>
              {hasUnconsulted && !pagerLocked && <View style={styles.redDot} />}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.indicator}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.dot, (page === 0 ? 0 : 1) === i && styles.dotActive]} />
        ))}
        {/* 1.38 — Partage, en miroir de la cloche : page Substances uniquement */}
        {page === 0 && (
          <TouchableOpacity
            style={[styles.shareBtn, pagerLocked && { opacity: 0.3 }]}
            onPress={() => setShareOpen(true)}
            disabled={pagerLocked}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons name="share-variant" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        )}
        {/* Cloche sous « settings » (liste et Global) : vide si aucune notification, pleine sinon */}
        <TouchableOpacity
          style={[styles.bellBtn, pagerLocked && { opacity: 0.3 }]}
          onPress={() => setNotifOpen(true)}
          disabled={pagerLocked}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name={hasAnyNotif ? 'bell' : 'bell-outline'} size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.pagerWrap}>
        <AnimatedPager
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          scrollEnabled={!pagerLocked}
          onPageScroll={onPageScroll}
          onPageSelected={(e) => {
            const pos = e.nativeEvent.position;
            setPage(pos);
            if (pos >= 1) {
              setLastGlobal(pos);
              const t = GTABS[pos - 1];
              setVisited((v) => (v[t] ? v : { ...v, [t]: true }));
            }
            useStore.getState().requestCountersExit();
          }}
        >
          <View key="list" style={styles.page}>
            <SubstancesPage />
          </View>
          <View key="g-calendar" style={[styles.page, { paddingTop: gHeaderH }]}>{g.calendar}</View>
          <View key="g-history" style={[styles.page, { paddingTop: gHeaderH }]}>{g.history}</View>
          <View key="g-stats" style={[styles.page, { paddingTop: gHeaderH }]}>{g.stats}</View>
        </AnimatedPager>
        <Animated.View
          style={[styles.gHeader, { transform: [{ translateX: headerX }] }]}
          onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== gHeaderH) setGHeaderH(h); }}
        >
          {g.header}
        </Animated.View>
        {g.reorgBar}
      </View>
      {g.modals}

      <ShareModal visible={shareOpen} onClose={() => setShareOpen(false)} />
      <NotifWizard visible={notifOpen} onClose={() => setNotifOpen(false)} />
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
  settingBtn: { padding: theme.spacing.xs },
  settingText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    letterSpacing: 2,
    textTransform: 'lowercase',
    fontWeight: '400',
  },
  redDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginLeft: 4, marginBottom: 8,
  },
  indicator: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 26, gap: 6 },
  bellBtn: { position: 'absolute', right: theme.spacing.md + theme.spacing.xs, top: 0, bottom: 0, justifyContent: 'center' },
  shareBtn: { position: 'absolute', left: theme.spacing.md + theme.spacing.xs, top: 0, bottom: 0, justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.textFaint },
  dotActive: { backgroundColor: theme.colors.text },
  pagerWrap: { flex: 1, overflow: 'hidden' },
  pager: { flex: 1 },
  page: { flex: 1 },
  gHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.colors.background },
});
