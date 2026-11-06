import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { formatDateLong, formatTime } from '../utils/dates';
import { getIconById } from '../icons';
import SubstanceIcon from './SubstanceIcon';
import LiveCounter from './LiveCounter';
import BottomSheet from './BottomSheet';
import ConfirmModal from './ConfirmModal';
import haptics from '../utils/haptics';

export default function DayDetailModal({
  visible,
  dayTimestamp,
  consumptions = [],
  substancesById = {},
  singleSubstance = null,
  onTapConsumption,   // crayon : modifier la prise
  onDeleteConsumption, // 1.42 : poubelle (après confirmation)
  onAddPress,
  onClose,
  title: titleOverride = null, // 1.42 : ex. « Dernières 24 h »
  addLabel = 'Ajouter une consommation',
}) {
  const showAddBtn = !!onAddPress;
  const title = titleOverride || (dayTimestamp ? formatDateLong(dayTimestamp) : '');
  const [pendingDelete, setPendingDelete] = useState(null); // { item, sub }

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} keepTitleCase={!!titleOverride}>
      {consumptions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucune consommation ce jour</Text>
        </View>
      ) : (
        <FlatList keyboardShouldPersistTaps="handled"
          data={consumptions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const sub = singleSubstance ?? substancesById[item.substanceId];
            if (!sub) return null;
            return (
              // 1.42 : la ligne ne réagit plus au tap ; crayon (modifier) et poubelle (supprimer) à droite
              <View style={styles.row}>
                <View style={[styles.iconWrap, { borderColor: sub.color }]}>
                  <SubstanceIcon iconId={sub.icon} size={16} color={sub.color} />
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
                <LiveCounter timestamp={item.timestamp} style={styles.rowTimeAgo} numberOfLines={1} adjustsFontSizeToFit />
                <View style={styles.tools}>
                  <TouchableOpacity onPress={() => { haptics.light(); onTapConsumption?.(item, sub); }} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {onDeleteConsumption && (
                    <TouchableOpacity onPress={() => { haptics.light(); setPendingDelete({ item, sub }); }} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {showAddBtn && (
        <TouchableOpacity onPress={onAddPress} style={styles.addBtn}>
          <Ionicons name="add" size={20} color={theme.colors.text} />
          <Text style={styles.addBtnText}>{addLabel}</Text>
        </TouchableOpacity>
      )}

      <ConfirmModal
        visible={!!pendingDelete}
        title="Supprimer cette prise ?"
        message={pendingDelete
          ? `${pendingDelete.sub.name} · ${formatTime(pendingDelete.item.timestamp)}\nLa prise sera supprimée définitivement.`
          : ''}
        cancelLabel="Annuler"
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const p = pendingDelete;
          setPendingDelete(null);
          if (p) { haptics.success(); await onDeleteConsumption?.(p.item, p.sub); }
        }}
      />
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
  // Colonne fixe, texte centré (1.24)
  tools: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  rowTimeAgo: { width: 108, color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'center' },
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
