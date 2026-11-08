// 1.54 — Page d'une substance en SURCOUCHE, posée par-dessus la liste (qui ne bouge pas dessous).
//  - ouverture : la page arrive de la droite ;
//  - fermeture : flèche, retour Android, ou glisser vers la droite depuis Calendrier (la page suit le
//    doigt) → la page part à droite telle quelle (depuis n'importe quel onglet) et découvre la liste ;
//  - entre Calendrier · Recherche · Stats : son propre défilement, mêmes pages et mêmes onglets que
//    Global (useSubstancePages + AnimatedTabs), tout ce qui suit le doigt sur le fil d'affichage.
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, BackHandler, useWindowDimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import Reanimated, {
  useSharedValue, useAnimatedStyle, useEvent, useDerivedValue, withTiming, runOnJS, Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { useSubstancePages } from './SubstanceScreen';

const TABS = ['calendar', 'history', 'stats'];
const AnimatedPager = Reanimated.createAnimatedComponent(PagerView);
export const SLIDE_MS = 280;               // = vitesse du défilement entre les pages
const SLIDE_EASE = Easing.out(Easing.cubic);

// sub : { id, focusDate, notifFlash, tick } ; headerH : hauteur de l'en-tête principal (recouvert)
// onOpened : arrivée terminée ; onClosed : départ terminé (le parent retire la surcouche)
export default function SubstanceOverlay({ sub, headerH, tabsH0 = 96, onOpened, onClosed }) {
  const { width: winW } = useWindowDimensions();
  const pagerRef = useRef(null);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const [visited, setVisited] = useState({ calendar: true });
  // 1.56 : hauteur des onglets connue d'avance (mesurée sur Global) → le calendrier ne se décale plus
  const [tabsH, setTabsH] = useState(tabsH0);
  // 1.56 : pendant les déplacements, la page est dessinée comme une image (texture) → glisse d'un bloc
  const [hw, setHw] = useState(true);
  const pagerLocked = useStore((s) => s.pagerLocked);

  // Position horizontale de la surcouche (0 = affichée, winW = sortie à droite)
  const ox = useSharedValue(winW);
  const closing = useRef(false);

  // Défilement interne (0 à 2) ; les onglets attendent 1 à 3 (comme Global)
  const spos = useSharedValue(0);
  const tabPos = useDerivedValue(() => spos.value + 1);
  const onPageScroll = useEvent((e) => {
    'worklet';
    spos.value = e.position + e.offset;
  }, ['onPageScroll']);

  // 1.58 : la page ne commence à arriver qu'une fois TOUT en place hors écran (hauteur des onglets
  // mesurée, calendrier calé sur le mois courant) → plus rien ne bouge ou ne se décale à l'arrivée.
  const readyFlags = useRef({ tabs: false, cal: false });
  const started = useRef(false);
  const startOpen = () => {
    if (started.current) return;
    started.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ox.value = withTiming(0, { duration: SLIDE_MS, easing: SLIDE_EASE }, (fin) => { if (fin) runOnJS(opened)(); });
    }));
  };
  const checkReady = () => { if (readyFlags.current.tabs && readyFlags.current.cal) startOpen(); };
  const onCalendarPlaced = useCallback(() => { readyFlags.current.cal = true; checkReady(); }, []); // eslint-disable-line

  // Arrivée (et nouvelle substance ouverte par-dessus : on revient sur Calendrier, sans animation)
  const openedOnce = useRef(false);
  useEffect(() => {
    if (!sub) return undefined;
    setVisited({ calendar: true });
    // Recherche et Stats construites APRÈS l'arrivée (pas pendant le glissement)
    const t = setTimeout(() => setVisited({ calendar: true, history: true, stats: true }), 800);
    let t2 = null;
    if (!openedOnce.current) {
      openedOnce.current = true;
      ox.value = winW;
      t2 = setTimeout(startOpen, 400); // filet : on part quand même
    } else if (pageRef.current !== 0) {
      pagerRef.current?.setPageWithoutAnimation(0);
    }
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [sub?.tick]); // eslint-disable-line

  const opened = () => { setHw(false); onOpened?.(); };
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    // texture seulement si la page est encore en place (retour) ; au glisser elle bouge déjà
    if (ox.value < 1) setHw(true);
    // 1.55 : aucune mise à jour pendant le départ, sauf si la réorganisation des compteurs est ouverte
    if (useStore.getState().countersEditing) useStore.getState().requestCountersExit();
    // 1.56 : départ une image plus tard, une fois la page préparée en texture (plus d'à-coup au retour)
    requestAnimationFrame(() => {
      ox.value = withTiming(winW, { duration: SLIDE_MS, easing: SLIDE_EASE }, (fin) => { if (fin) runOnJS(onClosed)(); });
    });
  }, [winW, onClosed]); // eslint-disable-line

  // Retour Android (enregistré après celui de l'écran principal → prioritaire)
  useFocusEffect(
    useCallback(() => {
      const h = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
      return () => h.remove();
    }, [close])
  );

  const tab = TABS[page] || 'calendar';
  const goTab = useCallback((t) => pagerRef.current?.setPage(TABS.indexOf(t)), []);
  const s = useSubstancePages({ sub, activeTab: tab, goTab, visited, onBack: close, pos: tabPos, onCalendarPlaced });

  // Glisser vers la droite depuis Calendrier : la page suit le doigt
  const swipe = useMemo(() => Gesture.Pan()
    .enabled(page === 0 && !pagerLocked)
    .activeOffsetX(14)
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      'worklet';
      ox.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationX > winW * 0.3 || e.velocityX > 800) {
        runOnJS(close)();
      } else {
        ox.value = withTiming(0, { duration: 180, easing: SLIDE_EASE });
      }
    }), [page, pagerLocked, winW, close]); // eslint-disable-line

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: ox.value }] }));

  if (!s.topBar) return null;

  return (
    <Reanimated.View style={[styles.overlay, slideStyle]} renderToHardwareTextureAndroid={hw}>
      <GestureDetector gesture={swipe}>
        <View style={styles.fill} collapsable={false}>
          {/* En-tête (flèche, nom, cloche) à la place de l'en-tête principal */}
          <View style={[styles.topBar, { height: headerH }]}>{s.topBar}</View>
          <View style={styles.fill}>
            <AnimatedPager
              ref={pagerRef}
              style={styles.fill}
              initialPage={0}
              scrollEnabled={!pagerLocked}
              onPageScroll={onPageScroll}
              onPageSelected={(e) => {
                const p = e.nativeEvent.position;
                pageRef.current = p;
                setPage(p);
                const t = TABS[p];
                setVisited((v) => (v[t] ? v : { ...v, [t]: true }));
                if (useStore.getState().countersEditing) useStore.getState().requestCountersExit();
              }}
            >
              <View key="s-calendar" style={[styles.fill, { paddingTop: tabsH }]}>{s.calendar}</View>
              <View key="s-history" style={[styles.fill, { paddingTop: tabsH }]}>{s.history}</View>
              <View key="s-stats" style={[styles.fill, { paddingTop: tabsH }]}>{s.stats}</View>
            </AnimatedPager>
            {/* Onglets + petit compteur : fixes entre les 3 pages */}
            <View
              style={styles.tabsHeader}
              onLayout={(e) => {
                const h = Math.round(e.nativeEvent.layout.height);
                if (h > 0 && h !== tabsH) setTabsH(h);
                if (h > 0 && !readyFlags.current.tabs) { readyFlags.current.tabs = true; checkReady(); }
              }}
            >
              {s.header}
            </View>
            {s.fab && <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{s.fab}</View>}
            {s.reorgBar}
          </View>
        </View>
      </GestureDetector>
      {s.modals}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // 1.55 : sans ombre (coûteuse à animer sur Android → saccades)
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: theme.colors.background },
  fill: { flex: 1 },
  topBar: { paddingTop: 34, backgroundColor: theme.colors.background },
  tabsHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.colors.background },
});
