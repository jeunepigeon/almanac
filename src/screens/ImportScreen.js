import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Pressable, Modal, Vibration, Animated,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useKeepAwake } from '../utils/keepAwake';
import { theme } from '../theme';
import { parseExportFile } from '../utils/exportImport';
import { dbInsertSubstanceRaw, dbInsertConsumptionRaw, dbGetConsumptionsBySubstance, uuid } from '../db';
import { useStore } from '../store';
import { fmtDateTiret } from '../utils/snapshots';

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

export default function ImportScreen() {
  const navigation = useNavigation();
  const loadAll = useStore((s) => s.loadAll);
  const createSnapshotFromLive = useStore((s) => s.createSnapshotFromLive);

  const [step, setStep] = useState('pick');
  const [fileContent, setFileContent] = useState(null);
  const [password, setPassword] = useState('');
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pinError, setPinError] = useState(false);

  // Pop-up conflit : {parsedSub, resolve}
  const [conflictModal, setConflictModal] = useState(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useKeepAwake('import-screen');

  const triggerShake = () => {
    setPinError(true);
    Vibration.vibrate(80);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      setFileContent(content);
      setStep('password');
    } catch (e) {
      Alert.alert('Erreur', e.message || String(e));
    }
  };

  const decrypt = async () => {
    if (password.length !== 4 || !/^\d{4}$/.test(password)) {
      triggerShake();
      return;
    }
    setBusy(true);
    try {
      const data = parseExportFile(fileContent, password);
      setParsed(data);
      const sel = {};
      for (const s of data.substances) sel[s.id] = true;
      setSelected(sel);
      setStep('select');
    } catch (e) {
      triggerShake();
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (id) => {
    setSelected((sel) => ({ ...sel, [id]: !sel[id] }));
  };

  const allSelected = parsed?.substances.every((s) => selected[s.id]);
  const toggleAll = () => {
    const next = {};
    for (const s of parsed.substances) next[s.id] = !allSelected;
    setSelected(next);
  };

  // Attend une décision de l'utilisateur pour un conflit de nom
  const askConflictChoice = (parsedSub) => new Promise((resolve) => {
    setConflictModal({ parsedSub, resolve });
  });

  const resolveConflict = (choice) => {
    if (conflictModal) {
      conflictModal.resolve(choice);
      setConflictModal(null);
    }
  };

  // Trouve un nom unique avec suffixe (2), (3), etc.
  const makeNumberedName = (baseName, takenNames) => {
    let n = 2;
    while (takenNames.has(normalizeName(`${baseName} (${n})`))) n++;
    return `${baseName} (${n})`;
  };

  const doImport = async () => {
    setImporting(true);
    try {
      // Snapshot auto AVANT l'import
      await createSnapshotFromLive(`avant-import-${fmtDateTiret()}`);

      const importedSubIds = parsed.substances.filter((s) => selected[s.id]).map((s) => s.id);
      const importedSubsSelected = parsed.substances.filter((s) => selected[s.id]);

      // Map des noms actifs (lowercase) → substance active
      const activeSubs = [...useStore.getState().substances, ...useStore.getState().archivedSubstances];
      const activeByName = new Map();
      const takenNames = new Set();
      for (const s of activeSubs) {
        activeByName.set(normalizeName(s.name), s);
        takenNames.add(normalizeName(s.name));
      }

      // Map : snapshot_substance_id → active_substance_id
      const idMap = {};
      let importedCount = 0;
      let mergedCount = 0;
      let numberedCount = 0;
      let ignoredCount = 0;

      for (const sub of importedSubsSelected) {
        const key = normalizeName(sub.name);
        const existing = activeByName.get(key);

        if (!existing) {
          // Pas de conflit → créer tel quel
          const newId = uuid();
          await dbInsertSubstanceRaw({
            id: newId, name: sub.name, color: sub.color, icon: sub.icon,
            createdAt: sub.createdAt, archived: false, position: sub.position ?? 9999,
          });
          idMap[sub.id] = newId;
          takenNames.add(key);
          importedCount++;
        } else {
          // Conflit : demander à l'utilisateur
          const choice = await askConflictChoice(sub);
          if (choice === 'merge') {
            // Fusion : router les consos vers la substance active
            idMap[sub.id] = existing.id;
            mergedCount++;
          } else if (choice === 'number') {
            // Numéroter : nouveau nom unique
            const newName = makeNumberedName(sub.name, takenNames);
            const newId = uuid();
            await dbInsertSubstanceRaw({
              id: newId, name: newName, color: sub.color, icon: sub.icon,
              createdAt: sub.createdAt, archived: false, position: sub.position ?? 9999,
            });
            idMap[sub.id] = newId;
            takenNames.add(normalizeName(newName));
            numberedCount++;
          } else {
            // Ignorer
            ignoredCount++;
            continue;
          }
        }
      }

      // Consos : router selon idMap, dédup par timestamp exact
      let consosAdded = 0;
      for (const c of parsed.consumptions) {
        const destSubId = idMap[c.substanceId];
        if (!destSubId) continue;
        const existingList = await dbGetConsumptionsBySubstance(destSubId);
        const dup = existingList.some((ec) => ec.timestamp === c.timestamp);
        if (dup) continue;
        await dbInsertConsumptionRaw({
          id: uuid(), substanceId: destSubId, timestamp: c.timestamp,
          dosage: c.dosage, notes: c.notes, createdAt: c.createdAt || c.timestamp,
        });
        consosAdded++;
      }

      await loadAll();

      Alert.alert(
        'Import terminé',
        `${importedCount} ajoutée(s), ${mergedCount} fusionnée(s), ${numberedCount} numérotée(s), ${ignoredCount} ignorée(s).\n${consosAdded} consommation(s) importée(s).`
      );
      navigation.goBack();
    } catch (e) {
      Alert.alert("Erreur d'import", e.message || String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {step === 'pick' && (
          <>
            <Text style={styles.intro}>
              Sélectionne un fichier .almanac à importer.
            </Text>
            <TouchableOpacity onPress={pickFile} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Choisir un fichier</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'password' && (
          <>
            <Text style={styles.intro}>Entre le code PIN du fichier (4 chiffres).</Text>
            <Text style={styles.fieldLabel}>Code PIN</Text>
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <TextInput
                value={password}
                onChangeText={(v) => { setPassword(v.replace(/\D/g, '').slice(0, 4)); setPinError(false); }}
                placeholder="••••"
                placeholderTextColor={theme.colors.textFaint}
                style={[styles.input, pinError && styles.inputError]}
                secureTextEntry
                autoFocus
                keyboardType="number-pad"
                maxLength={4}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="oneTimeCode"
              />
            </Animated.View>
            <TouchableOpacity onPress={decrypt} style={styles.primaryBtn} disabled={busy}>
              <Text style={styles.primaryBtnText}>Déchiffrer</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'select' && parsed && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Substances à importer</Text>
              <TouchableOpacity onPress={toggleAll}>
                <Text style={styles.toggleAllText}>
                  {allSelected ? 'Tout décocher' : 'Tout cocher'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.subsList}>
              {parsed.substances.map((sub) => (
                <Pressable key={sub.id} onPress={() => toggleSelected(sub.id)} style={styles.subRow}>
                  <View style={[
                    styles.checkbox,
                    { borderColor: sub.color },
                    selected[sub.id] && { backgroundColor: sub.color },
                  ]}>
                    {selected[sub.id] && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                  </View>
                  <Text style={styles.subName}>{sub.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.hint}>
              Un snapshot est créé automatiquement avant l'import pour pouvoir annuler.
            </Text>

            <TouchableOpacity onPress={doImport} style={styles.primaryBtn} disabled={importing}>
              <Text style={styles.primaryBtnText}>Importer</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Overlay spinner déchiffrement */}
      <Modal visible={busy} transparent animationType="fade">
        <View style={styles.spinnerOverlay}>
          <View style={styles.spinnerCard}>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={styles.spinnerText}>Déchiffrement en cours…</Text>
          </View>
        </View>
      </Modal>

      {/* Overlay spinner import */}
      <Modal visible={importing && !conflictModal} transparent animationType="fade">
        <View style={styles.spinnerOverlay}>
          <View style={styles.spinnerCard}>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={styles.spinnerText}>Import en cours…</Text>
          </View>
        </View>
      </Modal>

      {/* Modal conflit de nom */}
      <Modal visible={!!conflictModal} transparent animationType="fade">
        <View style={styles.spinnerOverlay}>
          <View style={styles.conflictCard}>
            <Text style={styles.conflictTitle}>Nom déjà existant</Text>
            <Text style={styles.conflictMessage}>
              Une substance nommée "{conflictModal?.parsedSub?.name}" existe déjà. Que veux-tu faire ?
            </Text>
            <TouchableOpacity onPress={() => resolveConflict('merge')} style={styles.conflictBtn}>
              <Text style={styles.conflictBtnText}>Fusionner</Text>
              <Text style={styles.conflictBtnHint}>Ajouter les consos à la substance existante</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => resolveConflict('number')} style={styles.conflictBtn}>
              <Text style={styles.conflictBtnText}>Numéroter</Text>
              <Text style={styles.conflictBtnHint}>Créer "{conflictModal?.parsedSub?.name} (2)"</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => resolveConflict('ignore')} style={styles.conflictBtn}>
              <Text style={styles.conflictBtnText}>Ignorer</Text>
              <Text style={styles.conflictBtnHint}>Ne pas importer cette substance</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingVertical: theme.spacing.lg, paddingHorizontal: theme.spacing.lg },
  intro: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', lineHeight: 20, marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
  },
  toggleAllText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400',
    textDecorationLine: 'underline',
  },
  subsList: {
    marginBottom: theme.spacing.md,
    maxHeight: 300,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 4,
    paddingVertical: theme.spacing.xs,
  },
  subRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  subName: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  hint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontStyle: 'italic', marginBottom: theme.spacing.md },
  fieldLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  input: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.md,
  },
  inputError: {
    borderBottomColor: theme.colors.danger,
    borderBottomWidth: 2,
    color: theme.colors.danger,
  },
  primaryBtn: {
    backgroundColor: theme.colors.text, paddingVertical: theme.spacing.md,
    borderRadius: 4, alignItems: 'center', marginTop: theme.spacing.md,
  },
  primaryBtnText: {
    color: theme.colors.background, fontSize: theme.font.sizes.md,
    fontWeight: '500', letterSpacing: 1,
  },
  spinnerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center',
  },
  spinnerCard: {
    backgroundColor: theme.colors.surface, padding: theme.spacing.xl,
    borderRadius: 8, alignItems: 'center', gap: theme.spacing.md,
    minWidth: 180,
  },
  spinnerText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300',
  },
  conflictCard: {
    backgroundColor: theme.colors.surface, padding: theme.spacing.lg,
    borderRadius: 8, width: '85%', borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
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
