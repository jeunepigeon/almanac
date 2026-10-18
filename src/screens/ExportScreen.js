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
import { useKeepAwake } from '../utils/keepAwake';
import { theme } from '../theme';
import { dbGetSubstances, dbGetAllConsumptions, dbGetSnapshotData } from '../db';
import { buildExportFile } from '../utils/exportImport';
import { parseSnapshot, fmtDateTiret } from '../utils/snapshots';

export default function ExportScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const snapshotId = route.params?.snapshotId ?? null;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [subs, setSubs] = useState([]); // {id, name, color, selected}
  const [snapParsed, setSnapParsed] = useState(null);
  const [confirmError, setConfirmError] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Garde l'écran allumé pendant l'opération
  useKeepAwake('export-screen');

  // Load substances disponibles pour cases à cocher
  useEffect(() => {
    (async () => {
      if (snapshotId) {
        const data = await dbGetSnapshotData(snapshotId);
        if (data) {
          const parsed = parseSnapshot(data);
          setSnapParsed(parsed);
          setSubs(parsed.substances.map((s) => ({
            id: s.id, name: s.name, color: s.color, selected: true,
          })));
        }
      } else {
        const list = await dbGetSubstances({ includeArchived: true });
        setSubs(list.map((s) => ({
          id: s.id, name: s.name, color: s.color, selected: true,
        })));
      }
    })();
  }, [snapshotId]);

  const toggleSub = (id) => {
    setSubs((prev) => prev.map((s) => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const toggleAll = (val) => {
    setSubs((prev) => prev.map((s) => ({ ...s, selected: val })));
  };

  const triggerShake = () => {
    setConfirmError(true);
    Vibration.vibrate(80);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleExport = async () => {
    if (password.length !== 4 || !/^\d{4}$/.test(password)) {
      triggerShake();
      return;
    }
    if (password !== confirmPassword) {
      triggerShake();
      return;
    }
    const selectedIds = subs.filter((s) => s.selected).map((s) => s.id);
    if (selectedIds.length === 0) {
      Alert.alert('Aucune substance sélectionnée', 'Coche au moins une substance.');
      return;
    }

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
      const path = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(path, fileContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: 'Exporter Almanac' });
      } else {
        Alert.alert('Export créé', `Fichier créé : ${path}`);
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

  const allSelected = subs.length > 0 && subs.every((s) => s.selected);
  const noneSelected = subs.length > 0 && subs.every((s) => !s.selected);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Toutes les données cochées seront chiffrées avec ce code PIN (AES-256).
        </Text>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Substances à exporter</Text>
          <TouchableOpacity onPress={() => toggleAll(!allSelected)}>
            <Text style={styles.toggleAllText}>
              {allSelected ? 'Tout décocher' : 'Tout cocher'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.subsList}>
          {subs.map((sub) => (
            <Pressable key={sub.id} onPress={() => toggleSub(sub.id)} style={styles.subRow}>
              <View style={[
                styles.checkbox,
                { borderColor: sub.color },
                sub.selected && { backgroundColor: sub.color },
              ]}>
                {sub.selected && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
              </View>
              <Text style={styles.subName}>{sub.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Code PIN (4 chiffres)</Text>
        <TextInput
          value={password}
          onChangeText={(v) => { setPassword(v.replace(/\D/g, '').slice(0, 4)); setConfirmError(false); }}
          placeholder="••••"
          placeholderTextColor={theme.colors.textFaint}
          style={styles.input}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={4}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="oneTimeCode"
        />

        <Text style={styles.fieldLabel}>Confirmer</Text>
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
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

        <TouchableOpacity
          onPress={handleExport}
          style={[styles.primaryBtn, noneSelected && { opacity: 0.5 }]}
          disabled={busy || noneSelected}
        >
          <Text style={styles.primaryBtnText}>Exporter</Text>
        </TouchableOpacity>
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
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
  },
  toggleAllText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400',
    textDecorationLine: 'underline',
  },
  subsList: {
    marginBottom: theme.spacing.lg,
    maxHeight: 240,
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
    borderBottomColor: theme.colors.danger,
    borderBottomWidth: 2,
    color: theme.colors.danger,
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
});
