import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Dimensions,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { theme } from '../theme';
import { useStore } from '../store';
import { WINDOWS, windowRange } from '../utils/stats';
import { dbGetAllConsumptions, dbGetConsumptionsBySubstance } from '../db';

const { width: SCREEN_W } = Dimensions.get('window');
const ALL_WINDOWS = [...WINDOWS, { id: 'custom', label: 'Perso' }];

const dayKey = (ts) => {
  const d = new Date(ts);
  const p = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function fmtDate(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

function fmtShort(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

export default function ActivityDetailScreen({ route, navigation }) {
  const { mode, substanceId, color = theme.colors.text } = route.params || {};
  const substances = useStore((s) => s.substances);

  // Charge les consos depuis la DB (mode global = toutes, mode substance = celles de la sub)
  const [allConsos, setAllConsos] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        if (mode === 'substance' && substanceId) {
          const list = await dbGetConsumptionsBySubstance(substanceId);
          setAllConsos(list);
        } else {
          const list = await dbGetAllConsumptions();
          setAllConsos(list);
        }
      } catch (e) {
        console.error('ActivityDetail load error', e);
        setAllConsos([]);
      }
    })();
  }, [mode, substanceId]);

  const consumptionsBySubstance = useMemo(() => {
    const map = {};
    if (allConsos) {
      for (const c of allConsos) {
        // Le champ peut être 'substanceId' ou 'substance_id' selon la source
        const subId = c.substanceId ?? c.substance_id;
        if (!subId) continue;
        if (!map[subId]) map[subId] = [];
        map[subId].push(c);
      }
    }
    return map;
  }, [allConsos]);

  const substancesById = useMemo(() => {
    const map = {};
    for (const s of substances || []) map[s.id] = s;
    return map;
  }, [substances]);

  const [windowId, setWindowId] = useState('30d');
  const [customStart, setCustomStart] = useState(() => Date.now() - 30 * 86400000);
  const [customEnd, setCustomEnd] = useState(() => Date.now());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState('start');
  const [useDoses, setUseDoses] = useState(false);

  // Sélection des substances à afficher
  const [subSelection, setSubSelection] = useState(() => {
    const sel = {};
    if (mode === 'substance' && substanceId) sel[substanceId] = true;
    else {
      for (const s of substances || []) if (!s.archived) sel[s.id] = true;
    }
    return sel;
  });

  // Met à jour selection si liste change
  useEffect(() => {
    setSubSelection((prev) => {
      const next = { ...prev };
      for (const s of substances || []) {
        if (s.archived) continue;
        if (!(s.id in next)) next[s.id] = true;
      }
      return next;
    });
  }, [substances]);

  const now = Date.now();
  const effectiveRange = useMemo(() => {
    if (windowId === 'custom') return [customStart, customEnd];
    return windowRange(windowId, now);
  }, [windowId, customStart, customEnd]);

  // Pinch zoom : zoom sur la plage X
  // zoomStart/zoomEnd sont en ratio 0..1 de la plage effective
  const zoomStart = useSharedValue(0);
  const zoomEnd = useSharedValue(1);
  const [zoomRange, setZoomRange] = useState({ start: 0, end: 1 });

  // Reset zoom quand fenêtre change
  useEffect(() => {
    zoomStart.value = 0;
    zoomEnd.value = 1;
    setZoomRange({ start: 0, end: 1 });
  }, [windowId, customStart, customEnd]);

  // Plage temporelle effective avec zoom
  const visibleRange = useMemo(() => {
    const [s, e] = effectiveRange;
    if (s === null) return effectiveRange;
    const range = e - s;
    return [s + range * zoomRange.start, s + range * zoomRange.end];
  }, [effectiveRange, zoomRange]);

  // Courbes calculées sur la plage visible
  const curves = useMemo(() => {
    const [start, end] = visibleRange;
    if (start === null) return [];

    // Liste des jours visibles
    const startDay = new Date(start); startDay.setHours(0,0,0,0);
    const endDay = new Date(end); endDay.setHours(0,0,0,0);
    const days = [];
    const cur = new Date(startDay);
    while (cur.getTime() <= endDay.getTime()) {
      days.push(cur.getTime());
      cur.setDate(cur.getDate() + 1);
    }
    if (days.length === 0) return [];

    const result = [];
    const subIds = mode === 'substance' && substanceId
      ? [substanceId]
      : Object.keys(consumptionsBySubstance);

    for (const subId of subIds) {
      if (subSelection[subId] === false) continue;
      const sub = substancesById[subId];
      if (!sub || sub.archived) continue;

      const subConsos = (consumptionsBySubstance[subId] || []).filter(
        (c) => c.timestamp >= start && c.timestamp <= end
      );
      if (subConsos.length === 0) continue;

      const hasAnyDosage = subConsos.some((c) => {
        const v = parseFloat(c.dosage);
        return !isNaN(v) && v > 0;
      });

      const dayMap = {};
      const daysWithConso = new Set();
      for (const c of subConsos) {
        const k = dayKey(c.timestamp);
        daysWithConso.add(k);
        if (useDoses && hasAnyDosage) {
          const v = parseFloat(c.dosage);
          dayMap[k] = (dayMap[k] || 0) + (isNaN(v) ? 0 : v);
        } else {
          dayMap[k] = (dayMap[k] || 0) + 1;
        }
      }

      const usePlateauMode = useDoses && !hasAnyDosage;
      const points = days.map((ts) => {
        const k = dayKey(ts);
        if (usePlateauMode) return { ts, count: daysWithConso.has(k) ? 0.5 : 0 };
        return { ts, count: dayMap[k] || 0 };
      });

      if (points.some((p) => p.count > 0)) {
        result.push({ id: sub.id, name: sub.name, color: sub.color, points });
      }
    }
    return result;
  }, [visibleRange, consumptionsBySubstance, substancesById, subSelection, mode, substanceId, useDoses]);

  // Pinch gesture
  const pinchScale = useSharedValue(1);
  const pinchFocal = useSharedValue(0.5);
  const lastZoom = useRef({ start: 0, end: 1 });

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      lastZoom.current = { start: zoomStart.value, end: zoomEnd.value };
      pinchFocal.value = e.focalX / SCREEN_W;
    })
    .onUpdate((e) => {
      const focal = pinchFocal.value;
      const oldRange = lastZoom.current.end - lastZoom.current.start;
      const newRange = Math.max(0.05, Math.min(1, oldRange / e.scale));
      // Centre sur focal
      const focalPos = lastZoom.current.start + oldRange * focal;
      let newStart = focalPos - newRange * focal;
      let newEnd = focalPos + newRange * (1 - focal);
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd > 1) { newStart -= (newEnd - 1); newEnd = 1; }
      newStart = Math.max(0, newStart);
      newEnd = Math.min(1, newEnd);
      zoomStart.value = newStart;
      zoomEnd.value = newEnd;
      runOnJS(setZoomRange)({ start: newStart, end: newEnd });
    });

  // Pan pour déplacer le zoom
  const pan = Gesture.Pan()
    .minDistance(10)
    .onStart(() => { lastZoom.current = { start: zoomStart.value, end: zoomEnd.value }; })
    .onUpdate((e) => {
      const range = lastZoom.current.end - lastZoom.current.start;
      const delta = -e.translationX / SCREEN_W * range;
      let newStart = lastZoom.current.start + delta;
      let newEnd = lastZoom.current.end + delta;
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd > 1) { newStart -= (newEnd - 1); newEnd = 1; }
      zoomStart.value = newStart;
      zoomEnd.value = newEnd;
      runOnJS(setZoomRange)({ start: newStart, end: newEnd });
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  // Render SVG
  const chartW = SCREEN_W - 32;
  const chartH = 220;
  const padX = 12, padY = 16;
  const innerW = chartW - padX * 2;
  const innerH = chartH - padY * 2 - 20;

  const allValues = curves.flatMap((c) => c.points.map((p) => p.count));
  const globalMax = Math.max(...allValues, 1);
  const dataLen = curves[0]?.points.length || 0;

  // Graduations
  const numLabels = Math.min(8, Math.max(2, Math.floor(innerW / 60)));
  const labels = [];
  if (dataLen > 0) {
    for (let i = 0; i < numLabels; i++) {
      const idx = Math.floor((dataLen - 1) * (i / (numLabels - 1)));
      labels.push({
        x: padX + (idx / Math.max(1, dataLen - 1)) * innerW,
        text: fmtShort(curves[0].points[idx].ts),
      });
    }
  }

  // Reset zoom
  const resetZoom = () => {
    zoomStart.value = 0;
    zoomEnd.value = 1;
    setZoomRange({ start: 0, end: 1 });
  };

  const openPicker = (target) => { setPickerTarget(target); setPickerVisible(true); };
  const onPickerChange = (event, selectedDate) => {
    setPickerVisible(false);
    if (event.type === 'dismissed' || !selectedDate) return;
    if (pickerTarget === 'start') setCustomStart(selectedDate.getTime());
    else setCustomEnd(selectedDate.getTime());
  };

  const toggleSub = useCallback((id) => {
    setSubSelection((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const visibleSubstances = useMemo(() => {
    return (substances || []).filter((s) => !s.archived);
  }, [substances]);

  const zoomed = zoomRange.start > 0 || zoomRange.end < 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sélecteur fenêtre */}
      <View style={styles.windowSelector}>
        {ALL_WINDOWS.map((w) => (
          <TouchableOpacity
            key={w.id}
            onPress={() => setWindowId(w.id)}
            style={[styles.windowChip, windowId === w.id && { borderColor: color, backgroundColor: theme.colors.surfaceAlt }]}
          >
            <Text style={[styles.windowChipText, windowId === w.id && { color: theme.colors.text }]}>{w.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {windowId === 'custom' ? (
        <View style={styles.customRangeRow}>
          <TouchableOpacity onPress={() => openPicker('start')} style={styles.customDateBtn}>
            <Text style={[styles.customDateText, { color: mode === 'global' ? '#FFFFFF' : color }]}>{fmtDate(customStart)}</Text>
          </TouchableOpacity>
          <Text style={styles.customSep}>—</Text>
          <TouchableOpacity onPress={() => openPicker('end')} style={styles.customDateBtn}>
            <Text style={[styles.customDateText, { color: mode === 'global' ? '#FFFFFF' : color }]}>{fmtDate(customEnd)}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.periodBand, { color: mode === 'global' ? '#FFFFFF' : color }]}>
          {fmtDate(effectiveRange[0])} — {fmtDate(effectiveRange[1])}
        </Text>
      )}

      {pickerVisible && (
        <DateTimePicker
          value={new Date(pickerTarget === 'start' ? customStart : customEnd)}
          mode="date"
          display="default"
          onChange={onPickerChange}
          maximumDate={new Date()}
        />
      )}

      {/* Indicateur de zoom + bouton reset, uniquement quand zoomé */}
      {zoomed && (
        <View style={styles.zoomInfo}>
          <Text style={styles.zoomInfoText}>
            Zoom : {fmtDate(visibleRange[0])} — {fmtDate(visibleRange[1])}
          </Text>
          <TouchableOpacity onPress={resetZoom} style={styles.resetZoom}>
            <Text style={styles.resetZoomText}>Reset</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.helpText}>Pince pour zoomer, glisse pour naviguer</Text>

      {/* Graphique avec gesture */}
      <GestureDetector gesture={composed}>
        <Animated.View>
          <View style={{ alignItems: 'center', marginBottom: theme.spacing.md }}>
            {curves.length === 0 || dataLen === 0 ? (
              <View style={{ height: chartH, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={styles.emptyText}>Pas de consommation sur la période</Text>
              </View>
            ) : (
              <Svg width={chartW} height={chartH}>
                {/* Grid horizontale */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                  <Line
                    key={i}
                    x1={padX} x2={padX + innerW}
                    y1={padY + innerH * p} y2={padY + innerH * p}
                    stroke={theme.colors.border}
                    strokeWidth={0.5}
                  />
                ))}

                {/* Courbes */}
                {curves.map((curve, i) => {
                  const stepX = innerW / Math.max(1, dataLen - 1);
                  const points = curve.points.map((d, j) => ({
                    x: padX + j * stepX,
                    y: padY + innerH - (d.count / globalMax) * innerH,
                    v: d.count,
                  }));

                  const nonZero = points.filter((p) => p.v > 0);
                  if (nonZero.length === 0) return null;
                  if (nonZero.length === 1) {
                    return <Circle key={curve.id} cx={nonZero[0].x} cy={nonZero[0].y} r={3} fill={curve.color} />;
                  }
                  let pathD = `M ${nonZero[0].x} ${nonZero[0].y}`;
                  for (let j = 1; j < nonZero.length; j++) pathD += ` L ${nonZero[j].x} ${nonZero[j].y}`;
                  return (
                    <Path key={curve.id} d={pathD} stroke={curve.color} strokeWidth={1.8} fill="none" opacity={0.95} />
                  );
                })}
              </Svg>
            )}
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Graduations dates */}
      {dataLen > 0 && (
        <View style={styles.gradRow}>
          {labels.map((l, i) => (
            <Text key={i} style={[styles.gradLabel, { left: l.x - 18 }]}>{l.text}</Text>
          ))}
        </View>
      )}

      {/* Switch Prises/Dosage */}
      <View style={[styles.modeSwitch, { alignSelf: 'center', marginVertical: theme.spacing.md }]}>
        <TouchableOpacity
          onPress={() => setUseDoses(false)}
          style={[styles.modeBtn, !useDoses && styles.modeBtnActive]}
        >
          <Text style={[styles.modeBtnText, !useDoses && styles.modeBtnTextActive]}>Prises</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setUseDoses(true)}
          style={[styles.modeBtn, useDoses && styles.modeBtnActive]}
        >
          <Text style={[styles.modeBtnText, useDoses && styles.modeBtnTextActive]}>Dosage</Text>
        </TouchableOpacity>
      </View>

      {/* Liste substances (mode global uniquement) */}
      {mode === 'global' && (
        <View style={styles.subList}>
          <Text style={styles.subListTitle}>Substances</Text>
          {visibleSubstances
            .slice()
            .sort((a, b) => a.color.localeCompare(b.color))
            .map((s) => (
              <TouchableOpacity key={s.id} onPress={() => toggleSub(s.id)} style={styles.subRow}>
                <View style={[styles.subCheckbox, subSelection[s.id] && { backgroundColor: s.color, borderColor: s.color }]}>
                  {subSelection[s.id] && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <View style={[styles.subDot, { backgroundColor: s.color }]} />
                <Text style={[styles.subName, !subSelection[s.id] && styles.subNameOff]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingTop: theme.spacing.md, paddingBottom: 40 },
  windowSelector: {
    flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.xs, justifyContent: 'center',
  },
  windowChip: {
    paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs,
    borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border,
  },
  windowChipText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300', letterSpacing: 0.5 },
  customRangeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: theme.spacing.md, marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm,
  },
  customDateBtn: {
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  customDateText: { fontSize: theme.font.sizes.sm, fontWeight: '300', letterSpacing: 1 },
  customSep: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '200' },
  periodBand: {
    fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 1,
    textAlign: 'center', opacity: 0.6, marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  zoomInfo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: theme.spacing.md, marginTop: theme.spacing.xs,
  },
  zoomInfoText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.5 },
  resetZoom: {
    paddingHorizontal: theme.spacing.sm, paddingVertical: 2,
    borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  resetZoomText: { color: theme.colors.text, fontSize: 10, fontWeight: '300', letterSpacing: 0.5 },
  helpText: {
    color: theme.colors.textFaint, fontSize: 10, fontWeight: '300',
    textAlign: 'center', marginVertical: theme.spacing.xs, fontStyle: 'italic',
  },
  emptyText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontStyle: 'italic' },
  gradRow: {
    height: 14, marginTop: 2, marginBottom: theme.spacing.sm,
    paddingHorizontal: 16, position: 'relative',
  },
  gradLabel: {
    position: 'absolute', top: 0, width: 36, textAlign: 'center',
    color: theme.colors.textFaint, fontSize: 9, fontWeight: '300', letterSpacing: 0.3,
  },
  modeSwitch: { flexDirection: 'row' },
  modeBtn: {
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  modeBtnActive: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.text },
  modeBtnText: { color: theme.colors.textFaint, fontSize: 11, fontWeight: '300', letterSpacing: 0.5 },
  modeBtnTextActive: { color: theme.colors.text, fontWeight: '400' },
  subList: {
    paddingHorizontal: theme.spacing.md, marginTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  subListTitle: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '400',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: theme.spacing.sm,
  },
  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  subCheckbox: {
    width: 16, height: 16, borderRadius: 3, borderWidth: 1,
    borderColor: theme.colors.textMuted, justifyContent: 'center', alignItems: 'center',
  },
  subDot: { width: 8, height: 8, borderRadius: 4 },
  subName: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  subNameOff: { color: theme.colors.textFaint },
});
