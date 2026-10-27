import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { dbGetFirstConsumptionTimestamp, dbGetSnapshotData, dbGetAllConsumptions } from '../db';
import ConfirmModal from '../components/ConfirmModal';
import ActionSheet from '../components/ActionSheet';
import ExportIcon from '../components/ExportIcon';
import ImportIcon from '../components/ImportIcon';
import InfoModal from '../components/InfoModal';
import ResultModal from '../components/ResultModal';
import SubstanceSelectModal from '../components/SubstanceSelectModal';
import ExportWizard from '../components/ExportWizard';
import ImportWizard from '../components/ImportWizard';
import RestoreWizard from '../components/RestoreWizard';
import { fmtDateTiret, fmtSize, parseSnapshot } from '../utils/snapshots';
import { useKeepAwake } from '../utils/keepAwake';
import appJson from '../../app.json';

const APP_VERSION = appJson?.expo?.version || '?';

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
  const markSnapshotsConsulted = useStore((s) => s.markSnapshotsConsulted);
  const loadSnapshots = useStore((s) => s.loadSnapshots);

  const [firstConsoTs, setFirstConsoTs] = useState(null);
  const [pendingWipeStep, setPendingWipeStep] = useState(0);
  const [wipeToastVisible, setWipeToastVisible] = useState(false);

  const [snapshotAction, setSnapshotAction] = useState(null);
  const [pendingSnapDelete, setPendingSnapDelete] = useState(null);
  const [restoreSnapId, setRestoreSnapId] = useState(null);
  const [importWizardVisible, setImportWizardVisible] = useState(false);
  const [createSnapshotModal, setCreateSnapshotModal] = useState(false);
  const [snapshotStats, setSnapshotStats] = useState({});
  const [infoModal, setInfoModal] = useState(null);

  // ExportWizard source : live ou snapshot
  const [exportSource, setExportSource] = useState(null);
  const [liveStatsById, setLiveStatsById] = useState({});

  // Debug button : liste de modals textuelles à parcourir
  const [debugModals, setDebugModals] = useState([]);
  const [debugIdx, setDebugIdx] = useState(0);

  useFocusEffect(
    useCallback(() => { markSnapshotsConsulted(); }, [markSnapshotsConsulted])
  );

  useEffect(() => {
    dbGetFirstConsumptionTimestamp().then(setFirstConsoTs);
    loadSnapshots();
  }, []);

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

  const statsFromConsos = (consos) => {
    const byId = {};
    const now = Date.now();
    for (const c of consos) {
      const sid = c.substance_id ?? c.substanceId;
      if (!byId[sid]) byId[sid] = { consCount: 0, firstTs: null };
      byId[sid].consCount++;
      if (byId[sid].firstTs == null || c.timestamp < byId[sid].firstTs) byId[sid].firstTs = c.timestamp;
    }
    const out = {};
    for (const sid of Object.keys(byId)) {
      const b = byId[sid];
      out[sid] = {
        consCount: b.consCount,
        days: b.firstTs ? Math.max(1, Math.round((now - b.firstTs) / 86400000)) : 0,
      };
    }
    return out;
  };

  const openExportLive = async () => {
    const consos = await dbGetAllConsumptions();
    const subs = [...substances, ...archivedSubstances]
      .map((s) => ({ id: s.id, name: s.name, color: s.color }));
    setExportSource({ subs, consos, statsById: statsFromConsos(consos) });
  };

  const openExportSnapshot = async (snapId) => {
    const data = await dbGetSnapshotData(snapId);
    if (!data) {
      setInfoModal({ title: 'Erreur', message: 'Snapshot introuvable.' });
      return;
    }
    const parsed = parseSnapshot(data);
    const subs = parsed.substances.map((s) => ({ id: s.id, name: s.name, color: s.color }));
    const consos = parsed.consumptions.map((c) => ({
      id: c.id, substance_id: c.substanceId, timestamp: c.timestamp,
      dosage: c.dosage, notes: c.notes, created_at: c.createdAt,
    }));
    setExportSource({ subs, consos, statsById: statsFromConsos(consos) });
  };

  const openImportWizard = () => setImportWizardVisible(true);

  const openCreateSnapshotModal = async () => {
    const consos = await dbGetAllConsumptions();
    setLiveStatsById(statsFromConsos(consos));
    setCreateSnapshotModal(true);
  };

  // Debug : enchaîne les VRAIES modals de l'app (celles qui ne font qu'info + OK, pas celles
  // avec logique de confirmation / sélection substance).
  const openDebugModals = () => {
    const list = [
      {
        kind: 'result-ok',
        title: 'Sauvegarde enregistrée',
        message: 'almanac-export-27-10-2026-0049.almanac\n1714 prises · 26 substances',
      },
      {
        kind: 'result-ko',
        title: "La sauvegarde n'a pas pu aboutir",
        message: "Permission d'écriture refusée ou dossier non sélectionné.",
      },
      {
        kind: 'result-ko',
        title: "La sauvegarde n'a pas pu aboutir",
        message: "Erreur SAF :\n[createFile] IOException: Could not write to file",
      },
      {
        kind: 'result-ok',
        title: 'Import terminé',
        message: '2 nouvelles · 24 fusionnées · 0 déjà présentes\n1714 prises importées · 0 déjà présentes',
      },
      {
        kind: 'result-ok',
        title: 'Import terminé',
        message: '0 nouvelles · 0 fusionnées · 26 déjà présentes\n0 prises importées · 1714 déjà présentes',
      },
      {
        kind: 'result-ko',
        title: "L'import n'a pas pu aboutir",
        message: 'Format de fichier invalide.',
      },
      {
        kind: 'result-ok',
        title: 'Restauration terminée',
        message: '0 nouvelles · 26 fusionnées · 0 déjà présentes\n1714 prises restaurées · 0 déjà présentes',
      },
      {
        kind: 'info',
        title: 'Sauvegarde créée',
        message: 'Une sauvegarde a été créée. Vous pouvez la restaurer ou la supprimer définitivement via Paramètres.',
      },
      {
        kind: 'info',
        title: 'Erreur création sauvegarde',
        message: 'Database locked. Réessayez dans quelques secondes.',
      },
      {
        kind: 'info',
        title: 'Erreur',
        message: 'Snapshot introuvable.',
      },
    ];
    setDebugModals(list);
    setDebugIdx(0);
  };

  const allSubsForModal = [...substances, ...archivedSubstances]
    .map((s) => ({ id: s.id, name: s.name, color: s.color }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ===== SOUTENIR ===== */}
      <Text style={styles.sectionTitle}>Soutenir le projet</Text>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Donations')}>
        <Text style={styles.rowLabel}>Soutenir le développement</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {/* ===== ACTIONS (sans titre) ===== */}
      <View style={{ height: theme.spacing.lg }} />
      <TouchableOpacity style={styles.row} onPress={openImportWizard}>
        <View style={styles.rowLeft}>
          <View style={styles.rowIcon}><ImportIcon size={18} color={theme.colors.text} /></View>
          <Text style={styles.rowLabel}>Importer</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={openExportLive}>
        <View style={styles.rowLeft}>
          <View style={styles.rowIcon}><ExportIcon size={18} color={theme.colors.text} /></View>
          <Text style={styles.rowLabel}>Exporter</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.rowNoBorder} onPress={openCreateSnapshotModal}>
        <View style={styles.rowLeft}>
          <Ionicons name="add" size={20} color={theme.colors.text} style={styles.rowIcon} />
          <Text style={styles.rowLabel}>Créer une sauvegarde</Text>
        </View>
      </TouchableOpacity>

      {/* ===== GESTIONNAIRE DE SAUVEGARDES = liste snapshots seule ===== */}
      <Text style={styles.sectionTitle}>Gestionnaire de sauvegardes</Text>
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

      {/* ===== ZONE DE DANGER ===== */}
      <Text style={styles.sectionTitle}>Zone de danger</Text>
      <TouchableOpacity style={styles.row} onPress={() => setPendingWipeStep(1)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabelDanger}>Remise à zéro complète</Text>
          <Text style={styles.rowDangerHint}>Vos données resteront dans le gestionnaire de sauvegardes</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.danger} />
      </TouchableOpacity>

      {/* ===== DEBUG ===== */}
      <Text style={styles.sectionTitle}>Debug</Text>
      <TouchableOpacity style={styles.row} onPress={openDebugModals}>
        <Text style={styles.rowLabel}>Afficher toutes les modals textuelles</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {/* ===== À PROPOS ===== */}
      <Text style={styles.sectionTitle}>À propos</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Version</Text>
        <Text style={styles.rowValue}>{APP_VERSION}</Text>
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
                  onPress: () => {
                    const sid = snapshotAction.snap.id;
                    setSnapshotAction(null);
                    setRestoreSnapId(sid);
                  },
                },
                {
                  id: 'export',
                  label: 'Exporter',
                  icon: 'download-outline',
                  onPress: async () => {
                    const sid = snapshotAction.snap.id;
                    setSnapshotAction(null);
                    await openExportSnapshot(sid);
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

      <InfoModal
        visible={wipeToastVisible}
        title="Sauvegarde créée"
        message="Une sauvegarde a été créée. Vous pouvez la restaurer ou la supprimer définitivement via Paramètres."
        onClose={() => { setWipeToastVisible(false); navigation.goBack(); }}
      />

      {/* ===== Wizards ===== */}
      <ExportWizard
        visible={!!exportSource}
        substances={exportSource?.subs || []}
        statsById={exportSource?.statsById || {}}
        consumptions={exportSource?.consos || []}
        onClose={() => setExportSource(null)}
      />

      <ImportWizard
        visible={importWizardVisible}
        onClose={() => setImportWizardVisible(false)}
      />

      <RestoreWizard
        visible={!!restoreSnapId}
        snapshotId={restoreSnapId}
        onClose={() => setRestoreSnapId(null)}
      />

      {/* ===== Créer sauvegarde modal ===== */}
      <SubstanceSelectModal
        visible={createSnapshotModal}
        title="Créer une sauvegarde"
        showNameField
        nameFieldLabel="Nom (optionnel)"
        nameFieldPlaceholder="sauvegarde"
        nameHint={(n) => `→ ${(n || 'sauvegarde').trim().replace(/\s+/g, '-').toLowerCase()}-${fmtDateTiret()}`}
        substances={allSubsForModal}
        statsById={liveStatsById}
        confirmLabel="Créer"
        onCancel={() => setCreateSnapshotModal(false)}
        onConfirm={async (ids, nameInput) => {
          const base = (nameInput || 'sauvegarde').trim().replace(/\s+/g, '-').toLowerCase();
          const fullName = `${base}-${fmtDateTiret()}`;
          try {
            await createSnapshotFromLive(fullName, ids);
            setCreateSnapshotModal(false);
          } catch (e) {
            setCreateSnapshotModal(false);
            setInfoModal({ title: 'Erreur création sauvegarde', message: e.message || String(e) });
          }
        }}
      />

      <InfoModal
        visible={!!infoModal}
        title={infoModal?.title}
        message={infoModal?.message}
        onClose={() => setInfoModal(null)}
      />

      {/* Debug : enchaîne les vraies modals */}
      {debugModals.length > 0 && debugIdx < debugModals.length && (() => {
        const m = debugModals[debugIdx];
        const label = debugIdx === debugModals.length - 1 ? 'Fermer' : 'Suivant';
        const close = () => {
          const next = debugIdx + 1;
          if (next >= debugModals.length) { setDebugModals([]); setDebugIdx(0); }
          else setDebugIdx(next);
        };
        if (m.kind === 'result-ok' || m.kind === 'result-ko') {
          return (
            <ResultModal
              visible
              ok={m.kind === 'result-ok'}
              title={m.title}
              message={m.message}
              buttonLabel={label}
              onClose={close}
            />
          );
        }
        return (
          <InfoModal
            visible
            title={m.title}
            message={m.message}
            buttonLabel={label}
            onClose={close}
          />
        );
      })()}
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
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  // Variante sans border-bottom pour la dernière ligne d'un groupe (Créer sauvegarde)
  rowNoBorder: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowIcon: { marginRight: theme.spacing.md },
  rowLabel: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowLabelDanger: { color: theme.colors.danger, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowDangerHint: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '400', marginTop: 3 },
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
});
