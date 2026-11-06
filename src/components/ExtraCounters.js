// Compteurs ajoutés sous « Sobre depuis » (1.40) — page d'une substance et stats globales.
//  - « + » (pilule) : fenêtre à cocher pour ajouter / retirer ;
//  - appui long sur un compteur ajouté : le retire ;
//  - réglage propre à chaque substance (scope = id) et un pour le global (scope = '__global').
// Taille : 18, plus petite que les compteurs principaux (24), identique partout.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { useStore } from '../store';
import haptics from '../utils/haptics';
import { formatDurationSince } from '../utils/duration';
import { soberPeriods, rangeFR } from '../utils/soberPeriods';
import LiveCounter from './LiveCounter';
import ToggleListModal from './ToggleListModal';

const EMPTY = [];
const DEFS = [
  { id: 'prev', label: 'Période de sobriété précédente', short: 'Sobriété précédente' },
  { id: 'record', label: 'Plus longue période de sobriété', short: 'Plus longue sobriété' },
];

export default function ExtraCounters({ scope, timestamps, color = theme.colors.text }) {
  const enabled = useStore((s) => s.extraCounters[scope]) || EMPTY;
  const toggle = useStore((s) => s.toggleExtraCounter);
  const [open, setOpen] = useState(false);
  const p = useMemo(() => soberPeriods(timestamps), [timestamps]);

  // La période en cours peut dépasser le record pendant qu'on regarde : réévalué toutes les 30 s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled.includes('record')) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [enabled]);

  const recordIsCurrent = p.last != null
    && (!p.pastRecord || now - p.last > p.pastRecord.end - p.pastRecord.start);

  const remove = (id) => { haptics.medium(); toggle(scope, id); };

  const renderOne = (id) => {
    const def = DEFS.find((d) => d.id === id);
    let value = null; let dates = null; let live = false; let label = def.short;
    if (id === 'prev' && p.prev) {
      value = formatDurationSince(p.prev.start, p.prev.end);
      dates = rangeFR(p.prev.start, p.prev.end);
    } else if (id === 'record' && p.last != null) {
      if (recordIsCurrent) {
        live = true; label = `${def.short} · en cours`; dates = rangeFR(p.last, null);
      } else {
        value = formatDurationSince(p.pastRecord.start, p.pastRecord.end);
        dates = rangeFR(p.pastRecord.start, p.pastRecord.end);
      }
    }
    return (
      <Pressable key={id} onLongPress={() => remove(id)} delayLongPress={450} style={styles.block}>
        <Text style={styles.label}>{label}</Text>
        {live ? (
          <LiveCounter timestamp={p.last} style={[styles.counter, { color }]} />
        ) : (
          <Text style={[styles.counter, { color }]}>{value || '—'}</Text>
        )}
        {dates ? <Text style={styles.dates}>{dates}</Text> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      {enabled.map(renderOne)}
      <TouchableOpacity
        style={styles.pill}
        onPress={() => { haptics.light(); setOpen(true); }}
        hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
        activeOpacity={0.6}
      >
        <MaterialCommunityIcons name="plus" size={10} color={theme.colors.background} />
      </TouchableOpacity>
      <ToggleListModal
        visible={open}
        title="Compteurs"
        options={DEFS.map((d) => ({ id: d.id, label: d.label, color, checked: enabled.includes(d.id) }))}
        onToggle={(id) => toggle(scope, id)}
        footer="Appui long sur un compteur pour le retirer."
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'stretch' },
  block: { alignItems: 'center', alignSelf: 'stretch', marginTop: theme.spacing.md },
  label: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: theme.spacing.xs,
  },
  // Plus petit que le compteur principal (24), même taille partout
  counter: {
    fontSize: theme.font.sizes.lg, fontWeight: '300', letterSpacing: 0.5,
    fontVariant: ['tabular-nums'], textAlign: 'center',
  },
  dates: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontWeight: '300', marginTop: 2, letterSpacing: 0.3 },
  pill: {
    height: 12, width: 32, borderRadius: 6, backgroundColor: theme.colors.text,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md,
  },
});
