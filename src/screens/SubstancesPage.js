import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useStore } from '../store';
import CreateSubstanceModal from '../components/CreateSubstanceModal';
import ConfirmModal from '../components/ConfirmModal';

export default function SubstancesPage() {
  const substances = useStore((s) => s.substances);
  const ready = useStore((s) => s.ready);
  const deleteSubstance = useStore((s) => s.deleteSubstance);

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  if (!ready) {
    return <View style={styles.container} />;
  }

  if (substances.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            Ajoute au moins 1 substance pour utiliser l'app
          </Text>
        </View>
        <FAB onPress={() => setCreateOpen(true)} />
        <CreateSubstanceModal
          visible={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={substances}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <SubstanceRow
            substance={item}
            onLongPress={() => setPendingDelete(item)}
          />
        )}
      />

      <FAB onPress={() => setCreateOpen(true)} />

      <CreateSubstanceModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <ConfirmModal
        visible={!!pendingDelete}
        title="Supprimer ?"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" sera supprimée définitivement (provisoire — un menu plus complet arrivera).`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            await deleteSubstance(pendingDelete.id);
          }
          setPendingDelete(null);
        }}
      />
    </View>
  );
}

function SubstanceRow({ substance, onLongPress }) {
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.colorDot, { backgroundColor: substance.color }]} />
      <Text style={styles.rowName}>{substance.name}</Text>
      <Text style={styles.rowHint}>—</Text>
    </Pressable>
  );
}

function FAB({ onPress }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name="add" size={28} color={theme.colors.background} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptyText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingTop: theme.spacing.sm,
    paddingBottom: 120,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  rowName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  rowHint: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
  },
  fab: {
    position: 'absolute',
    bottom: theme.spacing.lg,
    right: theme.spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.text,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
