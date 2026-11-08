import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Animated, Easing, Image, useWindowDimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import NotifWizard from '../components/NotifWizard';
import ShareModal from '../components/ShareModal';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import SubstancesPage from './SubstancesPage';
import { useGlobalPages } from './GlobalCalendarPage';
import { useSubstancePages } from './SubstanceScreen';

// 1.49 : un seul défilement Liste · Calendrier · Recherche · Stats.
// 1.50 : les 3 pages de droite montrent Global OU la substance ouverte (même code, mêmes gestes).
// 1.51 :
//  - Global reste monté (masqué) pendant qu'une substance est ouverte → plus de reconstruction ;
//  - fermeture (flèche, retour Android, depuis Global ou une substance) : retour DIRECT à la liste,
//    la page part vers la droite d'un seul bloc (image figée de l'écran qui glisse), sans repasser
//    par Recherche / Calendrier ;
//  - titres « Substances | Global », points et onglets suivent le doigt (couleurs calculées depuis
//    la position du défilement) ;
//  - partager visible aussi sur Global ; barre de réorganisation plus épaisse, sans délai.
const TABS = ['calendar', 'history', 'stats'];
const SLIDE_MS = 280;

export default function MainScreen() {
  const navigation = useNavigation();
  const pagerRef = useRef(null);
  const rootRef = useRef(null);
  const areaRef = useRef(null);
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

  // Position du défilement (JavaScript : suit toujours la page affichée)
  const progress = useRef(new Animated.Value(0)).current;
  const headerX = useMemo(() => progress.interpolate({
    inputRange: [0, 1], outputRange: [winW, 0], extrapolate: 'clamp',
  }), [progress, winW]);
  const titleColors = useMemo(() => [
    progress.interpolate({ inputRange: [0, 1], outputRange: [theme.colors.text, theme.colors.textFaint], extrapolate: 'clamp' }),
    progress.interpolate({ inputRange: [0, 1], outputRange: [theme.colors.textFaint, theme.colors.text], extrapolate: 'clamp' }),
  ], [progress]);
  const [tabsH, setTabsH] = useState(96);
  const [mainHeaderH, setMainHeaderH] = useState(108);

  // Substance ouverte : { id, focusDate, notifFlash, tick }
  const [sub, setSub] = useState(null);
  const subRef = useRef(null);
  subRef.current = sub;
  const subRequest = useStore((s) => s.subRequest);

  // --- Fermeture directe vers la liste (image figée qui part à droite) ---
  const closingRef = useRef(false);  // fermeture en cours
  const freezeRef = useRef(false);   // pendant l'animation : la position du défilement est pilotée ici
  const [shot, setShot] = useState(null); // { uri, full } — full : tout l'écran (substance, avec son en-tête)
  const shotX = useRef(new Animated.Value(0)).current;
  const shotStarted = useRef(false);

  const closeToList = useCallback(async () => {
    if (closingRef.current) return;
    if (pageRef.current === 0 && !subRef.current) return;
    closingRef.current = true;
    const full = !!subRef.current;
    try {
      const uri = await captureRef(full ? rootRef : areaRef, { format: 'jpg', quality: 0.85, result: 'tmpfile' });
      shotStarted.current = false;
      shotX.setValue(0);
      setShot({ uri, full });
    } catch (e) {
      closingRef.current = false;
      pagerRef.current?.setPage(0); // filet : défilement normal
    }
  }, [shotX]);

  // L'image couvre l'écran : passage instantané sur la liste dessous, puis l'image glisse à droite
  const startShotSlide = () => {
    if (shotStarted.current) return;
    shotStarted.current = true;
    freezeRef.current = true;
    pagerRef.current?.setPageWithoutAnimation(0); // la page 0 sélectionnée ferme la substance
    progress.setValue(1);
    const ease = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(shotX, { toValue: winW, duration: SLIDE_MS, easing: ease, useNativeDriver: false }),
      Animated.timing(progress, { toValue: 0, duration: SLIDE_MS, easing: ease, useNativeDriver: false }),
    ]).start(() => {
      freezeRef.current = false;
      closingRef.current = false;
      progress.setValue(pageRef.current);
      setShot((cur) => { if (cur?.uri) { try { releaseCapture(cur.uri); } catch (e) { /* rien */ } } return null; });
    });
  };
  useEffect(() => { // filet : image jamais chargée
    if (!shot) return undefined;
    const t = setTimeout(startShotSlide, 250);
    return () => clearTimeout(t);
  }, [shot]); // eslint-disable-line

  const tab = page >= 1 ? TABS[page - 1] : 'calendar';
  const goTab = useCallback((t) => pagerRef.current?.setPage(1 + TABS.indexOf(t)), []);
  const g = useGlobalPages({ activeTab: sub || page === 0 ? TABS[lastGlobal - 1] : tab, goTab, visited: gVisited, progress });
  const s = useSubstancePages({ sub, activeTab: sub ? tab : 'calendar', goTab, visited: sVisited, onBack: closeToList, progress });

  // Demande d'ouverture (liste, notification) — 1.51 : plus d'ouverture depuis Global
  useEffect(() => {
    if (!subRequest) return undefined;
    const cur = subRef.current;
    const next = { ...subRequest };
    subRef.current = next;
    setSub(next);
    setSVisited({ calendar: true });
    const t = setTimeout(() => setSVisited({ calendar: true, history: true, stats: true }), 500);
    if (cur || pageRef.current >= 1) {
      // Substance déjà ouverte, ou notification reçue sur Global : la page s'affiche directement
      pagerRef.current?.setPageWithoutAnimation(1);
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

  // Tap sur une notification « Toutes » / catégorie → liste (directement)
  useEffect(() => {
    if (notifFocus?.tick && pageRef.current !== 0) pagerRef.current?.setPageWithoutAnimation(0);
  }, [notifFocus?.tick]);

  // Bandeau des stats → onglet Stats de Global
  useEffect(() => {
    if (gotoGlobalStatsTick > 0) {
      if (subRef.current) { subRef.current = null; setSub(null); }
      requestAnimationFrame(() => pagerRef.current?.setPage(3));
    }
  }, [gotoGlobalStatsTick]); // eslint-disable-line

  const titles = ['Substances', 'Global'];

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (subRef.current || pageRef.current >= 1) { closeToList(); return true; }
        return false;
      };
      const h = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => h.remove();
    }, [closeToList])
  );

  const subOpen = !!sub && !!s.topBar;
  // 1.51 : la liste n'est pas redessinée quand l'écran principal change (onglets, cartes de Global…)
  const listPage = useMemo(() => <SubstancesPage />, []);
  const listReorg = reorderMode && page === 0;

  // Contenu d'une page de droite : Global toujours monté (masqué si une substance est ouverte)
  const pageBody = (key) => (
    <>
      <View style={[styles.fill, subOpen && styles.hidden]}>{g[key]}</View>
      {subOpen && <View style={styles.fill}>{s[key]}</View>}
    </>
  );

  return (
    <View ref={rootRef} collapsable={false} style={styles.container}>
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
                  onPress={() => {
                    if (pagerLocked) return;
                    if (i === 0) closeToList();
                    else pagerRef.current?.setPage(lastGlobal);
                  }}
                  style={styles.titleTab}
                  disabled={pagerLocked}
                >
                  <Animated.Text style={[styles.titleText, { color: titleColors[i] }, dim && { opacity: 0.3 }]}>
                    {t}
                  </Animated.Text>
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
            <Animated.View key={i} style={[styles.dot, { backgroundColor: titleColors[i] }]} />
          ))}
          {/* Partage (liste et Global), en miroir de la cloche. Inactifs pendant une réorganisation,
              sans changer d'aspect (1.51 : plus de clignotement) */}
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() => setShareOpen(true)}
            disabled={pagerLocked}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons name="share-variant" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => setNotifOpen(true)}
            disabled={pagerLocked}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons name={hasAnyNotif ? 'bell' : 'bell-outline'} size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* Réorganisation de la liste : barre posée PAR-DESSUS la ligne partager · points · cloche
            (plus épaisse, déborde vers le haut dans l'espace libre ; ne cache pas les bandeaux) */}
        {listReorg && (
          <View style={styles.reorgBar}>
            <Text style={styles.reorgText}>Réorganisation</Text>
            <TouchableOpacity onPress={() => useStore.getState().requestListFinish()} style={styles.reorgDoneBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.reorgDone}>Terminé</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View ref={areaRef} collapsable={false} style={styles.pagerArea}>
        <View style={styles.pagerWrap}>
          <PagerView
            ref={pagerRef}
            style={styles.pager}
            initialPage={0}
            scrollEnabled={!pagerLocked}
            onPageScroll={(e) => { if (!freezeRef.current) progress.setValue(e.nativeEvent.position + e.nativeEvent.offset); }}
            onPageSelected={(e) => {
              const pos = e.nativeEvent.position;
              pageRef.current = pos;
              setPage(pos);
              if (!freezeRef.current) progress.setValue(pos);
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
              {listPage}
            </View>
            <View key="p-calendar" style={[styles.page, { paddingTop: tabsH }]}>{pageBody('calendar')}</View>
            <View key="p-history" style={[styles.page, { paddingTop: tabsH }]}>{pageBody('history')}</View>
            <View key="p-stats" style={[styles.page, { paddingTop: tabsH }]}>{pageBody('stats')}</View>
          </PagerView>
          {/* Onglets + petit compteur : fixes entre les 3 pages, glissent avec la page vers la liste */}
          <Animated.View
            style={[styles.gHeader, { transform: [{ translateX: headerX }] }]}
            onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== tabsH) setTabsH(h); }}
          >
            <View style={subOpen && styles.hidden}>{g.header}</View>
            {subOpen && s.header}
          </Animated.View>
          {subOpen && s.fab && (
            <Animated.View style={[styles.fabWrap, { transform: [{ translateX: headerX }] }]} pointerEvents="box-none">
              {s.fab}
            </Animated.View>
          )}
          {subOpen ? s.reorgBar : g.reorgBar}
        </View>
        {shot && !shot.full && (
          <Animated.View pointerEvents="none" style={[styles.shot, { transform: [{ translateX: shotX }] }]}>
            <Image source={{ uri: shot.uri }} style={styles.shotImg} fadeDuration={0} onLoad={startShotSlide} />
          </Animated.View>
        )}
      </View>

      {/* En-tête de la substance (flèche, nom, cloche) par-dessus l'en-tête principal : part et revient
          avec ses pages */}
      {subOpen && (
        <Animated.View style={[styles.subTop, { height: mainHeaderH, transform: [{ translateX: headerX }] }]}>
          {s.topBar}
        </Animated.View>
      )}

      {shot && shot.full && (
        <Animated.View pointerEvents="none" style={[styles.shot, { transform: [{ translateX: shotX }] }]}>
          <Image source={{ uri: shot.uri }} style={styles.shotImg} fadeDuration={0} onLoad={startShotSlide} />
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
  titleText: { fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
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
  dot: { width: 4, height: 4, borderRadius: 2 },
  pagerArea: { flex: 1, overflow: 'hidden' },
  pagerWrap: { flex: 1, backgroundColor: theme.colors.background },
  pager: { flex: 1 },
  page: { flex: 1 },
  fill: { flex: 1 },
  hidden: { display: 'none' },
  gHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.colors.background },
  fabWrap: { ...StyleSheet.absoluteFillObject },
  subTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 34, backgroundColor: theme.colors.background, zIndex: 50, elevation: 50 },
  shot: { ...StyleSheet.absoluteFillObject, zIndex: 100, elevation: 100, backgroundColor: theme.colors.background },
  shotImg: { width: '100%', height: '100%' },
  // Barre de réorganisation de la liste (même aspect que celle des compteurs) : bas aligné sur la
  // ligne partager · points · cloche, déborde vers le haut
  reorgBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, zIndex: 60, elevation: 60,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  reorgText: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' },
  reorgDoneBtn: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  reorgDone: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 1 },
});
