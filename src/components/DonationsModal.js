import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Pressable, ActivityIndicator,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { useBilling, DONATION_PRODUCTS } from '../utils/useBilling';

// 1.50 — Soutenir le développement : fenêtre flottante (avant : une page), même contenu,
// ouverte depuis la même ligne de Paramètres.
export default function DonationsModal({ visible, onClose }) {
  const {
    connected, loading, purchasing, error,
    purchase, getLocalPrice,
    thanksPending, consumeThanks,
  } = useBilling();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <Pressable style={styles.overlay} onPress={onClose}>
    <Pressable style={styles.card} onPress={() => {}}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Soutenir le développement</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
    <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Almanac est gratuit et sans publicité. Son développement peut être soutenu ici.
      </Text>
      <Text style={styles.subIntro}>
        Aucune fonctionnalité n'est débloquée. C'est un don volontaire.
      </Text>

      {loading && !connected && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.textMuted} />
          <Text style={styles.loadingText}>Connexion au store...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.section}>
        {DONATION_PRODUCTS.map((product, idx) => {
          const isBuying = purchasing === product.id;
          const isLast = idx === DONATION_PRODUCTS.length - 1;
          return (
            <TouchableOpacity
              key={product.id}
              style={[styles.row, isLast && styles.rowLast, isBuying && styles.rowBuying]}
              onPress={() => purchase(product.id)}
              disabled={!!purchasing || !connected}
              activeOpacity={0.6}
            >
              <Text style={styles.rowLabel}>{product.label}</Text>
              {isBuying ? (
                <ActivityIndicator size="small" color={theme.colors.text} />
              ) : (
                <Text style={styles.rowValue}>{getLocalPrice(product.id)}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.footer}>
        Paiement sécurisé via Google Play.{'\n'}
        Aucun compte requis, aucune donnée partagée.
      </Text>

      <Modal
        visible={thanksPending}
        transparent
        animationType="fade"
        onRequestClose={consumeThanks}
      >
        <Pressable style={styles.overlay} onPress={consumeThanks}>
          <View style={styles.thankYouCard}>
            <Text style={styles.thankYouTitle}>Merci pour le soutien</Text>
            <Text style={styles.thankYouText}>
              Ça compte vraiment. Bonne continuation.
            </Text>
            <TouchableOpacity onPress={consumeThanks} style={styles.thankYouBtn}>
              <Text style={styles.thankYouBtnText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
    </Pressable>
    </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  card: {
    backgroundColor: theme.colors.background, borderRadius: 8, maxHeight: '85%',
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.sm,
  },
  cardTitle: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  scroll: { flexGrow: 0 },
  content: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  intro: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    lineHeight: 22,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  subIntro: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    lineHeight: 18,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    fontStyle: 'italic',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
  },
  errorBox: {
    marginHorizontal: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.danger,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
  },
  section: {
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  rowLast: { borderBottomWidth: 0 },
  rowBuying: { opacity: 0.5 },
  rowLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  rowValue: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: theme.spacing.xl,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  thankYouCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 6,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  thankYouTitle: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.lg,
    fontWeight: '300',
    letterSpacing: 1,
    textAlign: 'center',
  },
  thankYouText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    textAlign: 'center',
    lineHeight: 20,
  },
  thankYouBtn: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  thankYouBtnText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 1,
  },
});
