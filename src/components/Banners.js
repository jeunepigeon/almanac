// Bandeaux de la liste des substances (1.41 : sortis de SubstancesPage, + nouveaux types).
//  - SobreBanner      : « Sobre de tout depuis » (1.48 : un bandeau comme les autres, déplaçable)
//  - CounterBanner    : catégorie de couleur (« Sobre depuis », en couleur) et bandeau
//                       personnalisé (« Sobre de <nom> depuis », en blanc)
//  - RecordBanner     : plus longue sobriété de tout (en direct si le record est en cours)
//  - Last24Banner     : prises des dernières 24 h glissantes, points de couleur par substance
// Tous : date sous le compteur, cloche à gauche (visible mais inactive en réorganisation),
// poubelle à droite en réorganisation.
// 1.48 : hauteur 104 (moins de vide, même contenu). `compact` = demi-case de la grille 2 colonnes :
// le bandeau est dessiné en entier puis réduit (HALF_SCALE) ; marges réduites (cloche et poubelle
// collées aux bords), icônes à ~13 px une fois réduites, crayon et poubelle empilés.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, useWindowDimensions } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { useStore } from '../store';
import { useFlashBackground } from '../utils/flash';
import { soberPeriods, rangeFR } from '../utils/soberPeriods';
import { formatDurationSince } from '../utils/duration';
import LiveCounter from './LiveCounter';
import { WiggleContent } from './ReorderList';

export const BANNER_HEIGHT = 104; // 1.48 : moins de vide en haut et en bas (avant 118)
export const HALF_SCALE = 0.6;    // 1.48 : échelle des demi-cases (2 colonnes)
export const COMPACT_PAD = 28;    // marge latérale du contenu en demi-case (avant réduction)
const COMPACT_ICON = Math.round(13 / HALF_SCALE); // ~13 px une fois réduit
export const FADE_MS = 450;
const traceAnim = (label) => () => useStore.getState().traceNotif('animation lancée', label);

// Cloche : vide / pleine. En réorganisation, toujours affichée mais inactive.
export function BannerBell({ color, active, onPress, disabled, compact }) {
  return (
    <View style={[styles.bell, compact && styles.bellCompact]} pointerEvents={disabled ? 'none' : 'auto'}>
      <TouchableOpacity onPress={onPress} disabled={disabled} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
        <MaterialCommunityIcons name={active ? 'bell' : 'bell-outline'} size={compact ? COMPACT_ICON : 18} color={color} />
      </TouchableOpacity>
    </View>
  );
}

