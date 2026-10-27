// Wizard d'export v1.1.18.5
//   1. select   : sélection substances
//   2. password : PIN + confirmation + nom (même écran)
//        - PIN1 focus auto à l'arrivée
//        - PIN1 = 4 chiffres → focus PIN2 automatique
//        - 4e chiffre de PIN2 : erreur immédiate si ≠ PIN1 (rien d'auto si identique)
//        - Entrée sur PIN2 → validation (4+4+correspondance) puis focus Nom
//        - Entrée sur Nom → export
//        - Position FIXE (ne bouge pas à l'ouverture du clavier), visible clavier ouvert ou fermé
//   3. busy     : spinner (affiché AVANT le calcul PBKDF2 qui bloque le thread JS)
//   4. result   : ✓ / ❌ avec taille réellement écrite
// SAF : l'emplacement est redemandé à CHAQUE export (Android ne redemande l'autorisation
// que pour un nouveau dossier). Plus de fallback « partager ».

import { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, BackHandler, Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import PinField from './PinField';
import SubCard from './SubCard';
import haptics from '../utils/haptics';
import { buildExportFile } from '../utils/exportImport';
import {
  getOrPickExportDir, writeFileToDir, readBackLength, makeUniqueFilename, debugLastError,
} from '../utils/saf';
import { fmtDateTiretHM } from '../utils/snapshots';
import { useKeepAwake } from '../utils/keepAwake';
import { yieldToUI } from '../utils/useKeyboard';
import { useFixedModalTop } from '../utils/modalPosition';

function fmtBytes(n) {
  if (n < 1024) return `${n} o`;
  return `${Math.round(n / 1024)} Ko`;
}

export default function ExportWizard({ visible, substances = [], statsById = {}, consumptions = [], onClose }) {
  const [step, setStep] = useState('select');
  const [selected, setSelected] = useState({});
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [filename, setFilename] = useState('');
  const [busyLabel, setBusyLabel] = useState('');
  const [result, setResult] = useState(null);

  const pin1Ref = useRef(null);
  const pin2Ref = useRef(null);
  const nameRef = useRef(null);

  useKeepAwake('export-wizard');
  // Étape PIN : centrée entre le bas du bandeau « Paramètres » et le haut du clavier, position fixe
  const fixed = useFixedModalTop('betweenHeaderAndKeyboard');

  useEffect(() => {
    if (!visible) return;
    setStep('select');
    const sel = {}; for (const s of substances) sel[s.id] = true;
    setSelected(sel);
    setPin(''); setPinConfirm(''); setFilename('');
    setResult(null);
  }, [visible, substances]);

  // Focus auto PIN1 à l'arrivée sur l'étape
  useEffect(() => {
    if (step !== 'password') return;
    const t = setTimeout(() => pin1Ref.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [step]);

  // PIN1 complet → focus PIN2
  useEffect(() => {
    if (step === 'password' && pin.length === 4) pin2Ref.current?.focus();
  }, [pin, step]);

  // Toute modif de PIN1 efface l'erreur de PIN2 (sinon elle restait affichée même codes identiques)
  useEffect(() => {
    if (step === 'password') pin2Ref.current?.clearError();
  }, [pin, step]);

  // 4e chiffre de PIN2 : erreur immédiate si ça ne correspond pas
  useEffect(() => {
    if (step !== 'password' || pinConfirm.length !== 4 || pin.length !== 4) return;
    if (pin !== pinConfirm) pin2Ref.current?.shake('Les codes ne correspondent pas');
  }, [pinConfirm, step]); // eslint-disable-line

  // Entrée sur PIN1 : si incomplet → erreur, sinon PIN2
  const onSubmitPin1 = () => {
    if (pin.length !== 4) { pin1Ref.current?.shake('4 chiffres requis'); return; }
    pin2Ref.current?.focus();
  };
  // Entrée sur PIN2 : validation complète (4 + 4 + correspondance) → focus nom
  const onSubmitPin2 = () => {
    if (pin.length !== 4) { pin1Ref.current?.shake('4 chiffres requis'); pin1Ref.current?.focus(); return; }
    if (pinConfirm.length !== 4) { pin2Ref.current?.shake('4 chiffres requis'); return; }
    if (pin !== pinConfirm) { pin2Ref.current?.shake('Les codes ne correspondent pas'); return; }
    nameRef.current?.focus();
  };

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'select' || step === 'result') { onClose?.(); return true; }
      if (step === 'password') { Keyboard.dismiss(); setStep('select'); return true; }
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

  const validateAll = () => {
    if (pin.length !== 4) { pin1Ref.current?.shake('4 chiffres requis'); return false; }
    if (pinConfirm.length !== 4) { pin2Ref.current?.shake('4 chiffres requis'); return false; }
    if (pin !== pinConfirm) { pin2Ref.current?.shake('Les codes ne correspondent pas'); return false; }
    return true;
  };

  const fail = (message) => { setResult({ ok: false, message }); setStep('result'); };

  const handleExport = async () => {
    if (!validateAll()) return;
    Keyboard.dismiss();

    const trimmed = (filename || '').trim();
    const timestamp = fmtDateTiretHM();
    const base = trimmed ? `${trimmed}-${timestamp}` : `almanac-export-${timestamp}`;
    const selectedIds = new Set(substances.filter((s) => selected[s.id]).map((s) => s.id));

    // 1. Spinner AFFICHÉ avant le calcul lourd
    setBusyLabel('Chiffrement en cours…');
    setStep('busy');
    await yieldToUI();

    let fileContent;
    let consCount = 0;
    let subsCount = 0;
    try {
      const subs = substances.filter((s) => selectedIds.has(s.id)).map((s) => ({
        id: s.id, name: s.name, color: s.color, icon: s.icon,
        createdAt: s.createdAt ?? s.created_at ?? Date.now(),
        archived: s.archived ? 1 : 0, position: s.position ?? 0,
      }));
      const cons = consumptions
        .filter((c) => selectedIds.has(c.substanceId ?? c.substance_id))
        .map((c) => ({
          id: c.id, substanceId: c.substanceId ?? c.substance_id, timestamp: c.timestamp,
          dosage: c.dosage ?? null, notes: c.notes ?? null,
          createdAt: c.createdAt ?? c.created_at ?? c.timestamp,
        }));
      consCount = cons.length;
      subsCount = subs.length;
      fileContent = await buildExportFile(subs, cons, pin);
    } catch (e) {
      fail(`Chiffrement impossible :\n${e.message || e}`);
      return;
    }

    // 2. Choix de l'emplacement (à chaque fois)
    setBusyLabel('Choix du dossier…');
    const dirUri = await getOrPickExportDir({ forcePick: true });
    if (!dirUri) { fail(debugLastError() || 'Aucun dossier sélectionné.'); return; }

    // 3. Écriture + relecture
    setBusyLabel('Écriture du fichier…');
    await yieldToUI();
    const finalName = await makeUniqueFilename(dirUri, `${base}.almanac`);
    const fileUri = await writeFileToDir(dirUri, finalName, fileContent);
    if (!fileUri) { fail(`Erreur d'écriture :\n${debugLastError() || 'inconnue'}`); return; }

    const written = await readBackLength(fileUri);
    if (written === 0) {
      fail(`Le fichier a été créé mais il est vide.\n${debugLastError() || ''}`.trim());
      return;
    }
    if (written < fileContent.length) {
      fail(`Fichier incomplet : ${fmtBytes(written)} écrits sur ${fmtBytes(fileContent.length)}.`);
      return;
    }

    haptics.success();
    setResult({
      ok: true,
      message: `${finalName}\n${consCount} prises · ${subsCount} substances · ${fmtBytes(written)}`,
    });
    setStep('result');
  };


  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Étape PIN : position fixe, centrée entre bandeau et clavier, ne bouge pas */}
      <View style={[styles.overlay, step === 'password' && fixed.overlayStyle]}>
        <View
          style={[styles.card, step === 'password' && fixed.cardStyle]}
          onLayout={step === 'password' ? fixed.onLayout : undefined}
        >
          {step === 'select' && (
            <>
              <Text style={styles.title}>Exporter</Text>
              <Text style={styles.intro}>Coche les substances à inclure.</Text>
              <View style={styles.header}>
                <Text style={styles.sectionLabel}>{substances.length} substances</Text>
                <TouchableOpacity onPress={toggleAll}>
                  <Text style={styles.toggleAllText}>{allSelected ? 'Tout décocher' : 'Tout cocher'}</Text>
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
                <TouchableOpacity onPress={onClose}><Text style={styles.cancelText}>Fermer</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setStep('password')} disabled={noneSelected}>
                  <Text style={[styles.confirmText, noneSelected && { opacity: 0.4 }]}>Suivant</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'password' && (
            <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingBottom: 4 }}>
              <Text style={styles.title}>Code PIN & nom</Text>
              <Text style={styles.intro}>Choisis un PIN à 4 chiffres pour chiffrer le fichier.</Text>

              <Text style={styles.fieldLabel}>Code PIN</Text>
              <PinField ref={pin1Ref} value={pin} onChangeText={setPin} returnKeyType="next" onSubmitEditing={onSubmitPin1} />

              <Text style={styles.fieldLabel}>Confirmer</Text>
              <PinField ref={pin2Ref} value={pinConfirm} onChangeText={setPinConfirm} returnKeyType="next" onSubmitEditing={onSubmitPin2} />

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
              <Text style={styles.hint}>{`${filename.trim() || 'almanac-export'}-${fmtDateTiretHM()}.almanac`}</Text>

              <View style={styles.warningBox}>
                <MaterialCommunityIcons name="alert-outline" size={14} color={theme.colors.textMuted} />
                <Text style={styles.warningText}>Si tu oublies ce code, le fichier sera illisible.</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); setStep('select'); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.cancelText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleExport} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.confirmText}>Exporter</Text>
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
              <TouchableOpacity onPress={onClose} style={styles.okBtn}>
                <Text style={styles.confirmText}>OK</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg,
  },
  // Clavier ouvert : carte collée en haut pour rester dans la zone libre
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 10,
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md,
    width: '100%', maxWidth: 440, maxHeight: '100%',
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600',
    textAlign: 'center', marginBottom: theme.spacing.sm, letterSpacing: 0.3,
  },
  intro: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '400',
    lineHeight: 20, marginBottom: theme.spacing.md, textAlign: 'center',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: theme.spacing.sm, marginTop: theme.spacing.sm,
  },
  sectionLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '400',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  toggleAllText: { color: theme.colors.text, fontSize: theme.font.sizes.sm, textDecorationLine: 'underline' },
  list: { maxHeight: 380 },
  fieldLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '400',
    letterSpacing: 1, textTransform: 'uppercase', marginTop: theme.spacing.xs,
  },
  input: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '400',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    paddingVertical: 6, textAlign: 'center',
  },
  hint: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontStyle: 'italic',
    marginTop: 6, marginBottom: 8, textAlign: 'center',
  },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm,
    alignItems: 'center', paddingVertical: 9, paddingHorizontal: theme.spacing.sm, borderRadius: 4, marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  warningText: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, lineHeight: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.lg, marginTop: theme.spacing.md },
  cancelText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '400', paddingVertical: 4 },
  confirmText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', paddingVertical: 4 },
  busyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.md },
  busyText: { color: theme.colors.text, fontSize: theme.font.sizes.sm },
  resultWrap: { alignItems: 'center', paddingVertical: theme.spacing.md },
  resultTitle: {
    fontSize: theme.font.sizes.md, fontWeight: '600', textAlign: 'center',
    marginTop: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  resultMessage: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, textAlign: 'center',
    lineHeight: 22, marginBottom: theme.spacing.lg,
  },
  okBtn: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.xs },
});
