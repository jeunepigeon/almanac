// Wizard d'import v1.1.18.
// Flow compact : pick → pin → select
// - PIN validé AVANT déchiffrement
// - Fix bug "double tap Déchiffrer" (onPressIn au lieu de onPress sur le bouton)
// - Fusion : nouveau count split (nouvelles / fusionnées / déjà présentes / prises / déjà présentes)

import { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, BackHandler, Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '../theme';
import PinField from './PinField';
import SubCard from './SubCard';
import haptics from '../utils/haptics';
import { parseExportFile } from '../utils/exportImport';
import { performFusion } from '../utils/fusion';
import { fmtDateTiretHM } from '../utils/snapshots';
import { useStore } from '../store';
import { useKeepAwake } from '../utils/keepAwake';
import { yieldToUI } from '../utils/useKeyboard';

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

function formatFusionResult(fused) {
  // Tout au pluriel, pas de (s)
  return (
    `${fused.added} nouvelles · ${fused.merged} fusionnées · ${fused.alreadyPresent} déjà présentes\n` +
    `${fused.consosAdded} prises importées · ${fused.consosSkipped} déjà présentes`
  );
}

export default function ImportWizard({ visible, onClose, onComplete }) {
  const [step, setStep] = useState('pick');
  const [fileContent, setFileContent] = useState(null);
  const [pin, setPin] = useState('');
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});
  const [busyLabel, setBusyLabel] = useState('Déchiffrement en cours…');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState(null);
  const pinRef = useRef(null);

  useKeepAwake('import-wizard');

  useEffect(() => {
    if (!visible) return;
    setStep('pick');
    setFileContent(null); setPin(''); setParsed(null); setSelected({});
    setProgress({ current: 0, total: 0 });
    setResult(null);
  }, [visible]);

  useEffect(() => {
    if (step === 'pin') {
      const t = setTimeout(() => pinRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [step]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'pick') { onClose?.(); return true; }
      if (step === 'pin') { Keyboard.dismiss(); setStep('pick'); return true; }
      if (step === 'select') { setStep('pin'); return true; }
      if (step === 'result') { onClose?.(); return true; }
      return true;
    });
    return () => sub.remove();
  }, [visible, step, onClose]);

  const pickFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (r.canceled) return;
      const asset = r.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      setFileContent(content);
      setStep('pin');
    } catch (e) {
      setResult({ ok: false, message: e.message || 'Lecture du fichier impossible.' });
      setStep('result');
    }
  };

  const busyRef = useRef(false);
  const submitPin = async () => {
    if (busyRef.current) return;
    if (pin.length !== 4) {
      pinRef.current?.shake('4 chiffres requis');
      return;
    }
    busyRef.current = true;
    Keyboard.dismiss();
    // Spinner AFFICHÉ avant le calcul : la vérif du PIN (PBKDF2) bloque le thread JS plusieurs secondes.
    setBusyLabel('Déchiffrement en cours…');
    setStep('busy');
    await yieldToUI();
    try {
      const data = parseExportFile(fileContent, pin);
      setParsed(data);
      const sel = {};
      for (const s of data.substances) sel[s.id] = true;
      setSelected(sel);
      setStep('select');
    } catch (e) {
      setPin('');
      setStep('pin');
      setTimeout(() => {
        pinRef.current?.shake('Code PIN incorrect');
        pinRef.current?.focus();
      }, 120);
    } finally {
      busyRef.current = false;
    }
  };

  const toggleSub = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const allSelected = parsed?.substances.every((s) => selected[s.id]);
  const noneSelected = parsed?.substances.every((s) => !selected[s.id]);
  const toggleAll = () => {
    haptics.light();
    const next = {}; for (const s of parsed.substances) next[s.id] = !allSelected;
    setSelected(next);
  };

  const doImport = async () => {
    const selectedIds = parsed.substances.filter((s) => selected[s.id]).map((s) => s.id);
    setBusyLabel('Préparation…');
    setProgress({ current: 0, total: 0 });
    setStep('importing');
    try {
      await useStore.getState().createSnapshotFromLive(`avant-import-${fmtDateTiretHM()}`);
      const activeSubs = [
        ...useStore.getState().substances,
        ...useStore.getState().archivedSubstances,
      ];
      setBusyLabel('Import en cours…');
      const fused = await performFusion({
        parsed,
        activeSubs,
        substanceIds: new Set(selectedIds),
        onProgress: (cur, tot) => setProgress({ current: cur, total: tot }),
      });
      await useStore.getState().loadAll();
      haptics.success();
      setResult({ ok: true, message: formatFusionResult(fused) });
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
      {/* Étape PIN : position fixe un peu au-dessus du centre, ne bouge pas avec le clavier */}
      <View style={[styles.overlay, step === 'pin' && styles.overlayFixed]}>
        <View style={styles.card}>
          {step === 'pick' && (
            <>
              <Text style={styles.title}>Importer</Text>
              <Text style={styles.intro}>Sélectionne un fichier .almanac.</Text>
              <TouchableOpacity onPress={pickFile} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Choisir un fichier</Text>
              </TouchableOpacity>
              <View style={styles.actions}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.cancelText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'pin' && (
            <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingBottom: 4 }}>
              <Text style={styles.title}>Code PIN</Text>
              <Text style={styles.intro}>Entre le code PIN du fichier.</Text>
              <PinField
                ref={pinRef}
                value={pin}
                onChangeText={setPin}
                autoFocus={false}
                returnKeyType="done"
                onSubmitEditing={submitPin}
              />
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); setStep('pick'); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitPin} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.confirmText}>Déchiffrer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {step === 'busy' && (
            <View style={styles.busyWrap}>
              <ActivityIndicator size="large" color={theme.colors.text} />
              <Text style={styles.busyText}>{busyLabel}</Text>
            </View>
          )}

          {step === 'select' && parsed && (
            <>
              <Text style={styles.title}>Substances à importer</Text>
              <Text style={styles.intro}>
                Un snapshot sera créé juste avant l'import. Les doublons par heure exacte sont ignorés.
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
                <TouchableOpacity onPress={() => setStep('pin')}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={doImport} disabled={noneSelected}>
                  <Text style={[styles.confirmText, noneSelected && { opacity: 0.4 }]}>Importer</Text>
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
                {result?.ok ? 'Import terminé' : "L'import n'a pas pu aboutir"}
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
  overlayFixed: { justifyContent: 'flex-start', paddingTop: 170 },
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
  primaryBtn: {
    backgroundColor: theme.colors.text, paddingVertical: theme.spacing.md,
    borderRadius: 6, alignItems: 'center', marginTop: theme.spacing.md,
  },
  primaryBtnText: {
    color: theme.colors.background, fontSize: theme.font.sizes.md,
    fontWeight: '600', letterSpacing: 1,
  },
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
