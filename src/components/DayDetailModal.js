import { View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { formatDateLong, formatTime } from '../utils/dates';
import { getIconById } from '../icons';
import BottomSheet from './BottomSheet';

export default function DayDetailModal({
  visible,
  dayTimestamp,
  consumptions = [],
  substancesById = {},
  singleSubstance = null,
  onTapConsumption,
  onAddPress,
  onClose,
}) {
  const showAddBtn = !!onAddPress;
  const title = dayTimestamp ? formatDateLong(dayTimestamp) : '';

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      {consumptions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucune consommation ce jour</Text>
        </View>
      ) : (
        <FlatList
          data={consumptions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const sub = singleSubstance ?? substancesById[item.substanceId];
            if (!sub) return null;
            const iconEntry = getIconById(sub.icon);
            return (
              <Pressable
                onPress={() => onTapConsumption?.(item, sub)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.iconWrap, { borderColor: sub.color }]}>
                  <MaterialCommunityIcons name={iconEntry.icon} size={16} color={sub.color} />
                </View>
                <View style={styles.rowMiddle}>
                  {!singleSubstance && <Text style={styles.rowName}>{sub.name}</Text>}
                  <View style={styles.metaRow}>
                    <Text style={styles.rowTime}>{formatTime(item.timestamp)}</Text>
                    {item.dosage != null ? (
                      <Text style={styles.rowDosage}>
                        · {Number(item.dosage).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}
                      </Text>
                    ) : null}
                  </View>
                  {item.notes ? (
                    <Text style={styles.rowNotes} numberOfLines={3}>
                      {item.notes}
                    </Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textFaint} />
              </Pressable>
            );
          }}
        />
      )}

      {showAddBtn && (
        <TouchableOpacity onPress={onAddPress} style={styles.addBtn}>
          <Ionicons name="add" size={20} color={theme.colors.text} />
          <Text style={styles.addBtnText}>Ajouter une consommation</Text>
        </TouchableOpacity>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    fontStyle: 'italic',
  },
  listContent: { paddingBottom: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  rowPressed: { backgroundColor: theme.colors.surface },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
  },
  rowMiddle: { flex: 1, gap: 2 },
  rowName: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  metaRow: { flexDirection: 'row', gap: 4 },
  rowTime: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300', fontVariant: ['tabular-nums'] },
  rowDosage: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  rowNotes: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontStyle: 'italic', fontWeight: '300' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  addBtnText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 1,
  },
});
