// Image de partage — rendue à 360 dp de large puis capturée en 1080 px (×3).
// 1.62 : même logique que l'écran principal :
//  - en haut les bandeaux (dessinés comme dans la liste, sans date ni cloche), en 1 ou 2 colonnes
//    (grande case en tête si nombre impair) ;
//  - puis les substances (lignes comme la liste), en 1 ou 2 colonnes (ligne réduite de moitié) ;
//  - hauteur selon le contenu ; au-delà du 9:16 (1080 × 1920), l'image reste en 9:16 et tout le
//    contenu est réduit pour tenir (centré, sur le fond noir).
// Les compteurs des substances sont calculés avec le même instant `now` (photo au moment du partage).
import { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { formatDurationSince } from '../utils/duration';
import SubstanceIcon from './SubstanceIcon';
import { WiggleContent } from './ReorderList';
import { geom, gridHeight } from './BannerGrid';
import { BANNER_HEIGHT } from './Banners';
import { renderShareBanner } from './ShareBanners';

export const SHARE_W = 360;                         // largeur logique (dp)
export const SHARE_SCALE = 3;                       // 360 dp → 1080 px
export const H_916 = Math.round((SHARE_W * 16) / 9); // 640 dp → 1920 px
export const BAN_H = BANNER_HEIGHT;                 // bandeau plein (104)
export const SUB_H = 52;                            // ligne de substance pleine
export const FOOT_H = 55;
const LOGO = require('../../assets/share-logo.png');
const LOGO_RATIO = 485 / 440;
export const BAN_CELL = { h1: BAN_H, u: 1 };
export const SUB_CELL = { h1: SUB_H, u: 1 };

// Tailles : hauteur du contenu, de l'image, et réduction éventuelle (9:16 maximum)
export function shareSize(nb, banCols, ns, subCols) {
  const banH = gridHeight(nb, banCols, BAN_CELL);
  const subH = gridHeight(ns, subCols, SUB_CELL);
  const contentH = banH + subH + FOOT_H;
  if (contentH <= H_916) return { banH, subH, contentH, height: contentH, f: 1 };
  return { banH, subH, contentH, height: H_916, f: H_916 / contentH };
}

// Ligne d'une substance (comme la liste) — aussi utilisée dans l'aperçu
export function ShareSubRow({ sub, now, isWiggling = false, phase = 0 }) {
  return (
    <View style={styles.row}>
      <WiggleContent isWiggling={isWiggling} phase={phase} style={styles.rowInner}>
        <View style={[styles.iconWrap, { borderColor: sub.color }]}>
          <SubstanceIcon iconId={sub.icon} size={18} color={sub.color} />
        </View>
        <Text style={styles.name} numberOfLines={1}>{sub.name}</Text>
        <Text style={styles.counter} numberOfLines={1}>{formatDurationSince(sub.ts, now)}</Text>
      </WiggleContent>
    </View>
  );
}

// Une section (bandeaux ou substances) dessinée à plat avec la géométrie de la grille
function Section({ items, cols, cell, render }) {
  const n = items.length;
  return (
    <View style={{ height: gridHeight(n, cols, cell) }}>
      {items.map((it, i) => {
        const g = geom(i, n, cols, SHARE_W, cell);
        const L = g.w / g.s;
        return (
          <View key={it.id} style={[styles.cell, { left: g.x, top: g.y, width: g.w, height: g.h }]}>
            <View style={{ width: L, height: cell.h1 / cell.u, transform: [{ scale: g.s }], transformOrigin: 'top left' }}>
              {render(it, { compact: !g.wide, layoutWidth: L })}
            </View>
            <View style={styles.lineBottom} />
            {!g.wide && g.col === 0 && <View style={styles.lineRight} />}
          </View>
        );
      })}
    </View>
  );
}

const ShareImage = forwardRef(function ShareImage({ banners, subs, banCols, subCols, now, sobreTs }, ref) {
  const size = shareSize(banners.length, banCols, subs.length, subCols);
  const f = size.f;
  return (
    <View ref={ref} collapsable={false} style={[styles.canvas, { height: size.height }]}>
      <View style={{
        width: SHARE_W, height: size.contentH,
        transform: [{ scale: f }], transformOrigin: 'top left', marginLeft: (SHARE_W * (1 - f)) / 2,
      }}
      >
        {banners.length > 0 && (
          <Section items={banners} cols={banCols} cell={BAN_CELL} render={(it, o) => renderShareBanner(it, o, sobreTs)} />
        )}
        {subs.length > 0 && (
          <Section items={subs} cols={subCols} cell={SUB_CELL} render={(it) => <ShareSubRow sub={it} now={now} />} />
        )}
        {/* Signature : logo détouré + « almanac », côte à côte */}
        <View style={styles.foot}>
          <Image source={LOGO} style={{ height: 20, width: 20 * LOGO_RATIO }} resizeMode="contain" />
          <Text style={styles.wordmark}>almanac</Text>
        </View>
      </View>
    </View>
  );
});

export default ShareImage;

const BORDER = StyleSheet.hairlineWidth;
const styles = StyleSheet.create({
  canvas: { width: SHARE_W, backgroundColor: theme.colors.background, overflow: 'hidden' },
  cell: { position: 'absolute', overflow: 'hidden', backgroundColor: theme.colors.background },
  lineBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: BORDER, backgroundColor: theme.colors.border },
  lineRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: BORDER, backgroundColor: theme.colors.border },
  row: { height: SUB_H, justifyContent: 'center', paddingHorizontal: 16 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  name: { flex: 1, color: theme.colors.text, fontSize: 14, fontWeight: '300', letterSpacing: 0.5 },
  counter: {
    width: 142, color: theme.colors.text, fontSize: 14, fontWeight: '300', letterSpacing: 0.5,
    textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  foot: { height: FOOT_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wordmark: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '300', letterSpacing: 3 },
});
