import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable, Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { getIconById } from '../icons';
import LiveCounter from '../components/LiveCounter';
import SubstanceFormModal from '../components/SubstanceFormModal';
import ActionSheet from '../components/ActionSheet';
import ConfirmModal from '../components/ConfirmModal';

export default function SubstancesPage() {
  const navigation = useNavigation();
  const substances = useStore((s) => s.substances);
  const archivedSubstances = useStore((s) => s.archivedSubstances);
  const ready = useStore((s) => s.ready);
  const lastTimestamps = useStore((s) => s.lastTimestamps);

  const createSubstance = useStore((s) => s.createSubstance);
  const updateSubstance = useStore((s) => s.updateSubstance);
  const deleteSubstance = useStore((s) => s.deleteSubstance);
  const archiveSubstance = useStore((s) => s.archiveSubstance);
  const restoreSubstance = useStore((s) => s.restoreSubstance);
  const reorderSubstances = useStore((s) => s.reorderSubstances);

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingArchivedConflict, setPendingArchivedConflict] = useState(null);
  const [actionSheetFor, setActionSheetFor] = useState(null);
  const [editMode, setEditMode] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Mode réorganisation
  const [reorderMode, setReorderMode] = useState(false);
  const [localOrder, setLocalOrder] = useState(null);

  // Sync localOrder avec substances quand on entre en mode reorder
  useEffect(() => {
    if (reorderMode) {
      setLocalOrder(substances.map((s) => s.id));
    } else {
      setLocalOrder(null);
    }
  }, [reorderMode, substances]);

  if (!ready) return <View style={styles.container} />;

  // Liste affichée : si reorderMode, on utilise localOrder
  const displayedSubstances = reorderMode && localOrder
    ? localOrder.map((id) => substances.find((s) => s.id === id)).filter(Boolean)
    : substances;

  const moveItem = (index, direction) => {
    if (!localOrder) return;
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= localOrder.length) return;
    const next = [...localOrder];
    [next[index], next[newIdx]] = [next[newIdx], next[index]];
    setLocalOrder(next);
  };

  const finishReorder = async () => {
    if (localOrder) {
      await reorderSubstances(localOrder);
    }
    setReorderMode(false);
  };

  const handleCreateSubmit = async ({ name, color, icon }) => {
    const archivedMatch = archivedSubstances.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
    if (archivedMatch) {
      setCreateOpen(false);
      setPendingArchivedConflict({ archivedSub: archivedMatch, attempted: { name, color, icon } });
      return;
    }
    try {
      await createSubstance({ name, color, icon });
      setCreateOpen(false);
    } catch (e) {
      Alert.alert('Nom déjà utilisé', e.message || 'Une substance avec ce nom existe déjà.');
    }
  };

  const handleEditSubmit = async (payload) => {
    if (!editMode) return;
    try {
      await updateSubstance(editMode.sub.id, payload);
      setEditMode(null);
    } catch (e) {
      Alert.alert('Nom déjà utilisé', e.message || 'Une substance avec ce nom existe déjà.');
    }
  };

  const handleArchivedConflictRestore = async () => {
    await restoreSubstance(pendingArchivedConflict.archivedSub.id);
    setPendingArchivedConflict(null);
  };

  const handleArchivedConflictNew = async () => {
    const { attempted } = pendingArchivedConflict;
    try {
      await createSubstance({
        name: `${attempted.name} (nouveau)`,
        color: attempted.color, icon: attempted.icon,
      });
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
    setPendingArchivedConflict(null);
  };

  const openActions = (sub) => setActionSheetFor(sub);

  const actionItems = (sub) => [
    { id: 'rename', label: 'Renommer', icon: 'pencil-outline', onPress: () => setEditMode({ sub, mode: 'rename' }) },
    { id: 'color', label: 'Changer la couleur', icon: 'palette-outline', onPress: () => setEditMode({ sub, mode: 'color' }) },
    { id: 'icon', label: "Changer l'icône", icon: 'shape-outline', onPress: () => setEditMode({ sub, mode: 'icon' }) },
    { id: 'reorder', label: 'Réorganiser la liste', icon: 'drag', onPress: () => setReorderMode(true) },
    { id: 'delete', label: 'Supprimer', icon: 'trash-can-outline', destructive: true, onPress: () => setPendingDelete(sub) },
  ];

  return (
    <View style={styles.container}>
      {/* Bandeau mode réorganisation */}
      {reorderMode && (
        <View style={styles.reorderBar}>
          <Text style={styles.reorderBarText}>Réorganisation</Text>
          <TouchableOpacity onPress={finishReorder} style={styles.reorderDoneBtn}>
            <Text style={styles.reorderDoneText}>Terminé</Text>
          </TouchableOpacity>
        </View>
      )}

      {substances.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Ajoute au moins 1 substance pour utiliser l'app</Text>
        </View>
      ) : (
        <FlatList
          data={displayedSubstances}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <SubstanceRow
              substance={item}
              lastTimestamp={lastTimestamps[item.id]}
              reorderMode={reorderMode}
              isFirst={index === 0}
              isLast={index === displayedSubstances.length - 1}
              onPress={() => !reorderMode && navigation.navigate('Substance', { substanceId: item.id })}
              onLongPress={() => !reorderMode && setReorderMode(true)}
              onMenu={() => !reorderMode && openActions(item)}
              onMoveUp={() => moveItem(index, -1)}
              onMoveDown={() => moveItem(index, 1)}
            />
          )}
        />
      )}

      {!reorderMode && <FAB onPress={() => setCreateOpen(true)} />}

      <SubstanceFormModal
        visible={createOpen} mode="create"
        onSubmit={handleCreateSubmit}
        onClose={() => setCreateOpen(false)}
      />

      <ConfirmModal
        visible={!!pendingArchivedConflict}
        title="Une sauvegarde existe"
        message={
          pendingArchivedConflict
            ? `Une substance archivée "${pendingArchivedConflict.archivedSub.name}" existe déjà avec son historique. Veux-tu la restaurer ou créer une nouvelle substance vierge ?`
            : ''
        }
        cancelLabel="Annuler"
        onCancel={() => setPendingArchivedConflict(null)}
        extraActions={[
          { label: 'Restaurer la sauvegarde', hint: "L'historique précédent revient", onPress: handleArchivedConflictRestore },
          { label: 'Créer une nouvelle', hint: 'Repart de zéro, suffixée "(nouveau)"', onPress: handleArchivedConflictNew },
        ]}
      />

      <ActionSheet
        visible={!!actionSheetFor}
        title={actionSheetFor?.name}
        items={actionSheetFor ? actionItems(actionSheetFor) : []}
        onClose={() => setActionSheetFor(null)}
      />

      <SubstanceFormModal
        visible={!!editMode}
        mode={editMode?.mode || 'rename'}
        initial={editMode?.sub}
        onSubmit={handleEditSubmit}
        onClose={() => setEditMode(null)}
      />

      <ConfirmModal
        visible={!!pendingDelete}
        title="Supprimer cette substance"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" — choisis ce qui doit se passer avec son historique :`
            : ''
        }
        cancelLabel="Annuler"
        onCancel={() => setPendingDelete(null)}
        extraActions={[
          {
            label: 'Archiver',
            hint: "Disparaît de la liste, l'historique reste visible dans le calendrier global",
            onPress: async () => {
              if (pendingDelete) await archiveSubstance(pendingDelete.id);
              setPendingDelete(null);
            },
          },
          {
            label: 'Effacer définitivement',
            hint: 'La substance et tout son historique sont supprimés',
            destructive: true,
            onPress: async () => {
              if (pendingDelete) await deleteSubstance(pendingDelete.id);
              setPendingDelete(null);
            },
          },
        ]}
      />
    </View>
  );
}

