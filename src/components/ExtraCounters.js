// Compteurs ajoutés sous « Sobre depuis » (1.40) — page d'une substance et stats globales.
//  - séparateurs entre les compteurs (comme la liste), pilule « + » posée sur le dernier (1.42) ;
//  - « + » : fenêtre à cocher pour ajouter / retirer ;
//  - appui long puis glisser, dans le même geste (comme la liste) → réorganisation : les compteurs
//    vibrent, le séparateur où le compteur va se poser s'allume (1.42), poubelle pour retirer,
//    « Terminé » (ou retour) pour sortir ;
//  - réglage propre à chaque substance (scope = id) et un pour le global (scope = '__global').
// Taille : 18, plus petite que les compteurs principaux (24), identique partout.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, BackHandler } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
const LONG_PRESS_MS = 400;

function Separator({ lit, children }) {
  return (
    <View style={styles.sepWrap}>
      <View style={[styles.sep, lit && styles.sepLit]} />
      {children}
    </View>
  );
}

// Un compteur déplaçable : appui long (ou direct en réorganisation) puis glisser
function DraggableItem({ index, editing, onStart, onMove, onEnd, dragging, dy, phase, onDelete, onLayout, children }) {
  const handlers = useRef({});
  handlers.current = { onStart, onMove, onEnd };
  const gesture = useMemo(() => {
    const g = Gesture.Pan().runOnJS(true)
      .onStart(() => handlers.current.onStart(index))
      .onUpdate((e) => handlers.current.onMove(e.translationY))
      .onEnd(() => handlers.current.onEnd())
      .onFinalize(() => handlers.current.onEnd());
    return editing ? g.minDistance(4) : g.activateAfterLongPress(LONG_PRESS_MS);
  }, [editing, index]);
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        onLayout={onLayout}
        style={[styles.item, dragging && { transform: [{ translateY: dy }, { scale: 1.04 }], zIndex: 10, opacity: 0.92 }]}
      >
        <WiggleContent isWiggling={editing && !dragging} phase={phase} style={[styles.block, editing && styles.blockEditing]}>
          {children}
        </WiggleContent>
        {editing && (
          <TouchableOpacity onPress={onDelete} style={styles.trash} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
          </TouchableOpacity>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// bleed : marge intérieure du conteneur, compensée pour que les séparateurs aillent bord à bord
export default function ExtraCounters({ scope, timestamps, color = theme.colors.text, bleed = 0 }) {
  const enabled = useStore((s) => s.extraCounters[scope]) || EMPTY;
  const toggle = useStore((s) => s.toggleExtraCounter);
  const setOrder = useStore((s) => s.setExtraCountersOrder);
  const setCountersEditing = useStore((s) => s.setCountersEditing);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drag, setDragState] = useState(null); // { from, target }
  const dragRef = useRef(null);
  const setDrag = (d) => { dragRef.current = d; setDragState(d); };
  const dy = useRef(new Animated.Value(0)).current;
  const heights = useRef({});
  const p = useMemo(() => soberPeriods(timestamps), [timestamps]);

  // La période en cours peut dépasser le record pendant qu'on regarde : réévalué toutes les 30 s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled.includes('record')) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [enabled]);

  // Pendant la réorganisation, la page ne défile plus (sinon elle « vole » le glissement)
  useEffect(() => { setCountersEditing(editing); return () => setCountersEditing(false); }, [editing]); // eslint-disable-line
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

  // --- glisser-déposer ---
  const avgH = () => {
    const hs = Object.values(heights.current);
    return hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 70;
  };
  const start = (from) => {
    if (!editing) { haptics.medium(); setEditing(true); }
    dy.setValue(0);
    setDrag({ from, target: from });
  };
  const move = (ty) => {
    dy.setValue(ty);
    const d = dragRef.current;
    if (!d) return;
    const target = Math.max(0, Math.min(enabled.length - 1, d.from + Math.round(ty / avgH())));
    if (target !== d.target) { haptics.light(); setDrag({ ...d, target }); }
  };
  const end = () => {
    const d = dragRef.current;
    if (!d) return;
    if (d.target !== d.from) {
      const list = [...enabled];
      const [x] = list.splice(d.from, 1);
      list.splice(d.target, 0, x);
      setOrder(scope, list);
      haptics.medium();
    }
    setDrag(null);
    dy.setValue(0);
  };
  // Séparateur allumé = là où le compteur va se poser (k = 0 : au-dessus du 1er)
  const litSep = drag && drag.target !== drag.from ? (drag.target < drag.from ? drag.target : drag.target + 1) : -1;

  return (
    <View style={[styles.wrap, bleed ? { marginHorizontal: -bleed } : null]}>
      {/* Séparateur sous le compteur principal ; sans compteur ajouté, la pilule est posée dessus */}
      <Separator lit={litSep === 0}>
        {enabled.length === 0 && <Pill onPress={() => { haptics.light(); setOpen(true); }} />}
      </Separator>
      {enabled.map((id, i) => (
        <View key={id} style={{ alignSelf: 'stretch' }}>
          <DraggableItem
            index={i}
            editing={editing}
            dragging={drag?.from === i}
            dy={dy}
            phase={i % 3}
            onStart={start}
            onMove={move}
            onEnd={end}
            onDelete={() => { haptics.medium(); toggle(scope, id); }}
            onLayout={(e) => { heights.current[id] = e.nativeEvent.layout.height; }}
          >
            {content(id)}
          </DraggableItem>
          {i < enabled.length - 1 && <Separator lit={litSep === i + 1} />}
        </View>
      ))}
      {enabled.length > 0 && (
        <Separator lit={litSep === enabled.length}>
          {!editing && <Pill onPress={() => { haptics.light(); setOpen(true); }} />}
        </Separator>
      )}
      {editing && (
        <TouchableOpacity onPress={() => { haptics.light(); setEditing(false); }} style={styles.done} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}>
          <Text style={styles.doneText}>Terminé</Text>
        </TouchableOpacity>
      )}
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

function Pill({ onPress }) {
  return (
    <View pointerEvents="box-none" style={styles.pillOverlay}>
      <TouchableOpacity style={styles.pill} onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }} activeOpacity={0.6}>
        <MaterialCommunityIcons name="plus" size={10} color={theme.colors.background} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'stretch', marginTop: theme.spacing.md },
  sepWrap: { alignSelf: 'stretch', height: 12, justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, alignSelf: 'stretch' },
  sepLit: { height: 2, backgroundColor: theme.colors.text },
  item: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' },
  block: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.lg },
  blockEditing: { paddingHorizontal: 48 },
  trash: { position: 'absolute', right: theme.spacing.sm, top: 0, bottom: 0, width: 32, alignItems: 'center', justifyContent: 'center' },
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
  done: { marginTop: theme.spacing.xs, marginBottom: theme.spacing.sm, paddingVertical: 4, paddingHorizontal: theme.spacing.md, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.textMuted },
  doneText: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '600', letterSpacing: 0.5 },
});
