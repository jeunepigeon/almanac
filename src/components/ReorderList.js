// Système de réorganisation drag & drop v1.1.17.
//
// Flow :
//  - 1er long press (hors mode) → active le mode réorganisation : TOUTES les rows vibrent.
//    + haptic medium + bouton « Terminé » apparaît en haut sans décaler le contenu.
//  - 2e long press (en mode) sur une row → PICKUP DIRECT :
//    les AUTRES s'arrêtent de vibrer, SEULE la row piquée continue de vibrer,
//    et le drag commence immédiatement sans qu'on ait besoin de relâcher le doigt.
//    + haptic medium.
//  - Drag → barre indicatrice fine blanche entre les rows cibles. Haptic light au slot change.
//  - Release → drop. Haptic success si l'ordre a changé, rien sinon.
//    Les autres rows recommencent à vibrer après drop.
//  - Bouton « Terminé » ou back Android → sort du mode.
//
// Pas de scroll parasite à l'entrée/sortie du mode (header animé en overlay, pas inséré dans la liste).

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, PanResponder,
  TouchableOpacity, BackHandler, ScrollView,
} from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const WIGGLE_ANGLE = 1.2;
const WIGGLE_DURATION = 110;
const PICKUP_SCALE = 1.06;
const PICKUP_OPACITY = 0.92;

function RowWrapper({ children, isWiggling, phase }) {
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

export default function ReorderList({
  data = [],
  renderItem,
  itemHeight = 68,
  onReorder,
  active,
  onActivate,
  onDeactivate,
  headerComponent = null,
  scrollRef = null,
}) {
  const [localIds, setLocalIds] = useState(data.map((d) => d.id));
  const [pickupId, setPickupId] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // Refs synchronisés avec les states pour usage dans PanResponder (créé 1 fois)
  const pickupIdRef = useRef(null);
  const hoverIdxRef = useRef(null);
  const localIdsRef = useRef(localIds);
  const snapshotRef = useRef([]);
  const activeRef = useRef(active);
  const panY = useRef(new Animated.Value(0)).current;
  const touchYInListRef = useRef(0); // position Y de la touch dans la zone liste

  useEffect(() => { pickupIdRef.current = pickupId; }, [pickupId]);
  useEffect(() => { hoverIdxRef.current = hoverIdx; }, [hoverIdx]);
  useEffect(() => { localIdsRef.current = localIds; }, [localIds]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const localScrollRef = useRef(null);
  const effectiveScrollRef = scrollRef || localScrollRef;

  // Resync localIds hors drag
  useEffect(() => {
    if (pickupIdRef.current == null) {
      setLocalIds(data.map((d) => d.id));
    }
  }, [data, active]);

  // Back Android
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

  // Démarre un pickup à l'index donné, à partir d'une position Y absolue (dans la zone liste)
  const startPickup = useCallback((idx, startY) => {
    haptics.medium();
    const id = localIdsRef.current[idx];
    snapshotRef.current = [...localIdsRef.current];
    panY.setValue(0);
    touchYInListRef.current = startY;
    setPickupId(id);
    setHoverIdx(idx);
  }, [panY]);

  const handleLongPress = (idx, event) => {
    if (!activeRef.current) {
      // 1er long press → active le mode (sans pickup)
      haptics.medium();
      onActivate?.();
      return;
    }
    // 2e long press → pickup direct
    // Position Y absolue dans la zone liste = idx * itemHeight + offset dans la row
    // On ne connaît pas précisément le touch Y dans la row ; approximation : centre de la row
    const startY = idx * itemHeight + itemHeight / 2;
    startPickup(idx, startY);
  };

  // PanResponder créé 1 fois. On capture les touches dans la zone liste.
  // Il doit prendre le relais SEULEMENT quand un pickup est en cours (sinon il bloquerait les long presses).
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => pickupIdRef.current != null,
      onMoveShouldSetPanResponder: () => pickupIdRef.current != null,
      onPanResponderMove: (_e, g) => {
        const pid = pickupIdRef.current;
        if (pid == null) return;
        panY.setValue(g.dy);
        // Nouvelle position centre de la row piquée = startY + dy
        const absY = touchYInListRef.current + g.dy;
        const maxIdx = snapshotRef.current.length - 1;
        let newHover = Math.floor(absY / itemHeight);
        newHover = Math.max(0, Math.min(maxIdx, newHover));
        if (newHover !== hoverIdxRef.current) {
          haptics.light();
          hoverIdxRef.current = newHover;
          const next = [...snapshotRef.current];
          const origIdx = snapshotRef.current.indexOf(pid);
          if (origIdx >= 0) {
            const [moved] = next.splice(origIdx, 1);
            next.splice(newHover, 0, moved);
            localIdsRef.current = next;
            setHoverIdx(newHover);
            setLocalIds(next);
          }
        }
      },
      onPanResponderRelease: () => {
        if (pickupIdRef.current == null) return;
        const original = snapshotRef.current;
        const current = localIdsRef.current;
        const changed = current.some((id, i) => id !== original[i]);
        if (changed) haptics.success();
        setPickupId(null);
        setHoverIdx(null);
        panY.setValue(0);
      },
      onPanResponderTerminate: () => {
        setPickupId(null);
        setHoverIdx(null);
        panY.setValue(0);
      },
    })
  ).current;

  const items = localIds.map((id) => data.find((d) => d.id === id)).filter(Boolean);
  const pickupStartY = pickupId != null
    ? snapshotRef.current.indexOf(pickupId) * itemHeight
    : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={effectiveScrollRef}
        contentContainerStyle={{ paddingBottom: 120 }}
        scrollEnabled={pickupId == null}
      >
        {/* Bannière/header TOUJOURS rendu : évite les scroll parasites quand on entre/sort du mode */}
        {headerComponent}

        <View style={styles.listArea} {...panResponder.panHandlers}>
          {items.map((item, idx) => {
            const isPickup = item.id === pickupId;
            if (isPickup) {
              // Placeholder vide à la position actuelle
              return <View key={item.id} style={{ height: itemHeight }} />;
            }
            // En mode actif, UNE row (celle piquée) wiggles seule → les autres NE wiggle PAS si pickupId != null
            const wiggleThisOne = active && pickupId == null;
            return (
              <View key={item.id} style={{ height: itemHeight }}>
                <Pressable
                  onLongPress={(e) => handleLongPress(idx, e)}
                  delayLongPress={400}
                >
                  <RowWrapper isWiggling={wiggleThisOne} phase={idx % 3}>
                    {renderItem({ item, index: idx, isWiggling: wiggleThisOne, isPickup: false })}
                  </RowWrapper>
                </Pressable>
              </View>
            );
          })}

          {pickupId != null && hoverIdx != null && (
            <View
              pointerEvents="none"
              style={[
                styles.indicatorBar,
                { top: hoverIdx === 0 ? 0 : hoverIdx * itemHeight },
              ]}
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
                    transform: [
                      { translateY: panY },
                      { scale: PICKUP_SCALE },
                    ],
                    opacity: PICKUP_OPACITY,
                  },
                ]}
              >
                {/* seule la row flottante vibre */}
                <RowWrapper isWiggling phase={0}>
                  {renderItem({ item, index: 0, isWiggling: true, isPickup: true })}
                </RowWrapper>
              </Animated.View>
            );
          })()}
        </View>
      </ScrollView>

      {/* Bouton Terminé en overlay (ne décale pas le contenu quand il apparaît/disparaît) */}
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
