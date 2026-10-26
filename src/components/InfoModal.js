// Modal custom centrée pour les messages d'info.
// Tout est centré : titre, message, bouton. Message peut être multi-lignes.
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { theme } from '../theme';

export default function InfoModal({
  visible, title, message, buttonLabel = 'OK', onClose,
  icon = null,       // 'success' | 'error' | null  → petite icône centrée au-dessus du titre
  iconColor = null,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TouchableOpacity onPress={onClose} style={styles.btn}>
            <Text style={styles.btnText}>{buttonLabel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 10,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    width: '100%', maxWidth: 400,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    alignItems: 'center',
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '600', textAlign: 'center',
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  message: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', lineHeight: 22,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  btn: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: 6,
  },
  btnText: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '600', letterSpacing: 1,
  },
});
