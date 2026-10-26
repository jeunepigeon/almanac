// Modal unifiée de sélection de substances (import, fusion, export, création snapshot).
// Layout V2b : cards compactes avec icône + nom bold + stats, check C3 à droite,
// cadre couleur quand coché / gris dim quand décoché.
// Animation bubble (scale) au tap. Haptic light.

import { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, TextInput,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { getIconById } from '../icons';
import haptics from '../utils/haptics';

const DIM_BORDER = '#2F2F2F';
const DIM_TEXT = '#3A3A3A';

function SubCard({ sub, isChecked, onToggle, stats }) {
  const scale = useRef(new Animated.Value(1)).current;

  const triggerBubble = () => {
    scale.setValue(0.95);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.05, useNativeDriver: true, speed: 20, bounciness: 10 }),
      Animated.spring(scale, { toValue: 1.02, useNativeDriver: true, speed: 20, bounciness: 8 }),
      Animated.spring(scale, { toValue: 1.0, useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
  };

  const handlePress = () => {
    haptics.light();
    triggerBubble();
    onToggle();
  };

  const borderColor = isChecked ? sub.color : DIM_BORDER;
  const nameColor = isChecked ? theme.colors.text : DIM_TEXT;
  const statsColor = isChecked ? theme.colors.textMuted : DIM_TEXT;
  const iconColor = isChecked ? sub.color : DIM_TEXT;

  const consCount = stats?.consCount ?? 0;
  const days = stats?.days ?? 0;
  const statsText = `${consCount} prise${consCount > 1 ? 's' : ''} · ${days}j`;

  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 8 }}>
      <Pressable
        onPress={handlePress}
        style={[styles.subCard, { borderColor }]}
      >
        <View style={[styles.iconWrap, { borderColor: iconColor }]}>
          <View style={[styles.iconDot, { backgroundColor: iconColor }]} />
        </View>
        <View style={styles.cardMiddle}>
          <Text style={[styles.cardName, { color: nameColor }]} numberOfLines={1}>{sub.name}</Text>
          <Text style={[styles.cardStats, { color: statsColor }]}>{statsText}</Text>
        </View>
        {isChecked && (
          <MaterialCommunityIcons name="check" size={22} color={sub.color} style={styles.check} />
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function SubstanceSelectModal({
  visible,
  title = 'Substances',
  intro = null,
  hint = null,
  substances = [], // [{id, name, color}]
  statsById = {},  // {id: {consCount, days}} optionnel
  initialSelectedIds = null,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  showNameField = false,
  nameFieldLabel = 'Nom',
  nameFieldPlaceholder = '',
  nameHint = null,
  onConfirm,
  onCancel,
}) {
  const [selected, setSelected] = useState({});
  const [name, setName] = useState('');

  useEffect(() => {
    if (!visible) return;
    const sel = {};
    const defaultIds = initialSelectedIds ?? substances.map((s) => s.id);
    for (const s of substances) sel[s.id] = defaultIds.includes(s.id);
    setSelected(sel);
    setName('');
  }, [visible, substances, initialSelectedIds]);

  const toggleSub = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allSelected = substances.length > 0 && substances.every((s) => selected[s.id]);
  const noneSelected = substances.length > 0 && substances.every((s) => !selected[s.id]);
  const toggleAll = () => {
    haptics.light();
    const next = {};
    for (const s of substances) next[s.id] = !allSelected;
    setSelected(next);
  };

  const handleConfirm = () => {
    const ids = substances.filter((s) => selected[s.id]).map((s) => s.id);
    onConfirm?.(ids, name);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {intro ? <Text style={styles.intro}>{intro}</Text> : null}

          {showNameField && (
            <>
              <Text style={styles.fieldLabel}>{nameFieldLabel}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={nameFieldPlaceholder}
                placeholderTextColor={theme.colors.textFaint}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {nameHint ? <Text style={styles.nameHintText}>{nameHint(name)}</Text> : null}
            </>
          )}

          <View style={styles.header}>
            <Text style={styles.sectionLabel}>
              {substances.length} substance{substances.length > 1 ? 's' : ''}
            </Text>
            <TouchableOpacity onPress={toggleAll}>
              <Text style={styles.toggleAllText}>
                {allSelected ? 'Tout décocher' : 'Tout cocher'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {substances.map((sub) => (
              <SubCard
                key={sub.id}
                sub={sub}
                isChecked={!!selected[sub.id]}
                onToggle={() => toggleSub(sub.id)}
                stats={statsById[sub.id]}
              />
            ))}
          </ScrollView>

          {hint ? <Text style={styles.hint}>{hint}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConfirm} disabled={noneSelected}>
              <Text style={[styles.confirmText, noneSelected && { opacity: 0.4 }]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: theme.spacing.lg,
    width: '100%',
    maxHeight: '85%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '400', textAlign: 'center', marginBottom: theme.spacing.sm,
  },
  intro: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', lineHeight: 20,
    marginBottom: theme.spacing.md, textAlign: 'center',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  fieldLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  input: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.xs,
  },
  nameHintText: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs,
    fontStyle: 'italic', marginBottom: theme.spacing.md,
  },
  sectionLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
  },
  toggleAllText: {
    color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '400',
    textDecorationLine: 'underline',
  },
  list: {
    maxHeight: 440,
  },
  listContent: {
    paddingVertical: 4,
  },
  subCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    gap: 12,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  iconDot: {
    width: 12, height: 12, borderRadius: 6,
  },
  cardMiddle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  cardStats: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  check: {
    marginLeft: 4,
  },
  hint: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs,
    fontStyle: 'italic', marginTop: theme.spacing.md, textAlign: 'center',
  },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: theme.spacing.lg, marginTop: theme.spacing.md,
  },
  cancelText: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300',
  },
  confirmText: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '500',
  },
});
