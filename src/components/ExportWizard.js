// Wizard d'export v1.1.18 — flow compact :
//   1. select     : sélection substances
//   2. password   : PIN + confirm + nom de fichier (TOUT sur le même écran)
//      - Enter PIN1 → focus PIN2
//      - Enter PIN2 → focus nom
//      - Enter nom  → export
//      - Validation locale : shake le mauvais champ
//      - Tap "Exporter" fonctionne du 1er coup (onPressIn pour éviter le blur du TextInput)
//   3. busy       : spinner inline
//   4. result     : ✓ / ❌

import { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Platform, BackHandler, Keyboard, KeyboardAvoidingView, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import PinField from './PinField';
import SubCard from './SubCard';
import haptics from '../utils/haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildExportFile } from '../utils/exportImport';
import {
  getOrPickExportDir, writeFileToDir, verifyFileExists, makeUniqueFilename, debugLastError,
} from '../utils/saf';
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
  // 'select' | 'password' | 'busy' | 'result'
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

  // Focus auto quand on entre dans l'étape password
  useEffect(() => {
    if (step === 'password') {
      const t = setTimeout(() => pin1Ref.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [step]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'select') { onClose?.(); return true; }
      if (step === 'password') { Keyboard.dismiss(); setStep('select'); return true; }
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

  // Enter sur PIN1 → focus PIN2
  const onSubmitPin1 = () => {
    if (pin.length !== 4) {
      pin1Ref.current?.shake('4 chiffres requis');
      return;
    }
    pin2Ref.current?.focus();
  };
  // Enter sur PIN2 → focus nom (ne lance pas l'export)
  const onSubmitPin2 = () => {
    if (pinConfirm.length !== 4) {
      pin2Ref.current?.shake('4 chiffres requis');
      return;
    }
    if (pin !== pinConfirm) {
      pin2Ref.current?.shake('Les codes ne correspondent pas');
      return;
    }
    nameRef.current?.focus();
  };

  const validateAll = () => {
    if (pin.length !== 4) { pin1Ref.current?.shake('4 chiffres requis'); return false; }
    if (pinConfirm.length !== 4) { pin2Ref.current?.shake('4 chiffres requis'); return false; }
    if (pin !== pinConfirm) { pin2Ref.current?.shake('Les codes ne correspondent pas'); return false; }
    return true;
  };

  const handleExport = async () => {
    if (!validateAll()) return;
    Keyboard.dismiss();

    const trimmed = (filename || '').trim();
    const timestamp = fmtDateTiretHM();
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

      const desiredName = `${base}.almanac`;

      // Essai SAF d'abord. Si le dossier choisi refuse l'écriture (ex: Downloads virtuel),
      // on tombe automatiquement sur Sharing (menu Android « Enregistrer dans ») qui marche partout.
      const dirUri = await getOrPickExportDir();
      let fileUri = null;
      let finalName = desiredName;
      if (dirUri) {
        finalName = await makeUniqueFilename(dirUri, desiredName);
        fileUri = await writeFileToDir(dirUri, finalName, fileContent);
      }

      if (!fileUri) {
        // Fallback universel : écrit en cache puis ouvre le menu Android de partage
        try {
          const cachePath = `${FileSystem.cacheDirectory}${desiredName}`;
          await FileSystem.writeAsStringAsync(cachePath, fileContent, { encoding: FileSystem.EncodingType.UTF8 });
          const available = await Sharing.isAvailableAsync();
          if (available) {
            await Sharing.shareAsync(cachePath, {
              mimeType: 'application/octet-stream',
              dialogTitle: 'Exporter Almanac',
            });
            // On ne peut pas vérifier côté app si l'user a bien sauvegardé (c'est Android qui gère),
            // mais le fichier est bien généré dans le cache et le menu a été affiché.
            haptics.success();
            setResult({
              ok: true,
              message:
                `${desiredName}\n${cons.length} prises · ${subs.length} substances\n\n` +
                `Partage via Android — choisis où enregistrer dans le menu qui s'est ouvert.`,
            });
            setStep('result');
            return;
          }
        } catch (e) {
          // fallthrough
        }
        const err = debugLastError() || 'Impossible d\'écrire le fichier.';
        setResult({
          ok: false,
          message:
            `Erreur SAF :\n${err}\n\nEssaie de choisir un autre dossier (évite "Downloads").`,
        });
        setStep('result');
        return;
      }

      const exists = await verifyFileExists(fileUri);
      if (!exists) {
        setResult({ ok: false, message: "Le fichier a été écrit mais n'a pas pu être relu." });
        setStep('result');
        return;
      }
      haptics.success();
      setResult({
        ok: true,
        message: `${finalName}\n${cons.length} prises · ${subs.length} substances`,
      });
      setStep('result');
    } catch (e) {
      setResult({ ok: false, message: `${e.message || e}` });
      setStep('result');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                <TouchableOpacity onPress={() => setStep('password')} disabled={noneSelected}>
                  <Text style={[styles.confirmText, noneSelected && { opacity: 0.4 }]}>Suivant</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'password' && (
            <ScrollView contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="always">
              <Text style={styles.title}>Code PIN & nom</Text>
              <Text style={styles.intro}>Choisis un PIN à 4 chiffres pour chiffrer le fichier.</Text>

              <Text style={styles.fieldLabel}>Code PIN</Text>
              <PinField
                ref={pin1Ref}
                value={pin}
                onChangeText={setPin}
                autoFocus={false}
                returnKeyType="next"
                onSubmitEditing={onSubmitPin1}
              />

              <Text style={styles.fieldLabel}>Confirmer</Text>
              <PinField
                ref={pin2Ref}
                value={pinConfirm}
                onChangeText={setPinConfirm}
                autoFocus={false}
                returnKeyType="next"
                onSubmitEditing={onSubmitPin2}
              />

              <Text style={styles.fieldLabel}>Nom du fichier (optionnel)</Text>
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

              <View style={styles.warningBox}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.warningText}>
                  Si tu oublies ce code, le fichier sera illisible.
                </Text>
              </View>

              <View style={styles.actions}>
                <Pressable onPressIn={() => { Keyboard.dismiss(); setStep('select'); }}>
                  <Text style={styles.cancelText}>Retour</Text>
                </Pressable>
                <Pressable onPressIn={handleExport}>
                  <Text style={styles.confirmText}>Exporter</Text>
                </Pressable>
              </View>
            </ScrollView>
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
  fieldLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: theme.spacing.xs, marginTop: theme.spacing.sm,
  },
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
    marginTop: theme.spacing.sm, marginBottom: theme.spacing.md,
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
    marginTop: theme.spacing.sm, textAlign: 'center',
  },
  resultMessage: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', textAlign: 'center', marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
});
