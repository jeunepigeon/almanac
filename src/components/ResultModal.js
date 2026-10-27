// Modal résultat success/erreur partagée (export, import, restore).
// Centrée, icône, titre, message multi-lignes, 1 bouton OK.

import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

export default function ResultModal({ visible, ok, title, message, onClose, buttonLabel = 'OK' }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <MaterialCommunityIcons
            name={ok ? 'check-circle-outline' : 'close-circle-outline'}
            size={48}
            color={ok ? '#01C853' : theme.colors.danger}
          />
          <Text style={[styles.title, { color: ok ? theme.colors.text : theme.colors.danger }]}>
            {title}
          </Text>
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
    paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.lg,
    width: '100%', maxWidth: 400,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.font.sizes.md,
    fontWeight: '600',
    marginTop: theme.spacing.lg,       // + d'espace entre icône et titre
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  message: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', lineHeight: 22,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,     // + d'espace entre message et bouton
  },
  btn: {
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xl,
    borderRadius: 6,
  },
  btnText: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '600', letterSpacing: 1,
  },
});
