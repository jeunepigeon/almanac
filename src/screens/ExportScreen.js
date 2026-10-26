// ExportScreen multi-étapes (comme ImportScreen) :
// 1. select : liste substances avec cases couleur (toutes cochées par défaut)
// 2. password : PIN 4 chiffres + confirmation (champ rouge + vibration si incorrect)
// Spinner overlay plein écran pendant chiffrement. Keep awake.

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Modal, Vibration, Animated, Pressable,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../theme';
import { dbGetSubstances, dbGetAllConsumptions, dbGetSnapshotData } from '../db';
import { buildExportFile } from '../utils/exportImport';
import { parseSnapshot, fmtDateTiret } from '../utils/snapshots';
import { useKeepAwake } from '../utils/keepAwake';

export default function ExportScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const snapshotId = route.params?.snapshotId ?? null;

  // Flow : 'select' → 'password'
  const [step, setStep] = useState('select');
  const [subs, setSubs] = useState([]); // {id, name, color}
  const [snapParsed, setSnapParsed] = useState(null);
  const [selected, setSelected] = useState({});

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [pinError, setPinError] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useKeepAwake('export-screen');

  // Load substances disponibles
  useEffect(() => {
    (async () => {
      let list;
      if (snapshotId) {
        const data = await dbGetSnapshotData(snapshotId);
        if (data) {
          const parsed = parseSnapshot(data);
          setSnapParsed(parsed);
          list = parsed.substances;
        } else list = [];
      } else {
        list = await dbGetSubstances({ includeArchived: true });
      }
      setSubs(list.map((s) => ({ id: s.id, name: s.name, color: s.color })));
      const sel = {};
      for (const s of list) sel[s.id] = true;
      setSelected(sel);
    })();
  }, [snapshotId]);

  const toggleSub = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const allSelected = subs.length > 0 && subs.every((s) => selected[s.id]);
  const noneSelected = subs.length > 0 && subs.every((s) => !selected[s.id]);
  const toggleAll = () => {
    const next = {};
    const target = !allSelected;
    for (const s of subs) next[s.id] = target;
    setSelected(next);
  };

  const triggerShake = (which = 'confirm') => {
    if (which === 'confirm') setConfirmError(true);
    else setPinError(true);
    Vibration.vibrate(80);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleGoToPassword = () => {
    if (noneSelected) return;
    setStep('password');
  };

  const handleExport = async () => {
    if (password.length !== 4 || !/^\d{4}$/.test(password)) {
      triggerShake('pin');
      return;
    }
    if (password !== confirmPassword) {
      triggerShake('confirm');
      return;
    }
    const selectedIds = subs.filter((s) => selected[s.id]).map((s) => s.id);

    setBusy(true);
    try {
      let substances, consumptions, filenameBase;
      if (snapshotId && snapParsed) {
        substances = snapParsed.substances.filter((s) => selectedIds.includes(s.id)).map((s) => ({
          id: s.id, name: s.name, color: s.color, icon: s.icon,
          created_at: s.createdAt, archived: s.archived ? 1 : 0, position: s.position ?? 0,
        }));
        const subIds = new Set(selectedIds);
        consumptions = snapParsed.consumptions.filter((c) => subIds.has(c.substanceId)).map((c) => ({
          id: c.id, substance_id: c.substanceId, timestamp: c.timestamp,
          dosage: c.dosage, notes: c.notes, created_at: c.createdAt,
        }));
        filenameBase = `snapshot-${fmtDateTiret()}`;
      } else {
        const allSubs = await dbGetSubstances({ includeArchived: true });
        substances = allSubs.filter((s) => selectedIds.includes(s.id));
        const allCons = await dbGetAllConsumptions();
        const subIds = new Set(selectedIds);
        consumptions = allCons.filter((c) => subIds.has(c.substance_id));
        filenameBase = `almanac-export-${fmtDateTiret()}`;
      }

      const fileContent = await buildExportFile(substances, consumptions, password);
      const filename = `${filenameBase}.almanac`;
      const cachePath = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(cachePath, fileContent, { encoding: FileSystem.EncodingType.UTF8 });

      // Préfère SAF : sauvegarde directe dans un dossier choisi par l'utilisateur
      let savedDirectly = false;
      try {
        const SAF = FileSystem.StorageAccessFramework;
        if (SAF && Platform.OS === 'android') {
          const perm = await SAF.requestDirectoryPermissionsAsync();
          if (perm.granted) {
            const destUri = await SAF.createFileAsync(perm.directoryUri, filename, 'application/octet-stream');
            await SAF.writeAsStringAsync(destUri, fileContent, { encoding: FileSystem.EncodingType.UTF8 });
            savedDirectly = true;
          }
        }
      } catch {
        // Fallback vers Sharing
      }

      if (!savedDirectly) {
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(cachePath, { mimeType: 'text/plain', dialogTitle: 'Exporter Almanac' });
        } else {
          Alert.alert('Export créé', `Fichier créé : ${cachePath}`);
        }
      }

      setPassword('');
      setConfirmPassword('');
      navigation.goBack();
    } catch (e) {
      Alert.alert("Erreur d'export", e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* ========== STEP SELECT ========== */}
        {step === 'select' && (
          <>
            <Text style={styles.intro}>
              Coche les substances à inclure dans l'export.
            </Text>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>
                {subs.length} substance{subs.length > 1 ? 's' : ''}
              </Text>
              <TouchableOpacity onPress={toggleAll}>
                <Text style={styles.toggleAllText}>
                  {allSelected ? 'Tout décocher' : 'Tout cocher'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.subsList}>
              <ScrollView style={{ maxHeight: 380 }}>
                {subs.map((sub) => {
                  const isChecked = !!selected[sub.id];
                  return (
                    <Pressable key={sub.id} onPress={() => toggleSub(sub.id)} style={styles.subRow}>
                      <View style={[
                        styles.checkbox,
                        { borderColor: sub.color },
                        isChecked && { backgroundColor: sub.color },
                      ]}>
                        {isChecked && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                      </View>
                      <Text style={styles.subName}>{sub.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <TouchableOpacity
              onPress={handleGoToPassword}
              style={[styles.primaryBtn, noneSelected && { opacity: 0.4 }]}
              disabled={noneSelected}
            >
              <Text style={styles.primaryBtnText}>Suivant</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ========== STEP PASSWORD ========== */}
        {step === 'password' && (
          <>
            <Text style={styles.intro}>
              Choisis un code PIN à 4 chiffres pour chiffrer le fichier.
            </Text>

            <Text style={styles.fieldLabel}>Code PIN (4 chiffres)</Text>
            <Animated.View style={{ transform: [{ translateX: pinError ? shakeAnim : 0 }] }}>
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

            <Text style={styles.fieldLabel}>Confirmer</Text>
            <Animated.View style={{ transform: [{ translateX: confirmError ? shakeAnim : 0 }] }}>
              <TextInput
                value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v.replace(/\D/g, '').slice(0, 4)); setConfirmError(false); }}
                placeholder="••••"
                placeholderTextColor={theme.colors.textFaint}
                style={[styles.input, confirmError && styles.inputError]}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={4}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="oneTimeCode"
              />
            </Animated.View>

            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={16} color={theme.colors.textMuted} />
              <Text style={styles.warningText}>
                Si tu oublies ce code PIN, le fichier sera illisible.
              </Text>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity onPress={() => setStep('select')} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleExport} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Exporter</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Overlay spinner plein écran */}
      <Modal visible={busy} transparent animationType="fade">
        <View style={styles.spinnerOverlay}>
          <View style={styles.spinnerCard}>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={styles.spinnerText}>Chiffrement en cours…</Text>
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
  subsList: {
    marginBottom: theme.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 4,
    paddingVertical: theme.spacing.xs,
  },
  subRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  subName: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  fieldLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: theme.spacing.sm, marginTop: theme.spacing.sm,
  },
  input: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.md,
  },
  inputError: {
    borderBottomColor: theme.colors.danger, borderBottomWidth: 2, color: theme.colors.danger,
  },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm,
    marginTop: theme.spacing.md, marginBottom: theme.spacing.lg,
    padding: theme.spacing.md, borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  warningText: {
    flex: 1, color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: theme.colors.text, paddingVertical: theme.spacing.md,
    borderRadius: 4, alignItems: 'center', marginTop: theme.spacing.md,
    flex: 1,
  },
  primaryBtnText: {
    color: theme.colors.background, fontSize: theme.font.sizes.md,
    fontWeight: '500', letterSpacing: 1,
  },
  secondaryBtn: {
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg,
    borderRadius: 4, alignItems: 'center', marginTop: theme.spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  secondaryBtnText: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.md,
    fontWeight: '400', letterSpacing: 1,
  },
  actionsRow: {
    flexDirection: 'row', gap: theme.spacing.md,
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
});
