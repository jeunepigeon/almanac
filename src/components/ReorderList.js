// Système de réorganisation drag & drop v1.1.18.4.
//
// Design :
//  - HORS mode réorg : les rows sont des Pressable classiques (scroll + tap + long press standard).
//  - EN mode réorg : chaque row devient un View à responder MANUEL (plus de scroll possible
//    mais ça permet le 2e long press suivi d'un drag CONTINU en 1 touch).
//
// Flow :
//  - Pressable (mode inactif) : long press 400ms → onLongPress → active mode.
//  - View responder (mode actif) : touch down → timer long press 400ms → pickup + drag immédiat.
//  - Release → drop. Haptic success si l'ordre a changé.
//  - Bouton Terminé ou back Android → sort du mode + applique l'ordre.
//
// Fix double flash au drop : au release, on push le nouvel ordre directement dans data via
// onReorderLive (optionnel) pour que la row reste à sa place sans "retour arrière" visuel.

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated,
  TouchableOpacity, BackHandler, ScrollView,
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
    if (!isWiggling) {
      rot.stopAnimation();
      rot.setValue(0);
      return;
    }
    const seq = Animated.loop(
      Animated.sequence([
        Animated.timing(rot, {
          toValue: 1, duration: WIGGLE_DURATION, useNativeDriver: true, delay: phase * 25,
        }),
        Animated.timing(rot, { toValue: -1, duration: WIGGLE_DURATION * 2, useNativeDriver: true }),
        Animated.timing(rot, { toValue: 0, duration: WIGGLE_DURATION, useNativeDriver: true }),
      ])
    );
    seq.start();
    return () => seq.stop();
  }, [isWiggling, phase, rot]);

  const rotate = rot.interpolate({
    inputRange: [-1, 1],
    outputRange: [`-${WIGGLE_ANGLE}deg`, `${WIGGLE_ANGLE}deg`],
  });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

// Row mode ACTIF : View avec responder manuel pour long press + drag en un seul touch.
function ActiveRow({
  item, index, itemHeight, onPickup, onDragMove, onDragEnd,
  isWiggling, renderItem, hidden = false,
}) {
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  const cancelTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

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
    if (draggingRef.current) {
      draggingRef.current = false;
      onDragEnd();
    }
  };

  return (
    <View
      style={{ height: itemHeight }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={onStart}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
      onResponderTerminationRequest={() => !draggingRef.current}
    >
      {/* hidden = ligne en cours de drag : reste MONTÉE (garde le geste) mais invisible */}
      <View style={hidden ? { opacity: 0 } : null}>
        <WiggleContent isWiggling={isWiggling && !hidden} phase={index % 3}>
          {renderItem({ item, index, isWiggling, isPickup: false })}
        </WiggleContent>
      </View>
    </View>
  );
}