function Tools({ onEdit, onDelete, compact }) {
  const size = compact ? COMPACT_ICON : 20;
  return (
    <View style={[styles.tools, compact && styles.toolsCompact]}>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} style={styles.toolBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="pencil-outline" size={size} color={theme.colors.textMuted} />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onDelete} style={styles.toolBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <MaterialCommunityIcons name="trash-can-outline" size={size} color={theme.colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

export function DateLine({ text, style }) {
  if (!text) return null;
  return <Text style={[styles.date, style]} numberOfLines={1}>{text}</Text>;
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
function Frame({ flashColor, flashTick, traceLabel, fading, inReorder, isWiggling, phase, bell, onEdit, onDelete, compact, children }) {
  const fade = useFade(fading);
  const flashBg = useFlashBackground(flashTick, flashColor, traceAnim(traceLabel));
  return (
    <Animated.View style={[styles.frame, { opacity: fade, backgroundColor: flashBg }]} pointerEvents={fading ? 'none' : 'auto'}>
      <WiggleContent isWiggling={!!isWiggling} phase={phase || 0} style={[styles.content, compact && styles.contentCompact]}>
        {children}
      </WiggleContent>
      {bell && !fading ? <BannerBell {...bell} compact={compact} disabled={inReorder} /> : null}
      {inReorder && <Tools onEdit={onEdit} onDelete={onDelete} compact={compact} />}
    </Animated.View>
  );
}

// « Sobre de tout » (1.48 : même cadre que les autres bandeaux, déplaçable, hauteur fixe)
export function SobreBanner({ lastGlobalTimestamp, ...frame }) {
  return (
    <Frame flashColor="#FFFFFF" traceLabel="sobre de tout" {...frame}>
      <Text style={styles.label} numberOfLines={1}>SOBRE DE TOUT DEPUIS</Text>
      {lastGlobalTimestamp ? (
        <>
          <View style={styles.counterWrap}>
            <LiveCounter timestamp={lastGlobalTimestamp} style={styles.counter} numberOfLines={1} />
          </View>
          <DateLine text={rangeFR(lastGlobalTimestamp, null)} />
        </>
      ) : (
        <>
          <Text style={styles.counter}>—</Text>
          <Text style={styles.emptyHint}>aucune consommation renseignée</Text>
        </>
      )}
    </Frame>
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

export function Last24Banner({ layoutWidth, ...frame }) {
  const cons = useListTimestamps();
  const substances = useStore((s) => s.substances);
  const { width: winW } = useWindowDimensions();
  const width = layoutWidth || winW; // 1.48 : largeur du bandeau (demi-case : avant réduction)
  // 1.42 : l'heure de référence est relue à CHAQUE changement de prises (avant : une fois par minute,
  // une prise toute neuve était « dans le futur » et n'apparaissait qu'à la minute suivante)
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  const now = useMemo(() => Date.now(), [cons, tick]); // eslint-disable-line
  // Groupes par substance, dans l'ordre chronologique de leur 1re prise dans la fenêtre
  const groups = useMemo(() => {
    const from = now - 24 * 3600 * 1000;
    const bySub = new Map();
    for (const c of cons) {
      if (c.timestamp <= from) continue; // (une prise saisie dans le futur compte aussi)
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
  const asNumbers = groups.some((g) => g.n > 7) || dotsW > width - 2 * (frame.compact ? COMPACT_PAD + 12 : 72);
  return (
    <Frame flashColor="#FFFFFF" traceLabel="24 h" {...frame}>
      <Text style={styles.label}>TOUTES PRISES · DERNIÈRES 24 H</Text>
      <Text style={[styles.counter, styles.last24Count]}>{total === 0 ? '—' : `${total} prise${total > 1 ? 's' : ''}`}</Text>
      {total > 0 && (
        <View style={styles.dotsRow}>
          {groups.map((g) => (asNumbers
            ? <Text key={g.id} style={[styles.num, { color: g.color }]}>{g.n}</Text>
            : <Cluster key={g.id} color={g.color} n={g.n} />))}
        </View>
      )}
      <DateLine text="clic pour plus de détails" />
    </Frame>
  );
}

const styles = StyleSheet.create({
  frame: { height: BANNER_HEIGHT - StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', paddingHorizontal: 56 },
  contentCompact: { paddingHorizontal: COMPACT_PAD },
  label: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: theme.spacing.xs,
  },
  counterWrap: { minHeight: 36, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.md, width: '100%' },
  counter: {
    color: theme.colors.text, fontSize: theme.font.sizes.xl, fontWeight: '300',
    letterSpacing: 0.5, fontVariant: ['tabular-nums'], textAlign: 'center',
  },
  last24Count: { lineHeight: 30 },
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
  // 1.48 : demi-case → collés au bord, empilés et centrés (bandeau personnalisé : crayon + poubelle)
  toolsCompact: { right: 2, flexDirection: 'column', justifyContent: 'center', gap: 4 },
  bellCompact: { left: 4 },
  toolBtn: { padding: theme.spacing.xs },
  // 1.43 : points centrés, même écart au-dessus (chiffre) et en dessous (« clic pour plus de détails »)
  dotsRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', alignSelf: 'center',
    columnGap: CLUSTER_GAP, rowGap: 2, marginTop: 6, marginBottom: 6,
  },
  num: { fontWeight: '700', fontSize: 17, fontVariant: ['tabular-nums'] },
});
