// Réorganisation drag & drop v1.20 — gestes NATIFS via react-native-gesture-handler.
//
// Pourquoi : les versions faites avec le responder JS (PanResponder / onResponder*) se faisaient
// couper par Android dès que le doigt bougeait. gesture-handler gère les gestes côté natif et
// coordonne proprement avec la ScrollView (elle aussi fournie par gesture-handler).
//
// Comportement :
//  - Hors mode : Pressable → tap = ouvrir la substance, appui long = menu « ⋯ » de la substance.
//  - En mode (entré via « Réorganiser » dans le menu) :
//     • défilement NORMAL de la liste tant que rien n'est saisi ;
//     • appui long (400 ms) sur une ligne → saisie, et le drag continue dans le même toucher
//       (Pan avec activateAfterLongPress : si le doigt bouge AVANT 400 ms, le geste échoue et
//       c'est le défilement qui s'applique) ;
//     • seules les substances vibrent (contenu), JAMAIS les séparateurs (portés par le conteneur) ;
//     • une copie suit le doigt ; les autres lignes glissent pour libérer la place ; barre blanche ;
//     • près du bord haut/bas de la zone visible : défilement automatique doux ;
//     • lâcher → nouvel ordre appliqué en une fois.
//  - « Terminé » ou retour Android → sortie + enregistrement de l'ordre.
// Aucune priorité d'affichage (zIndex/elevation) dans la liste.
//
// 1.27 — item.collapse (Animated.Value, optionnel) : hauteur animée de la ligne.
// 1.48 — item.animHeight (élément fixe) : hauteur animée (grille des bandeaux qui grandit / rétrécit).
//
// 1.23 — plusieurs GROUPES dans une seule liste et un seul mode (ex. bandeaux puis substances) :
//  - chaque élément peut avoir `group` (même groupe = peuvent s'échanger) et `static: true`
//    (élément fixe, ex. l'espace avec la pilule « + » entre bandeaux et substances), avec un
//    `containerStyle` optionnel (ex. marge négative) ;
//  - hauteurs variables via getItemHeight(item) ;
//  - un élément saisi ne peut aller que dans SON groupe : la copie est bloquée en butée
//    au premier / dernier élément du groupe.

import { useState, useEffect, useLayoutEffect, useRef, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, TouchableOpacity, BackHandler, Easing,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const WIGGLE_ANGLE = 1.2;
const WIGGLE_DURATION = 110;
const PICKUP_SCALE = 1.06;
const PICKUP_OPACITY = 0.92;
const LONG_PRESS_MS = 400;
const EDGE_ZONE = 90;       // px depuis le bord où l'auto-scroll démarre
const EDGE_MAX_SPEED = 14;  // px par frame au plus près du bord
const BOUND_PX = 6;         // dépassement (px) au-delà duquel on signale la butée

// Exporté (1.25) : c'est renderItem qui choisit QUOI vibre (ex. icône + nom, pas les boutons)
export function WiggleContent({ children, isWiggling, phase, style }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isWiggling) { rot.stopAnimation(); rot.setValue(0); return; }
    const seq = Animated.loop(Animated.sequence([
      Animated.timing(rot, { toValue: 1, duration: WIGGLE_DURATION, useNativeDriver: true, delay: phase * 25 }),
      Animated.timing(rot, { toValue: -1, duration: WIGGLE_DURATION * 2, useNativeDriver: true }),
      Animated.timing(rot, { toValue: 0, duration: WIGGLE_DURATION, useNativeDriver: true }),
    ]));
    seq.start();
    return () => seq.stop();
  }, [isWiggling, phase, rot]);
  const rotate = rot.interpolate({ inputRange: [-1, 1], outputRange: [`-${WIGGLE_ANGLE}deg`, `${WIGGLE_ANGLE}deg`] });
  return <Animated.View style={[style, { transform: [{ rotate }] }]}>{children}</Animated.View>;
}

