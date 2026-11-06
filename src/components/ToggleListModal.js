// Fenêtre « à cocher » partagée (1.40) :
//  - bandeaux de la liste (« Sobre de tout » + catégories) ;
//  - compteurs ajoutés sous « Sobre depuis » (page d'une substance, stats globales).
// Un tap ajoute ou retire immédiatement ; l'élément actif a un fond pâle à sa couleur.
// Retrait d'un élément qui porte des notifications : confirmation DANS la même fenêtre.
import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import haptics from '../utils/haptics';
import { hexToRgba } from '../utils/flash';

// options : [{ id, color, label (texte ou élément), checked, removeConfirm?: string, hint?: string }]
export default function ToggleListModal({ visible, title, message, options, onToggle, onClose, footer }) {
  const [confirm, setConfirm] = useState(null); // option à retirer après confirmation
  useEffect(() => { if (!visible) setConfirm(null); }, [visible]);

  const press = (o) => {
    haptics.light();
    if (o.checked && o.removeConfirm) { setConfirm(o); return; }
    onToggle(o.id, !o.checked);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{confirm ? 'Retirer ?' : title}</Text>
          {confirm ? (
            <>
              <Text style={styles.message}>{confirm.removeConfirm}</Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setConfirm(null)} style={styles.btn}>
                  <Text style={styles.btnMuted}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { haptics.success(); onToggle(confirm.id, false); setConfirm(null); }}
                  style={styles.btn}
                >
                  <Text style={styles.btnDanger}>Retirer</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {message ? <Text style={styles.message}>{message}</Text> : null}
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} showsVerticalScrollIndicator={false}>
                {options.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    style={[
                      styles.option,
                      o.checked
                        ? { backgroundColor: hexToRgba(o.color, 0.14), borderColor: hexToRgba(o.color, 0.8) }
                        : { borderColor: hexToRgba(o.color, 0.3) },
                    ]}
                    onPress={() => press(o)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dot, { backgroundColor: o.checked ? o.color : hexToRgba(o.color, 0.45) }]} />
                    <View style={styles.labelWrap}>
                      {typeof o.label === 'string'
                        ? <Text style={[styles.label, { color: o.checked ? theme.colors.text : theme.colors.textMuted }]}>{o.label}</Text>
                        : o.label}
                      {o.hint ? <Text style={styles.hint}>{o.hint}</Text> : null}
                    </View>
                    <View style={styles.checkSlot}>
                      {o.checked && <MaterialCommunityIcons name="check" size={20} color={o.color} />}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {footer ? <Text style={styles.footer}>{footer}</Text> : null}
              <TouchableOpacity onPress={onClose} style={styles.btn}>
                <Text style={styles.btnText}>OK</Text>
              </TouchableOpacity>
            </>
          )}
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
    backgroundColor: theme.colors.surface, borderRadius: 10,
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg,
    width: '100%', maxWidth: 400, maxHeight: '80%',
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, alignItems: 'center',
  },
  title: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600',
    textAlign: 'center', marginBottom: theme.spacing.sm, letterSpacing: 0.3,
  },
  message: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '400',
    lineHeight: 20, textAlign: 'center', marginBottom: theme.spacing.md,
  },
  list: { alignSelf: 'stretch', flexGrow: 0 },
  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: theme.spacing.md,
    borderWidth: 1, borderRadius: 8, marginBottom: theme.spacing.sm,
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: theme.spacing.md },
  labelWrap: { flex: 1 },
  label: { fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.3 },
  hint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, marginTop: 2 },
  checkSlot: { width: 22, alignItems: 'flex-end' },
  footer: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, textAlign: 'center', marginTop: theme.spacing.xs, lineHeight: 16 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.xl },
  btn: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xl, borderRadius: 6, marginTop: theme.spacing.sm },
  btnText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 1 },
  btnMuted: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, letterSpacing: 1 },
  btnDanger: { color: theme.colors.danger, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 1 },
});
