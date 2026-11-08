import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Animated, Easing, useWindowDimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import NotifWizard from '../components/NotifWizard';
import ShareModal from '../components/ShareModal';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import SubstancesPage from './SubstancesPage';
import { useGlobalPages } from './GlobalCalendarPage';
import { useSubstancePages } from './SubstanceScreen';

// 1.49 : un seul défilement Liste · Calendrier · Recherche · Stats.
// 1.50 : les 3 pages de droite montrent Global OU la substance ouverte (même code, mêmes gestes) :
//  - substance ouverte depuis la liste : ses pages glissent depuis la droite ; glisser vers la droite
//    depuis Calendrier (ou flèche / retour Android) ramène à la vraie liste, et la substance se ferme ;
//  - ouverte depuis Global : elle glisse par-dessus Global (resté dessous) ; flèche / retour Android
//    ramènent à Global là où on était ; glisser depuis Calendrier ramène à la liste.
const TABS = ['calendar', 'history', 'stats'];
const SLIDE_MS = 280;

export default function MainScreen() {
  const navigation = useNavigation();
  const pagerRef = useRef(null);
  const { width: winW } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const [lastGlobal, setLastGlobal] = useState(1); // dernier onglet de Global affiché (page 1 à 3)
  // Pages construites à la 1re visite, puis toutes peu après (prêtes au glisser)
  const [gVisited, setGVisited] = useState({ calendar: true });
  const [sVisited, setSVisited] = useState({ calendar: true });
  useEffect(() => {
    const t = setTimeout(() => setGVisited({ calendar: true, history: true, stats: true }), 600);
    return () => clearTimeout(t);
  }, []);

  // Position du défilement (calculée en JavaScript : suit toujours la page affichée)
  const progress = useRef(new Animated.Value(0)).current;
  const slideX = useRef(new Animated.Value(0)).current; // substance ouverte depuis Global
  const headerX = useMemo(() => progress.interpolate({
    inputRange: [0, 1], outputRange: [winW, 0], extrapolate: 'clamp',
  }), [progress, winW]);
  const topX = useMemo(() => Animated.add(headerX, slideX), [headerX, slideX]);
  const [tabsH, setTabsH] = useState(96);
  const [mainHeaderH, setMainHeaderH] = useState(108);

  // Substance ouverte : { id, focusDate, notifFlash, tick, from: 'list' | 'global', globalPage }
  const [sub, setSub] = useState(null);
  const subRef = useRef(null);
  subRef.current = sub;
  const subRequest = useStore((s) => s.subRequest);

  const tab = page >= 1 ? TABS[page - 1] : (sub ? 'calendar' : TABS[lastGlobal - 1]);
  const goTab = (t) => pagerRef.current?.setPage(1 + TABS.indexOf(t));
  const g = useGlobalPages({ activeTab: sub ? TABS[(sub.globalPage || lastGlobal) - 1] : tab, goTab, visited: gVisited });

  const closeSub = useCallback(() => {
    const cur = subRef.current;
    if (!cur) return;
    if (cur.from === 'global') {
      Animated.timing(slideX, { toValue: winW, duration: SLIDE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(() => {
        const gp = cur.globalPage || 1;
        subRef.current = null;
        setSub(null);
        pagerRef.current?.setPageWithoutAnimation(gp);
        pageRef.current = gp; setPage(gp); progress.setValue(gp);
        requestAnimationFrame(() => slideX.setValue(0));
      });
    } else {
      pagerRef.current?.setPage(0); // la page 0 sélectionnée ferme la substance
    }
  }, [slideX, winW, progress]);

  const s = useSubstancePages({ sub, activeTab: sub ? tab : 'calendar', goTab, visited: sVisited, onBack: closeSub });

  // Demande d'ouverture (liste, Recherche de Global, notification)
  useEffect(() => {
    if (!subRequest) return;
    const cur = subRef.current;
    const onGlobal = pageRef.current >= 1 && !cur;
    const from = cur ? cur.from : (subRequest.from === 'global' && onGlobal ? 'global' : 'list');
    const next = { ...subRequest, from, globalPage: cur ? cur.globalPage : (onGlobal ? pageRef.current : null) };
    subRef.current = next;
    setSub(next);
    setSVisited({ calendar: true });
    const t = setTimeout(() => setSVisited({ calendar: true, history: true, stats: true }), 500);
    if (cur) {
      pagerRef.current?.setPageWithoutAnimation(1);
    } else if (from === 'global') {
      slideX.setValue(winW);
      pagerRef.current?.setPageWithoutAnimation(1);
      requestAnimationFrame(() => Animated.timing(slideX, { toValue: 0, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start());
    } else if (pageRef.current >= 1) {
      pagerRef.current?.setPageWithoutAnimation(1); // ouverte par une notification depuis Global
    } else {
      requestAnimationFrame(() => pagerRef.current?.setPage(1));
    }
    return () => clearTimeout(t);
  }, [subRequest?.tick]); // eslint-disable-line

  const hasUnconsulted = useStore((s2) => s2.hasUnconsultedSnapshots);
  const gotoGlobalStatsTick = useStore((s2) => s2.gotoGlobalStatsTick);
  const pagerLocked = useStore((s2) => s2.pagerLocked);
  const reorderMode = useStore((s2) => s2.reorderMode);
  const notifFocus = useStore((s2) => s2.notifFocus);
  const [notifOpen, setNotifOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 1.40 : la cloche principale ne concerne que les substances (les bandeaux ont leur cloche)
  const hasAnyNotif = useStore((s2) => s2.notifRules.some((r) => r.target === 'sub'));

  // Tap sur une notification « Toutes » / catégorie → page Substances
  useEffect(() => {
    if (notifFocus?.tick) pagerRef.current?.setPage(0);
  }, [notifFocus?.tick]);

  // Bandeau des stats → onglet Stats de Global
  useEffect(() => {
    if (gotoGlobalStatsTick > 0) {
      if (subRef.current) { subRef.current = null; setSub(null); slideX.setValue(0); }
      requestAnimationFrame(() => pagerRef.current?.setPage(3));
    }
  }, [gotoGlobalStatsTick]); // eslint-disable-line

  const titles = ['Substances', 'Global'];

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (subRef.current) { closeSub(); return true; }
        if (pageRef.current >= 1) { pagerRef.current?.setPage(0); return true; }
        return false;
      };
      const h = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => h.remove();
    }, [closeSub])
  );

  const subOpen = !!sub && !!s.topBar;

  return (
    <View style={styles.container}>
      <View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== mainHeaderH) setMainHeaderH(h); }}>
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
                  <Text style={[styles.titleText, cur === i && styles.titleTextActive, dim && { opacity: 0.3 }]}>
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

        {/* 1.50 : en réorganisation de la liste, la barre « Réorganisation · Terminé » remplace cette
            ligne (partager et cloche ne sont pas utilisables pendant ce temps) → plus rien ne cache
            les bandeaux */}
        {reorderMode && page === 0 ? (
          <View style={[styles.indicator, styles.reorgRow]}>
            <Text style={styles.reorgText}>Réorganisation</Text>
            <TouchableOpacity onPress={() => useStore.getState().requestListFinish()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.reorgDone}>Terminé</Text>
            </TouchableOpacity>
          </View>
        ) : (
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
        )}
      </View>

      <View style={styles.pagerArea}>
        {/* Substance ouverte depuis Global : Global reste dessous pendant l'arrivée / le départ */}
        {sub?.from === 'global' && (
          <View style={StyleSheet.absoluteFill}>
            <View style={[styles.page, { paddingTop: tabsH }]}>{g[TABS[(sub.globalPage || 1) - 1]]}</View>
            <View style={styles.gHeader}>{g.header}</View>
          </View>
        )}
        <Animated.View style={[styles.pagerWrap, { transform: [{ translateX: slideX }] }]}>
          <PagerView
            ref={pagerRef}
            style={styles.pager}
            initialPage={0}
            scrollEnabled={!pagerLocked}
            onPageScroll={(e) => progress.setValue(e.nativeEvent.position + e.nativeEvent.offset)}
            onPageSelected={(e) => {
              const pos = e.nativeEvent.position;
              pageRef.current = pos;
              setPage(pos);
              progress.setValue(pos);
              if (pos === 0 && subRef.current) { subRef.current = null; setSub(null); }
              if (pos >= 1) {
                const t = TABS[pos - 1];
                if (subRef.current) setSVisited((v) => (v[t] ? v : { ...v, [t]: true }));
                else { setLastGlobal(pos); setGVisited((v) => (v[t] ? v : { ...v, [t]: true })); }
              }
              useStore.getState().requestCountersExit();
            }}
          >
            <View key="list" style={styles.page}>
              <SubstancesPage />
            </View>
            <View key="p-calendar" style={[styles.page, { paddingTop: tabsH }]}>{subOpen ? s.calendar : g.calendar}</View>
            <View key="p-history" style={[styles.page, { paddingTop: tabsH }]}>{subOpen ? s.history : g.history}</View>
            <View key="p-stats" style={[styles.page, { paddingTop: tabsH }]}>{subOpen ? s.stats : g.stats}</View>
          </PagerView>
          {/* Onglets + petit compteur : fixes entre les 3 pages, glissent avec la page vers la liste */}
          <Animated.View
            style={[styles.gHeader, { transform: [{ translateX: headerX }] }]}
            onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== tabsH) setTabsH(h); }}
          >
            {subOpen ? s.header : g.header}
          </Animated.View>
          {subOpen && s.fab && (
            <Animated.View style={[styles.fabWrap, { transform: [{ translateX: headerX }] }]} pointerEvents="box-none">
              {s.fab}
            </Animated.View>
          )}
          {subOpen ? s.reorgBar : g.reorgBar}
        </Animated.View>
      </View>

      {/* En-tête de la substance (flèche, nom, cloche) par-dessus l'en-tête principal : part et revient
          avec ses pages */}
      {subOpen && (
        <Animated.View style={[styles.subTop, { height: mainHeaderH, transform: [{ translateX: topX }] }]}>
          {s.topBar}
        </Animated.View>
      )}

      {g.modals}
      {subOpen && s.modals}
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
  pagerArea: { flex: 1, overflow: 'hidden' },
  pagerWrap: { flex: 1, backgroundColor: theme.colors.background },
  pager: { flex: 1 },
  page: { flex: 1 },
  gHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.colors.background },
  fabWrap: { ...StyleSheet.absoluteFillObject },
  subTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 34, backgroundColor: theme.colors.background, zIndex: 50, elevation: 50 },
  reorgRow: { justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, backgroundColor: theme.colors.surface },
  reorgText: { color: theme.colors.text, fontSize: theme.font.sizes.xs, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' },
  reorgDone: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '600', letterSpacing: 1 },
});
