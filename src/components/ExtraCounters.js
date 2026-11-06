// Compteurs ajoutés sous « Sobre depuis » (1.40) — page d'une substance et stats globales.
// 1.43 : réorganisation IDENTIQUE à la liste des substances :
//  - 1er appui long → mode réorganisation (les compteurs vibrent, poubelle à droite,
//    barre « RÉORGANISATION · Terminé » en haut de la page, le reste de la page assombri et figé) ;
//  - en réorganisation, appui long sur un compteur → saisi (vibration, agrandi, transparent),
//    il suit le doigt, l'autre glisse pour libérer la place, barre blanche sur le séparateur visé ;
//  - sortie : « Terminé », retour Android, changement d'onglet / de page.
// Séparateurs entre les compteurs, pilule « + » posée sur le dernier (toujours visible).
// Réglage propre à chaque substance (scope = id) et un pour le global (scope = '__global').
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Animated, Easing, BackHandler } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useIsFocused } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { useStore } from '../store';
import haptics from '../utils/haptics';
import { formatDurationSince } from '../utils/duration';
import { soberPeriods, rangeFR } from '../utils/soberPeriods';
import LiveCounter from './LiveCounter';
import ToggleListModal from './ToggleListModal';
import { WiggleContent } from './ReorderList';

const EMPTY = [];
const DEFS = [
  { id: 'prev', label: 'Période de sobriété précédente' },
  { id: 'record', label: 'Plus longue période sobre' },
];
const LONG_PRESS_MS = 400;     // = liste
const SEP_H = 12;
const SEP_MID = SEP_H / 2;     // ligne du séparateur, au milieu de sa zone
const PICKUP_SCALE = 1.06;     // = liste
const PICKUP_OPACITY = 0.92;   // = liste

function Pill({ onPress }) {
  return (
    <View pointerEvents="box-none" style={styles.pillOverlay}>
      <TouchableOpacity style={styles.pill} onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }} activeOpacity={0.6}>
        <MaterialCommunityIcons name="plus" size={10} color={theme.colors.background} />
      </TouchableOpacity>
    </View>
  );
}

