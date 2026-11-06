// Nom d'un bandeau personnalisé (1.41) : « Sobre de » est écrit mais pas modifiable (comme le
// chemin d'un dossier dans une fenêtre d'enregistrement), on tape seulement la suite.
// L'aperçu montre exactement le libellé du bandeau : « SOBRE DE <NOM> DEPUIS ».
import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable, Keyboard,
} from 'react-native';
import { theme } from '../theme';

const MAX = 20;

export default function CustomBannerNameModal({ visible, initialName = '', confirmLabel = 'Créer', onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  const timers = useRef([]);
  useEffect(() => {
    if (visible) setName(initialName);
    else { timers.current.forEach(clearTimeout); Keyboard.dismiss(); }
  }, [visible]); // eslint-disable-line
  // Clavier ouvert d'office (même méthode que « Renommer », 1.33)
  const focus = () => {
    timers.current.push(setTimeout(() => inputRef.current?.focus(), 120));
    timers.current.push(setTimeout(() => {
      if (Keyboard.isVisible?.()) return;
      inputRef.current?.blur();
      timers.current.push(setTimeout(() => inputRef.current?.focus(), 60));
    }, 480));
  };
  const clean = name.trim();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} onShow={focus}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Nom du bandeau</Text>
          <View style={styles.field}>
            <Text style={styles.prefix}>Sobre de</Text>
            <TextInput
              ref={inputRef}
              value={name}
              onChangeText={setName}
              maxLength={MAX}
              style={styles.input}
              placeholder="mes soirées"
              placeholderTextColor={theme.colors.textFaint}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => { if (clean) onConfirm(clean); }}
            />
          </View>
          <Text style={styles.count}>{name.length}/{MAX}</Text>
          <Text style={styles.previewLabel}>Aperçu</Text>
          <Text style={styles.preview} numberOfLines={2}>
            {`SOBRE DE ${(clean || '…').toUpperCase()} DEPUIS`}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={styles.btn}>
              <Text style={styles.btnMuted}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => clean && onConfirm(clean)} disabled={!clean} style={styles.btn}>
              <Text style={[styles.btnText, !clean && { opacity: 0.35 }]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 10, padding: theme.spacing.lg,
    width: '100%', maxWidth: 400, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600',
    textAlign: 'center', marginBottom: theme.spacing.md, letterSpacing: 0.3,
  },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.textMuted,
  },
  prefix: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300' },
  input: { flex: 1, color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', paddingVertical: theme.spacing.sm },
  count: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, textAlign: 'right', marginTop: 4 },
  previewLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, letterSpacing: 1.5,
    textTransform: 'uppercase', marginTop: theme.spacing.md, textAlign: 'center',
  },
  preview: {
    color: theme.colors.text, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 1.5,
    textAlign: 'center', marginTop: theme.spacing.xs,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.lg, marginTop: theme.spacing.lg },
  btn: { paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm },
  btnMuted: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md },
  btnText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600' },
});
