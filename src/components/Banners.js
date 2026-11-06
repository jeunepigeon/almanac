// Bandeaux de la liste des substances (1.41 : sortis de SubstancesPage, + nouveaux types).
//  - SobreBanner      : « Sobre de tout depuis » (fixe en haut quand il est activé)
//  - CounterBanner    : catégorie de couleur (« Sobre depuis », en couleur) et bandeau
//                       personnalisé (« Sobre de <nom> depuis », en blanc)
//  - RecordBanner     : plus longue sobriété de tout (en direct si le record est en cours)
//  - Last24Banner     : prises des dernières 24 h glissantes, points de couleur par substance
// Tous : date sous le compteur, cloche à gauche (visible mais inactive en réorganisation),
// poubelle à droite en réorganisation.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Animated, useWindowDimensions } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { useStore } from '../store';
import { useFlashBackground } from '../utils/flash';
import { soberPeriods, rangeFR } from '../utils/soberPeriods';
import { formatDurationSince } from '../utils/duration';
import haptics from '../utils/haptics';
import LiveCounter from './LiveCounter';
import { WiggleContent } from './ReorderList';

export const BANNER_HEIGHT = 118; // 1.41 : + ligne de dates (avant 102)
export const FADE_MS = 450;
const traceAnim = (label) => () => useStore.getState().traceNotif('animation lancée', label);

// Cloche : vide / pleine. En réorganisation, toujours affichée mais inactive.
export function BannerBell({ color, active, onPress, disabled }) {
  return (
    <View style={styles.bell} pointerEvents={disabled ? 'none' : 'auto'}>
      <TouchableOpacity onPress={onPress} disabled={disabled} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
        <MaterialCommunityIcons name={active ? 'bell' : 'bell-outline'} size={18} color={color} />
      </TouchableOpacity>
    </View>
  );
}

function Tools({ onEdit, onDelete }) {
  return (
    <View style={styles.tools}>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} style={styles.toolBtn} hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onDelete} style={styles.toolBtn} hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}>
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

export function DateLine({ text, style }) {
  if (!text) return null;
  return <Text style={[styles.date, style]} numberOfLines={1}>{text}</Text>;
}

// « Sobre de tout » : fixe en haut. 1.41 : appui long → réorganisation (poubelle), date.
export function SobreBanner({ lastGlobalTimestamp, onPress, onLongPress, flashTick, inReorder, onDelete, hasNotif, onBell }) {
  const flashBg = useFlashBackground(flashTick, '#FFFFFF', traceAnim('sobre de tout'));
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => { if (!inReorder) { haptics.medium(); onLongPress?.(); } }}
      delayLongPress={400}
    >
      <Animated.View style={[styles.sobre, { backgroundColor: flashBg }]}>
        <BannerBell color={theme.colors.textMuted} active={hasNotif} onPress={onBell} disabled={inReorder} />
        {inReorder && <Tools onDelete={onDelete} />}
        <Text style={styles.label}>SOBRE DE TOUT DEPUIS</Text>
        {lastGlobalTimestamp ? (
          <>
            <View style={styles.counterWrap}>
              <LiveCounter timestamp={lastGlobalTimestamp} style={styles.counter} />
            </View>
            <DateLine text={rangeFR(lastGlobalTimestamp, null)} />
          </>
        ) : (
          <>
            <Text style={styles.counter}>—</Text>
            <Text style={styles.emptyHint}>renseignez votre première consommation</Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Fondu d'un bandeau qui disparaît (catégorie dissoute, poubelle…)
function useFade(fading) {
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (fading) Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
    else fade.setValue(1);
  }, [fading, fade]);
  return fade;
}

