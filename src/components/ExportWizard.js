// Wizard d'export dans une modal superposée aux paramètres.
// Étapes : select → password+filename → (deciphering spinner inline) → result modal.
// Format fichier : almanac-export-DD-MM-YYYY-HHMM.almanac
// SAF 1ère fois seulement (saf.js persiste l'URI).
// Vérifie réellement que le fichier existe → ✓ ou ❌.
// PLUS de menu Android "partager".

import { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, TextInput,
  Animated, ActivityIndicator, KeyboardAvoidingView, Platform, BackHandler,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import PinField from './PinField';
import haptics from '../utils/haptics';
import { buildExportFile } from '../utils/exportImport';
import { getOrPickExportDir, writeFileToDir, verifyFileExists, makeUniqueFilename } from '../utils/saf';
import { fmtDateTiretHM } from '../utils/snapshots';
import { useKeepAwake } from '../utils/keepAwake';

const DIM_BORDER = '#2F2F2F';
const DIM_TEXT = '#3A3A3A';

function SubCard({ sub, isChecked, onToggle, stats }) {
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
  const statsColor = isChecked ? theme.colors.textMuted : DIM_TEXT;
  const iconColor = isChecked ? sub.color : DIM_TEXT;
  const consCount = stats?.consCount ?? 0;
  const days = stats?.days ?? 0;
  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 8 }}>
      <Pressable onPress={handlePress} style={[styles.subCard, { borderColor }]}>
        <View style={[styles.iconWrap, { borderColor: iconColor }]}>
          <View style={[styles.iconDot, { backgroundColor: iconColor }]} />
        </View>
        <View style={styles.cardMiddle}>
          <Text style={[styles.cardName, { color: nameColor }]} numberOfLines={1}>{sub.name}</Text>
          <Text style={[styles.cardStats, { color: statsColor }]}>
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