export default function ReorderList({
  data = [],
  renderItem,
  itemHeight = 68,
  onReorder,
  onItemTap = null,
  onScrollY = null,
  onScrollEnd = null,
  active,
  onActivate,
  onDeactivate,
  headerComponent = null,
  scrollRef = null,
}) {
  const [localIds, setLocalIds] = useState(data.map((d) => d.id));
  const [pickupId, setPickupId] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const pickupIdRef = useRef(null);
  const hoverIdxRef = useRef(null);
  const localIdsRef = useRef(localIds);
  const snapshotRef = useRef([]);
  const activeRef = useRef(active);
  const panY = useRef(new Animated.Value(0)).current;
  const dragStartYRef = useRef(0);

  useEffect(() => { pickupIdRef.current = pickupId; }, [pickupId]);
  useEffect(() => { hoverIdxRef.current = hoverIdx; }, [hoverIdx]);
  useEffect(() => { localIdsRef.current = localIds; }, [localIds]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const localScrollRef = useRef(null);
  const effectiveScrollRef = scrollRef || localScrollRef;

  // Resync depuis data UNIQUEMENT quand data change (pas quand on entre/sort du mode).
  // Évite le flash « ancien ordre » à la confirmation : on garde l'ordre local jusqu'à ce que
  // le store renvoie le nouvel ordre (identique).
  useEffect(() => {
    if (pickupIdRef.current == null) setLocalIds(data.map((d) => d.id));
  }, [data]);

  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finishReorder();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line
  }, [active]);

  const finishReorder = () => {
    const original = data.map((d) => d.id);
    const current = localIdsRef.current;
    const changed = current.length === original.length
      ? current.some((id, i) => id !== original[i])
      : true;
    if (changed) onReorder?.(current);
    setPickupId(null);
    setHoverIdx(null);
    panY.setValue(0);
    onDeactivate?.();
  };

  const onPickup = (idx) => {
    haptics.medium();
    const id = localIdsRef.current[idx];
    snapshotRef.current = [...localIdsRef.current];
    panY.setValue(0);
    dragStartYRef.current = idx * itemHeight + itemHeight / 2;
    setPickupId(id);
    setHoverIdx(idx);
  };

  const onDragMove = (dy) => {
    panY.setValue(dy);
    const absY = dragStartYRef.current + dy;
    const maxIdx = snapshotRef.current.length - 1;
    let newHover = Math.floor(absY / itemHeight);
    newHover = Math.max(0, Math.min(maxIdx, newHover));
    if (newHover !== hoverIdxRef.current) {
      haptics.light();
      hoverIdxRef.current = newHover;
      const next = [...snapshotRef.current];
      const pid = pickupIdRef.current;
      const origIdx = snapshotRef.current.indexOf(pid);
      if (origIdx >= 0) {
        const [moved] = next.splice(origIdx, 1);
        next.splice(newHover, 0, moved);
        localIdsRef.current = next;
        setHoverIdx(newHover);
        setLocalIds(next);
      }
    }
  };

  const onDragEnd = () => {
    if (pickupIdRef.current == null) return;
    const original = snapshotRef.current;
    const current = localIdsRef.current;
    const changed = current.some((id, i) => id !== original[i]);
    if (changed) haptics.success();
    // Important : on reset pickupId et panY ATOMIQUEMENT, et on garde localIds à current.
    // snapshotRef est aussi mis à jour pour que les futurs drags partent de l'ordre courant.
    snapshotRef.current = [...current];
    setPickupId(null);
    setHoverIdx(null);
    panY.setValue(0);
  };

  const items = localIds.map((id) => data.find((d) => d.id === id)).filter(Boolean);
  const pickupStartY = pickupId != null
    ? snapshotRef.current.indexOf(pickupId) * itemHeight
    : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={effectiveScrollRef}
        contentContainerStyle={{ paddingBottom: 120 }}
        scrollEnabled={!active && pickupId == null}
        onScroll={onScrollY ? (e) => onScrollY(e.nativeEvent.contentOffset.y) : undefined}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
      >
        {headerComponent}

        <View style={styles.listArea}>
          {items.map((item, idx) => {
            const isPickup = item.id === pickupId;
            if (active) {
              // Mode actif : responder manuel (long press + drag continu en 1 touch).
              // La ligne saisie reste montée (hidden) sinon elle perd le geste en cours.
              const wiggleThisOne = pickupId == null;
              return (
                <ActiveRow
                  key={item.id}
                  item={item}
                  index={idx}
                  itemHeight={itemHeight}
                  onPickup={onPickup}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                  isWiggling={wiggleThisOne}
                  hidden={isPickup}
                  renderItem={renderItem}
                />
              );
            }
            // Mode inactif : Pressable classique → scroll + tap + long press
            return (
              <View key={item.id} style={{ height: itemHeight }}>
                <Pressable
                  onPress={() => onItemTap?.(item, idx)}
                  onLongPress={() => {
                    haptics.medium();
                    onActivate?.();
                  }}
                  delayLongPress={400}
                >
                  {renderItem({ item, index: idx, isWiggling: false, isPickup: false })}
                </Pressable>
              </View>
            );
          })}

          {pickupId != null && hoverIdx != null && (
            <View
              pointerEvents="none"
              style={[styles.indicatorBar, { top: hoverIdx === 0 ? 0 : hoverIdx * itemHeight }]}
            />
          )}

          {pickupId != null && (() => {
            const item = data.find((d) => d.id === pickupId);
            if (!item) return null;
            return (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.floating,
                  {
                    top: pickupStartY,
                    height: itemHeight,
                    transform: [{ translateY: panY }, { scale: PICKUP_SCALE }],
                    opacity: PICKUP_OPACITY,
                  },
                ]}
              >
                <WiggleContent isWiggling phase={0}>
                  {renderItem({ item, index: 0, isWiggling: true, isPickup: true })}
                </WiggleContent>
              </Animated.View>
            );
          })()}
        </View>
      </ScrollView>

      {active && (
        <View style={styles.reorderBarOverlay} pointerEvents="box-none">
          <View style={styles.reorderBar}>
            <Text style={styles.reorderBarText}>Réorganisation</Text>
            <TouchableOpacity
              onPress={finishReorder}
              style={styles.doneBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
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
  reorderBarOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 200, elevation: 20,
  },
  reorderBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  reorderBarText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
  },
  doneBtn: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  doneText: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '600', letterSpacing: 1,
  },
  listArea: { position: 'relative' },
  indicatorBar: {
    position: 'absolute',
    left: '22.5%', width: '55%',
    height: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
    zIndex: 50,
  },
  floating: {
    position: 'absolute',
    left: 0, right: 0,
    zIndex: 100, elevation: 10,
  },
});
