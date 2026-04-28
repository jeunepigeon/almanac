import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { formatDateLong, formatTime } from '../utils/dates';
import { getIconById } from '../icons';

// Modal qui affiche les consos d'un jour, classées par couleur (groupé par substance).
// Props :
// - visible
// - dayTs : timestamp du jour (00:00)
// - consumptions : tableau de consos { id, substanceId, timestamp, dosage, notes }
// - substancesById : map { id -> substance }
// - onConsumptionPress(consumption, substance)
// - onAddPress(dayTs)  : pour ajouter une nouvelle conso ce jour
// - onClose()
export default function DaySheet({
  visible,
  dayTs,
  consumptions = [],
  substancesById = {},
  onConsumptionPress,
  onAddPress,
  onClose,
}) {
  // Grouper par substance, trier les substances par couleur (pour la cohérence visuelle)
  const grouped = {};
  for (const c of consumptions) {
    if (!grouped[c.substanceId]) grouped[c.substanceId] = [];
    grouped[c.substanceId].push(c);
  }

  const groupedArr = Object.entries(grouped)
    .map(([substanceId, items]) => ({
      substance: substancesById[substanceId],
      items: items.sort((a, b) => a.timestamp - b.timestamp),
    }))
    .filter((g) => g.substance) // ignore consos orphelines
    .sort((a, b) => {
      // tri par couleur (alphanumérique sur la couleur hex pour cohérence)
      return a.substance.color.localeCompare(b.substance.color);
    });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.bottomWrap}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {dayTs ? formatDateLong(dayTs) : ''}
              </Text>
              {onAddPress && (
                <TouchableOpacity
                  onPress={() => onAddPress(dayTs)}
                  style={styles.addBtn}
                  hitSlop={10}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={20}
                    color={theme.colors.text}
                  />
                  <Text style={styles.addBtnText}>Ajouter</Text>
                </TouchableOpacity>
              )}
            </View>

            {groupedArr.length === 0 ? (
              <Text style={styles.empty}>Aucune consommation ce jour.</Text>
            ) : (
              <FlatList
                data={groupedArr}
                keyExtractor={(g) => g.substance.id}
                style={styles.list}
                renderItem={({ item: group }) => {
                  const iconEntry = getIconById(group.substance.icon);
                  return (
                    <View style={styles.group}>
                      <View style={styles.groupHeader}>
                        <View
                          style={[
                            styles.substanceIcon,
                            { borderColor: group.substance.color },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={iconEntry.icon}
                            size={14}
                            color={group.substance.color}
                          />
                        </View>
                        <Text style={styles.substanceName}>
                          {group.substance.name}
                        </Text>
                        <Text style={styles.groupCount}>
                          {group.items.length}
                          {group.items.length > 1 ? ' consos' : ' conso'}
                        </Text>
                      </View>
                      {group.items.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() =>
                            onConsumptionPress?.(c, group.substance)
                          }
                          style={styles.consoRow}
                        >
                          <View
                            style={[
                              styles.consoBullet,
                              { backgroundColor: group.substance.color },
                            ]}
                          />
                          <Text style={styles.consoTime}>
                            {formatTime(c.timestamp)}
                          </Text>
                          {c.dosage ? (
                            <Text style={styles.consoDosage}>{c.dosage}</Text>
                          ) : null}
                          {c.notes ? (
                            <Text
                              style={styles.consoNotes}
                              numberOfLines={1}
                            >
                              {c.notes}
                            </Text>
                          ) : null}
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={16}
                            color={theme.colors.textFaint}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                }}
              />
            )}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  bottomWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: 6,
    paddingVertical: theme.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 0.5,
    flex: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  addBtnText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  empty: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
    fontStyle: 'italic',
  },
  list: {
    maxHeight: 400,
  },
  group: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  substanceIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  substanceName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  groupCount: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
  },
  consoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  consoBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  consoTime: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    minWidth: 50,
  },
  consoDosage: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
  },
  consoNotes: {
    flex: 1,
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.sm,
    fontStyle: 'italic',
  },
});
