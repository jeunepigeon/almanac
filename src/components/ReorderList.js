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

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, TouchableOpacity, BackHandler,
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

function WiggleContent({ children, isWiggling, phase }) {
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
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

// Ligne en mode actif : geste natif (Pan après appui long). Le conteneur porte le séparateur
// et le décalage ; seul le contenu vibre / devient invisible quand la ligne est saisie.
function ActiveRow({ item, index, itemHeight, offsetY, isPicked, isWiggling, handlersRef, renderItem }) {
  const indexRef = useRef(index);
  indexRef.current = index;

  const gesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .runOnJS(true)
    .onStart((e) => handlersRef.current.start(indexRef.current, e))
    .onUpdate((e) => handlersRef.current.move(e))
    .onEnd(() => handlersRef.current.end())
    .onFinalize(() => handlersRef.current.finalize()), [handlersRef]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        style={[styles.rowContainer, { height: itemHeight, transform: [{ translateY: isPicked ? 0 : offsetY }] }]}
      >
        <View style={{ opacity: isPicked ? 0 : 1 }}>
          <WiggleContent isWiggling={isWiggling} phase={index % 3}>
            {renderItem({ item, index, isWiggling, isPickup: false, inReorder: true })}
          </WiggleContent>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

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
  onReorder,
  onItemTap = null,
  onItemLongPress = null,
  onScrollY = null,
  onScrollEnd = null,
  onMetrics = null,        // ({ viewportH, contentH, listTop }) pour le centrage du bandeau
  active,
  onDeactivate,
  headerComponent = null,
  scrollRef = null,
}) {
  const [localIds, setLocalIds] = useState(data.map((d) => d.id));
  const [pickupIdx, setPickupIdx] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

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
  const drag = useRef({ p: null, h: null, transY: 0, fingerAbsY: 0, scrollAtPickup: 0, committed: false }).current;
  const autoTimerRef = useRef(null);

  useEffect(() => {
    if (drag.p == null) setLocalIds(data.map((d) => d.id));
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
    const current = localIdsRef.current;
    const changed = current.length !== original.length || current.some((id, i) => id !== original[i]);
    if (changed) onReorder?.(current);
    stopAuto();
    drag.p = null;
    setPickupIdx(null);
    setHoverIdx(null);
    onDeactivate?.();
  };

  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { finishReorder(); return true; });
    return () => sub.remove();
    // eslint-disable-next-line
  }, [active]);

  // Position de la copie + place visée, à partir du doigt et du défilement
  const applyPosition = () => {
    if (drag.p == null) return;
    const delta = drag.transY + (scrollYRef.current - drag.scrollAtPickup);
    panY.setValue(delta);
    const center = drag.p * itemHeight + itemHeight / 2 + delta;
    let h = Math.floor(center / itemHeight);
    h = Math.max(0, Math.min(localIdsRef.current.length - 1, h));
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
      drag.p = idx;
      drag.h = idx;
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
    },
    finalize: () => {
      // Geste annulé (pas de fin normale) → on remet en place sans rien changer
      if (drag.p == null || drag.committed) return;
      stopAuto();
      drag.p = null;
      setPickupIdx(null);
      setHoverIdx(null);
    },
  };

  const offsetFor = (i) => {
    if (pickupIdx == null || hoverIdx == null || i === pickupIdx) return 0;
    if (pickupIdx < hoverIdx && i > pickupIdx && i <= hoverIdx) return -itemHeight;
    if (hoverIdx < pickupIdx && i >= hoverIdx && i < pickupIdx) return itemHeight;
    return 0;
  };

  let barTop = null;
  if (pickupIdx != null && hoverIdx != null && hoverIdx !== pickupIdx) {
    barTop = hoverIdx < pickupIdx ? hoverIdx * itemHeight : (hoverIdx + 1) * itemHeight;
  }

  const items = localIds.map((id) => data.find((d) => d.id === id)).filter(Boolean);
  const pickedItem = pickupIdx != null ? items[pickupIdx] : null;

  return (
    <View
      ref={containerRef}
      style={styles.container}
      collapsable={false}
      onLayout={(e) => { viewportHRef.current = e.nativeEvent.layout.height; reportMetrics(); }}
    >
      <ScrollView
        ref={effectiveScrollRef}
        contentContainerStyle={{ paddingBottom: 120 }}
        scrollEnabled={pickupIdx == null}
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
                  itemHeight={itemHeight}
                  offsetY={offsetFor(idx)}
                  isPicked={isPicked}
                  isWiggling={pickupIdx == null}
                  handlersRef={handlersRef}
                  renderItem={renderItem}
                />
              );
            }
            return (
              <View key={item.id} style={[styles.rowContainer, { height: itemHeight }]}>
                <Pressable
                  onPress={() => onItemTap?.(item, idx)}
                  onLongPress={() => { haptics.medium(); onItemLongPress?.(item, idx); }}
                  delayLongPress={400}
                >
                  {renderItem({ item, index: idx, isWiggling: false, isPickup: false, inReorder: false })}
                </Pressable>
              </View>
            );
          })}

          {/* Barre + copie montées en fin de liste, en permanence en mode actif (opacité) */}
          {active && (
            <View
              pointerEvents="none"
              style={[styles.indicatorBar, { top: barTop ?? 0, opacity: barTop != null ? 1 : 0 }]}
            />
          )}
          {active && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.floating,
                {
                  top: (pickupIdx ?? 0) * itemHeight,
                  height: itemHeight,
                  opacity: pickedItem ? PICKUP_OPACITY : 0,
                  transform: [{ translateY: panY }, { scale: PICKUP_SCALE }],
                },
              ]}
            >
              {pickedItem && (
                <WiggleContent isWiggling phase={0}>
                  {renderItem({ item: pickedItem, index: pickupIdx, isWiggling: true, isPickup: true, inReorder: true })}
                </WiggleContent>
              )}
            </Animated.View>
          )}
        </View>
      </ScrollView>

      {active && (
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
