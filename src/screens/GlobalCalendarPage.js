import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export default function GlobalCalendarPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.emptyText}>
        Calendrier global
      </Text>
      <Text style={styles.subtleText}>
        À venir : grille mensuelle multicolore
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptyText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.lg,
    fontWeight: '300',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  subtleText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
  },
});
