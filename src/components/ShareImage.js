// Image de partage (1.38) — rendue à 360 dp de large puis capturée en 1080 px (×3).
//  - jusqu'à MAX_ROWS substances : une colonne, comme la liste ; hauteur selon le contenu
//    (toujours moins haute qu'un 9:16) ;
//  - au-delà : image EXACTEMENT 9:16 (1080×1920), contenu étalé sur toute la hauteur :
//    1 colonne resserrée (jusqu'à 75 %), puis 2 colonnes espacées, réduites si nécessaire.
// Tous les compteurs sont calculés avec le MÊME instant `now` (photo prise au moment du partage).
import { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { formatDurationSince } from '../utils/duration';
import SubstanceIcon from './SubstanceIcon';

export const SHARE_W = 360;                         // largeur logique (dp)
export const SHARE_SCALE = 3;                       // 360 dp → 1080 px
const H_916 = Math.round((SHARE_W * 16) / 9);       // 640 dp → 1920 px
const SOBRE_H = 82;
const FOOT_H = 55;
const ROW_H = 52;
const CARD_H = 53;
const CARD_H_MAX = 76;
const MIN_ROW_K = 0.75;
const LOGO = require('../../assets/share-logo.png');
const LOGO_RATIO = 485 / 440;

// Mise en page selon le nombre de substances et la présence du bloc « Sobre de tout »
export function shareLayout(count, showSobre) {
  const top = showSobre ? SOBRE_H : 0;
  const avail = H_916 - top - FOOT_H;
  const maxRows = Math.floor(avail / ROW_H);
  if (count <= maxRows) {
    return { mode: 'list', height: top + count * ROW_H + FOOT_H, rowH: ROW_H, k: 1 };
  }
  const rowH = avail / count;
  if (rowH / ROW_H >= MIN_ROW_K) return { mode: 'list', height: H_916, rowH, k: rowH / ROW_H };
  const rows = Math.ceil(count / 2);
  const cardH = Math.min(avail / rows, CARD_H_MAX);
  return { mode: 'grid', height: H_916, rowH: cardH, k: Math.min(1, cardH / CARD_H) };
}

const ShareImage = forwardRef(function ShareImage({ showSobre, sobreTs, subs, now }, ref) {
  const lay = shareLayout(subs.length, showSobre);
  const { k } = lay;
  return (
    <View ref={ref} collapsable={false} style={[styles.canvas, { height: lay.height }]}>
      {showSobre && (
        <View style={styles.sobre}>
          <Text style={styles.sobreLabel}>SOBRE DE TOUT DEPUIS</Text>
          <Text style={styles.sobreCounter}>{formatDurationSince(sobreTs, now)}</Text>
        </View>
      )}

      <View style={[styles.middle, lay.height === H_916 && { flex: 1 }]}>
        {lay.mode === 'list' ? subs.map((s) => (
          <View key={s.id} style={[styles.row, { height: lay.rowH, gap: 12 * k }]}>
            <View style={[styles.iconWrap, { borderColor: s.color, width: 36 * k, height: 36 * k, borderRadius: 18 * k }]}>
              <SubstanceIcon iconId={s.icon} size={18 * k} color={s.color} />
            </View>
            <Text style={[styles.name, { fontSize: 14 * k }]} numberOfLines={1}>{s.name}</Text>
            <Text style={[styles.counter, { fontSize: 14 * k, width: 142 * k }]} numberOfLines={1}>
              {formatDurationSince(s.ts, now)}
            </Text>
          </View>
        )) : (
          <View style={styles.grid}>
            {subs.map((s) => (
              <View key={s.id} style={[styles.card, { height: lay.rowH, gap: 10 * k }]}>
                <View style={[styles.iconWrap, { borderColor: s.color, width: 34 * k, height: 34 * k, borderRadius: 17 * k }]}>
                  <SubstanceIcon iconId={s.icon} size={17 * k} color={s.color} />
                </View>
                <View style={styles.cardText}>
                  <Text style={[styles.cardName, { fontSize: 13.5 * k }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[styles.cardCounter, { fontSize: 13.5 * k }]} numberOfLines={1}>
                    {formatDurationSince(s.ts, now)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Signature : logo détouré + « almanac », côte à côte */}
      <View style={styles.foot}>
        <Image source={LOGO} style={{ height: 20, width: 20 * LOGO_RATIO }} resizeMode="contain" />
        <Text style={styles.wordmark}>almanac</Text>
      </View>
    </View>
  );
});

export default ShareImage;

const BORDER = StyleSheet.hairlineWidth;
const styles = StyleSheet.create({
  canvas: { width: SHARE_W, backgroundColor: theme.colors.background },
  sobre: {
    height: SOBRE_H, alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: BORDER, borderBottomColor: theme.colors.border,
  },
  sobreLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '300', letterSpacing: 1.8 },
  sobreCounter: {
    color: theme.colors.text, fontSize: 30, fontWeight: '300', letterSpacing: 0.5,
    marginTop: 4, fontVariant: ['tabular-nums'],
  },
  middle: { justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    borderBottomWidth: BORDER, borderBottomColor: theme.colors.border,
  },
  iconWrap: { borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  name: { flex: 1, color: theme.colors.text, fontWeight: '300', letterSpacing: 0.5 },
  counter: {
    color: theme.colors.text, fontWeight: '300', letterSpacing: 0.5,
    textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  card: {
    width: '50%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11,
    borderBottomWidth: BORDER, borderBottomColor: theme.colors.border,
  },
  cardText: { flex: 1, minWidth: 0 },
  cardName: { color: theme.colors.text, fontWeight: '300', letterSpacing: 0.5 },
  cardCounter: { color: theme.colors.text, fontWeight: '300', marginTop: 1, fontVariant: ['tabular-nums'] },
  foot: { height: FOOT_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wordmark: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '300', letterSpacing: 3 },
});
