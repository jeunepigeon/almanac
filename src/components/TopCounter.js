// Compteur sous les onglets Calendrier / Recherche / Stats (1.46), identique sur la page Global
// (« SOBRE DE TOUT DEPUIS ») et sur la page d'une substance (« SOBRE DEPUIS », compteur dans sa
// couleur ; 1.52 : logo rond à gauche, comme dans la liste). 1.47 : style de l'ancien grand compteur (libellé, compteur, date empilés et
// centrés), juste un peu plus petit.
// flashBg : fond animé (flash après un tap sur une notification de la substance).
// noBorder : sans bordure basse (onglet Stats : le 1er séparateur des compteurs ajoutés la remplace).
import { useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../theme';
import { rangeFR } from '../utils/soberPeriods';
import LiveCounter from './LiveCounter';
import SubstanceIcon from './SubstanceIcon';

export default function TopCounter({
  label, timestamp, color = theme.colors.text, iconId = null, withIcon = false, flashBg = null, dimmed = false, noBorder = false,
}) {
  // 1.54 : logo centré dans la marge gauche (entre le bord et le texte). Largeurs arrondies par pas de
  // 8 px : le logo ne bouge pas à chaque seconde du compteur.
  const [wrapW, setWrapW] = useState(0);
  const [textW, setTextW] = useState(0);
  const iconLeft = wrapW && textW ? Math.max(4, Math.round((wrapW - textW) / 4 - ICON / 2)) : theme.spacing.md;
  return (
    <Animated.View
      onLayout={withIcon ? (e) => { const w = Math.round(e.nativeEvent.layout.width); if (w !== wrapW) setWrapW(w); } : undefined}
      style={[styles.wrap, noBorder && { borderBottomWidth: 0 }, flashBg && { backgroundColor: flashBg }, dimmed && { opacity: theme.dim }]}
      pointerEvents={dimmed ? 'none' : 'auto'}
    >
      <View
        style={styles.textCol}
        onLayout={withIcon ? (e) => { const w = Math.ceil(e.nativeEvent.layout.width / 8) * 8; if (w !== textW) setTextW(w); } : undefined}
      >
        <View style={styles.labelRow}>
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
        </View>
        <View style={styles.counterWrap}>
          {timestamp
            ? <LiveCounter timestamp={timestamp} style={[styles.counter, { color }]} numberOfLines={1} />
            : <Text style={[styles.counter, { color }]}>—</Text>}
        </View>
        {timestamp ? <Text style={styles.date} numberOfLines={1}>{rangeFR(timestamp, null)}</Text> : null}
      </View>
      {/* 1.52 : un seul logo, à GAUCHE, rond et à la même place que dans la liste (Global : aucun) */}
      {/* 1.53 : affiché aussi avec le logo par défaut (comme dans la liste) */}
      {withIcon ? (
        <View style={[styles.iconSide, { left: iconLeft }]} pointerEvents="none">
          <View style={[styles.icon, { borderColor: color }]}>
            <SubstanceIcon iconId={iconId} size={18} color={color} />
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const ICON = 36;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center', paddingTop: theme.spacing.sm + 2, paddingBottom: theme.spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  iconSide: { position: 'absolute', left: theme.spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
  icon: { width: ICON, height: ICON, borderRadius: ICON / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  // = libellé de l'ancien grand compteur
  label: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 1.5, textTransform: 'uppercase' },
  textCol: { alignItems: 'center', maxWidth: '100%' },
  counterWrap: { minHeight: 30, justifyContent: 'center', alignItems: 'center' },
  // ancien grand compteur : 24 → un cheveu plus petit
  counter: { fontSize: 22, fontWeight: '300', letterSpacing: 0.5, fontVariant: ['tabular-nums'], textAlign: 'center' },
  date: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.3, marginTop: 2 },
});
