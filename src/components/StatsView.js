import { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Modal } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import {
  WINDOWS,
  computeStats,
  computeGlobalStats,
  formatInterval,
} from '../utils/stats';
import { BarChart, LineChart, PieChart, ChartCard } from './Charts';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const HOUR_LABELS_24 = ['0','','','','','','6','','','','','','12','','','','','','18','','','','',''];

export default function StatsView({
  mode = 'substance',
  consumptions,
  consumptionsBySubstance,
  substancesById,
  color = theme.colors.text,
}) {
  const [windowId, setWindowId] = useState('this_month');
  // Sélection des tranches du camembert : 'sobres' + substanceId -> bool
  // Réinitialisé à chaque changement de globalStats (fenêtre ou données)
  const [pieSelection, setPieSelection] = useState(null);
  const [infoVisible, setInfoVisible] = useState(false);

  const subStats = useMemo(() => {
    if (mode === 'substance') {
      return computeStats(consumptions || [], windowId);
    }
    return null;
  }, [mode, consumptions, windowId]);

  const globalStats = useMemo(() => {
    if (mode === 'global') {
      return computeGlobalStats(
        consumptionsBySubstance || {},
        substancesById || {},
        windowId,
        Date.now(),
        { activeOnly: true }
      );
    }
    return null;
  }, [mode, consumptionsBySubstance, substancesById, windowId]);

  // Stats agrégées pour mode global : on ne prend que les substances actives
  const aggregateStats = useMemo(() => {
    if (mode !== 'global') return null;
    const allConsos = [];
    for (const subId of Object.keys(consumptionsBySubstance || {})) {
      const sub = substancesById?.[subId];
      if (!sub || sub.archived) continue;
      allConsos.push(...(consumptionsBySubstance[subId] || []));
    }
    return computeStats(allConsos, windowId);
  }, [mode, consumptionsBySubstance, substancesById, windowId]);

  const stats = subStats || aggregateStats;

  const distinctActiveSubsCount = useMemo(() => {
    if (mode !== 'global' || !globalStats) return 0;
    return globalStats.breakdown.length;
  }, [mode, globalStats]);

  // Réinitialise la sélection (tout coché) quand les stats globales changent
  useEffect(() => {
    if (mode !== 'global' || !globalStats) return;
    const sel = { sobres: true };
    for (const b of globalStats.breakdown) {
      sel[b.substance.id] = true;
    }
    setPieSelection(sel);
  }, [mode, globalStats]);

  // Données du camembert filtrées par sélection
  const pieData = useMemo(() => {
    if (!globalStats || !pieSelection) return [];
    const data = [];
    if (pieSelection.sobres && globalStats.jourssobresEntry) {
      data.push({
        id: 'sobres',
        label: 'Jours sobres',
        value: globalStats.jourssobresEntry.count,
        color: theme.colors.textFaint,
        isJoursSobres: true,
      });
    }
    for (const b of globalStats.breakdown) {
      if (pieSelection[b.substance.id]) {
        data.push({
          id: b.substance.id,
          label: b.substance.name,
          value: b.count,
          color: b.substance.color,
          isJoursSobres: false,
        });
      }
    }
    return data;
  }, [globalStats, pieSelection]);

  const togglePieItem = (id) => {
    setPieSelection((prev) => prev ? { ...prev, [id]: !prev[id] } : prev);
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.windowSelector}>
        {WINDOWS.map((w) => (
          <TouchableOpacity
            key={w.id}
            onPress={() => setWindowId(w.id)}
            style={[
              styles.windowChip,
              windowId === w.id && { borderColor: color, backgroundColor: theme.colors.surfaceAlt },
            ]}
          >
            <Text
              style={[styles.windowChipText, windowId === w.id && { color: theme.colors.text }]}
            >
              {w.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {stats && (
        <>
          {/* Grille 3x3 = 9 métriques */}
          <View style={styles.numbersRow}>
            <Metric value={stats.total} label="Total" />
            <Metric value={stats.daysWithConsumption} label="Jours avec" />
            <Metric value={stats.daysWithoutConsumption} label="Jours sans" />
          </View>

          <View style={styles.numbersRow}>
            <Metric value={stats.avgPerWeek.toFixed(1)} label="/ semaine" />
            <Metric value={formatInterval(stats.avgIntervalMs)} label="Intervalle moy." />
            <Metric
              value={
                stats.trendPercent == null
                  ? '—'
                  : `${stats.trendPercent > 0 ? '+' : ''}${stats.trendPercent.toFixed(0)}%`
              }
              label="Tendance"
            />
          </View>

          <View style={styles.numbersRow}>
            <Metric value={`${stats.longestSoberStreak}j`} label="+ longue pause" />
            <Metric value={`${stats.longestActiveStreak}j`} label="+ longue série" />
            <Metric value={`${stats.currentSoberStreak}j`} label="Pause en cours" />
          </View>

          {/* Dosage stats (si données présentes) */}
          {stats.hasDosageData && (
            <ChartCard title={`Dosage (${stats.dosageCount} valeur${stats.dosageCount > 1 ? 's' : ''})`}>
              <View style={styles.dosageRow}>
                <View style={styles.dosageCell}>
                  <Text style={styles.dosageValue}>
                    {stats.dosageTotal.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.dosageLabel}>Total cumulé</Text>
                </View>
                <View style={styles.dosageCell}>
                  <Text style={styles.dosageValue}>
                    {stats.dosageAvg != null
                      ? stats.dosageAvg.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
                      : '—'}
                  </Text>
                  <Text style={styles.dosageLabel}>Moyenne par prise</Text>
                </View>
              </View>
            </ChartCard>
          )}

          {/* Camembert global */}
          {mode === 'global' && globalStats && distinctActiveSubsCount > 0 && pieSelection && (
            <ChartCard title={
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitleText}>Répartition des jours</Text>
                <TouchableOpacity
                  onPress={() => setInfoVisible(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            }>
              <View style={styles.pieRow}>
                {/* Camembert */}
                <PieChart
                  size={130}
                  data={pieData}
                />
                {/* Checkboxes à droite */}
                <View style={styles.pieCheckboxList}>
                  {/* Jours sobres en premier */}
                  {globalStats.jourssobresEntry && (
                    <PieCheckbox
                      id="sobres"
                      label="Jours sobres"
                      value={globalStats.jourssobresEntry.count}
                      color={theme.colors.textFaint}
                      checked={!!pieSelection.sobres}
                      onToggle={() => togglePieItem('sobres')}
                    />
                  )}
                  {/* Substances */}
                  {globalStats.breakdown.map((b) => (
                    <PieCheckbox
                      key={b.substance.id}
                      id={b.substance.id}
                      label={b.substance.name}
                      value={b.count}
                      color={b.substance.color}
                      checked={!!pieSelection[b.substance.id]}
                      onToggle={() => togglePieItem(b.substance.id)}
                    />
                  ))}
                </View>
              </View>
              <Text style={styles.pieNote}>
                En jours · {globalStats.totalDaysInWindow}j au total
              </Text>
            </ChartCard>
          )}

          {/* Modal info camembert */}
          <Modal visible={infoVisible} transparent animationType="fade" onRequestClose={() => setInfoVisible(false)}>
            <Pressable style={styles.infoOverlay} onPress={() => setInfoVisible(false)}>
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Comment lire ce camembert</Text>
                <Text style={styles.infoText}>
                  Chaque tranche représente un nombre de <Text style={styles.infoEmphasis}>jours</Text> sur la période sélectionnée.{'\n\n'}
                  Une substance occupe X jours si elle a été consommée au moins une fois ce jour-là. Si deux substances sont consommées le même jour, elles comptent chacune ce jour.{'\n\n'}
                  <Text style={styles.infoEmphasis}>Jours sobres</Text> = jours sans aucune consommation d'aucune substance.{'\n\n'}
                  Coche ou décoche les éléments pour isoler des substances.
                </Text>
                <TouchableOpacity onPress={() => setInfoVisible(false)} style={styles.infoClose}>
                  <Text style={styles.infoCloseText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>

          {/* Courbe activité dans le temps - toujours affichée */}
          <ChartCard title="Activité dans le temps">
            {stats.timeline && stats.timeline.length > 0 && stats.total > 0 ? (
              <LineChart data={stats.timeline} color={color} height={120} />
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyChartText}>
                  Pas de consommation sur la période sélectionnée
                </Text>
              </View>
            )}
          </ChartCard>

          {/* Distribution par heure */}
          <ChartCard title="Heure de la journée">
            {stats.total > 0 ? (
              <BarChart
                data={stats.hourDistribution}
                labels={HOUR_LABELS_24}
                color={color}
                height={100}
              />
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyChartText}>Pas de consommation sur la période sélectionnée</Text>
              </View>
            )}
          </ChartCard>

          {/* Distribution par jour de la semaine */}
          <ChartCard title="Jour de la semaine">
            {stats.total > 0 ? (
              <BarChart
                data={stats.weekdayDistribution}
                labels={WEEKDAY_LABELS}
                color={color}
                height={100}
              />
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyChartText}>Pas de consommation sur la période sélectionnée</Text>
              </View>
            )}
          </ChartCard>
        </>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function Metric({ value, label }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PieCheckbox({ label, value, color, checked, onToggle }) {
  return (
    <Pressable onPress={onToggle} style={styles.pieCheckboxRow}>
      <View style={[styles.pieCheckboxBox, checked && { backgroundColor: color, borderColor: color }]}>
        {checked && <Ionicons name="checkmark" size={10} color="#fff" />}
      </View>
      <View style={[styles.pieCheckboxDot, { backgroundColor: color }]} />
      <Text style={[styles.pieCheckboxLabel, !checked && styles.pieCheckboxLabelOff]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.pieCheckboxValue}>{value}j</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingTop: theme.spacing.sm, paddingBottom: 20 },
  windowSelector: {
    flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.md,
  },
  windowChip: {
    paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs,
    borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border,
  },
  windowChipText: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', letterSpacing: 0.5,
  },
  numbersRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  metricCell: {
    flex: 1, backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm,
    borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    alignItems: 'center', minHeight: 70, justifyContent: 'center',
  },
  metricValue: {
    color: theme.colors.text, fontSize: theme.font.sizes.lg,
    fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: 0.5,
  },
  metricLabel: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs,
    fontWeight: '300', letterSpacing: 0.5, textTransform: 'lowercase',
    marginTop: 4, textAlign: 'center',
  },
  pieRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
  },
  legend: { flex: 1, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { flex: 1, color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  legendPercent: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', fontVariant: ['tabular-nums'],
  },
  pieNote: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  // Card title avec bouton i
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  cardTitleText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.xs,
    fontWeight: '400',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  // Checkboxes camembert
  pieCheckboxList: {
    flex: 1,
    paddingLeft: theme.spacing.sm,
    gap: 4,
    maxHeight: 200,
    overflow: 'hidden',
  },
  pieCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
  },
  pieCheckboxBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: theme.colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pieCheckboxDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pieCheckboxLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '300',
  },
  pieCheckboxLabelOff: {
    color: theme.colors.textFaint,
  },
  pieCheckboxValue: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  // Modal info
  infoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 6,
    padding: theme.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  infoTitle: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.md,
  },
  infoText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  infoEmphasis: {
    color: theme.colors.text,
    fontWeight: '400',
  },
  infoClose: {
    alignSelf: 'flex-end',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  infoCloseText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 1,
  },
  emptyChart: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChartText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  dosageRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  dosageCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  dosageValue: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.lg,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  dosageLabel: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    letterSpacing: 0.5,
    textTransform: 'lowercase',
    marginTop: 2,
  },
});
