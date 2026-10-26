// Wizard de restauration/fusion depuis un snapshot interne. Même UI qu'ImportWizard
// mais sans l'étape PIN (le snapshot est déjà en clair dans la DB).

import { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  Animated, ActivityIndicator, KeyboardAvoidingView, Platform, BackHandler,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import haptics from '../utils/haptics';
import { performFusion } from '../utils/fusion';
import { fmtDateTiretHM, parseSnapshot } from '../utils/snapshots';
import { dbGetSnapshotData } from '../db';
import { useStore } from '../store';
import { useKeepAwake } from '../utils/keepAwake';

const DIM_BORDER = '#2F2F2F';
const DIM_TEXT = '#3A3A3A';

function SubCard({ sub, isChecked, onToggle }) {
  const scale = useRef(new Animated.Value(1)).current;
  const triggerBubble = () => {
    scale.setValue(0.95);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.05, useNativeDriver: true, speed: 20, bounciness: 10 }),
      Animated.spring(scale, { toValue: 1.02, useNativeDriver: true, speed: 20, bounciness: 8 }),
      Animated.spring(scale, { toValue: 1.0, useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
  };
  const handlePress = () => { haptics.light(); triggerBubble(); onToggle(); };
  const borderColor = isChecked ? sub.color : DIM_BORDER;
  const nameColor = isChecked ? theme.colors.text : DIM_TEXT;
  const iconColor = isChecked ? sub.color : DIM_TEXT;
  const consCount = sub._consCount ?? 0;
  const days = sub._days ?? 0;
  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 8 }}>
      <Pressable onPress={handlePress} style={[styles.subCard, { borderColor }]}>
        <View style={[styles.iconWrap, { borderColor: iconColor }]}>
          <View style={[styles.iconDot, { backgroundColor: iconColor }]} />
        </View>
        <View style={styles.cardMiddle}>
          <Text style={[styles.cardName, { color: nameColor }]} numberOfLines={1}>{sub.name}</Text>
          <Text style={[styles.cardStats, { color: isChecked ? theme.colors.textMuted : DIM_TEXT }]}>
            {consCount} prise{consCount > 1 ? 's' : ''} · {days}j
          </Text>
        </View>
        {isChecked && (
          <MaterialCommunityIcons name="check" size={22} color={sub.color} style={styles.check} />
        )}
      </Pressable>
    </Animated.View>
  );
}

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
  const [step, setStep] = useState('loading'); // 'loading' | 'select' | 'busy' | 'result' | 'conflict'
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});
  const [busyLabel, setBusyLabel] = useState('Restauration en cours…');
  const [result, setResult] = useState(null);
  const [conflict, setConflict] = useState(null);

  useKeepAwake('restore-wizard');

  useEffect(() => {
    if (!visible || !snapshotId) return;
    setStep('loading');
    setResult(null);
    setConflict(null);
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
        setResult({ ok: false, message: e.message || 'Lecture du snapshot impossible.' });
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

  const askConflictChoice = (parsedSub) => new Promise((resolve) => {
    setConflict({ parsedSub, resolve });
  });
  const resolveConflict = (choice) => {
    if (conflict) { conflict.resolve(choice); setConflict(null); }
  };

  const doRestore = async () => {
    const selectedIds = parsed.substances.filter((s) => selected[s.id]).map((s) => s.id);
    setBusyLabel('Restauration en cours…');
    setStep('busy');
    try {
      await useStore.getState().createSnapshotFromLive(`avant-restauration-${fmtDateTiretHM()}`);
      const activeSubs = [
        ...useStore.getState().substances,
        ...useStore.getState().archivedSubstances,
      ];
      const fused = await performFusion({
        parsed,
        activeSubs,
        substanceIds: new Set(selectedIds),
        onConflict: askConflictChoice,
      });
      await useStore.getState().loadAll();
      haptics.success();
      setResult({
        ok: true,
        message:
          `${fused.added} ajoutée(s), ${fused.merged} fusionnée(s), ` +
          `${fused.numbered} numérotée(s), ${fused.ignored} ignorée(s).\n` +
          `${fused.consosAdded} conso(s) restaurée(s).`,
      });
      setStep('result');
      onComplete?.();
    } catch (e) {
      setResult({ ok: false, message: e.message || String(e) });
      setStep('result');
    }
  };

  const parsedStats = parsed ? statsFromParsed(parsed) : {};
  const subList = parsed
    ? parsed.substances.map((s) => ({
        ...s,
        _consCount: parsedStats[s.id]?.consCount ?? 0,
        _days: parsedStats[s.id]?.days ?? 0,
      }))
    : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
                Les substances cochées seront ajoutées aux données actives. Un snapshot est créé juste avant.
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
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {subList.map((sub) => (
                  <SubCard
                    key={sub.id}
                    sub={sub}
                    isChecked={!!selected[sub.id]}
                    onToggle={() => toggleSub(sub.id)}
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

          {step === 'busy' && !conflict && (
            <View style={styles.busyWrap}>
              <ActivityIndicator size="large" color={theme.colors.text} />
              <Text style={styles.busyText}>{busyLabel}</Text>
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

          {conflict && (
            <View style={styles.conflictInner}>
              <Text style={styles.conflictTitle}>Nom déjà existant</Text>
              <Text style={styles.conflictMessage}>
                Une substance nommée "{conflict.parsedSub.name}" existe déjà. Que veux-tu faire ?
              </Text>
              <TouchableOpacity onPress={() => resolveConflict('merge')} style={styles.conflictBtn}>
                <Text style={styles.conflictBtnText}>Fusionner</Text>
                <Text style={styles.conflictBtnHint}>Ajouter les consos à la substance existante</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => resolveConflict('number')} style={styles.conflictBtn}>
                <Text style={styles.conflictBtnText}>Numéroter</Text>
                <Text style={styles.conflictBtnHint}>Créer "{conflict.parsedSub.name} (2)"</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => resolveConflict('ignore')} style={styles.conflictBtn}>
                <Text style={styles.conflictBtnText}>Ignorer</Text>
                <Text style={styles.conflictBtnHint}>Ne pas importer cette substance</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: theme.spacing.lg,
    width: '100%',
    maxHeight: '90%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '400', textAlign: 'center', marginBottom: theme.spacing.sm,
  },
  intro: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', lineHeight: 20,
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
  listContent: { paddingVertical: 4 },
  subCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderRadius: 8, gap: 12,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  iconDot: { width: 12, height: 12, borderRadius: 6 },
  cardMiddle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 16, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },
  cardStats: { fontSize: 11, fontWeight: '400', marginTop: 2, letterSpacing: 0.5, textAlign: 'center' },
  check: { marginLeft: 4 },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: theme.spacing.lg, marginTop: theme.spacing.md,
  },
  cancelText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300' },
  confirmText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '500' },
  busyWrap: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: theme.spacing.xl, gap: theme.spacing.md,
  },
  busyText: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  resultWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg, gap: theme.spacing.sm,
  },
  resultTitle: {
    fontSize: theme.font.sizes.md, fontWeight: '500',
    marginTop: theme.spacing.sm,
  },
  resultMessage: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', textAlign: 'center', marginBottom: theme.spacing.sm,
  },
  conflictInner: { paddingVertical: theme.spacing.md },
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
