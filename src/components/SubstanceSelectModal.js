// Modal unifiée de sélection de substances. V2b compact, bubble, haptic.

import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';
import SubCard from './SubCard';

export default function SubstanceSelectModal({
  visible,
  title = 'Substances',
  intro = null,
  hint = null,
  substances = [],
  statsById = {},
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

  const toggleSub = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const allSelected = substances.length > 0 && substances.every((s) => selected[s.id]);
  const noneSelected = substances.length > 0 && substances.every((s) => !selected[s.id]);
  const toggleAll = () => {
    haptics.light();
    const next = {}; for (const s of substances) next[s.id] = !allSelected;
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
    borderRadius: 10,
    padding: theme.spacing.lg,
    width: '100%',
    maxHeight: '85%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md,
    fontWeight: '600', textAlign: 'center', marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  intro: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', lineHeight: 20,
    marginBottom: theme.spacing.md, textAlign: 'center',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: theme.spacing.sm, marginTop: theme.spacing.sm,
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
  list: { maxHeight: 440 },
  listContent: { paddingVertical: 4 },
  hint: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs,
    fontStyle: 'italic', marginTop: theme.spacing.md, textAlign: 'center',
  },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: theme.spacing.lg, marginTop: theme.spacing.md,
  },
  cancelText: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '400',
  },
  confirmText: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600',
  },
});