function SubstanceRow({
  substance, lastTimestamp, reorderMode, isFirst, isLast,
  onPress, onLongPress, onMenu, onMoveUp, onMoveDown,
}) {
  const iconEntry = getIconById(substance.icon);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.row, pressed && !reorderMode && styles.rowPressed]}
    >
      {reorderMode && (
        <MaterialCommunityIcons name="drag" size={20} color={theme.colors.textMuted} />
      )}
      <View style={[styles.iconWrap, { borderColor: substance.color }]}>
        <MaterialCommunityIcons name={iconEntry.icon} size={18} color={substance.color} />
      </View>
      <View style={styles.rowMiddle}>
        <Text style={styles.rowName}>{substance.name}</Text>
        {!reorderMode && (
          <LiveCounter timestamp={lastTimestamp} style={styles.rowCounter} />
        )}
      </View>
      {reorderMode ? (
        <View style={styles.arrows}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={isFirst}
            style={[styles.arrowBtn, isFirst && styles.arrowDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="chevron-up" size={22} color={isFirst ? theme.colors.textFaint : theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={isLast}
            style={[styles.arrowBtn, isLast && styles.arrowDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="chevron-down" size={22} color={isLast ? theme.colors.textFaint : theme.colors.text} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={onMenu} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.menuBtn}>
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      )}
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
  container: { flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.lg },
  emptyText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.md, fontWeight: '300', textAlign: 'center', letterSpacing: 0.5 },

  reorderBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  reorderBarText: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' },
  reorderDoneBtn: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  reorderDoneText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '500', letterSpacing: 1 },

  listContent: { paddingTop: theme.spacing.sm, paddingBottom: 120 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  rowPressed: { backgroundColor: theme.colors.surface },
  iconWrap: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  rowMiddle: { flex: 1, gap: 2 },
  rowName: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.5 },
  rowCounter: { color: theme.colors.text, fontSize: theme.font.sizes.lg, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  menuBtn: { padding: theme.spacing.xs },
  arrows: { flexDirection: 'row', gap: theme.spacing.xs },
  arrowBtn: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4,
    minWidth: 32, alignItems: 'center',
  },
  arrowDisabled: { opacity: 0.3 },
  fab: {
    position: 'absolute', bottom: theme.spacing.lg, right: theme.spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: theme.colors.text, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
});