// Compteur en réorganisation : appui long → saisi, glisser dans le même geste (comme la liste)
function ActiveItem({ index, handlers, picked, phase, onDelete, children }) {
  const h = useRef(handlers); h.current = handlers;
  const gesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .runOnJS(true)
    .onStart(() => h.current.start(index))
    .onUpdate((e) => h.current.move(e.translationY))
    .onEnd(() => h.current.end())
    .onFinalize(() => h.current.end()), [index]);
  return (
    <View style={styles.itemRow}>
      <GestureDetector gesture={gesture}>
        <Animated.View collapsable={false} style={[styles.grab, picked && { opacity: PICKUP_OPACITY, transform: [{ scale: PICKUP_SCALE }] }]}>
          <WiggleContent isWiggling={!picked} phase={phase} style={[styles.block, styles.blockEditing]}>
            {children}
          </WiggleContent>
        </Animated.View>
      </GestureDetector>
      <TouchableOpacity onPress={onDelete} style={styles.trash} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

export default function ExtraCounters({ scope, timestamps, color = theme.colors.text, bleed = 0 }) {
  const enabled = useStore((s) => s.extraCounters[scope]) || EMPTY;
  const toggle = useStore((s) => s.toggleExtraCounter);
  const setOrder = useStore((s) => s.setExtraCountersOrder);
  const setCountersEditing = useStore((s) => s.setCountersEditing);
  const exitTick = useStore((s) => s.countersExitTick);
  const isFocused = useIsFocused();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drag, setDragState] = useState(null); // { from, target }
  const dragRef = useRef(null);
  const setDrag = (d) => { dragRef.current = d; setDragState(d); };
  const dy = useRef(new Animated.Value(0)).current;
  const shifts = useRef({});
  const shiftOf = (id) => { if (!shifts.current[id]) shifts.current[id] = new Animated.Value(0); return shifts.current[id]; };
  const layout = useRef({}); // index → { y, h } (bloc compteur + son séparateur)
  const p = useMemo(() => soberPeriods(timestamps), [timestamps]);

  // La période en cours peut dépasser le record pendant qu'on regarde : réévalué toutes les 30 s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled.includes('record')) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [enabled]);

  // --- entrée / sortie du mode ---
  useEffect(() => { setCountersEditing(editing ? scope : false); }, [editing]); // eslint-disable-line
  useEffect(() => () => setCountersEditing(false), []); // eslint-disable-line
  const firstTick = useRef(exitTick);
  useEffect(() => { if (exitTick !== firstTick.current) setEditing(false); }, [exitTick]);
  useEffect(() => { if (!isFocused) setEditing(false); }, [isFocused]);
  useEffect(() => {
    if (!editing) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setEditing(false); return true; });
    return () => sub.remove();
  }, [editing]);
  useEffect(() => { if (editing && enabled.length === 0) setEditing(false); }, [editing, enabled.length]);

  const recordIsCurrent = p.last != null
    && (!p.pastRecord || now - p.last > p.pastRecord.end - p.pastRecord.start);

  const content = (id) => {
    const def = DEFS.find((d) => d.id === id);
    let value = null; let dates = null; let live = false; let label = def.label;
    if (id === 'prev' && p.prev) {
      value = formatDurationSince(p.prev.start, p.prev.end);
      dates = rangeFR(p.prev.start, p.prev.end);
    } else if (id === 'record' && p.last != null) {
      if (recordIsCurrent) {
        live = true; label = `${def.label} · en cours`; dates = rangeFR(p.last, null);
      } else {
        value = formatDurationSince(p.pastRecord.start, p.pastRecord.end);
        dates = rangeFR(p.pastRecord.start, p.pastRecord.end);
      }
    }
    return (
      <>
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
        {live
          ? <LiveCounter timestamp={p.last} style={[styles.counter, { color }]} />
          : <Text style={[styles.counter, { color }]}>{value || '—'}</Text>}
        {dates ? <Text style={styles.dates}>{dates}</Text> : null}
      </>
    );
  };

  // --- glisser-déposer (logique de la liste) ---
  const hOf = (i) => layout.current[i]?.h || 70;
  const applyShifts = (d) => {
    enabled.forEach((id, i) => {
      let to = 0;
      if (d && i !== d.from) {
        if (d.from < d.target && i > d.from && i <= d.target) to = -hOf(d.from);
        if (d.target < d.from && i >= d.target && i < d.from) to = hOf(d.from);
      }
      Animated.timing(shiftOf(id), { toValue: to, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };
  const listH = useRef(0);
  const [bound, setBoundState] = useState(null); // 'top' | 'bottom' | null — butée atteinte
  const boundRef = useRef(null);
  const setBound = (b) => { if (b !== boundRef.current) { if (b) haptics.medium(); boundRef.current = b; setBoundState(b); } };
  const handlers = {
    start: (from) => { haptics.medium(); dy.setValue(0); setBound(null); const d = { from, target: from }; setDrag(d); applyShifts(d); },
    move: (rawTy) => {
      const d = dragRef.current;
      if (!d) return;
      // 1.44 : butées comme dans la liste — le compteur saisi ne sort pas de la zone des compteurs
      const l0 = layout.current[d.from] || { y: 0, h: hOf(d.from) };
      const minTy = -l0.y;
      const maxTy = Math.max(0, listH.current - (l0.y + l0.h));
      const ty = Math.max(minTy, Math.min(maxTy, rawTy));
      setBound(rawTy < minTy - 6 ? 'top' : rawTy > maxTy + 6 ? 'bottom' : null);
      dy.setValue(ty);
      // place visée : d'après le centre du compteur saisi
      const center = (layout.current[d.from]?.y || 0) + hOf(d.from) / 2 + ty;
      // nombre d'autres compteurs dont le milieu est au-dessus du doigt = nouvelle place
      let target = 0;
      enabled.forEach((_, i) => { const l = layout.current[i]; if (i !== d.from && l && l.y + l.h / 2 < center) target += 1; });
      target = Math.max(0, Math.min(enabled.length - 1, target));
      if (target !== d.target) { haptics.light(); const nd = { ...d, target }; setDrag(nd); applyShifts(nd); }
    },
    end: () => {
      const d = dragRef.current;
      if (!d) return;
      if (d.target !== d.from) {
        const list = [...enabled];
        const [x] = list.splice(d.from, 1);
        list.splice(d.target, 0, x);
        setOrder(scope, list);
      }
      setDrag(null);
      setBound(null);
      dy.setValue(0);
      enabled.forEach((id) => shiftOf(id).setValue(0));
    },
  };
  // Barre blanche posée sur le séparateur visé (même formule que la liste)
  let barTop = null;
  if (drag && bound) barTop = bound === 'top' ? SEP_MID : listH.current + SEP_MID;
  else if (drag && drag.target !== drag.from) {
    const l = layout.current[drag.target];
    if (l) barTop = drag.target < drag.from ? l.y + SEP_MID : l.y + l.h - hOf(drag.from) + SEP_MID;
  }

  const openPicker = () => { haptics.light(); setOpen(true); };

  return (
    <View style={[styles.wrap, bleed ? { marginHorizontal: -bleed } : null]}>
      {/* 1.44 : chaque compteur porte le séparateur AU-DESSUS de lui (il glisse avec) ; le dernier
          séparateur, avec la pilule « + », est FIXE (il ne part plus avec le compteur du bas) */}
      <View style={styles.listArea} onLayout={(e) => { listH.current = e.nativeEvent.layout.height; }}>
        {enabled.map((id, i) => (
          <Animated.View
            key={id}
            style={{
              alignSelf: 'stretch',
              zIndex: drag?.from === i ? 10 : 1,
              transform: [{ translateY: drag?.from === i ? dy : shiftOf(id) }],
            }}
            onLayout={(e) => { const { y, height } = e.nativeEvent.layout; layout.current[i] = { y, h: height }; }}
          >
            <View style={styles.sepWrap}><View style={styles.sep} /></View>
            {editing ? (
              <ActiveItem
                index={i}
                handlers={handlers}
                picked={drag?.from === i}
                phase={i % 3}
                onDelete={() => { haptics.medium(); toggle(scope, id); }}
              >
                {content(id)}
              </ActiveItem>
            ) : (
              <Pressable
                onLongPress={() => { haptics.medium(); setEditing(true); }}
                delayLongPress={LONG_PRESS_MS}
                style={styles.block}
              >
                {content(id)}
              </Pressable>
            )}
          </Animated.View>
        ))}
        {barTop != null && <View pointerEvents="none" style={[styles.indicatorBar, { top: barTop - 0.5 }]} />}
      </View>
      <View style={styles.sepWrap}>
        <View style={styles.sep} />
        <Pill onPress={openPicker} />
      </View>
      <ToggleListModal
        visible={open}
        title="Compteurs"
        options={DEFS.map((d) => ({ id: d.id, label: d.label, color, checked: enabled.includes(d.id) }))}
        onToggle={(id) => toggle(scope, id)}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'stretch', marginTop: theme.spacing.sm },
  listArea: { alignSelf: 'stretch', position: 'relative', overflow: 'visible' },
  sepWrap: { alignSelf: 'stretch', height: SEP_H, justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, alignSelf: 'stretch' },
  itemRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.background },
  grab: { flex: 1 },
  block: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.lg },
  blockEditing: { paddingHorizontal: 48 },
  trash: { position: 'absolute', right: theme.spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
  label: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: theme.spacing.xs,
  },
  // Plus petit que le compteur principal (24), même taille partout
  counter: {
    fontSize: theme.font.sizes.lg, fontWeight: '300', letterSpacing: 0.5,
    fontVariant: ['tabular-nums'], textAlign: 'center',
  },
  dates: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', marginTop: 2, letterSpacing: 0.3 },
  pillOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pill: {
    height: 12, width: 32, borderRadius: 6, backgroundColor: theme.colors.text,
    alignItems: 'center', justifyContent: 'center',
  },
  // = barre de la liste : 55 % de large, centrée, 1 px blanc
  indicatorBar: {
    position: 'absolute', left: '22.5%', width: '55%', height: 1,
    backgroundColor: '#FFFFFF', borderRadius: 1, zIndex: 20,
  },
});
