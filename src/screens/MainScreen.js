import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, useWindowDimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import Reanimated, { useSharedValue, useAnimatedStyle, useEvent, interpolate, interpolateColor, Extrapolation } from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import NotifWizard from '../components/NotifWizard';
import ShareModal from '../components/ShareModal';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import SubstancesPage from './SubstancesPage';
import { useGlobalPages } from './GlobalCalendarPage';
import SubstanceOverlay from './SubstanceOverlay';

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
//  1.52 : tout ce qui suit le doigt (en-têtes, onglets, titres, points, bouton +) est calculé sur le fil
//  d'affichage (Reanimated) depuis la position du défilement → accroché aux pages à chaque image ;
//  1.53 : retour = le glisser depuis Calendrier (plus d'image qui glisse : plus de flash noir).
//  1.54 : la substance n'est plus dans ce défilement : c'est une SURCOUCHE posée sur la liste (immobile
//  dessous), voir SubstanceOverlay. Ce défilement ne contient plus que Liste · Global (3 onglets).
const TABS = ['calendar', 'history', 'stats'];
const AnimatedPager = Reanimated.createAnimatedComponent(PagerView);
const C_FAINT = theme.colors.textFaint; // couleurs lues sur le fil d'affichage
const C_TEXT = theme.colors.text;

// Titre / point de l'en-tête principal : blanc sur sa page, gris sur l'autre (suit le doigt)
function HeaderTitle({ pos, i, label, dim }) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, pos.value));
    return { color: interpolateColor(i === 0 ? 1 - t : t, [0, 1], [C_FAINT, C_TEXT]) };
  }, [i]);
  return <Reanimated.Text style={[styles.titleText, style, dim && styles.dim]}>{label}</Reanimated.Text>;
}
function HeaderDot({ pos, i }) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, pos.value));
    return { backgroundColor: interpolateColor(i === 0 ? 1 - t : t, [0, 1], [C_FAINT, C_TEXT]) };
  }, [i]);
  return <Reanimated.View style={[styles.dot, style]} />;
}

