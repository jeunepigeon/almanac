// Système de réorganisation drag & drop style iOS :
// - 1er long press sur une row → entre en mode réorganisation (toutes les rows wiggle).
// - 2ème long press sur une row → pickup (floating : opacité réduite + scale ↑).
// - Drag → barre fine blanche entre les rows à l'emplacement d'insertion.
// - Drop → l'ordre est validé, haptic success si changé.
// - Bouton "Terminé" en haut, Back Android ferme le mode réorg.
// - Tap court en mode réorg = aucune action.

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, PanResponder,
  TouchableOpacity, BackHandler, ScrollView,
} from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const WIGGLE_ANGLE = 1.2; // degrés
const WIGGLE_DURATION = 110;
const PICKUP_SCALE = 1.06;
const PICKUP_OPACITY = 0.9;

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

  // Refs synchronisés avec les states, pour usage dans les callbacks PanResponder (créés 1 fois)
  const pickupIdRef = useRef(null);
  const hoverIdxRef = useRef(null);
  const localIdsRef = useRef(localIds);
  const snapshotRef = useRef([]);     // ordre au moment du pickup
  const dragStartYRef = useRef(0);
  const itemHeightRef = useRef(itemHeight);
  const panY = useRef(new Animated.Value(0)).current;

  useEffect(() => { pickupIdRef.current = pickupId; }, [pickupId]);
  useEffect(() => { hoverIdxRef.current = hoverIdx; }, [hoverIdx]);
  useEffect(() => { localIdsRef.current = localIds; }, [localIds]);
  useEffect(() => { itemHeightRef.current = itemHeight; }, [itemHeight]);

  const localScrollRef = useRef(null);
  const effectiveScrollRef = scrollRef || localScrollRef;

  // Resync quand data change hors mode actif ou à l'entrée du mode (pas pendant un pickup)
  useEffect(() => {
    if (pickupIdRef.current == null) {
      setLocalIds(data.map((d) => d.id));
    }
  }, [data, active]);

  // Back Android ferme le mode
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

  const handleLongPress = (idx) => {
    if (!active) {
      haptics.medium();
      onActivate?.();
      return;
    }
    // 2ème long press → pickup
    haptics.medium();
    const id = localIdsRef.current[idx];
    snapshotRef.current = [...localIdsRef.current];
    panY.setValue(0);
    dragStartYRef.current = idx * itemHeightRef.current;
    setPickupId(id);
    setHoverIdx(idx);
  };

  // PanResponder créé 1 fois
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => pickupIdRef.current != null,
      onMoveShouldSetPanResponder: () => pickupIdRef.current != null,
      onPanResponderMove: (_e, g) => {
        const pid = pickupIdRef.current;
        if (pid == null) return;
        panY.setValue(g.dy);
        const absY = dragStartYRef.current + g.dy;
        const h = itemHeightRef.current;
        const maxIdx = snapshotRef.current.length - 1;
        let newHover = Math.round(absY / h);
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

  // Items ordonnés selon localIds
  const items = localIds.map((id) => data.find((d) => d.id === id)).filter(Boolean);

  const pickupStartY = pickupId != null
    ? snapshotRef.current.indexOf(pickupId) * itemHeight
    : 0;

  return (
    <View style={styles.container}>
      {active && (
        <View style={styles.reorderBar}>
          <Text style={styles.reorderBarText}>Réorganisation</Text>
          <TouchableOpacity onPress={finishReorder} style={styles.doneBtn}>
            <Text style={styles.doneText}>Terminé</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        ref={effectiveScrollRef}
        contentContainerStyle={{ paddingBottom: 120 }}
        scrollEnabled={pickupId == null}
      >
        {!active && headerComponent}

        <View style={styles.listArea} {...panResponder.panHandlers}>
          {items.map((item, idx) => {
            const isPickup = item.id === pickupId;
            if (isPickup) {
              return <View key={item.id} style={{ height: itemHeight, opacity: 0.15 }} />;
            }
            return (
              <View key={item.id} style={{ height: itemHeight }}>
                <Pressable
                  onLongPress={() => handleLongPress(idx)}
                  delayLongPress={450}
                >
                  <RowWrapper isWiggling={active} phase={idx % 3}>
                    {renderItem({ item, index: idx, isWiggling: active, isPickup: false })}
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

          {pickupId != null && (
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
              {(() => {
                const item = data.find((d) => d.id === pickupId);
                if (!item) return null;
                return renderItem({ item, index: 0, isWiggling: false, isPickup: true });
              })()}
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    fontWeight: '500', letterSpacing: 1,
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
