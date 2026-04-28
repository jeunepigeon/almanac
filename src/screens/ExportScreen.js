import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { dbGetSubstances, dbGetAllConsumptions } from '../db';
import { buildExportFile } from '../utils/exportImport';

export default function ExportScreen() {
  const navigation = useNavigation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    if (password.length < 4) {
      Alert.alert('Mot de passe trop court', 'Au moins 4 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mots de passe différents', 'Les deux champs doivent être identiques.');
      return;
    }

    setBusy(true);
    try {
      const substances = await dbGetSubstances({ includeArchived: true });
      const consumptions = await dbGetAllConsumptions();
      const fileContent = await buildExportFile(substances, consumptions, password);

      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `almanac_export_${stamp}`;
      const path = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(path, fileContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(path, {
          mimeType: 'text/plain',
          dialogTitle: 'Exporter Almanac',
        });
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Toutes tes données seront chiffrées avec ce mot de passe (AES-256). Tu pourras les
          ré-importer ici, ou les déchiffrer manuellement à condition de connaître le mot de
          passe.
        </Text>

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

        <Text style={styles.fieldLabel}>Confirmer</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="..."
          placeholderTextColor={theme.colors.textFaint}
          style={styles.input}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="oneTimeCode"
        />

        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={16} color={theme.colors.textMuted} />
          <Text style={styles.warningText}>
            Si tu oublies ce mot de passe, le fichier sera illisible. Note-le quelque part.
          </Text>
        </View>

        <TouchableOpacity onPress={handleExport} style={styles.primaryBtn} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.primaryBtnText}>Exporter</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
});
