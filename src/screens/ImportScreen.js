import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Pressable, Modal,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { parseExportFile } from '../utils/exportImport';
import { dbImportBatch, uuid } from '../db';
import { useStore } from '../store';
import { getIconById } from '../icons';

export default function ImportScreen() {
  const navigation = useNavigation();
  const loadAll = useStore((s) => s.loadAll);

  const [step, setStep] = useState('pick');
  const [fileContent, setFileContent] = useState(null);
  const [password, setPassword] = useState('');
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  // Loading pendant l'import lui-même (distinct du busy du déchiffrement)
  const [importing, setImporting] = useState(false);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      setFileContent(content);
      setStep('password');
    } catch (e) {
      Alert.alert('Erreur', e.message || String(e));
    }
  };

  const decrypt = async () => {
    setBusy(true);
    try {
      const data = parseExportFile(fileContent, password);
      setParsed(data);
      const sel = {};
      for (const s of data.substances) sel[s.id] = true;
      setSelected(sel);
      setStep('select');
    } catch (e) {
      Alert.alert('Erreur', e.message || String(e));
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

  const doImport = async () => {
    setImporting(true);
    try {
      const importedSubIds = parsed.substances
        .filter((s) => selected[s.id])
        .map((s) => s.id);

      const allNames = new Set(
        [...useStore.getState().substances, ...useStore.getState().archivedSubstances].map(
          (s) => s.name.toLowerCase()
        )
      );

      const idMap = {};
      const substancesToInsert = [];

      for (const subId of importedSubIds) {
        const sub = parsed.substances.find((x) => x.id === subId);
        let name = sub.name;
        if (allNames.has(name.toLowerCase())) {
          let n = 2;
          while (allNames.has(`${sub.name} (import ${n})`.toLowerCase())) n++;
          name = `${sub.name} (import ${n})`;
        }
        allNames.add(name.toLowerCase());

        const newId = uuid();
        idMap[sub.id] = newId;
        substancesToInsert.push({
          id: newId,
          name,
          color: sub.color,
          icon: sub.icon,
          createdAt: sub.createdAt,
          archived: false,
          position: sub.position ?? 9999,
        });
      }

      const consumptionsToInsert = parsed.consumptions
        .filter((c) => idMap[c.substanceId])
        .map((c) => ({
          id: uuid(),
          substanceId: idMap[c.substanceId],
          timestamp: c.timestamp,
          dosage: c.dosage,
          notes: c.notes,
          createdAt: c.createdAt || c.timestamp,
        }));

      await dbImportBatch(substancesToInsert, consumptionsToInsert);
      await loadAll();

      Alert.alert(
        'Import réussi',
        `${importedSubIds.length} substance(s) et ${consumptionsToInsert.length} consommation(s) importées.`
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
      {/* Overlay de chargement pendant l'import */}
      <Modal visible={importing} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={styles.loadingText}>Import en cours...</Text>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>
        {step === 'pick' && (
          <>
            <Text style={styles.intro}>
              Choisis un fichier d'export Almanac à restaurer. Tu auras besoin du mot de
              passe utilisé lors de l'export.
            </Text>
            <TouchableOpacity onPress={pickFile} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Choisir un fichier</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'password' && (
          <>
            <Text style={styles.intro}>Entre le mot de passe utilisé lors de l'export.</Text>
            <Text style={styles.fieldLabel}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="..."
              placeholderTextColor={theme.colors.textFaint}
              style={styles.input}
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="oneTimeCode"
            />
            <TouchableOpacity onPress={decrypt} style={styles.primaryBtn} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={theme.colors.background} />
              ) : (
                <Text style={styles.primaryBtnText}>Déchiffrer</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === 'select' && parsed && (
          <>
            <Text style={styles.intro}>
              Coche les substances à importer. Si un nom existe déjà, il sera suffixé "(import N)".
            </Text>

            <TouchableOpacity onPress={toggleAll} style={styles.toggleAllBtn}>
              <Text style={styles.toggleAllText}>
                {allSelected ? 'Tout décocher' : 'Tout cocher'}
              </Text>
            </TouchableOpacity>

            {parsed.substances.map((sub) => {
              const iconEntry = getIconById(sub.icon);
              const consumptionsCount = parsed.consumptions.filter(
                (c) => c.substanceId === sub.id
              ).length;
              const checked = !!selected[sub.id];
              return (
                <Pressable
                  key={sub.id}
                  onPress={() => toggleSelected(sub.id)}
                  style={({ pressed }) => [styles.subRow, pressed && styles.subRowPressed]}
                >
                  <View style={styles.checkbox}>
                    {checked && (
                      <Ionicons name="checkmark" size={16} color={theme.colors.text} />
                    )}
                  </View>
                  <View style={[styles.iconWrap, { borderColor: sub.color }]}>
                    <MaterialCommunityIcons name={iconEntry.icon} size={16} color={sub.color} />
                  </View>
                  <View style={styles.subMiddle}>
                    <Text style={styles.subName}>{sub.name}</Text>
                    <Text style={styles.subMeta}>
                      {consumptionsCount} consommation{consumptionsCount !== 1 ? 's' : ''}
                      {sub.archived ? ' · archivée' : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <TouchableOpacity onPress={doImport} style={styles.primaryBtn} disabled={importing}>
              <Text style={styles.primaryBtnText}>Importer</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingVertical: theme.spacing.lg, paddingHorizontal: theme.spacing.lg },
  intro: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
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
  primaryBtn: {
    backgroundColor: theme.colors.text,
    paddingVertical: theme.spacing.md,
    borderRadius: 4, alignItems: 'center', marginTop: theme.spacing.lg,
  },
  primaryBtnText: {
    color: theme.colors.background,
    fontSize: theme.font.sizes.md, fontWeight: '500', letterSpacing: 1,
  },
  toggleAllBtn: { paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.sm },
  toggleAllText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm, fontWeight: '300', textDecorationLine: 'underline',
  },
  subRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  subRowPressed: { backgroundColor: theme.colors.surface },
  checkbox: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 1, borderColor: theme.colors.textMuted,
    justifyContent: 'center', alignItems: 'center',
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
  },
  subMiddle: { flex: 1, gap: 2 },
  subName: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  subMeta: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    minWidth: 200,
  },
  loadingText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 1,
  },
});
