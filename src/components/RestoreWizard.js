// Wizard de restauration/fusion depuis un snapshot interne.
// Même UI qu'ImportWizard mais sans PIN. Fusion automatique par nom + dédoublonnage timestamp.

import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, BackHandler,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import SubCard from './SubCard';
import haptics from '../utils/haptics';
import { performFusion } from '../utils/fusion';
import { fmtDateTiretHM, parseSnapshot } from '../utils/snapshots';
import { dbGetSnapshotData } from '../db';
import { useStore } from '../store';
import { useKeepAwake } from '../utils/keepAwake';

function statsFromParsed(parsed) {
  const by = {};
  for (const c of parsed.consumptions) {
    const id = c.substanceId;
    if (!by[id]) by[id] = { consCount: 0, firstTs: null };
    by[id].consCount += 1;
    if (by[id].firstTs == null || c.timestamp < by[id].firstTs) by[id].firstTs = c.timestamp;
  }
  const now = Date.now();
  const result = {};
  for (const id of Object.keys(by)) {
    const b = by[id];
    const days = b.firstTs ? Math.max(1, Math.round((now - b.firstTs) / 86400000)) : 0;
    result[id] = { consCount: b.consCount, days };
  }
  return result;
}

export default function RestoreWizard({ visible, snapshotId, onClose, onComplete }) {
  const [step, setStep] = useState('loading');
  // 'loading' | 'select' | 'importing' | 'result'
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});
  const [busyLabel, setBusyLabel] = useState('Restauration…');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState(null);

  useKeepAwake('restore-wizard');

  useEffect(() => {
    if (!visible || !snapshotId) return;
    setStep('loading');
    setProgress({ current: 0, total: 0 });
    setResult(null);
    (async () => {
      try {
        const data = await dbGetSnapshotData(snapshotId);
        if (!data) {
          setResult({ ok: false, message: 'Snapshot introuvable.' });
          setStep('result');
          return;
        }
        const p = parseSnapshot(data);
        setParsed(p);
        const sel = {};
        for (const s of p.substances) sel[s.id] = true;
        setSelected(sel);
        setStep('select');
      } catch (e) {
        setResult({ ok: false, message: e.message || 'Lecture impossible.' });
        setStep('result');
      }
    })();
  }, [visible, snapshotId]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'select') { onClose?.(); return true; }
      if (step === 'result') { onClose?.(); return true; }
      return true;
    });
    return () => sub.remove();
  }, [visible, step, onClose]);

  const toggleSub = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const allSelected = parsed?.substances.every((s) => selected[s.id]);
  const noneSelected = parsed?.substances.every((s) => !selected[s.id]);
  const toggleAll = () => {
    haptics.light();
    const next = {}; for (const s of parsed.substances) next[s.id] = !allSelected;
    setSelected(next);
  };

  const doRestore = async () => {
    const selectedIds = parsed.substances.filter((s) => selected[s.id]).map((s) => s.id);
    setBusyLabel('Préparation…');
    setProgress({ current: 0, total: 0 });
    setStep('importing');
    try {
      await useStore.getState().createSnapshotFromLive(`avant-restauration-${fmtDateTiretHM()}`);
      const activeSubs = [
        ...useStore.getState().substances,
        ...useStore.getState().archivedSubstances,
      ];
      setBusyLabel('Restauration en cours…');
      const fused = await performFusion({
        parsed,
        activeSubs,
        substanceIds: new Set(selectedIds),
        onProgress: (cur, tot) => setProgress({ current: cur, total: tot }),
      });
      await useStore.getState().loadAll();
      haptics.success();
      setResult({
        ok: true,
        message:
          `${fused.added} nouvelles · ${fused.merged} fusionnées · ${fused.alreadyPresent} déjà présentes\n` +
          `${fused.consosAdded} prises restaurées · ${fused.consosSkipped} déjà présentes`,
      });
      setStep('result');
      onComplete?.();
    } catch (e) {
      setResult({ ok: false, message: e.message || String(e) });
      setStep('result');
    }
  };

  const parsedStats = parsed ? statsFromParsed(parsed) : {};
  const subList = parsed ? parsed.substances.map((s) => ({ ...s })) : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {step === 'loading' && (
            <View style={styles.busyWrap}>
              <ActivityIndicator size="large" color={theme.colors.text} />
              <Text style={styles.busyText}>Chargement…</Text>
            </View>
          )}

          {step === 'select' && parsed && (
            <>
              <Text style={styles.title}>Restaurer / Fusionner</Text>
              <Text style={styles.intro}>
                Les substances cochées seront ajoutées. Un snapshot est créé juste avant.
              </Text>
              <View style={styles.header}>
                <Text style={styles.sectionLabel}>
                  {parsed.substances.length} substance{parsed.substances.length > 1 ? 's' : ''}
                </Text>
                <TouchableOpacity onPress={toggleAll}>
                  <Text style={styles.toggleAllText}>
                    {allSelected ? 'Tout décocher' : 'Tout cocher'}
                  </Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 4 }}>
                {subList.map((sub) => (
                  <SubCard
                    key={sub.id}
                    sub={sub}
                    isChecked={!!selected[sub.id]}
                    onToggle={() => toggleSub(sub.id)}
                    stats={parsedStats[sub.id]}
                  />
                ))}
              </ScrollView>
              <View style={styles.actions}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.cancelText}>Fermer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={doRestore} disabled={noneSelected}>
                  <Text style={[styles.confirmText, noneSelected && { opacity: 0.4 }]}>Restaurer</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'importing' && (
            <View style={styles.busyWrap}>
              <Text style={styles.busyText}>{busyLabel}</Text>
              <ProgressBar current={progress.current} total={progress.total} />
              <Text style={styles.progressText}>
                {progress.total > 0 ? `${progress.current} / ${progress.total}` : 'préparation…'}
              </Text>
            </View>
          )}

          {step === 'result' && (
            <View style={styles.resultWrap}>
              <MaterialCommunityIcons
                name={result?.ok ? 'check-circle-outline' : 'close-circle-outline'}
                size={48}
                color={result?.ok ? '#01C853' : theme.colors.danger}
              />
              <Text style={[styles.resultTitle, { color: result?.ok ? theme.colors.text : theme.colors.danger }]}>
                {result?.ok ? 'Restauration terminée' : "La restauration n'a pas pu aboutir"}
              </Text>
              <Text style={styles.resultMessage}>{result?.message}</Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.confirmText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <View style={progressStyles.wrap}>
      <View style={[progressStyles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  wrap: {
    width: '80%', height: 6,
    backgroundColor: theme.colors.border, borderRadius: 3,
    overflow: 'hidden', marginVertical: theme.spacing.sm,
  },
  fill: { height: '100%', backgroundColor: theme.colors.text, borderRadius: 3 },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 10,
    padding: theme.spacing.lg, width: '100%', maxWidth: 440, maxHeight: '90%',
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '600', textAlign: 'center', marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  intro: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', lineHeight: 20,
    marginBottom: theme.spacing.md, textAlign: 'center',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: theme.spacing.sm, marginTop: theme.spacing.sm,
  },
  sectionLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
  },
  toggleAllText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400',
    textDecorationLine: 'underline',
  },
  list: { maxHeight: 380 },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: theme.spacing.lg, marginTop: theme.spacing.md,
  },
  cancelText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '400' },
  confirmText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600' },
  busyWrap: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: theme.spacing.xl, gap: theme.spacing.md,
  },
  busyText: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400' },
  progressText: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', fontVariant: ['tabular-nums'],
  },
  resultWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg, gap: theme.spacing.sm,
  },
  resultTitle: {
    fontSize: theme.font.sizes.md, fontWeight: '600',
    marginTop: theme.spacing.sm, textAlign: 'center',
  },
  resultMessage: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', textAlign: 'center', marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
});
