// Compteurs ajoutés sous « Sobre depuis » (1.40) — page d'une substance et stats globales.
//  - « + » (pilule) : fenêtre à cocher pour ajouter / retirer ;
//  - 1.41 : appui long sur un compteur → mode réorganisation (comme les bandeaux) : ils vibrent,
//    on les glisse pour changer l'ordre, poubelle pour retirer, « Terminé » (ou retour) pour sortir ;
//  - réglage propre à chaque substance (scope = id) et un pour le global (scope = '__global').
// Taille : 18, plus petite que les compteurs principaux (24), identique partout.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, Animated, PanResponder, BackHandler,
} from 'react-native';
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

// Un compteur en mode réorganisation : vibre, se glisse verticalement, poubelle à droite
function EditableBlock({ index, count, blockH, onMove, onDelete, phase, children }) {
  const dy = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { setDragging(true); haptics.light(); },
    onPanResponderMove: (_, g) => dy.setValue(g.dy),
    onPanResponderRelease: (_, g) => {
      const h = blockH.current || 60;
      const to = Math.max(0, Math.min(count - 1, index + Math.round(g.dy / h)));
      dy.setValue(0);
      setDragging(false);
      if (to !== index) { haptics.medium(); onMove(index, to); }
    },
    onPanResponderTerminate: () => { dy.setValue(0); setDragging(false); },
  }), [index, count]); // eslint-disable-line
  return (
    <Animated.View style={[styles.editRow, { transform: [{ translateY: dy }], zIndex: dragging ? 5 : 1 }]}>
      <View {...pan.panHandlers} style={styles.editGrab}>
        <WiggleContent isWiggling={!dragging} phase={phase} style={styles.block}>{children}</WiggleContent>
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.trash} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ExtraCounters({ scope, timestamps, color = theme.colors.text }) {
  const enabled = useStore((s) => s.extraCounters[scope]) || EMPTY;
  const toggle = useStore((s) => s.toggleExtraCounter);
  const setOrder = useStore((s) => s.setExtraCountersOrder);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const blockH = useRef(60);
  const p = useMemo(() => soberPeriods(timestamps), [timestamps]);

  // La période en cours peut dépasser le record pendant qu'on regarde : réévalué toutes les 30 s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled.includes('record')) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [enabled]);

  // Sortie du mode réorganisation : retour Android, ou plus aucun compteur
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

  const move = (from, to) => {
    const list = [...enabled];
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
    setOrder(scope, list);
  };

  return (
    <View style={styles.wrap}>
      {enabled.map((id, i) => (editing ? (
        <EditableBlock
          key={id} index={i} count={enabled.length} blockH={blockH} phase={i % 3}
          onMove={move}
          onDelete={() => { haptics.medium(); toggle(scope, id); }}
        >
          {content(id)}
        </EditableBlock>
      ) : (
        <Pressable
          key={id}
          onLongPress={() => { haptics.medium(); setEditing(true); }}
          delayLongPress={400}
          style={styles.block}
          onLayout={(e) => { blockH.current = e.nativeEvent.layout.height; }}
        >
          {content(id)}
        </Pressable>
      )))}
      {editing ? (
        <TouchableOpacity onPress={() => { haptics.light(); setEditing(false); }} style={styles.done} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}>
          <Text style={styles.doneText}>Terminé</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.pill}
          onPress={() => { haptics.light(); setOpen(true); }}
          hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
          activeOpacity={0.6}
        >
          <MaterialCommunityIcons name="plus" size={10} color={theme.colors.background} />
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

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'stretch' },
  block: { alignItems: 'center', alignSelf: 'stretch', paddingTop: theme.spacing.md },
  editRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center' },
  editGrab: { flex: 1, paddingLeft: 32 }, // place symétrique à la poubelle
  trash: { width: 32, alignItems: 'center', paddingTop: theme.spacing.md },
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
  pill: {
    height: 12, width: 32, borderRadius: 6, backgroundColor: theme.colors.text,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md,
  },
  done: { marginTop: theme.spacing.md, paddingVertical: 4, paddingHorizontal: theme.spacing.md, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.textMuted },
  doneText: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '600', letterSpacing: 0.5 },
});