export default function MainScreen() {
  const navigation = useNavigation();
  const pagerRef = useRef(null);
  const { width: winW } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const [lastGlobal, setLastGlobal] = useState(1); // dernier onglet de Global affiché (page 1 à 3)
  // Pages construites à la 1re visite, puis toutes peu après (prêtes au glisser)
  const [gVisited, setGVisited] = useState({ calendar: true });
  useEffect(() => {
    const t = setTimeout(() => setGVisited({ calendar: true, history: true, stats: true }), 600);
    return () => clearTimeout(t);
  }, []);

  // Position du défilement (fil d'affichage) : 0 = liste, 1 à 3 = onglets
  const pos = useSharedValue(0);
  const onPageScroll = useEvent((e) => {
    'worklet';
    pos.value = e.position + e.offset;
  }, ['onPageScroll']);
  // En-têtes et bouton + des pages de droite : glissent avec la page vers la liste
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(pos.value, [0, 1], [winW, 0], Extrapolation.CLAMP) }],
  }), [winW]);
  const [tabsH, setTabsH] = useState(96);
  const [mainHeaderH, setMainHeaderH] = useState(108);

  // --- Retour à la liste depuis Global (flèche, retour Android, tap sur « Substances ») ---
  // Le glisser gauche → droite depuis Calendrier ; depuis Recherche / Stats : passage instantané sur
  // Calendrier, puis le même glisser.
  const closeToList = useCallback(() => {
    const p = pageRef.current;
    if (p === 0) return;
    if (p > 1) {
      pagerRef.current?.setPageWithoutAnimation(1);
      requestAnimationFrame(() => pagerRef.current?.setPage(0));
    } else {
      pagerRef.current?.setPage(0);
    }
  }, []);

  const tab = page >= 1 ? TABS[page - 1] : TABS[lastGlobal - 1];
  const goTab = useCallback((t) => pagerRef.current?.setPage(1 + TABS.indexOf(t)), []);
  const g = useGlobalPages({ activeTab: tab, goTab, visited: gVisited, pos });

  // --- Substance (surcouche) : { id, focusDate, notifFlash, tick } ---
  const [sub, setSub] = useState(null);
  const subRef = useRef(null);
  subRef.current = sub;
  const subRequest = useStore((s) => s.subRequest);
  useEffect(() => {
    if (!subRequest) return;
    const next = { ...subRequest };
    subRef.current = next;
    setSub(next);
  }, [subRequest?.tick]); // eslint-disable-line
  // Arrivée terminée : si on était sur Global (notification), la liste est remise en place DESSOUS
  // → à la fermeture, on retrouve la liste
  const onSubOpened = useCallback(() => {
    if (pageRef.current !== 0) pagerRef.current?.setPageWithoutAnimation(0);
  }, []);
  const onSubClosed = useCallback(() => { subRef.current = null; setSub(null); }, []);

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
    if (!notifFocus?.tick) return;
    if (subRef.current) onSubClosed();
    if (pageRef.current !== 0) pagerRef.current?.setPageWithoutAnimation(0);
  }, [notifFocus?.tick]);

  // Bandeau des stats → onglet Stats de Global
  useEffect(() => {
    if (gotoGlobalStatsTick > 0) {
      if (subRef.current) onSubClosed();
      requestAnimationFrame(() => pagerRef.current?.setPage(3));
    }
  }, [gotoGlobalStatsTick]); // eslint-disable-line

  const titles = ['Substances', 'Global'];

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (pageRef.current >= 1) { closeToList(); return true; }
        return false;
      };
      const h = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => h.remove();
    }, [closeToList])
  );

  // 1.51 : la liste n'est pas redessinée quand l'écran principal change (onglets, cartes de Global…)
  const listPage = useMemo(() => <SubstancesPage />, []);
  const listReorg = reorderMode && page === 0;

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
              // 1.52 : en réorganisation, « Substances », « Global » et « settings » sont assombris
              const dim = pagerLocked;
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
                  <HeaderTitle pos={pos} i={i} label={t} dim={dim} />
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => !pagerLocked && navigation.navigate('Settings')}
              style={[styles.settingBtn, pagerLocked && styles.dim]}
              disabled={pagerLocked}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.settingText}>settings</Text>
                {hasUnconsulted && <View style={styles.redDot} />}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 1.53 : en réorganisation, tout est assombri sauf « almanac » (même filtre partout) */}
        <View style={[styles.indicator, pagerLocked && styles.dim]}>
          {[0, 1].map((i) => (
            <HeaderDot key={i} pos={pos} i={i} />
          ))}
          {/* Partage (liste et Global), en miroir de la cloche. Inactifs pendant une réorganisation */}
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

      <View style={styles.pagerArea}>
        <View style={styles.pagerWrap}>
          <AnimatedPager
            ref={pagerRef}
            style={styles.pager}
            initialPage={0}
            scrollEnabled={!pagerLocked}
            onPageScroll={onPageScroll}
            onPageSelected={(e) => {
              const p = e.nativeEvent.position;
              pageRef.current = p;
              setPage(p);
              if (p >= 1) {
                const t = TABS[p - 1];
                setLastGlobal(p); setGVisited((v) => (v[t] ? v : { ...v, [t]: true }));
              }
              useStore.getState().requestCountersExit();
            }}
          >
            <View key="list" style={styles.page}>
              {listPage}
            </View>
            <View key="p-calendar" style={[styles.page, { paddingTop: tabsH }]}>{g.calendar}</View>
            <View key="p-history" style={[styles.page, { paddingTop: tabsH }]}>{g.history}</View>
            <View key="p-stats" style={[styles.page, { paddingTop: tabsH }]}>{g.stats}</View>
          </AnimatedPager>
          {/* Onglets + petit compteur : fixes entre les 3 pages, glissent avec la page vers la liste */}
          <Reanimated.View
            style={[styles.gHeader, slideStyle]}
            onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== tabsH) setTabsH(h); }}
          >
            {g.header}
          </Reanimated.View>
          {g.reorgBar}
        </View>
      </View>

      {g.modals}
      {/* 1.54 : substance en surcouche (la liste reste immobile dessous) */}
      {sub && (
        <SubstanceOverlay sub={sub} headerH={mainHeaderH} tabsH0={tabsH} onOpened={onSubOpened} onClosed={onSubClosed} />
      )}
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
  dim: { opacity: theme.dim },
  pagerArea: { flex: 1, overflow: 'hidden' },
  pagerWrap: { flex: 1, backgroundColor: theme.colors.background },
  pager: { flex: 1 },
  page: { flex: 1 },
  fill: { flex: 1 },
  hidden: { display: 'none' },
  gHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.colors.background },
  fabWrap: { ...StyleSheet.absoluteFillObject },
  subTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 34, backgroundColor: theme.colors.background, zIndex: 50, elevation: 50 },
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