export default function ExportWizard({
  visible,
  substances = [],   // [{id, name, color}]
  statsById = {},
  consumptions = [], // used to build file
  onClose,
}) {
  const [step, setStep] = useState('select'); // 'select' | 'password' | 'busy' | 'result'
  const [selected, setSelected] = useState({});
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState(null); // { ok, message, path? }
  const [busyLabel, setBusyLabel] = useState('Chiffrement en cours…');

  const pinRef = useRef(null);
  const pinConfirmRef = useRef(null);

  useKeepAwake('export-wizard');

  useEffect(() => {
    if (!visible) return;
    setStep('select');
    const sel = {};
    for (const s of substances) sel[s.id] = true;
    setSelected(sel);
    setPin('');
    setPinConfirm('');
    setFilename(`almanac-export-${fmtDateTiretHM()}`);
    setResult(null);
  }, [visible, substances]);

  // Bouton retour Android : ferme la modal (comme bouton Fermer).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'select') { onClose?.(); return true; }
      if (step === 'password') { setStep('select'); return true; }
      if (step === 'result') { onClose?.(); return true; }
      return true; // bloque en 'busy'
    });
    return () => sub.remove();
  }, [visible, step, onClose]);

  const toggleSub = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const allSelected = substances.length > 0 && substances.every((s) => selected[s.id]);
  const noneSelected = substances.length > 0 && substances.every((s) => !selected[s.id]);
  const toggleAll = () => {
    haptics.light();
    const next = {}; for (const s of substances) next[s.id] = !allSelected;
    setSelected(next);
  };

  const handleExport = async () => {
    // Validation PIN
    if (pin.length !== 4) { pinRef.current?.shake(); return; }
    if (pin !== pinConfirm) { pinConfirmRef.current?.shake(); return; }
    const trimmed = (filename || '').trim();
    if (!trimmed) { return; }

    const selectedIds = substances.filter((s) => selected[s.id]).map((s) => s.id);
    const subIdsSet = new Set(selectedIds);

    setBusyLabel('Chiffrement en cours…');
    setStep('busy');
    try {
      const subs = substances
        .filter((s) => subIdsSet.has(s.id))
        .map((s) => ({
          id: s.id, name: s.name, color: s.color, icon: s.icon,
          created_at: s.createdAt ?? s.created_at ?? Date.now(),
          archived: s.archived ? 1 : 0,
          position: s.position ?? 0,
        }));
      const cons = consumptions
        .filter((c) => subIdsSet.has(c.substanceId ?? c.substance_id))
        .map((c) => ({
          id: c.id,
          substance_id: c.substanceId ?? c.substance_id,
          timestamp: c.timestamp,
          dosage: c.dosage ?? null,
          notes: c.notes ?? null,
          created_at: c.createdAt ?? c.created_at ?? c.timestamp,
        }));

      const fileContent = await buildExportFile(subs, cons, pin);

      setBusyLabel('Sauvegarde du fichier…');

      // SAF : 1ère fois demande permission, sinon utilise URI persistée
      const dirUri = await getOrPickExportDir();
      if (!dirUri) {
        setResult({ ok: false, message: "Permission d'écriture refusée." });
        setStep('result');
        return;
      }

      // Collision sur nom : suffixe -2, -3, etc.
      const desiredName = `${trimmed}.almanac`;
      const finalName = await makeUniqueFilename(dirUri, desiredName);

      const fileUri = await writeFileToDir(dirUri, finalName, fileContent);
      if (!fileUri) {
        setResult({ ok: false, message: "Impossible d'écrire le fichier." });
        setStep('result');
        return;
      }
      const exists = await verifyFileExists(fileUri);
      if (!exists) {
        setResult({ ok: false, message: "Le fichier n'a pas pu être vérifié." });
        setStep('result');
        return;
      }
      haptics.success();
      setResult({ ok: true, message: `Fichier "${finalName}" enregistré.` });
      setStep('result');
    } catch (e) {
      setResult({ ok: false, message: e.message || String(e) });
      setStep('result');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* ===== STEP SELECT ===== */}
          {step === 'select' && (
            <>
              <Text style={styles.title}>Exporter</Text>
              <Text style={styles.intro}>Coche les substances à inclure.</Text>

              <View style={styles.header}>
                <Text style={styles.sectionLabel}>
                  {substances.length} substance{substances.length > 1 ? 's' : ''}
                </Text>
                <TouchableOpacity onPress={toggleAll}>
                  <Text style={styles.toggleAllText}>
                    {allSelected ? 'Tout décocher' : 'Tout cocher'}
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {substances.map((sub) => (
                  <SubCard
                    key={sub.id}
                    sub={sub}
                    isChecked={!!selected[sub.id]}
                    onToggle={() => toggleSub(sub.id)}
                    stats={statsById[sub.id]}
                  />
                ))}
              </ScrollView>

              <View style={styles.actions}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.cancelText}>Fermer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStep('password')}
                  disabled={noneSelected}
                >
                  <Text style={[styles.confirmText, noneSelected && { opacity: 0.4 }]}>Suivant</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ===== STEP PASSWORD + FILENAME ===== */}
          {step === 'password' && (
            <ScrollView>
              <Text style={styles.title}>Code PIN & nom du fichier</Text>
              <Text style={styles.intro}>
                Choisis un code PIN à 4 chiffres pour chiffrer le fichier.
              </Text>

              <Text style={styles.fieldLabel}>Code PIN (4 chiffres)</Text>
              <PinField ref={pinRef} value={pin} onChangeText={setPin} autoFocus />

              <Text style={styles.fieldLabel}>Confirmer</Text>
              <PinField ref={pinConfirmRef} value={pinConfirm} onChangeText={setPinConfirm} autoFocus={false} />

              <Text style={styles.fieldLabel}>Nom du fichier</Text>
              <TextInput
                value={filename}
                onChangeText={setFilename}
                placeholder="almanac-export"
                placeholderTextColor={theme.colors.textFaint}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>{filename}.almanac</Text>

              <View style={styles.warningBox}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.warningText}>
                  Si tu oublies ce code PIN, le fichier sera illisible.
                </Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setStep('select')}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleExport}>
                  <Text style={styles.confirmText}>Exporter</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ===== STEP BUSY (inline, pas de modal superposée) ===== */}
          {step === 'busy' && (
            <View style={styles.busyWrap}>
              <ActivityIndicator size="large" color={theme.colors.text} />
              <Text style={styles.busyText}>{busyLabel}</Text>
            </View>
          )}

          {/* ===== STEP RESULT ===== */}
          {step === 'result' && (
            <View style={styles.resultWrap}>
              <MaterialCommunityIcons
                name={result?.ok ? 'check-circle-outline' : 'close-circle-outline'}
                size={48}
                color={result?.ok ? '#01C853' : theme.colors.danger}
              />
              <Text style={[styles.resultTitle, { color: result?.ok ? theme.colors.text : theme.colors.danger }]}>
                {result?.ok ? 'Sauvegarde enregistrée' : "La sauvegarde n'a pas pu aboutir"}
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
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.sm,
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
  input: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.xs,
  },
  hint: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs,
    fontStyle: 'italic', marginBottom: theme.spacing.md,
  },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm,
    marginTop: theme.spacing.md, marginBottom: theme.spacing.lg,
    padding: theme.spacing.md, borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  warningText: {
    flex: 1, color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', lineHeight: 18,
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
  busyText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300',
  },
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
});