// Cadre commun des bandeaux du groupe (hauteur fixe, flash, fondu, vibration, outils)
function Frame({ flashColor, flashTick, traceLabel, fading, inReorder, isWiggling, phase, bell, onEdit, onDelete, children }) {
  const fade = useFade(fading);
  const flashBg = useFlashBackground(flashTick, flashColor, traceAnim(traceLabel));
  return (
    <Animated.View style={[styles.frame, { opacity: fade, backgroundColor: flashBg }]} pointerEvents={fading ? 'none' : 'auto'}>
      <WiggleContent isWiggling={!!isWiggling} phase={phase || 0} style={styles.content}>
        {children}
      </WiggleContent>
      {bell && !fading ? <BannerBell {...bell} disabled={inReorder} /> : null}
      {inReorder && <Tools onEdit={onEdit} onDelete={onDelete} />}
    </Animated.View>
  );
}

// Catégorie de couleur ou bandeau personnalisé
export function CounterBanner({ label, color, labelColor, lastTimestamp, ...frame }) {
  return (
    <Frame flashColor={color} traceLabel={label} {...frame}>
      <Text style={[styles.label, { color: labelColor || color }]} numberOfLines={1}>{label}</Text>
      <View style={styles.counterWrap}>
        {lastTimestamp
          ? <LiveCounter timestamp={lastTimestamp} style={[styles.counter, { color }]} numberOfLines={1} />
          : <Text style={[styles.counter, { color }]}>—</Text>}
      </View>
      <DateLine text={lastTimestamp ? rangeFR(lastTimestamp, null) : null} />
    </Frame>
  );
}

// Toutes les prises des substances de la liste (horodatages)
function useListTimestamps() {
  const substances = useStore((s) => s.substances);
  const all = useStore((s) => s.allConsumptions);
  return useMemo(() => {
    const ids = new Set(substances.map((x) => x.id));
    return all.filter((c) => ids.has(c.substanceId));
  }, [substances, all]);
}

// Plus longue sobriété de tout
export function RecordBanner(frame) {
  const cons = useListTimestamps();
  const p = useMemo(() => soberPeriods(cons.map((c) => c.timestamp)), [cons]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const current = p.last != null && (!p.pastRecord || now - p.last > p.pastRecord.end - p.pastRecord.start);
  const c = theme.colors.text;
  return (
    <Frame flashColor="#FFFFFF" traceLabel="record" {...frame}>
      <Text style={styles.label} numberOfLines={1}>{current ? 'PLUS LONGUE SOBRIÉTÉ DE TOUT · EN COURS' : 'PLUS LONGUE SOBRIÉTÉ DE TOUT'}</Text>
      <View style={styles.counterWrap}>
        {p.last == null ? <Text style={[styles.counter, { color: c }]}>—</Text>
          : current ? <LiveCounter timestamp={p.last} style={[styles.counter, { color: c }]} numberOfLines={1} />
            : <Text style={[styles.counter, { color: c }]} numberOfLines={1}>{formatDurationSince(p.pastRecord.start, p.pastRecord.end)}</Text>}
      </View>
      <DateLine text={p.last == null ? null : current ? rangeFR(p.last, null) : rangeFR(p.pastRecord.start, p.pastRecord.end)} />
    </Frame>
  );
}

// --- Dernières 24 h : points de couleur par substance ---
const DOT = 7; const PITCH = 10;
// Formes 1 à 7 (planche 4) : 1 seul · 2 empilés · 3 triangle · 4-5 dé · 6 = 2 rangées de 3 · 7 fleur
function shape(n) {
  const S = PITCH;
  switch (n) {
    case 1: return [[0, 0]];
    case 2: return [[0, -S / 2], [0, S / 2]];
    case 3: return [[0, -0.45 * S], [-S / 2, 0.45 * S], [S / 2, 0.45 * S]];
    case 4: return [[-S / 2, -S / 2], [S / 2, -S / 2], [-S / 2, S / 2], [S / 2, S / 2]];
    case 5: return [[-0.7 * S, -0.7 * S], [0.7 * S, -0.7 * S], [0, 0], [-0.7 * S, 0.7 * S], [0.7 * S, 0.7 * S]];
    case 6: return [[-S, -S / 2], [0, -S / 2], [S, -S / 2], [-S, S / 2], [0, S / 2], [S, S / 2]];
    default: { const h = 0.866 * S; return [[-S / 2, -h], [S / 2, -h], [-S, 0], [0, 0], [S, 0], [-S / 2, h], [S / 2, h]]; }
  }
}
function clusterBox(n) {
  const pts = shape(n);
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs) - DOT / 2; const minY = Math.min(...ys) - DOT / 2;
  return { pts, minX, minY, w: Math.max(...xs) + DOT / 2 - minX, h: Math.max(...ys) + DOT / 2 - minY };
}
function Cluster({ color, n }) {
  const b = clusterBox(n);
  return (
    <View style={{ width: b.w, height: b.h }}>
      {b.pts.map(([x, y], i) => (
        <View key={i} style={{ position: 'absolute', left: x - b.minX - DOT / 2, top: y - b.minY - DOT / 2, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }} />
      ))}
    </View>
  );
}
const CLUSTER_GAP = 12;

