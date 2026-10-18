import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, TextInput, Modal, Alert,
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

function formatDateLongFR(ts) {
  const d = new Date(ts);
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function SettingsScreen() {
  const navigation = useNavigation();
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

  const handleFusion = async () => {
    if (!fusionModal) return;
    const { snap, subIds } = fusionModal;
    await fusionSnapshot(snap.id, subIds);
    setFusionModal(null);
    Alert.alert('Fusion terminée', 'Les données du snapshot ont été fusionnées.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Soutenir le projet</Text>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Donations')}>
        <Text style={styles.rowLabel}>Soutenir le développement</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {/* ===== GESTIONNAIRE DE SAUVEGARDE ET ARCHIVES ===== */}
      <Text style={styles.sectionTitle}>Gestionnaire de sauvegarde et archives</Text>

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

      {/* ===== À PROPOS ===== */}
      <Text style={styles.sectionTitle}>À propos</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Version</Text>
        <Text style={styles.rowValue}>1.1.14</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Consos enregistrées depuis</Text>
        <Text style={styles.rowValue}>
          {firstConsoTs ? formatDateLongFR(firstConsoTs) : '—'}
        </Text>
      </View>

      {/* ===== ZONE DE DANGER (tout en bas) ===== */}
      <Text style={styles.sectionTitle}>Zone de danger</Text>
      <TouchableOpacity style={styles.row} onPress={() => setPendingWipeStep(1)}>
        <Text style={styles.rowLabelDanger}>Remise à zéro complète</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.danger} />
      </TouchableOpacity>

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
                  id: 'fusion',
                  label: 'Fusionner',
                  icon: 'set-merge',
                  onPress: () => openFusionModal(snapshotAction.snap),
                },
                {
                  id: 'export',
                  label: 'Exporter',
                  icon: 'floppy',
                  onPress: () => {
                    navigation.navigate('Export', { snapshotId: snapshotAction.snap.id });
                    setSnapshotAction(null);
                  },
                },
                {
                  id: 'download',
                  label: 'Télécharger',
                  icon: 'download-outline',
                  onPress: () => {
                    // Même flow qu'Exporter mais via le même ExportScreen (chiffré PIN)
                    navigation.navigate('Export', { snapshotId: snapshotAction.snap.id, downloadMode: true });
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

      {/* Modal Créer une sauvegarde */}
      <Modal visible={createSnapshotModal} transparent animationType="fade" onRequestClose={() => setCreateSnapshotModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Créer une sauvegarde</Text>
            <Text style={styles.modalLabel}>Nom (optionnel)</Text>
            <TextInput
              value={newSnapName}
              onChangeText={setNewSnapName}
              placeholder="sauvegarde"
              placeholderTextColor={theme.colors.textFaint}
              style={styles.modalInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalHint}>
              → {(newSnapName || 'sauvegarde').trim().replace(/\s+/g, '-').toLowerCase()}-{fmtDateTiret()}
            </Text>

            <Text style={styles.modalLabel}>Substances à inclure</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {[...substances, ...archivedSubstances].map((sub) => {
                const checked = newSnapSubIds.includes(sub.id);
                return (
                  <Pressable
                    key={sub.id}
                    onPress={() => {
                      setNewSnapSubIds((prev) =>
                        prev.includes(sub.id)
                          ? prev.filter((id) => id !== sub.id)
                          : [...prev, sub.id]
                      );
                    }}
                    style={styles.checkboxRow}
                  >
                    <View style={[
                      styles.checkbox,
                      { borderColor: sub.color },
                      checked && { backgroundColor: sub.color },
                    ]}>
                      {checked && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                    </View>
                    <Text style={[styles.checkboxLabel, sub.archived && { fontStyle: 'italic' }]}>
                      {sub.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCreateSnapshotModal(false)}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateSnapshot} disabled={newSnapSubIds.length === 0}>
                <Text style={[styles.modalOkText, newSnapSubIds.length === 0 && { opacity: 0.4 }]}>
                  Créer
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Fusion */}
      <Modal visible={!!fusionModal} transparent animationType="fade" onRequestClose={() => setFusionModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Fusionner</Text>
            <Text style={styles.modalHint}>
              Les substances cochées seront ajoutées aux données actives. Les doublons (même heure exacte) sont ignorés.
            </Text>

            <Text style={styles.modalLabel}>Substances à fusionner</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {fusionModal?.parsed?.substances.map((sub) => {
                const checked = fusionModal.subIds.includes(sub.id);
                return (
                  <Pressable
                    key={sub.id}
                    onPress={() => {
                      setFusionModal((prev) => ({
                        ...prev,
                        subIds: prev.subIds.includes(sub.id)
                          ? prev.subIds.filter((id) => id !== sub.id)
                          : [...prev.subIds, sub.id],
                      }));
                    }}
                    style={styles.checkboxRow}
                  >
                    <View style={[
                      styles.checkbox,
                      { borderColor: sub.color },
                      checked && { backgroundColor: sub.color },
                    ]}>
                      {checked && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                    </View>
                    <Text style={styles.checkboxLabel}>{sub.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setFusionModal(null)}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleFusion} disabled={!fusionModal?.subIds?.length}>
                <Text style={[styles.modalOkText, !fusionModal?.subIds?.length && { opacity: 0.4 }]}>
                  Fusionner
                </Text>
              </TouchableOpacity>
            </View>
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
});
