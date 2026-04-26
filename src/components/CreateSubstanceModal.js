import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { theme } from '../theme';
import { useStore } from '../store';

// Pour l'instant on assigne une couleur par défaut et une icône par défaut.
// Les vrais sélecteurs arriveront aux incréments suivants.
const DEFAULT_COLOR = theme.substanceColors[0];
const DEFAULT_ICON = 'circle';

export default function CreateSubstanceModal({ visible, onClose }) {
  const [name, setName] = useState('');
  const [colorIndex, setColorIndex] = useState(0);
  const createSubstance = useStore((s) => s.createSubstance);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createSubstance({
      name: trimmed,
      color: theme.substanceColors[colorIndex],
      icon: DEFAULT_ICON,
    });
    setName('');
    setColorIndex(0);
    onClose();
  };

  const handleCancel = () => {
    setName('');
    setColorIndex(0);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>Nouvelle substance</Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nom"
              placeholderTextColor={theme.colors.textFaint}
              style={styles.input}
              autoFocus
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
            />

            <Text style={styles.fieldLabel}>Couleur</Text>
            <View style={styles.colorRow}>
              {theme.substanceColors.map((c, i) => (
                <TouchableOpacity
                  key={c + i}
                  onPress={() => setColorIndex(i)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    colorIndex === i && styles.colorDotSelected,
                  ]}
                />
              ))}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity onPress={handleCancel} style={styles.actionBtn}>
                <Text style={styles.actionMuted}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                style={styles.actionBtn}
                disabled={!name.trim()}
              >
                <Text
                  style={[
                    styles.actionPrimary,
                    !name.trim() && styles.actionDisabled,
                  ]}
                >
                  Créer
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    padding: theme.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.lg,
    fontWeight: '300',
    letterSpacing: 1,
    marginBottom: theme.spacing.lg,
  },
  input: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: theme.spacing.lg,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: theme.colors.text,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  actionBtn: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  actionMuted: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 1,
  },
  actionPrimary: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 1,
  },
  actionDisabled: {
    color: theme.colors.textFaint,
  },
});
