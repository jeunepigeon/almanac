// Petit compteur sous les onglets Calendrier / Recherche / Stats (1.46), identique sur la page
// Global (« SOBRE DE TOUT DEPUIS ») et sur la page d'une substance (petit logo + « SOBRE DEPUIS »,
// compteur dans sa couleur). Une ligne : libellé + compteur ; la date en dessous.
// flashBg : fond animé (flash après un tap sur une notification de la substance).
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../theme';
import { rangeFR } from '../utils/soberPeriods';
import LiveCounter from './LiveCounter';
import SubstanceIcon from './SubstanceIcon';

export default function TopCounter({ label, timestamp, color = theme.colors.text, iconId = null, flashBg = null, dimmed = false }) {
  return (
    <Animated.View
      style={[styles.wrap, flashBg && { backgroundColor: flashBg }, dimmed && { opacity: 0.25 }]}
      pointerEvents={dimmed ? 'none' : 'auto'}
    >
      <View style={styles.line}>
        {iconId ? (
          <View style={[styles.icon, { borderColor: color }]}>
            <SubstanceIcon iconId={iconId} size={12} color={color} />
          </View>
        ) : null}
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        {timestamp
          ? <LiveCounter timestamp={timestamp} style={[styles.counter, { color }]} numberOfLines={1} />
          : <Text style={[styles.counter, { color }]}>—</Text>}
      </View>
      {timestamp ? <Text style={styles.date} numberOfLines={1}>{rangeFR(timestamp, null)}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center', paddingVertical: theme.spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
  icon: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 1.5, textTransform: 'uppercase' },
  counter: { fontSize: theme.font.sizes.lg, fontWeight: '300', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  date: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.3, marginTop: 1 },
});
