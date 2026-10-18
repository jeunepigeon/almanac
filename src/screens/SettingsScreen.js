import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, TextInput, Modal, Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { theme } from '../theme';
import { useStore } from '../store';
import { getIconById } from '../icons';
import { dbGetFirstConsumptionTimestamp, dbGetSnapshotData } from '../db';
import ConfirmModal from '../components/ConfirmModal';
import ActionSheet from '../components/ActionSheet';
import DiskIcon from '../components/DiskIcon';
import { fmtDateTiret, fmtSize, parseSnapshot } from '../utils/snapshots';
import { performFusion } from '../utils/fusion';
import { useKeepAwake } from '../utils/keepAwake';
import SubstanceSelectModal from '../components/SubstanceSelectModal';

function formatDateLongFR(ts) {
  const d = new Date(ts);
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  useKeepAwake('settings-screen');
  const substances = useStore((s) => s.substances);
  const archivedSubstances = useStore((s) => s.archivedSubstances);
  const snapshots = useStore((s) => s.snapshots);
  const wipeAll = useStore((s) => s.wipeAll);
  const createSnapshotFromLive = useStore((s) => s.createSnapshotFromLive);
  const deleteSnapshotFn = useStore((s) => s.deleteSnapshot);
  const fusionSnapshot = useStore((s) => s.fusionSnapshot);
  const markSnapshotsConsulted = useStore((s) => s.markSnapshotsConsulted);
  const loadSnapshots = useStore((s) => s.loadSnapshots);

  const [firstConsoTs, setFirstConsoTs] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingWipeStep, setPendingWipeStep] = useState(0);
  const [wipeToastVisible, setWipeToastVisible] = useState(false);

  // Snapshot actions
  const [snapshotAction, setSnapshotAction] = useState(null); // { snap }
  const [pendingSnapDelete, setPendingSnapDelete] = useState(null);
  const [fusionModal, setFusionModal] = useState(null); // { snap, subIds: [ids cochés] }
  const [fusionBusy, setFusionBusy] = useState(false);
  const [conflictModal, setConflictModal] = useState(null); // { parsedSub, resolve }
  const [createSnapshotModal, setCreateSnapshotModal] = useState(false);
  const [newSnapName, setNewSnapName] = useState('');
  const [newSnapSubIds, setNewSnapSubIds] = useState([]);
  const [snapshotStats, setSnapshotStats] = useState({}); // {id: {substancesCount, consumptionsCount, size}}

  // Marquer les snapshots comme consultés à l'ouverture des settings
  useFocusEffect(
    useCallback(() => {
      markSnapshotsConsulted();
    }, [markSnapshotsConsulted])
  );

  useEffect(() => {
    dbGetFirstConsumptionTimestamp().then(setFirstConsoTs);
    loadSnapshots();
  }, []);

  // Charger les stats de chaque snapshot pour affichage
  useEffect(() => {
    (async () => {
      const stats = {};
      for (const s of snapshots) {
        const data = await dbGetSnapshotData(s.id);
        if (data) {
          try {
            const parsed = parseSnapshot(data);
            stats[s.id] = {
              substancesCount: parsed.substances.length,
              consumptionsCount: parsed.consumptions.length,
              size: data.length,
            };
          } catch {
            stats[s.id] = { substancesCount: 0, consumptionsCount: 0, size: (data || '').length };
          }
        }
      }
      setSnapshotStats(stats);
    })();
  }, [snapshots]);

  const openCreateSnapshotModal = () => {
    setNewSnapName('');
    setNewSnapSubIds([...substances, ...archivedSubstances].map((s) => s.id));
    setCreateSnapshotModal(true);
  };

  const handleCreateSnapshot = async () => {
    const base = (newSnapName || 'sauvegarde').trim().replace(/\s+/g, '-').toLowerCase();
    const fullName = `${base}-${fmtDateTiret()}`;
    await createSnapshotFromLive(fullName, newSnapSubIds.length ? newSnapSubIds : null);
    setCreateSnapshotModal(false);
  };

  const openFusionModal = (snap) => {
    setSnapshotAction(null);
    (async () => {
      const data = await dbGetSnapshotData(snap.id);
      if (!data) return;
      const parsed = parseSnapshot(data);
      setFusionModal({ snap, parsed, subIds: parsed.substances.map((s) => s.id) });
    })();
  };

  const handleFusionWithIds = async (ids) => {
    if (!fusionModal) return;
    const { parsed } = fusionModal;
    setFusionModal(null);
    setFusionBusy(true);
    try {
      await useStore.getState().createSnapshotFromLive(`avant-fusion-${fmtDateTiret()}`);
      const activeSubs = [...useStore.getState().substances, ...useStore.getState().archivedSubstances];
      const result = await performFusion({
        parsed,
        activeSubs,
        substanceIds: new Set(ids),
        onConflict: askConflictChoice,
      });
      await useStore.getState().loadAll();
      Alert.alert(
        'Fusion terminée',
        `${result.added} ajoutée(s), ${result.merged} fusionnée(s), ${result.numbered} numérotée(s), ${result.ignored} ignorée(s).\n${result.consosAdded} conso(s) importée(s).`
      );
    } catch (e) {
      Alert.alert('Erreur fusion', e.message || String(e));
    } finally {
      setFusionBusy(false);
    }
  };

  const askConflictChoice = (parsedSub) => new Promise((resolve) => {
    setConflictModal({ parsedSub, resolve });
  });

  const resolveConflict = (choice) => {
    if (conflictModal) {
      conflictModal.resolve(choice);
      setConflictModal(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Soutenir le projet</Text>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Donations')}>
        <Text style={styles.rowLabel}>Soutenir le développement</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {/* ===== GESTIONNAIRE DE SAUVEGARDE ET ARCHIVES ===== */}
      <Text style={styles.sectionTitle}>Gestionnaire de sauvegarde</Text>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Import')}>
        <View style={styles.rowLeft}>
          <Ionicons name="arrow-down-outline" size={18} color={theme.colors.text} style={styles.rowIcon} />
          <Text style={styles.rowLabel}>Importer</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Export')}>
        <View style={styles.rowLeft}>
          <View style={styles.rowIcon}>
            <DiskIcon size={18} color={theme.colors.text} />
          </View>
          <Text style={styles.rowLabel}>Exporter</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={openCreateSnapshotModal}>
        <View style={styles.rowLeft}>
          <Ionicons name="add" size={20} color={theme.colors.text} style={styles.rowIcon} />
          <Text style={styles.rowLabel}>Créer une sauvegarde</Text>
        </View>
      </TouchableOpacity>

      {snapshots.length === 0 ? (
        <View style={styles.row}>
          <Text style={styles.rowValueFaint}>Aucune sauvegarde</Text>
        </View>
      ) : (
        snapshots.map((snap) => {
          const stats = snapshotStats[snap.id];
          return (
            <Pressable
              key={snap.id}
              onPress={() => setSnapshotAction({ snap })}
              style={({ pressed }) => [
                styles.snapRow,
                pressed && { backgroundColor: theme.colors.surface },
              ]}
            >
              <View style={styles.snapContent}>
                <View style={styles.snapNameRow}>
                  {!snap.consulted && <View style={styles.redDotSmall} />}
                  <Text style={styles.snapName}>{snap.name}</Text>
                </View>
                {stats && (
                  <Text style={styles.snapInfo}>
                    {stats.substancesCount} substance{stats.substancesCount > 1 ? 's' : ''} · {stats.consumptionsCount} consos · {fmtSize(stats.size)}
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons name="dots-horizontal" size={20} color={theme.colors.textMuted} />
            </Pressable>
          );
        })
      )}

      {/* ===== ZONE DE DANGER (au-dessus de À propos) ===== */}
      <Text style={styles.sectionTitle}>Zone de danger</Text>
      <TouchableOpacity style={styles.row} onPress={() => setPendingWipeStep(1)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabelDanger}>Remise à zéro complète</Text>
          <Text style={styles.rowDangerHint}>sauf données restaurables depuis Gestionnaire de sauvegarde</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.danger} />
      </TouchableOpacity>

      {/* ===== À PROPOS ===== */}
      <Text style={styles.sectionTitle}>À propos</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Version</Text>
        <Text style={styles.rowValue}>1.1.15.1</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Consos enregistrées depuis</Text>
        <Text style={styles.rowValue}>
          {firstConsoTs ? formatDateLongFR(firstConsoTs) : '—'}
        </Text>
      </View>

      <View style={styles.creditWrap}>
        <Text style={styles.creditText}>almanac — développé par pigeon</Text>
      </View>

      {/* Action sheet snapshot */}
      <ActionSheet
        visible={!!snapshotAction}
        title={snapshotAction?.snap?.name}
        items={
          snapshotAction
            ? [
                {
                  id: 'restore',
                  label: 'Restaurer / Fusionner',
                  icon: 'set-merge',
                  onPress: () => openFusionModal(snapshotAction.snap),
                },
                {
                  id: 'download',
                  label: 'Télécharger',
                  icon: 'download-outline',
                  onPress: () => {
                    navigation.navigate('Export', { snapshotId: snapshotAction.snap.id });
                    setSnapshotAction(null);
                  },
                },
                {
                  id: 'delete',
                  label: 'Supprimer définitivement',
                  icon: 'trash-can-outline',
                  destructive: true,
                  onPress: () => {
                    setPendingSnapDelete(snapshotAction.snap);
                    setSnapshotAction(null);
                  },
                },
              ]
            : []
        }
        onClose={() => setSnapshotAction(null)}
      />

      <ConfirmModal
        visible={!!pendingSnapDelete}
        title="Supprimer cette sauvegarde ?"
        message={
          pendingSnapDelete
            ? `"${pendingSnapDelete.name}" sera effacé définitivement. Cette action est irréversible.`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setPendingSnapDelete(null)}
        onConfirm={async () => {
          if (pendingSnapDelete) await deleteSnapshotFn(pendingSnapDelete.id);
          setPendingSnapDelete(null);
        }}
      />

      <ConfirmModal
        visible={pendingWipeStep === 1}
        title="Remise à zéro complète"
        message="Vos données seront remises à zéro. Une sauvegarde fantôme sera créée automatiquement et sera restaurable via les paramètres. Continuer ?"
        confirmLabel="Continuer"
        destructive
        onCancel={() => setPendingWipeStep(0)}
        onConfirm={() => setPendingWipeStep(2)}
      />

      <ConfirmModal
        visible={pendingWipeStep === 2}
        title="Confirmer l'effacement"
        message="Cette action est définitive. Une sauvegarde automatique va être créée avant."
        confirmLabel="Effacer tout"
        destructive
        onCancel={() => setPendingWipeStep(0)}
        onConfirm={async () => {
          await wipeAll();
          setPendingWipeStep(0);
          setFirstConsoTs(null);
          setWipeToastVisible(true);
        }}
      />

      <ConfirmModal
        visible={wipeToastVisible}
        title="Sauvegarde créée"
        message="Une sauvegarde a été créée. Vous pouvez la restaurer ou la supprimer définitivement via Paramètres."
        confirmLabel="OK"
        hideCancel
        onCancel={() => setWipeToastVisible(false)}
        onConfirm={() => {
          setWipeToastVisible(false);
          navigation.goBack();
        }}
      />

      {/* Modal Créer une sauvegarde (UI unifiée SubstanceSelectModal) */}
      <SubstanceSelectModal
        visible={createSnapshotModal}
        title="Créer une sauvegarde"
        showNameField
        nameFieldLabel="Nom (optionnel)"
        nameFieldPlaceholder="sauvegarde"
        nameHint={(n) => `→ ${(n || 'sauvegarde').trim().replace(/\s+/g, '-').toLowerCase()}-${fmtDateTiret()}`}
        substances={[...substances, ...archivedSubstances].map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        confirmLabel="Créer"
        onCancel={() => setCreateSnapshotModal(false)}
        onConfirm={async (ids, nameInput) => {
          const base = (nameInput || 'sauvegarde').trim().replace(/\s+/g, '-').toLowerCase();
          const fullName = `${base}-${fmtDateTiret()}`;
          await createSnapshotFromLive(fullName, ids);
          setCreateSnapshotModal(false);
        }}
      />

      {/* Modal Restaurer / Fusionner (UI unifiée) */}
      <SubstanceSelectModal
        visible={!!fusionModal}
        title="Restaurer / Fusionner"
        intro="Les substances cochées seront ajoutées aux données actives. Les doublons (même heure exacte) sont ignorés."
        substances={fusionModal?.parsed?.substances?.map((s) => ({ id: s.id, name: s.name, color: s.color })) || []}
        initialSelectedIds={fusionModal?.subIds || null}
        confirmLabel="Restaurer"
        onCancel={() => setFusionModal(null)}
        onConfirm={(ids) => {
          setFusionModal((prev) => prev ? { ...prev, subIds: ids } : null);
          // Launch fusion via next tick with ids set
          setTimeout(() => {
            handleFusionWithIds(ids);
          }, 50);
        }}
      />

      {/* Overlay spinner fusion */}
      <Modal visible={fusionBusy && !conflictModal} transparent animationType="fade">
        <View style={styles.spinnerOverlay}>
          <View style={styles.spinnerCard}>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={styles.spinnerText}>Fusion en cours…</Text>
          </View>
        </View>
      </Modal>

      {/* Modal conflit de nom */}
      <Modal visible={!!conflictModal} transparent animationType="fade">
        <View style={styles.spinnerOverlay}>
          <View style={styles.conflictCard}>
            <Text style={styles.conflictTitle}>Nom déjà existant</Text>
            <Text style={styles.conflictMessage}>
              Une substance nommée "{conflictModal?.parsedSub?.name}" existe déjà. Que veux-tu faire ?
            </Text>
            <TouchableOpacity onPress={() => resolveConflict('merge')} style={styles.conflictBtn}>
              <Text style={styles.conflictBtnText}>Fusionner</Text>
              <Text style={styles.conflictBtnHint}>Ajouter les consos à la substance existante</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => resolveConflict('number')} style={styles.conflictBtn}>
              <Text style={styles.conflictBtnText}>Numéroter</Text>
              <Text style={styles.conflictBtnHint}>Créer "{conflictModal?.parsedSub?.name} (2)"</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => resolveConflict('ignore')} style={styles.conflictBtn}>
              <Text style={styles.conflictBtnText}>Ignorer</Text>
              <Text style={styles.conflictBtnHint}>Ne pas importer cette substance</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingVertical: theme.spacing.lg, paddingBottom: theme.spacing.xl },
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
  subsectionTitle: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '400',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowIcon: { marginRight: theme.spacing.md },
  rowLabel: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowLabelDanger: { color: theme.colors.danger, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowDangerHint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontWeight: '300', marginTop: 2, fontStyle: 'italic' },
  rowValue: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowValueFaint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontStyle: 'italic' },
  snapRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  snapContent: { flex: 1 },
  snapNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  redDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B30' },
  snapName: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  snapInfo: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, marginTop: 3, fontWeight: '300' },
  creditWrap: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  creditText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    letterSpacing: 2,
    textTransform: 'lowercase',
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: theme.spacing.lg,
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  modalTitle: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '400', marginBottom: theme.spacing.md, textAlign: 'center' },
  modalLabel: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300', marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  modalHint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontStyle: 'italic', marginBottom: theme.spacing.sm },
  modalInput: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
  },
  checkboxRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxLabel: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: theme.spacing.lg, marginTop: theme.spacing.md,
  },
  modalCancelText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300' },
  modalOkText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '500' },

  spinnerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center',
  },
  spinnerCard: {
    backgroundColor: theme.colors.surface, padding: theme.spacing.xl,
    borderRadius: 8, alignItems: 'center', gap: theme.spacing.md,
    minWidth: 180,
  },
  spinnerText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300',
  },
  conflictCard: {
    backgroundColor: theme.colors.surface, padding: theme.spacing.lg,
    borderRadius: 8, width: '85%', borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  conflictTitle: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '400', textAlign: 'center', marginBottom: theme.spacing.sm,
  },
  conflictMessage: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', textAlign: 'center', marginBottom: theme.spacing.md, lineHeight: 20,
  },
  conflictBtn: {
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
  },
  conflictBtnText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '400' },
  conflictBtnHint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, marginTop: 2, fontStyle: 'italic' },
});