export function Last24Banner(frame) {
  const cons = useListTimestamps();
  const substances = useStore((s) => s.substances);
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  // Groupes par substance, dans l'ordre chronologique de leur 1re prise dans la fenêtre
  const groups = useMemo(() => {
    const from = now - 24 * 3600 * 1000;
    const bySub = new Map();
    for (const c of cons) {
      if (c.timestamp <= from || c.timestamp > now) continue;
      const g = bySub.get(c.substanceId) || { id: c.substanceId, n: 0, first: c.timestamp };
      g.n += 1; g.first = Math.min(g.first, c.timestamp);
      bySub.set(c.substanceId, g);
    }
    const colorOf = Object.fromEntries(substances.map((s) => [s.id, s.color]));
    return [...bySub.values()].sort((a, b) => a.first - b.first).map((g) => ({ ...g, color: colorOf[g.id] || theme.colors.text }));
  }, [cons, substances, now]);
  const total = groups.reduce((a, g) => a + g.n, 0);
  // Chiffres dès qu'un groupe dépasse 7 ou que les points ne tiennent pas en largeur
  const dotsW = groups.reduce((a, g) => a + clusterBox(Math.min(g.n, 7)).w, 0) + CLUSTER_GAP * Math.max(0, groups.length - 1);
  const asNumbers = groups.some((g) => g.n > 7) || dotsW > width - 2 * 72;
  return (
    <Frame flashColor="#FFFFFF" traceLabel="24 h" {...frame}>
      <Text style={styles.label}>DERNIÈRES 24 H</Text>
      <Text style={[styles.counter, styles.last24Count]}>{total === 0 ? '—' : `${total} prise${total > 1 ? 's' : ''}`}</Text>
      {total > 0 && (
        <View style={styles.dotsRow}>
          {groups.map((g) => (asNumbers
            ? <Text key={g.id} style={[styles.num, { color: g.color }]}>{g.n}</Text>
            : <Cluster key={g.id} color={g.color} n={g.n} />))}
        </View>
      )}
    </Frame>
  );
}

const styles = StyleSheet.create({
  sobre: {
    alignItems: 'center', paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  frame: { height: BANNER_HEIGHT - StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', paddingHorizontal: 56 },
  label: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: theme.spacing.xs,
  },
  counterWrap: { minHeight: 36, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.md, width: '100%' },
  counter: {
    color: theme.colors.text, fontSize: theme.font.sizes.xl, fontWeight: '300',
    letterSpacing: 0.5, fontVariant: ['tabular-nums'], textAlign: 'center',
  },
  last24Count: { minHeight: 32 },
  date: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.3, marginTop: 2 },
  emptyHint: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontWeight: '300',
    letterSpacing: 0.5, fontStyle: 'italic', marginTop: theme.spacing.xs,
  },
  bell: {
    position: 'absolute', left: theme.spacing.lg, top: 0, bottom: 0,
    justifyContent: 'center', padding: theme.spacing.xs, zIndex: 2,
  },
  tools: {
    position: 'absolute', right: theme.spacing.md, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, zIndex: 2,
  },
  toolBtn: { padding: theme.spacing.xs },
  dotsRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
    columnGap: CLUSTER_GAP, rowGap: 4, marginTop: 4, minHeight: 26,
  },
  num: { fontWeight: '700', fontSize: 17, fontVariant: ['tabular-nums'] },
});
