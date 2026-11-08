// Compteur sous les onglets Calendrier / Recherche / Stats (1.46), identique sur la page Global
// (« SOBRE DE TOUT DEPUIS ») et sur la page d'une substance (« SOBRE DEPUIS », compteur dans sa
// couleur ; 1.51 : logo rond à droite, comme dans la liste). 1.47 : style de l'ancien grand compteur (libellé, compteur, date empilés et
// centrés), juste un peu plus petit.
// flashBg : fond animé (flash après un tap sur une notification de la substance).
// noBorder : sans bordure basse (onglet Stats : le 1er séparateur des compteurs ajoutés la remplace).
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../theme';
import { rangeFR } from '../utils/soberPeriods';
import LiveCounter from './LiveCounter';
import SubstanceIcon from './SubstanceIcon';

export default function TopCounter({
  label, timestamp, color = theme.colors.text, iconId = null, flashBg = null, dimmed = false, noBorder = false,
}) {
  return (
    <Animated.View
      style={[styles.wrap, noBorder && { borderBottomWidth: 0 }, flashBg && { backgroundColor: flashBg }, dimmed && { opacity: 0.25 }]}
      pointerEvents={dimmed ? 'none' : 'auto'}
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
      {/* 1.51 : un seul logo, à droite, rond comme dans la liste des substances (Global : aucun) */}
      {iconId ? (
        <View style={styles.iconSide} pointerEvents="none">
          <View style={[styles.icon, { borderColor: color }]}>
            <SubstanceIcon iconId={iconId} size={18} color={color} />
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center', paddingTop: theme.spacing.sm + 2, paddingBottom: theme.spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  iconSide: { position: 'absolute', right: theme.spacing.lg, top: 0, bottom: 0, justifyContent: 'center' },
  icon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  // = libellé de l'ancien grand compteur
  label: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 1.5, textTransform: 'uppercase' },
  counterWrap: { minHeight: 30, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.md, width: '100%' },
  // ancien grand compteur : 24 → un cheveu plus petit
  counter: { fontSize: 22, fontWeight: '300', letterSpacing: 0.5, fontVariant: ['tabular-nums'], textAlign: 'center' },
  date: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.3, marginTop: 2 },
});