// Ligne en mode actif : geste natif (Pan après appui long). Le conteneur porte le séparateur
// et le décalage ; seul le contenu vibre / devient invisible quand la ligne est saisie.
//
// Perf (1.22) :
//  - memo : à chaque changement de place pendant le drag, seules les lignes dont le décalage
//    change sont redessinées (avant : toute la liste) ;
//  - décalage animé côté natif (glisse en 140 ms au lieu de sauter) PENDANT le drag ;
//  - hors drag, décalage statique 0 : au lâcher, le nouvel ordre et la remise à 0 arrivent dans
//    le même rendu (pas de saut d'une frame).
const ActiveRow = memo(function ActiveRow({
  item, index, itemHeight, offsetY, dragging, isPicked, isWiggling, handlersRef, renderItem,
}) {
  const indexRef = useRef(index);
  indexRef.current = index;
  const offAnim = useRef(new Animated.Value(0)).current;

  useLayoutEffect(() => {
    if (!dragging) { offAnim.stopAnimation(); offAnim.setValue(0); return; }
    Animated.timing(offAnim, {
      toValue: offsetY, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [offsetY, dragging, offAnim]);

  const gesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .runOnJS(true)
    .onStart((e) => handlersRef.current.start(indexRef.current, e))
    .onUpdate((e) => handlersRef.current.move(e))
    .onEnd(() => handlersRef.current.end())
    .onFinalize(() => handlersRef.current.finalize()), [handlersRef]);

  const translateY = dragging && !isPicked ? offAnim : 0;

  if (item.static) {
    return <Animated.View style={[{ height: item.animHeight || itemHeight }, item.containerStyle]}>{renderItem({ item, index, isWiggling: false, isPickup: false, inReorder: true })}</Animated.View>;
  }

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        style={[styles.rowContainer, { height: item.collapse || itemHeight, transform: [{ translateY }] }, item.collapse && { overflow: 'hidden' }]}
      >
        <View style={{ opacity: isPicked ? 0 : 1 }}>
          {renderItem({ item, index, isWiggling, phase: index % 3, isPickup: false, inReorder: true })}
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

function moveItem(arr, from, to) {
  const next = [...arr];
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m);
  return next;
}

export default function ReorderList({
  data = [],
  renderItem,
  itemHeight = 68,
  getItemHeight = null,    // (item) => hauteur ; sinon itemHeight pour tous
  onReorder,
  onItemTap = null,
  onItemLongPress = null,
  onScrollY = null,
  onScrollEnd = null,
  onMetrics = null,        // ({ viewportH, contentH, listTop }) pour le centrage du bandeau
  active,
  onDeactivate,
  headerComponent = null,
  renderOverlay = null,    // ({ items, tops, heights }) → élément dessiné PAR-DESSUS la liste et la copie
  footerComponent = null,  // affiché sous la liste (ex. substances grisées pendant la réorg des bandeaux)
  scrollRef = null,
  finishSignal = 0,        // 1.33 : change → termine la réorganisation (ordre en cours enregistré)
  scrollLocked = false,    // 1.48 : un élément fixe gère son propre glisser (grille des bandeaux)
  showBar = true,          // 1.50 : false → la barre « Réorganisation · Terminé » est affichée ailleurs
}) {
  const [localIds, setLocalIds] = useState(data.map((d) => d.id));
  const [pickupIdx, setPickupIdx] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  // Butée atteinte pendant le drag : 'top' | 'bottom' | null → barre au bord de la section + haptic
  const [bound, setBound] = useState(null);

  const localIdsRef = useRef(localIds);
  useEffect(() => { localIdsRef.current = localIds; }, [localIds]);
  const panY = useRef(new Animated.Value(0)).current;

  const localScrollRef = useRef(null);
  const effectiveScrollRef = scrollRef || localScrollRef;
  const containerRef = useRef(null);

  // Mesures (pour l'auto-scroll et le centrage du bandeau)
  const scrollYRef = useRef(0);
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);
  const listTopRef = useRef(0);       // position Y des lignes dans le contenu (= hauteur du header)
  const viewportTopRef = useRef(0);   // position Y absolue de la zone visible à l'écran
  const reportMetrics = () => onMetrics?.({
    viewportH: viewportHRef.current, contentH: contentHRef.current, listTop: listTopRef.current,
  });

  // État du drag (refs : lus dans les callbacks de geste)
  const drag = useRef({ p: null, h: null, bound: null, gStart: 0, gEnd: 0, transY: 0, fingerAbsY: 0, scrollAtPickup: 0, committed: false }).current;
  const layoutRef = useRef({ items: [], tops: [], heights: [] });
  const autoTimerRef = useRef(null);

  // Resync depuis data. En mode réorganisation, on garde l'ordre en cours (pas encore enregistré) :
  // éléments supprimés retirés, nouveaux ajoutés à leur place d'origine.
  useEffect(() => {
    if (drag.p != null) return;
    const ids = data.map((d) => d.id);
    if (!active) { setLocalIds(ids); return; }
    setLocalIds((prev) => {
      const set = new Set(ids);
      const kept = prev.filter((id) => set.has(id));
      if (kept.length === 0) return ids;
      const next = [...kept];
      ids.forEach((id, i) => { if (!next.includes(id)) next.splice(Math.min(i, next.length), 0, id); });
      return next;
    });
  }, [data]); // eslint-disable-line

  useLayoutEffect(() => {
    if (pickupIdx == null) panY.setValue(0);
  }, [localIds, pickupIdx, panY]);

  const stopAuto = () => {
    if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
  };
  useEffect(() => stopAuto, []);

  const finishReorder = () => {
    const original = data.map((d) => d.id);
    // Ordre en cours, limité aux éléments encore présents (ex. substance qui vient d'être supprimée)
    // + éléments apparus entre-temps, à leur place d'origine
    const present = new Set(original);
    const current = localIdsRef.current.filter((id) => present.has(id));
    original.forEach((id, i) => { if (!current.includes(id)) current.splice(Math.min(i, current.length), 0, id); });
    const changed = current.length !== original.length || current.some((id, i) => id !== original[i]);
    if (changed) onReorder?.(current);
    stopAuto();
    drag.p = null;
    setPickupIdx(null);
    setHoverIdx(null);
    onDeactivate?.();
  };

  // Fin demandée par le parent (suppression, couleur, icône, nom : l'action pour laquelle on était venu)
  const finishSignalRef = useRef(finishSignal);
  useEffect(() => {
    if (finishSignal === finishSignalRef.current) return;
    finishSignalRef.current = finishSignal;
    if (active) finishReorder();
  }, [finishSignal]); // eslint-disable-line

  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { finishReorder(); return true; });
    return () => sub.remove();
    // eslint-disable-next-line
  }, [active]);

  // Position de la copie + place visée, à partir du doigt et du défilement
  const applyPosition = () => {
    if (drag.p == null) return;
    const { tops, heights } = layoutRef.current;
    const p = drag.p;
    const H = heights[p];
    const raw = drag.transY + (scrollYRef.current - drag.scrollAtPickup);
    // Butées : la copie ne sort pas de son groupe (1er / dernier élément du groupe)
    const minDelta = tops[drag.gStart] - tops[p];
    const maxDelta = tops[drag.gEnd] - tops[p];
    const delta = Math.max(minDelta, Math.min(maxDelta, raw));
    panY.setValue(delta);
    // On pousse au-delà du 1er / dernier élément de la section → repère + haptic (une fois par butée)
    const b = raw < minDelta - BOUND_PX ? 'top' : raw > maxDelta + BOUND_PX ? 'bottom' : null;
    if (b !== drag.bound) {
      if (b) haptics.medium(); // un seul coup (le motif « warning » d'Android en fait deux)
      drag.bound = b;
      setBound(b);
    }
    const center = tops[p] + H / 2 + delta;
    let h = drag.gStart + Math.floor((center - tops[drag.gStart]) / H);
    h = Math.max(drag.gStart, Math.min(drag.gEnd, h));
    if (h !== drag.h) {
      haptics.light();
      drag.h = h;
      setHoverIdx(h);
    }
  };

  // Auto-scroll doux près des bords pendant le drag
  const autoScrollTick = () => {
    if (drag.p == null) return;
    const rel = drag.fingerAbsY - viewportTopRef.current;
    const vh = viewportHRef.current;
    let speed = 0;
    if (rel < EDGE_ZONE) speed = -Math.max(2, ((EDGE_ZONE - rel) / EDGE_ZONE) * EDGE_MAX_SPEED);
    else if (rel > vh - EDGE_ZONE) speed = Math.max(2, ((rel - (vh - EDGE_ZONE)) / EDGE_ZONE) * EDGE_MAX_SPEED);
    if (speed === 0) return;
    // Copie déjà en butée de son groupe dans ce sens → inutile de faire défiler
    const { tops } = layoutRef.current;
    const raw = drag.transY + (scrollYRef.current - drag.scrollAtPickup);
    if (speed < 0 && raw <= tops[drag.gStart] - tops[drag.p]) return;
    if (speed > 0 && raw >= tops[drag.gEnd] - tops[drag.p]) return;
    const maxY = Math.max(0, contentHRef.current - vh);
    const nextY = Math.max(0, Math.min(maxY, scrollYRef.current + speed));
    if (nextY === scrollYRef.current) return;
    scrollYRef.current = nextY;
    effectiveScrollRef.current?.scrollTo({ y: nextY, animated: false });
    applyPosition();
  };

  const handlersRef = useRef(null);
  handlersRef.current = {
    start: (idx, e) => {
      haptics.medium();
      // Plage du groupe de l'élément saisi (éléments contigus du même groupe, non fixes)
      const its = layoutRef.current.items;
      const g = its[idx]?.group;
      let gs = idx; let ge = idx;
      while (gs - 1 >= 0 && !its[gs - 1].static && its[gs - 1].group === g) gs--;
      while (ge + 1 < its.length && !its[ge + 1].static && its[ge + 1].group === g) ge++;
      drag.gStart = gs; drag.gEnd = ge;
      drag.p = idx;
      drag.h = idx;
      drag.bound = null;
      setBound(null);
      drag.transY = 0;
      drag.fingerAbsY = e.absoluteY;
      drag.scrollAtPickup = scrollYRef.current;
      drag.committed = false;
      panY.setValue(0);
      setPickupIdx(idx);
      setHoverIdx(idx);
      containerRef.current?.measureInWindow?.((x, y) => { viewportTopRef.current = y; });
      stopAuto();
      autoTimerRef.current = setInterval(autoScrollTick, 16);
    },
    move: (e) => {
      if (drag.p == null) return;
      drag.transY = e.translationY;
      drag.fingerAbsY = e.absoluteY;
      applyPosition();
    },
    end: () => {
      // Fin normale du geste (doigt levé) → on applique la place visée
      if (drag.p == null) return;
      const p = drag.p;
      const h = drag.h;
      drag.committed = true;
      stopAuto();
      drag.p = null;
      if (h != null && h !== p) {
        haptics.success();
        const next = moveItem(localIdsRef.current, p, h);
        localIdsRef.current = next;
        setLocalIds(next);
      }
      setPickupIdx(null);
      setHoverIdx(null);
      drag.bound = null;
      setBound(null);
    },
    finalize: () => {
      // Geste annulé (pas de fin normale) → on remet en place sans rien changer
      if (drag.p == null || drag.committed) return;
      stopAuto();
      drag.p = null;
      setPickupIdx(null);
      setHoverIdx(null);
      drag.bound = null;
      setBound(null);
    },
  };

  let items = localIds.map((id) => data.find((d) => d.id === id)).filter(Boolean);
  // Changement de jeu de données (ex. substances → bandeaux) : on suit data tout de suite
  if (items.length !== data.length) items = data;

  // Positions (dans la zone de liste) et hauteurs de chaque élément
  const heightOf = (it) => (getItemHeight ? getItemHeight(it) : itemHeight);
  const heights = items.map(heightOf);
  const tops = [];
  heights.reduce((acc, h, i) => { tops[i] = acc; return acc + h; }, 0);
  layoutRef.current = { items, tops, heights }; // lu par les callbacks de geste

  // Décalage visuel d'une ligne pendant le drag (même groupe uniquement)
  const offsetFor = (i) => {
    if (pickupIdx == null || hoverIdx == null || i === pickupIdx) return 0;
    if (items[i]?.static || items[i]?.group !== items[pickupIdx]?.group) return 0;
    const H = heights[pickupIdx];
    if (pickupIdx < hoverIdx && i > pickupIdx && i <= hoverIdx) return -H;
    if (hoverIdx < pickupIdx && i >= hoverIdx && i < pickupIdx) return H;
    return 0;
  };

  let barTop = null;
  if (pickupIdx != null && bound) {
    // Butée : barre au bord de la section (haut du 1er élément / bas du dernier)
    barTop = bound === 'top' ? tops[drag.gStart] : tops[drag.gEnd] + heights[drag.gEnd];
  } else if (pickupIdx != null && hoverIdx != null && hoverIdx !== pickupIdx) {
    barTop = hoverIdx < pickupIdx ? tops[hoverIdx] : tops[hoverIdx] + heights[pickupIdx];
  }
  const pickedItem = pickupIdx != null ? items[pickupIdx] : null;
  // Copie qui suit le doigt : construite une fois par saisie (pas à chaque changement de place)
  const cloneContent = useMemo(() => (pickedItem
    ? renderItem({ item: pickedItem, index: pickupIdx, isWiggling: true, phase: 0, isPickup: true, inReorder: true })
    : null), [pickedItem, pickupIdx, renderItem]);

  return (
    <View
      ref={containerRef}
      style={styles.container}
      collapsable={false}
      onLayout={(e) => { viewportHRef.current = e.nativeEvent.layout.height; reportMetrics(); }}
    >
      <ScrollView keyboardShouldPersistTaps="handled"
        ref={effectiveScrollRef}
        contentContainerStyle={{ paddingBottom: 120 }}
        scrollEnabled={pickupIdx == null && !scrollLocked}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
          onScrollY?.(scrollYRef.current);
        }}
        onContentSizeChange={(w, h) => { contentHRef.current = h; reportMetrics(); }}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
      >
        {headerComponent}

        <View
          style={styles.listArea}
          onLayout={(e) => { listTopRef.current = e.nativeEvent.layout.y; reportMetrics(); }}
        >
          {items.map((item, idx) => {
            if (active) {
              const isPicked = idx === pickupIdx;
              return (
                <ActiveRow
                  key={item.id}
                  item={item}
                  index={idx}
                  itemHeight={heights[idx]}
                  offsetY={offsetFor(idx)}
                  dragging={pickupIdx != null}
                  isPicked={isPicked}
                  isWiggling={pickupIdx == null}
                  handlersRef={handlersRef}
                  renderItem={renderItem}
                />
              );
            }
            if (item.static) {
              return (
                <Animated.View key={item.id} style={[{ height: item.animHeight || heights[idx] }, item.containerStyle]}>
                  {renderItem({ item, index: idx, isWiggling: false, isPickup: false, inReorder: false })}
                </Animated.View>
              );
            }
            return (
              // item.collapse (Animated.Value) : hauteur animée (ex. bandeau supprimé qui se referme)
              <Animated.View key={item.id} style={[styles.rowContainer, { height: item.collapse || heights[idx] }, item.collapse && { overflow: 'hidden' }]}>
                <Pressable
                  onPress={() => onItemTap?.(item, idx)}
                  onLongPress={() => { haptics.medium(); onItemLongPress?.(item, idx); }}
                  delayLongPress={400}
                >
                  {renderItem({ item, index: idx, isWiggling: false, isPickup: false, inReorder: false })}
                </Pressable>
              </Animated.View>
            );
          })}

          {/* Copie qui suit le doigt : fond NON agrandi (hauteur de ligne moins le séparateur, pour
              ne pas recouvrir les séparateurs voisins), seul le contenu est agrandi. */}
          {active && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.floating,
                {
                  top: pickupIdx != null ? tops[pickupIdx] : 0,
                  height: pickupIdx != null ? heights[pickupIdx] - StyleSheet.hairlineWidth : 0,
                  opacity: pickedItem ? 1 : 0,
                  transform: [{ translateY: panY }],
                },
              ]}
            >
              <View style={{ flex: 1, opacity: PICKUP_OPACITY, transform: [{ scale: PICKUP_SCALE }] }}>
                {cloneContent}
              </View>
            </Animated.View>
          )}
          {/* Barre blanche PAR-DESSUS la copie et posée sur le séparateur (place visée ou butée) */}
          {active && (
            <View
              pointerEvents="none"
              style={[styles.indicatorBar, { top: (barTop ?? 0) - 1, opacity: barTop != null ? 1 : 0 }]}
            />
          )}
          {renderOverlay?.({ items, tops, heights })}
        </View>
        {footerComponent}
      </ScrollView>

      {active && showBar && (
        <View style={styles.reorderBarOverlay} pointerEvents="box-none">
          <View style={styles.reorderBar}>
            <Text style={styles.reorderBarText}>Réorganisation</Text>
            <TouchableOpacity onPress={finishReorder} style={styles.doneBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.doneText}>Terminé</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Le séparateur est porté par le conteneur de ligne (ne vibre pas avec le contenu)
  rowContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  reorderBarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200, elevation: 20 },
  reorderBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  reorderBarText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  doneBtn: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  doneText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 1 },
  listArea: { position: 'relative' },
  indicatorBar: {
    position: 'absolute', left: '22.5%', width: '55%', height: 1,
    backgroundColor: '#FFFFFF', borderRadius: 1,
  },
  floating: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: theme.colors.background,
  },
});
