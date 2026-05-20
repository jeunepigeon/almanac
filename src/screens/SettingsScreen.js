import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { getIconById } from '../icons';
import { dbGetFirstConsumptionTimestamp } from '../db';
import ConfirmModal from '../components/ConfirmModal';
import ActionSheet from '../components/ActionSheet';

function formatDateLongFR(ts) {
  const d = new Date(ts);
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const archivedSubstances = useStore((s) => s.archivedSubstances);
  const restoreSubstance = useStore((s) => s.restoreSubstance);
  const deleteSubstance = useStore((s) => s.deleteSubstance);
  const wipeAll = useStore((s) => s.wipeAll);

  const [firstConsoTs, setFirstConsoTs] = useState(null);
  const [actionFor, setActionFor] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingWipeStep, setPendingWipeStep] = useState(0);

  useEffect(() => {
    dbGetFirstConsumptionTimestamp().then(setFirstConsoTs);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Sauvegardes archivées</Text>
      {archivedSubstances.length === 0 ? (
        <View style={styles.row}>
          <Text style={styles.rowValueFaint}>Aucune sauvegarde</Text>
        </View>
      ) : (
        archivedSubstances.map((sub) => {
          const iconEntry = getIconById(sub.icon);
          return (
            <Pressable
              key={sub.id}
              onPress={() => setActionFor(sub)}
              style={({ pressed }) => [
                styles.archivedRow,
                pressed && { backgroundColor: theme.colors.surface },
              ]}
            >
              <View style={[styles.archivedIcon, { borderColor: sub.color }]}>
                <MaterialCommunityIcons name={iconEntry.icon} size={16} color={sub.color} />
              </View>
              <Text style={styles.archivedName}>{sub.name}</Text>
              <MaterialCommunityIcons name="dots-horizontal" size={20} color={theme.colors.textMuted} />
            </Pressable>
          );
        })
      )}

      <Text style={styles.sectionTitle}>Soutenir le projet</Text>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Donations')}>
        <Text style={styles.rowLabel}>Soutenir le développement</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Données</Text>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Export')}>
        <Text style={styles.rowLabel}>Exporter</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Import')}>
        <Text style={styles.rowLabel}>Importer</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Zone de danger</Text>
      <TouchableOpacity style={styles.row} onPress={() => setPendingWipeStep(1)}>
        <Text style={styles.rowLabelDanger}>Remise à zéro complète</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.danger} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>À propos</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Version</Text>
        <Text style={styles.rowValue}>1.1.1</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Consos enregistrées depuis</Text>
        <Text style={styles.rowValue}>
          {firstConsoTs ? formatDateLongFR(firstConsoTs) : '—'}
        </Text>
      </View>

      {/* Crédit discret */}
      <View style={styles.creditWrap}>
        <Text style={styles.creditText}>almanac — fait par pigeon</Text>
      </View>

      <ActionSheet
        visible={!!actionFor}
        title={actionFor?.name}
        items={
          actionFor
            ? [
                {
                  id: 'restore',
                  label: 'Restaurer',
                  icon: 'archive-arrow-up-outline',
                  onPress: async () => { await restoreSubstance(actionFor.id); },
                },
                {
                  id: 'delete',
                  label: 'Supprimer définitivement',
                  icon: 'trash-can-outline',
                  destructive: true,
                  onPress: () => setPendingDelete(actionFor),
                },
              ]
            : []
        }
        onClose={() => setActionFor(null)}
      />

      <ConfirmModal
        visible={!!pendingDelete}
        title="Supprimer définitivement ?"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" et tout son historique seront effacés sans retour possible.`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await deleteSubstance(pendingDelete.id);
          setPendingDelete(null);
        }}
      />

      <ConfirmModal
        visible={pendingWipeStep === 1}
        title="Remise à zéro complète"
        message="Toutes tes substances, archives et consommations seront effacées sans retour possible. Tu devrais avant tout faire un export. Continuer ?"
        confirmLabel="Continuer"
        destructive
        onCancel={() => setPendingWipeStep(0)}
        onConfirm={() => setPendingWipeStep(2)}
      />

      <ConfirmModal
        visible={pendingWipeStep === 2}
        title="Confirmer l'effacement"
        message="Cette action est définitive. Toutes les données seront perdues."
        confirmLabel="Effacer tout"
        destructive
        onCancel={() => setPendingWipeStep(0)}
        onConfirm={async () => {
          await wipeAll();
          setPendingWipeStep(0);
          setFirstConsoTs(null);
          navigation.goBack();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingVertical: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  rowLabel: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowLabelDanger: { color: theme.colors.danger, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowValue: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowValueFaint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontStyle: 'italic' },
  archivedRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  archivedIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  archivedName: { flex: 1, color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  creditWrap: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  creditText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    letterSpacing: 2,
    textTransform: 'lowercase',
  },
});
