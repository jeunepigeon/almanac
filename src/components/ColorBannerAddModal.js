// Ajout d'un bandeau « Sobre depuis » par couleur (1.22).
// Propose uniquement les couleurs qui ont au moins 2 substances et pas encore de bandeau.
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';

// options : [{ color, names: [string] }]
export default function ColorBannerAddModal({ visible, options, onPick, onClose }) {
  const empty = options.length === 0;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Nouveau bandeau</Text>
          {empty ? (
            <Text style={styles.message}>
              Il faut au moins 2 substances de la même couleur pour créer un bandeau.
            </Text>
          ) : (
            <>
              <Text style={styles.message}>Choisis une couleur : le bandeau affiche le temps depuis la dernière prise par catégorie.</Text>
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {options.map((o) => (
                  <TouchableOpacity
                    key={o.color}
                    style={[styles.option, { borderColor: o.color }]}
                    onPress={() => { haptics.light(); onPick(o.color); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dot, { backgroundColor: o.color }]} />
                    <Text style={[styles.names, { color: o.color }]} numberOfLines={2}>
                      {/* Séparateur collé au nom SUIVANT (espace insécable) : en cas de retour à la
                          ligne, une ligne commence par « • » et ne finit jamais par lui */}
                      {o.names.map((n, i) => (
                        <Text key={`${n}-${i}`}>
                          {i > 0 ? ' ' : ''}
                          {i > 0 && <Text style={styles.sep}>{'•\u00A0'}</Text>}
                          {n}
                        </Text>
                      ))}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
          <TouchableOpacity onPress={onClose} style={styles.btn}>
            <Text style={styles.btnText}>{empty ? 'OK' : 'Annuler'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 10,
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg,
    width: '100%', maxWidth: 400, maxHeight: '80%',
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    alignItems: 'center',
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md,
    borderWidth: 1, borderRadius: 8, marginBottom: theme.spacing.sm,
  },
  dot: { width: 14, height: 14, borderRadius: 7, marginRight: theme.spacing.md },
  sep: { fontWeight: '900', fontSize: theme.font.sizes.lg },
  names: { flexShrink: 1, textAlign: 'center', fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.3 },
  btn: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xl, borderRadius: 6, marginTop: theme.spacing.sm },
  btnText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 1 },
});
