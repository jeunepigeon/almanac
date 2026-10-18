// Modal partagée pour sélectionner les substances à inclure dans une opération
// (import fichier, fusion snapshot, export…).
// UI identique partout : liste scrollable + cases couleur substance + Tout cocher/décocher.

import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

export default function SubstanceSelectModal({
  visible,
  title = 'Substances',
  intro = null,
  hint = null,
  substances = [], // [{id, name, color}]
  initialSelectedIds = null, // null = all selected by default
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  showNameField = false,       // Si true, affiche un champ nom (pour snapshot manuel)
  nameFieldLabel = 'Nom',
  nameFieldPlaceholder = '',
  nameHint = null,              // function(name) → string (ex: preview du nom final)
  onConfirm,                    // (ids, name?) → void
  onCancel,
}) {
  const [selected, setSelected] = useState({});
  const [name, setName] = useState('');

  // Reset à chaque ouverture
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
            {substances.map((sub) => {
              const isChecked = !!selected[sub.id];
              return (
                <Pressable key={sub.id} onPress={() => toggleSub(sub.id)} style={styles.subRow}>
                  <View style={[
                    styles.checkbox,
                    { borderColor: sub.color },
                    isChecked && { backgroundColor: sub.color },
                  ]}>
                    {isChecked && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                  </View>
                  <Text style={styles.subName}>{sub.name}</Text>
                </Pressable>
              );
            })}
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
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
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
    maxHeight: 400,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  listContent: {
    paddingVertical: theme.spacing.xs,
  },
  subRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  subName: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300' },
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
