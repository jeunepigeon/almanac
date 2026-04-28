import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

// Bottom-sheet style action menu.
// items : [{ id, label, icon?, destructive?, onPress }]
export default function ActionSheet({ visible, title, items, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.bottomWrap}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
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
    paddingVertical: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
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
