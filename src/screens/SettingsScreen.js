import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Données</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Exporter</Text>
        <Text style={styles.rowValueFaint}>à venir</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Importer</Text>
        <Text style={styles.rowValueFaint}>à venir</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Sauvegardes archivées</Text>
        <Text style={styles.rowValueFaint}>à venir</Text>
      </View>

      <Text style={styles.sectionTitle}>À propos</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Version</Text>
        <Text style={styles.rowValue}>0.1.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingVertical: theme.spacing.lg,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
  },
  rowValue: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
  },
  rowValueFaint: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.sm,
    fontStyle: 'italic',
  },
});
