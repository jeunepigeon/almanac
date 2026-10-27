// Réorganisation drag & drop v1.1.18.7 (fait main).
//
// Entrée dans le mode : depuis le menu « ⋯ » d'une substance (« Réorganiser »).
// Hors mode : Pressable classique → tap = ouvrir la substance, appui long = ouvrir son menu.
// En mode :
//  - toutes les lignes vibrent ;
//  - appui long sur une ligne → saisie, et le drag continue dans le MÊME toucher ;
//  - pendant le drag, seule la ligne saisie vibre ; elle suit le doigt ;
//  - les autres lignes NE SONT PAS réordonnées : elles glissent visuellement (décalage translateY)
//    pour libérer la place. La ligne sous le doigt n'est donc jamais déplacée dans la liste
//    (c'est ce qui faisait annuler le toucher par Android et « revenir » la substance) ;
//  - lâcher → le nouvel ordre est appliqué en une fois ; décalages remis à 0 avant l'affichage.
//  - v1.1.19 : AUCUN zIndex/elevation dans la liste (sur Android ça peut réordonner les vues et
//    annuler le toucher → la substance « revenait » à sa place). La ligne touchée devient juste
//    invisible ; une COPIE (montée en fin de liste, toujours présente en mode actif) suit le doigt.
//  - renderItem reçoit inReorder (compteurs/⋯ masqués pendant tout le mode, indépendamment du wiggle).
//  - « Terminé » ou retour Android → sortie du mode + enregistrement de l'ordre.

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, TouchableOpacity, BackHandler, ScrollView,
} from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const WIGGLE_ANGLE = 1.2;
const WIGGLE_DURATION = 110;
const PICKUP_SCALE = 1.06;
const PICKUP_OPACITY = 0.92;
const LONG_PRESS_MS = 400;
const CANCEL_MOVE_PX = 10;

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

