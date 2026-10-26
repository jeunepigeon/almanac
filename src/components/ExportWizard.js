// Wizard d'export v1.1.17.
// Étapes :
//   1. select     : sélection substances
//   2. pin1       : choix du PIN (4 chiffres). Validation locale avant d'avancer.
//   3. pin2       : confirmation du PIN. Doit matcher pin1.
//   4. filename   : nom de fichier éditable (optionnel). Enter → export.
//   5. busy       : spinner inline (chiffrement + écriture)
//   6. result     : ✓ ou ❌
//
// Nom de fichier final : `<nom-ou-"almanac-export">-<DD-MM-YYYY-HHMM>.almanac`
// Collisions : suffixe auto -2, -3, …
// SAF 1ère fois seulement, URI persisté.

import { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, BackHandler,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import PinField from './PinField';
import SubCard from './SubCard';
import haptics from '../utils/haptics';
import { buildExportFile } from '../utils/exportImport';
import { getOrPickExportDir, writeFileToDir, verifyFileExists, makeUniqueFilename } from '../utils/saf';
import { fmtDateTiretHM } from '../utils/snapshots';
import { useKeepAwake } from '../utils/keepAwake';

export default function ExportWizard({
  visible,
  substances = [],
  statsById = {},
  consumptions = [],
  onClose,
}) {
  const [step, setStep] = useState('select');
  // 'select' | 'pin1' | 'pin2' | 'filename' | 'busy' | 'result'
  const [selected, setSelected] = useState({});
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [filename, setFilename] = useState('');
  const [busyLabel, setBusyLabel] = useState('Chiffrement en cours…');
  const [result, setResult] = useState(null);

  const pin1Ref = useRef(null);
  const pin2Ref = useRef(null);
  const nameRef = useRef(null);

  useKeepAwake('export-wizard');

  useEffect(() => {
    if (!visible) return;
    setStep('select');
    const sel = {}; for (const s of substances) sel[s.id] = true;
    setSelected(sel);
    setPin(''); setPinConfirm(''); setFilename('');
    setResult(null);
  }, [visible, substances]);

  // Focus auto PIN à chaque étape où il est pertinent
  useEffect(() => {
    if (step === 'pin1') {
      // Petit délai pour laisser le render de la modal se stabiliser avant d'ouvrir le clavier
      const t = setTimeout(() => pin1Ref.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    if (step === 'pin2') {
      const t = setTimeout(() => pin2Ref.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    if (step === 'filename') {
      const t = setTimeout(() => nameRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Back Android
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'select') { onClose?.(); return true; }
      if (step === 'pin1') { setStep('select'); return true; }
      if (step === 'pin2') { setStep('pin1'); return true; }
      if (step === 'filename') { setStep('pin2'); return true; }
      if (step === 'result') { onClose?.(); return true; }
      return true;
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

  // Validation PIN1 → va à PIN2
  const submitPin1 = () => {
    if (pin.length !== 4) {
      pin1Ref.current?.shake('4 chiffres requis');
      return;
    }
    setStep('pin2');
  };
  // Validation PIN2 → va à filename
  const submitPin2 = () => {
    if (pinConfirm.length !== 4) {
      pin2Ref.current?.shake('4 chiffres requis');
      return;
    }
    if (pin !== pinConfirm) {
      pin2Ref.current?.shake('Les codes ne correspondent pas');
      return;
    }
    setStep('filename');
  };

  const handleExport = async () => {
    const trimmed = (filename || '').trim();
    const timestamp = fmtDateTiretHM();
    // Nom final : <nom>-<timestamp>.almanac  (si nom vide → almanac-export-<timestamp>)
    const base = trimmed ? `${trimmed}-${timestamp}` : `almanac-export-${timestamp}`;

    const selectedIds = substances.filter((s) => selected[s.id]).map((s) => s.id);
    const subIdsSet = new Set(selectedIds);

    setBusyLabel('Chiffrement en cours…');
    setStep('busy');

    try {
      const subs = substances
        .filter((s) => subIdsSet.has(s.id))
        .map((s) => ({
          id: s.id, name: s.name, color: s.color, icon: s.icon,
          createdAt: s.createdAt ?? s.created_at ?? Date.now(),
          archived: s.archived ? 1 : 0,
          position: s.position ?? 0,
        }));
      const cons = consumptions
        .filter((c) => subIdsSet.has(c.substanceId ?? c.substance_id))
        .map((c) => ({
          id: c.id,
          substanceId: c.substanceId ?? c.substance_id,
          timestamp: c.timestamp,
          dosage: c.dosage ?? null,
          notes: c.notes ?? null,
          createdAt: c.createdAt ?? c.created_at ?? c.timestamp,
        }));

      const fileContent = await buildExportFile(subs, cons, pin);

      setBusyLabel('Sauvegarde du fichier…');

      const dirUri = await getOrPickExportDir();
      if (!dirUri) {
        setResult({ ok: false, message: "Permission d'écriture refusée." });
        setStep('result');
        return;
      }

      const desiredName = `${base}.almanac`;
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
      setResult({
        ok: true,
        message: `${finalName}\n${cons.length} prise(s) · ${subs.length} substance(s)`,
      });
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
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
              <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 4 }}>
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
                <TouchableOpacity onPress={() => setStep('pin1')} disabled={noneSelected}>
                  <Text style={[styles.confirmText, noneSelected && { opacity: 0.4 }]}>Suivant</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'pin1' && (
            <>
              <Text style={styles.title}>Code PIN</Text>
              <Text style={styles.intro}>Choisis un code à 4 chiffres pour chiffrer le fichier.</Text>
              <PinField
                ref={pin1Ref}
                value={pin}
                onChangeText={setPin}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={submitPin1}
              />
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setStep('select')}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitPin1}>
                  <Text style={styles.confirmText}>Suivant</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'pin2' && (
            <>
              <Text style={styles.title}>Confirmer</Text>
              <Text style={styles.intro}>Retape le même code pour confirmer.</Text>
              <PinField
                ref={pin2Ref}
                value={pinConfirm}
                onChangeText={setPinConfirm}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={submitPin2}
              />
              <View style={styles.warningBox}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.warningText}>
                  Si tu oublies ce code, le fichier sera illisible.
                </Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setStep('pin1')}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitPin2}>
                  <Text style={styles.confirmText}>Suivant</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'filename' && (
            <>
              <Text style={styles.title}>Nom du fichier</Text>
              <Text style={styles.intro}>
                Laisse vide pour « almanac-export ». La date-heure est ajoutée automatiquement.
              </Text>
              <TextInput
                ref={nameRef}
                value={filename}
                onChangeText={setFilename}
                placeholder="almanac-export"
                placeholderTextColor={theme.colors.textFaint}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleExport}
              />
              <Text style={styles.hint}>
                {`${(filename.trim() || 'almanac-export')}-${fmtDateTiretHM()}.almanac`}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setStep('pin2')}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleExport}>
                  <Text style={styles.confirmText}>Exporter</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'busy' && (
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
  input: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '400',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    textAlign: 'center',
  },
  hint: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs,
    fontStyle: 'italic', marginTop: theme.spacing.sm, marginBottom: theme.spacing.md,
    textAlign: 'center',
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
    fontWeight: '400', lineHeight: 18,
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
  resultWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg, gap: theme.spacing.sm,
  },
  resultTitle: {
    fontSize: theme.font.sizes.md, fontWeight: '600',
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  resultMessage: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', textAlign: 'center', marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
});
