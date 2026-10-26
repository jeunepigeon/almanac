import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { ICONS, DEFAULT_ICON_ID } from '../icons';

// Modal réutilisable :
// - mode "create" : formulaire complet, callback onSubmit({ name, color, icon })
// - mode "edit"   : pré-rempli, callback onSubmit({ name, color, icon })
// - mode "rename" : seulement le champ nom
// - mode "color"  : seulement la palette
// - mode "icon"   : seulement la grille d'icônes
//
// Le parent décide du mode via la prop `mode`.
// On affiche tous les champs en mode create/edit, juste un en mode partiel.
export default function SubstanceFormModal({
  visible,
  mode = 'create',
  initial,
  onSubmit,
  onClose,
}) {
  const [name, setName] = useState('');
  const [colorIndex, setColorIndex] = useState(0);
  const [iconId, setIconId] = useState(DEFAULT_ICON_ID);

  // Réinitialise le formulaire à chaque ouverture
  useEffect(() => {
    if (visible) {
      if (initial) {
        setName(initial.name ?? '');
        const ci = theme.substanceColors.indexOf(initial.color);
        setColorIndex(ci >= 0 ? ci : 0);
        setIconId(initial.icon ?? DEFAULT_ICON_ID);
      } else {
        setName('');
        setColorIndex(0);
        setIconId(DEFAULT_ICON_ID);
      }
    }
  }, [visible, initial]);

  const showName = mode === 'create' || mode === 'edit' || mode === 'rename';
  const showColor = mode === 'create' || mode === 'edit' || mode === 'color';
  const showIcon = mode === 'create' || mode === 'edit' || mode === 'icon';

  const titles = {
    create: 'Nouvelle substance',
    edit: 'Modifier',
    rename: 'Renommer',
    color: 'Changer la couleur',
    icon: "Changer l'icône",
  };

  const submitLabels = {
    create: 'Créer',
    edit: 'Enregistrer',
    rename: 'Enregistrer',
    color: 'Enregistrer',
    icon: 'Enregistrer',
  };

  const canSubmit = !showName || name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = {};
    if (showName) payload.name = name.trim();
    if (showColor) payload.color = theme.substanceColors[colorIndex];
    if (showIcon) payload.icon = iconId;
    onSubmit(payload);
  };

  const selectedColor = theme.substanceColors[colorIndex];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{titles[mode]}</Text>

            {showName && (
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nom"
                placeholderTextColor={theme.colors.textFaint}
                style={styles.input}
                autoFocus={mode === 'create' || mode === 'rename'}
                returnKeyType="done"
              />
            )}

            {showColor && (
              <>
                <Text style={styles.fieldLabel}>Couleur</Text>
                <View style={styles.colorRow}>
                  {theme.substanceColors.map((c, i) => (
                    <View key={c + i} style={styles.colorCell}>
                      <TouchableOpacity
                        onPress={() => setColorIndex(i)}
                        style={[
                          styles.colorDot,
                          { backgroundColor: c },
                          colorIndex === i && styles.colorDotSelected,
                        ]}
                      />
                    </View>
                  ))}
                </View>
              </>
            )}

            {showIcon && (
              <>
                <Text style={styles.fieldLabel}>Icône</Text>
                <View style={styles.iconGridStatic}>
                  {ICONS.map((entry) => {
                    const selected = entry.id === iconId;
                    return (
                      <View key={entry.id} style={styles.iconCell}>
                        <TouchableOpacity
                          onPress={() => setIconId(entry.id)}
                          style={[
                            styles.iconCellInner,
                            selected && {
                              borderColor: selectedColor,
                              backgroundColor: theme.colors.surfaceAlt,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={entry.icon}
                            size={18}
                            color={selected ? selectedColor : theme.colors.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.actions}>
              <TouchableOpacity onPress={onClose} style={styles.actionBtn}>
                <Text style={styles.actionMuted}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                style={styles.actionBtn}
                disabled={!canSubmit}
              >
                <Text
                  style={[
                    styles.actionPrimary,
                    !canSubmit && styles.actionDisabled,
                  ]}
                >
                  {submitLabels[mode]}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
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
    maxHeight: '85%',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.lg,
    fontWeight: '300',
    letterSpacing: 1,
    marginBottom: theme.spacing.lg,
  },
  input: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  // Grille couleurs 2×6 : chaque pastille prend 1/6 de la largeur (centrée dans sa case)
  // écart vertical identique à l'écart horizontal
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.lg,
    justifyContent: 'center',
  },
  colorCell: {
    width: '16.666%', // 100/6
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: theme.colors.text,
  },
  iconScroll: {
    maxHeight: 180,
    marginBottom: theme.spacing.lg,
  },
  // Grille icônes 8×5 : chaque cellule prend 1/8 de la largeur, carrée.
  // Pas de gap (sinon flex-wrap casse en 7 par ligne), le padding interne de iconCellInner fait l'espacement.
  iconGridStatic: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.lg,
    justifyContent: 'flex-start',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: theme.spacing.sm,
  },
  iconCell: {
    width: '12.5%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 3,
  },
  iconCellInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  actionBtn: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
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
  actionDisabled: {
    color: theme.colors.textFaint,
  },
});
