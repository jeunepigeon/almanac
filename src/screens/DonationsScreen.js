import { useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { theme } from '../theme';
import { useBilling, DONATION_PRODUCTS } from '../utils/useBilling';

export default function DonationsScreen() {
  const {
    connected, loading, purchasing, error,
    purchase, getLocalPrice,
    thanksPending, consumeThanks,
  } = useBilling();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Almanac est gratuit et sans publicité. Si l'app t'est utile, tu peux soutenir son développement.
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
            <Text style={styles.thankYouTitle}>Merci pour ton soutien</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    paddingVertical: theme.spacing.lg,
    paddingBottom: 60,
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
