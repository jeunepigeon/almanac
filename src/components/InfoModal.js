// Modal custom centrée pour les messages d'info (remplace Alert.alert alignés à gauche sur Android)
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

export default function InfoModal({ visible, title, message, buttonLabel = 'OK', onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TouchableOpacity onPress={onClose} style={styles.btn}>
            <Text style={styles.btnText}>{buttonLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 8,
    padding: theme.spacing.lg, width: '100%',
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    alignItems: 'center',
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '500', textAlign: 'center', marginBottom: theme.spacing.sm,
  },
  message: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', lineHeight: 20,
    textAlign: 'center', marginBottom: theme.spacing.md,
  },
  btn: {
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
  },
  btnText: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '500', letterSpacing: 1,
  },
});
