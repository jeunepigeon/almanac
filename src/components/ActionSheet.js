import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';

// Bottom-sheet style action menu.
// items : [{ id, label, icon?, destructive?, onPress }]
export default function ActionSheet({ visible, title, items, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.bottomWrap}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {/* En-tête : croix de fermeture en haut à gauche, titre centré verticalement (1.26) */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
            </View>
            {items.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.item,
                  i === items.length - 1 && styles.itemLast,
                ]}
                onPress={() => {
                  onClose();
                  setTimeout(() => item.onPress?.(), 50);
                }}
              >
                {item.icon ? (
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={18}
                    color={item.destructive ? theme.colors.danger : theme.colors.text}
                    style={{ marginRight: theme.spacing.md }}
                  />
                ) : null}
                <Text
                  style={[
                    styles.itemLabel,
                    item.destructive && { color: theme.colors.danger },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: 6,
    paddingBottom: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  header: {
    height: 52, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 52, // place pour la croix, titre bien centré
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  closeBtn: {
    position: 'absolute', left: theme.spacing.md, top: 0, bottom: 0, justifyContent: 'center',
  },
  title: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  itemLabel: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
});
