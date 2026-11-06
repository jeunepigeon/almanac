// Barre « RÉORGANISATION · Terminé » (1.43) — la même que celle de la liste des substances,
// posée par-dessus le haut de la page (aucun décalage de l'affichage).
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

export default function ReorgBar({ onDone }) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.bar}>
        <Text style={styles.text}>Réorganisation</Text>
        <TouchableOpacity onPress={onDone} style={styles.doneBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.doneText}>Terminé</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Styles copiés de ReorderList (barre de la liste) pour un rendu identique
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200, elevation: 20 },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  text: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  doneBtn: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  doneText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 1 },
});
