import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { theme } from '../theme';

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  destructive = false,
  // Si on veut afficher 2 boutons d'action en plus d'annuler (ex: archiver / effacer).
  extraActions = null,
  hideCancel = false,
  // Si true, tout le texte du modal est en rouge sur fond gris (confirmation ULTRA destructive)
  allRed = false,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.center}>
          <Pressable style={[styles.card, allRed && styles.cardRed]} onPress={() => {}}>
            {title ? <Text style={[styles.title, allRed && styles.titleRed]} numberOfLines={1} adjustsFontSizeToFit>{title}</Text> : null}
            {message ? <Text style={[styles.message, allRed && styles.messageRed]}>{message}</Text> : null}

            {extraActions ? (
              <View style={styles.actionsCol}>
                {extraActions.map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    onPress={a.onPress}
                    style={styles.actionRow}
                  >
                    <Text
                      style={[
                        styles.actionRowLabel,
                        a.destructive && { color: theme.colors.danger },
                      ]}
                    >
                      {a.label}
                    </Text>
                    {a.hint ? <Text style={styles.actionRowHint}>{a.hint}</Text> : null}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={onCancel} style={styles.actionRow}>
                  <Text style={styles.actionMuted}>{cancelLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.actions}>
                {!hideCancel && (
                  <TouchableOpacity onPress={onCancel} style={styles.actionBtn}>
                    <Text style={styles.actionMuted}>{cancelLabel}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onConfirm} style={[styles.actionBtn, allRed && styles.confirmBtnRed]}>
                  <Text style={allRed ? styles.confirmTextRed : (destructive ? styles.actionDanger : styles.actionPrimary)}>
                    {confirmLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </View>
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
  cardRed: {
    backgroundColor: '#2a1a1a',
    borderColor: theme.colors.danger,
    borderWidth: 1,
  },
  titleRed: { color: theme.colors.danger, fontWeight: '700' },
  messageRed: { color: theme.colors.danger, fontWeight: '400' },
  confirmBtnRed: {
    backgroundColor: theme.colors.danger,
    borderRadius: 4,
    paddingHorizontal: theme.spacing.md,
  },
  confirmTextRed: {
    color: '#fff',
    fontSize: theme.font.sizes.md,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  actionsCol: {
    gap: theme.spacing.xs,
  },
  actionBtn: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  actionRow: {
    paddingVertical: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  actionRowLabel: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  actionRowHint: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    marginTop: 2,
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
  actionDanger: {
    color: theme.colors.danger,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 1,
  },
});
