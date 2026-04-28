import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { getIconById } from '../icons';
import BottomSheet from './BottomSheet';

export default function SubstancePicker({ visible, substances, onPick, onClose }) {
  return (
    <BottomSheet visible={visible} title="Choisir une substance" onClose={onClose}>
      {substances.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucune substance disponible</Text>
        </View>
      ) : (
        <FlatList
          data={substances}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const iconEntry = getIconById(item.icon);
            return (
              <Pressable
                onPress={() => onPick(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.iconWrap, { borderColor: item.color }]}>
                  <MaterialCommunityIcons name={iconEntry.icon} size={18} color={item.color} />
                </View>
                <Text style={styles.rowName}>{item.name}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textFaint} />
              </Pressable>
            );
          }}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: theme.spacing.lg, alignItems: 'center' },
  emptyText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.md, fontWeight: '300', fontStyle: 'italic' },
  listContent: { paddingBottom: theme.spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  rowPressed: { backgroundColor: theme.colors.surface },
  iconWrap: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  rowName: { flex: 1, color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.5 },
});
