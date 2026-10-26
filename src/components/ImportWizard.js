// Wizard d'import depuis un fichier .almanac, dans une modal superposée.
// Étapes : pick → password (déchiffrage inline) → select → (fusion inline + conflict) → result.
// PAS de modal superposée au wizard : spinner inline, modal conflit en overlay OBJ dans la carte.

import { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  Animated, ActivityIndicator, KeyboardAvoidingView, Platform, BackHandler,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '../theme';
import PinField from './PinField';
import haptics from '../utils/haptics';
import { parseExportFile } from '../utils/exportImport';
import { performFusion } from '../utils/fusion';
import { fmtDateTiretHM } from '../utils/snapshots';
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

// Calcule des stats par sub d'après parsed.consumptions
function statsFromParsed(parsed) {
  const by = {};
  for (const c of parsed.consumptions) {
    const id = c.substanceId;
    if (!by[id]) by[id] = { consCount: 0, firstTs: null, lastTs: null };
    by[id].consCount += 1;
    if (by[id].firstTs == null || c.timestamp < by[id].firstTs) by[id].firstTs = c.timestamp;
    if (by[id].lastTs == null || c.timestamp > by[id].lastTs) by[id].lastTs = c.timestamp;
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

export default function ImportWizard({ visible, onClose, onComplete }) {
  const [step, setStep] = useState('pick'); // 'pick' | 'password' | 'select' | 'busy' | 'result' | 'conflict'
  const [fileContent, setFileContent] = useState(null);
  const [pin, setPin] = useState('');
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});
  const [busyLabel, setBusyLabel] = useState('Fusion en cours…');
  const [result, setResult] = useState(null);
  const [conflict, setConflict] = useState(null); // { parsedSub, resolve }
  const pinRef = useRef(null);

  useKeepAwake('import-wizard');

  useEffect(() => {
    if (!visible) return;
    setStep('pick');
    setFileContent(null);
    setPin('');
    setParsed(null);
    setSelected({});
    setResult(null);
    setConflict(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'pick') { onClose?.(); return true; }
      if (step === 'password') { setStep('pick'); return true; }
      if (step === 'select') { setStep('password'); return true; }
      if (step === 'result') { onClose?.(); return true; }
      return true; // bloque pendant busy et conflict
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
      setStep('password');
    } catch (e) {
      setResult({ ok: false, message: e.message || 'Lecture du fichier impossible.' });
      setStep('result');
    }
  };

  const decrypt = async () => {
    if (pin.length !== 4) { pinRef.current?.shake(); return; }
    setBusyLabel('Déchiffrement en cours…');
    setStep('busy');
    try {
      // Timeout pour permettre render du spinner avant le travail CPU
      await new Promise((r) => setTimeout(r, 50));
      const data = parseExportFile(fileContent, pin);
      setParsed(data);
      const sel = {};
      for (const s of data.substances) sel[s.id] = true;
      setSelected(sel);
      setStep('select');
    } catch (e) {
      // PIN probablement invalide → shake + reste à password
      setStep('password');
      pinRef.current?.shake();
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

  const askConflictChoice = (parsedSub) => new Promise((resolve) => {
    setConflict({ parsedSub, resolve });
  });

  const resolveConflict = (choice) => {
    if (conflict) {
      conflict.resolve(choice);
      setConflict(null);
    }
  };

  const doImport = async () => {
    const selectedIds = parsed.substances.filter((s) => selected[s.id]).map((s) => s.id);
    setBusyLabel('Import en cours…');
    setStep('busy');
    try {
      // Snapshot auto JUSTE AVANT la fusion (si on annule avant, rien n'est créé)
      await useStore.getState().createSnapshotFromLive(`avant-import-${fmtDateTiretHM()}`);

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
          `${fused.consosAdded} conso(s) importée(s).`,
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

          {step === 'password' && (
            <>
              <Text style={styles.title}>Déchiffrer</Text>
              <Text style={styles.intro}>Entre le code PIN du fichier.</Text>
              <Text style={styles.fieldLabel}>Code PIN</Text>
              <PinField ref={pinRef} value={pin} onChangeText={setPin} />
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setStep('pick')}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={decrypt}>
                  <Text style={styles.confirmText}>Déchiffrer</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'select' && parsed && (
            <>
              <Text style={styles.title}>Substances à importer</Text>
              <Text style={styles.intro}>Un snapshot sera créé juste avant l'import.</Text>
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
                <TouchableOpacity onPress={() => setStep('password')}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={doImport} disabled={noneSelected}>
                  <Text style={[styles.confirmText, noneSelected && { opacity: 0.4 }]}>Importer</Text>
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

          {/* Conflit : overlay dans la même carte */}
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
  fieldLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: theme.spacing.xs, marginTop: theme.spacing.sm,
  },
  primaryBtn: {
    backgroundColor: theme.colors.text, paddingVertical: theme.spacing.md,
    borderRadius: 4, alignItems: 'center', marginTop: theme.spacing.md,
  },
  primaryBtnText: {
    color: theme.colors.background, fontSize: theme.font.sizes.md,
    fontWeight: '500', letterSpacing: 1,
  },
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
  conflictInner: {
    paddingVertical: theme.spacing.md,
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