// Ligne en mode actif : responder manuel (appui long + drag dans le même toucher).
function ActiveRow({
  item, index, itemHeight, offsetY, isPicked, panY, isWiggling,
  onPickup, onDragMove, onDragEnd, renderItem,
}) {
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const cancelTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const onStart = (evt) => {
    const t = evt.nativeEvent;
    startRef.current = { x: t.pageX, y: t.pageY };
    draggingRef.current = false;
    cancelTimer();
    timerRef.current = setTimeout(() => {
      draggingRef.current = true;
      onPickup(index);
    }, LONG_PRESS_MS);
  };
  const onMove = (evt) => {
    const t = evt.nativeEvent;
    const dx = t.pageX - startRef.current.x;
    const dy = t.pageY - startRef.current.y;
    if (!draggingRef.current) {
      if (Math.hypot(dx, dy) > CANCEL_MOVE_PX) cancelTimer();
      return;
    }
    onDragMove(dy);
  };
  const onEnd = () => {
    cancelTimer();
    if (draggingRef.current) { draggingRef.current = false; onDragEnd(); }
  };

  // Ligne saisie : reste exactement en place (même vue, mêmes props de structure), juste invisible.
  const style = { height: itemHeight, opacity: isPicked ? 0 : 1, transform: [{ translateY: isPicked ? 0 : offsetY }] };

  return (
    <Animated.View
      style={style}
      onStartShouldSetResponder={() => true}
      onResponderGrant={onStart}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
      onResponderTerminationRequest={() => !draggingRef.current}
    >
      <WiggleContent isWiggling={isWiggling} phase={index % 3}>
        {renderItem({ item, index, isWiggling, isPickup: false, inReorder: true })}
      </WiggleContent>
    </Animated.View>
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
  active,
  onDeactivate,
  headerComponent = null,
  scrollRef = null,
}) {
  const [localIds, setLocalIds] = useState(data.map((d) => d.id));
  const [pickupIdx, setPickupIdx] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const pickupIdxRef = useRef(null);
  const hoverIdxRef = useRef(null);
  const localIdsRef = useRef(localIds);
  const panY = useRef(new Animated.Value(0)).current;
  useEffect(() => { pickupIdxRef.current = pickupIdx; }, [pickupIdx]);
  useEffect(() => { localIdsRef.current = localIds; }, [localIds]);

  const localScrollRef = useRef(null);
  const effectiveScrollRef = scrollRef || localScrollRef;

  // Resync depuis data uniquement quand data change (pas à l'entrée/sortie du mode)
  useEffect(() => {
    if (pickupIdxRef.current == null) setLocalIds(data.map((d) => d.id));
  }, [data]);

  // Après application du nouvel ordre : remise à 0 du décalage AVANT l'affichage (pas de flash)
  useLayoutEffect(() => {
    if (pickupIdx == null) panY.setValue(0);
  }, [localIds, pickupIdx, panY]);

  const finishReorder = () => {
    const original = data.map((d) => d.id);
    const current = localIdsRef.current;
    const changed = current.length !== original.length || current.some((id, i) => id !== original[i]);
    if (changed) onReorder?.(current);
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

  const onPickup = (idx) => {
    haptics.medium();
    panY.setValue(0);
    pickupIdxRef.current = idx;
    hoverIdxRef.current = idx;
    setPickupIdx(idx);
    setHoverIdx(idx);
  };

  const onDragMove = (dy) => {
    const p = pickupIdxRef.current;
    if (p == null) return;
    panY.setValue(dy);
    const centerY = p * itemHeight + itemHeight / 2 + dy;
    let h = Math.floor(centerY / itemHeight);
    h = Math.max(0, Math.min(localIdsRef.current.length - 1, h));
    if (h !== hoverIdxRef.current) {
      haptics.light();
      hoverIdxRef.current = h;
      setHoverIdx(h);
    }
  };

  const onDragEnd = () => {
    const p = pickupIdxRef.current;
    const h = hoverIdxRef.current;
    if (p == null) return;
    pickupIdxRef.current = null;
    if (h != null && h !== p) {
      haptics.success();
      const next = moveItem(localIdsRef.current, p, h);
      localIdsRef.current = next;
      setLocalIds(next);
    }
    setPickupIdx(null);
    setHoverIdx(null);
  };

  // Décalage visuel d'une ligne non saisie pendant le drag
  const offsetFor = (i) => {
    if (pickupIdx == null || hoverIdx == null || i === pickupIdx) return 0;
    if (pickupIdx < hoverIdx && i > pickupIdx && i <= hoverIdx) return -itemHeight;
    if (hoverIdx < pickupIdx && i >= hoverIdx && i < pickupIdx) return itemHeight;
    return 0;
  };

  // Barre blanche : bord de la place d'arrivée (haut si on monte, bas si on descend)
  let barTop = null;
  if (pickupIdx != null && hoverIdx != null && hoverIdx !== pickupIdx) {
    barTop = hoverIdx < pickupIdx ? hoverIdx * itemHeight : (hoverIdx + 1) * itemHeight;
  }

  const items = localIds.map((id) => data.find((d) => d.id === id)).filter(Boolean);
  const pickedItem = pickupIdx != null ? items[pickupIdx] : null;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={effectiveScrollRef}
        contentContainerStyle={{ paddingBottom: 120 }}
        scrollEnabled={!active}
        onScroll={onScrollY ? (e) => onScrollY(e.nativeEvent.contentOffset.y) : undefined}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
      >
        {headerComponent}

        <View style={styles.listArea}>
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
                  panY={panY}
                  isWiggling={pickupIdx == null || isPicked}
                  onPickup={onPickup}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                  renderItem={renderItem}
                />
              );
            }
            return (
              <View key={item.id} style={{ height: itemHeight }}>
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

          {/* Barre + copie : montées en FIN de liste et en permanence en mode actif
              (aucune insertion/zIndex pendant le geste) ; affichées via opacité. */}
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
