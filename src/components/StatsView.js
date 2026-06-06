import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Pressable, Modal, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import {
  WINDOWS,
  computeStats,
  computeGlobalStats,
  formatInterval,
  formatDaysLong,
  windowRange,
} from '../utils/stats';
import { BarChart, LineChart, PieChart, ChartCard, MultiLineChart } from './Charts';
import LiveCounter from './LiveCounter';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const HOUR_LABELS_24 = ['0','','','','','','6','','','','','','12','','','','','','18','','','','',''];

const ALL_WINDOWS = [...WINDOWS, { id: 'custom', label: 'Perso' }];

function fmt(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

export default function StatsView({
  mode = 'substance',
  consumptions,
  consumptionsBySubstance,
  substancesById,
  color = theme.colors.text,
  navigation,
  substanceId,
}) {
  const [windowId, setWindowId] = useState('30d');
  const [pieSelection, setPieSelection] = useState(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const [useDoses, setUseDoses] = useState(false); // false = réinitialisations, true = doses
  const [customStart, setCustomStart] = useState(() => Date.now() - 30 * 86400000);
  const [customEnd, setCustomEnd] = useState(() => Date.now());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState('start');

  const now = Date.now();

  const effectiveRange = useMemo(() => {
    if (windowId === 'custom') return [customStart, customEnd];
    return windowRange(windowId, now);
  }, [windowId, customStart, customEnd]);

  const subStats = useMemo(() => {
    if (mode !== 'substance') return null;
    const range = windowId === 'custom' ? effectiveRange : null;
    return computeStats(consumptions || [], windowId, { customRange: range, useDoses: useDoses });
  }, [mode, consumptions, windowId, effectiveRange, useDoses]);

  const globalStats = useMemo(() => {
    if (mode !== 'global') return null;
    const range = windowId === 'custom' ? effectiveRange : null;
    return computeGlobalStats(
      consumptionsBySubstance || {},
      substancesById || {},
      windowId,
      now,
      { activeOnly: true, customRange: range }
    );
  }, [mode, consumptionsBySubstance, substancesById, windowId, effectiveRange]);

  const aggregateStats = useMemo(() => {
    if (mode !== 'global') return null;
    const allConsos = [];
    for (const subId of Object.keys(consumptionsBySubstance || {})) {
      const sub = substancesById?.[subId];
      if (!sub || sub.archived) continue;
      if (pieSelection && pieSelection[subId] === false) continue;
      allConsos.push(...(consumptionsBySubstance[subId] || []));
    }
    const range = windowId === 'custom' ? effectiveRange : null;
    return computeStats(allConsos, windowId, { customRange: range, useDoses: useDoses });
  }, [mode, consumptionsBySubstance, substancesById, windowId, effectiveRange, pieSelection, useDoses]);

  const stats = subStats || aggregateStats;

  // Stats complètes non filtrées pour pause/série
  const fullSubStats = useMemo(() => {
    if (mode !== 'substance') return null;
    return computeStats(consumptions || [], 'all');
  }, [mode, consumptions]);

  const distinctActiveSubsCount = useMemo(() => {
    if (mode !== 'global' || !globalStats) return 0;
    return globalStats.breakdown.length;
  }, [mode, globalStats]);

  useEffect(() => {
    if (mode !== 'global' || !globalStats) return;
    setPieSelection((prev) => {
      const next = { sobres: prev?.sobres ?? true };
      for (const b of globalStats.breakdown) {
        // Garde l'état existant, init à true seulement si nouveau
        next[b.substance.id] = prev?.[b.substance.id] ?? true;
      }
      return next;
    });
  }, [mode, globalStats]);

  const pieData = useMemo(() => {
    if (!globalStats || !pieSelection) return [];
    const data = [];
    if (pieSelection.sobres && globalStats.jourssobresEntry) {
      data.push({ id: 'sobres', label: 'Jours sobres', value: globalStats.jourssobresEntry.count, color: theme.colors.textFaint });
    }
    for (const b of globalStats.breakdown) {
      if (pieSelection[b.substance.id]) {
        data.push({ id: b.substance.id, label: b.substance.name, value: b.count, color: b.substance.color });
      }
    }
    return data;
  }, [globalStats, pieSelection]);

  const togglePieItem = useCallback((id) => {
    setPieSelection((prev) => prev ? { ...prev, [id]: !prev[id] } : prev);
  }, []);

  // Breakdown trié par couleur (pour regrouper couleurs identiques)
  const sortedBreakdown = useMemo(() => {
    if (!globalStats?.breakdown) return [];
    return [...globalStats.breakdown].sort((a, b) =>
      a.substance.color.localeCompare(b.substance.color)
    );
  }, [globalStats]);

  const dominantColor = useMemo(() => {
    if (mode !== 'global' || !globalStats?.breakdown?.length) return color;
    const top = globalStats.breakdown.find((b) => !pieSelection || pieSelection[b.substance.id] !== false);
    return top ? top.substance.color : color;
  }, [mode, globalStats, pieSelection, color]);

  // Précalcul : pour chaque dayKey → couleur substance dominante (optimisé)
  const dayDominantColor = useMemo(() => {
    if (mode !== 'global' || !consumptionsBySubstance) return {};
    const map = {};
    for (const subId of Object.keys(consumptionsBySubstance)) {
      if (pieSelection && pieSelection[subId] === false) continue;
      const sub = substancesById?.[subId];
      if (!sub || sub.archived) continue;
      for (const c of consumptionsBySubstance[subId] || []) {
        const d = new Date(c.timestamp);
        const p = (n) => (n < 10 ? `0${n}` : `${n}`);
        const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        if (!map[k]) map[k] = { color: sub.color, count: 1 };
        else if (++map[k].count >= map[k].count) map[k].color = sub.color;
      }
    }
    return map;
  }, [mode, consumptionsBySubstance, substancesById, pieSelection]);

  const segmentColors = useMemo(() => {
    if (mode !== 'global' || !stats?.timeline) return null;
    const timeline = stats.timeline;
    if (timeline.length < 2) return null;
    return timeline.slice(0, -1).map((point) => {
      const d = new Date(point.ts);
      const p = (n) => (n < 10 ? `0${n}` : `${n}`);
      const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      return dayDominantColor[k]?.color || dominantColor;
    });
  }, [mode, stats, dayDominantColor, dominantColor]);

  // Multi-courbes au global : une courbe par substance cochée
  const multiCurves = useMemo(() => {
    if (mode !== 'global' || !stats?.timeline || !consumptionsBySubstance) return null;
    const timeline = stats.timeline;
    if (timeline.length === 0) return null;

    const dayKey = (ts) => {
      const d = new Date(ts);
      const p = (n) => (n < 10 ? `0${n}` : `${n}`);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };

    const curves = [];
    for (const subId of Object.keys(consumptionsBySubstance)) {
      const sub = substancesById?.[subId];
      if (!sub || sub.archived) continue;

      const subConsos = consumptionsBySubstance[subId] || [];

      // Détecte si AU MOINS UNE conso de cette substance a un dosage utilisable
      const hasAnyDosage = subConsos.some((c) => {
        const v = parseFloat(c.dosage);
        return !isNaN(v) && v > 0;
      });

      // Agrège par jour
      const dayMap = {};
      const daysWithConso = new Set();
      for (const c of subConsos) {
        const k = dayKey(c.timestamp);
        daysWithConso.add(k);
        if (useDoses && hasAnyDosage) {
          // Mode doses ET la substance a des dosages : somme des dosages
          const v = parseFloat(c.dosage);
          dayMap[k] = (dayMap[k] || 0) + (isNaN(v) ? 0 : v);
        } else {
          // Mode réinitialisations OU pas de dosage : compte les prises
          dayMap[k] = (dayMap[k] || 0) + 1;
        }
      }

      // Mode doses sans dosage → on force hauteur plate à 0.5 pour les jours consommés
      const usePlateauMode = useDoses && !hasAnyDosage;

      const points = timeline.map((p) => {
        const k = dayKey(p.ts);
        if (usePlateauMode) {
          return { ts: p.ts, count: daysWithConso.has(k) ? 0.5 : 0 };
        }
        return { ts: p.ts, count: dayMap[k] || 0 };
      });

      if (points.some((p) => p.count > 0)) {
        const visible = !pieSelection || pieSelection[subId] !== false;
        curves.push({
          id: sub.id,
          name: sub.name,
          color: sub.color,
          points,
          visible,
        });
      }
    }
    return curves;
  }, [mode, stats, consumptionsBySubstance, substancesById, pieSelection, useDoses]);

  // Dernière conso toutes substances confondues (pour le hero global)
  const lastGlobalTimestamp = useMemo(() => {
    if (mode !== 'global' || !consumptionsBySubstance) return null;
    let max = 0;
    for (const list of Object.values(consumptionsBySubstance)) {
      for (const c of list) if (c.timestamp > max) max = c.timestamp;
    }
    return max || null;
  }, [mode, consumptionsBySubstance]);

  // Jours sobres consécutifs au global (toutes substances confondues)
  const globalCurrentSoberDays = useMemo(() => {
    if (mode !== 'global' || !consumptionsBySubstance) return null;
    const allConsos = Object.values(consumptionsBySubstance).flat();
    if (allConsos.length === 0) return null;
    const dayKey = (ts) => {
      const d = new Date(ts);
      const p = (n) => (n < 10 ? `0${n}` : `${n}`);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const daysWithConso = new Set(allConsos.map((c) => dayKey(c.timestamp)));
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cur = new Date(today);
    while (true) {
      const k = dayKey(cur.getTime());
      if (daysWithConso.has(k)) break;
      streak++;
      cur.setDate(cur.getDate() - 1);
      if (streak > 3650) break; // sécurité
    }
    return streak;
  }, [mode, consumptionsBySubstance]);

  const openPicker = (target) => {
    setPickerTarget(target);
    setPickerVisible(true);
  };

  const onPickerChange = (event, selectedDate) => {
    setPickerVisible(false);
    if (event.type === 'dismissed' || !selectedDate) return;
    if (pickerTarget === 'start') setCustomStart(selectedDate.getTime());
    else setCustomEnd(selectedDate.getTime());
  };

  const bandColor = mode === 'global' ? '#FFFFFF' : color;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>

      {/* Hero jours sobres — mode global uniquement */}
      {mode === 'global' && globalCurrentSoberDays !== null && (
        <View style={styles.globalHero}>
          <Text style={styles.globalHeroLabel}>Sobre de tout depuis</Text>
          <View style={styles.counterWrap}>
            <LiveCounter
              timestamp={lastGlobalTimestamp}
              style={styles.globalHeroCounter}
            />
          </View>
          <Text style={styles.globalHeroSubLabel}>
            {globalCurrentSoberDays} jour{globalCurrentSoberDays > 1 ? 's' : ''} sobre{globalCurrentSoberDays > 1 ? 's' : ''} consécutif{globalCurrentSoberDays > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Sélecteur fenêtre */}
      <View style={styles.windowSelector}>
        {ALL_WINDOWS.map((w) => (
          <TouchableOpacity
            key={w.id}
            onPress={() => setWindowId(w.id)}
            style={[styles.windowChip, windowId === w.id && { borderColor: color, backgroundColor: theme.colors.surfaceAlt }]}
          >
            <Text style={[styles.windowChipText, windowId === w.id && { color: theme.colors.text }]}>
              {w.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bandeau période */}
      {windowId === 'custom' ? (
        <View style={styles.customRangeRow}>
          <TouchableOpacity onPress={() => openPicker('start')} style={styles.customDateBtn}>
            <Text style={[styles.customDateText, { color: bandColor }]}>{fmt(customStart)}</Text>
          </TouchableOpacity>
          <Text style={styles.customSep}>—</Text>
          <TouchableOpacity onPress={() => openPicker('end')} style={styles.customDateBtn}>
            <Text style={[styles.customDateText, { color: bandColor }]}>{fmt(customEnd)}</Text>
          </TouchableOpacity>
        </View>
      ) : effectiveRange[0] !== null ? (
        <Text style={[styles.periodBand, { color: bandColor }]}>
          {fmt(effectiveRange[0])} — {fmt(effectiveRange[1])}
        </Text>
      ) : null}

      {/* DatePicker Android */}
      {pickerVisible && (
        <DateTimePicker
          value={new Date(pickerTarget === 'start' ? customStart : customEnd)}
          mode="date"
          display="default"
          onChange={onPickerChange}
          maximumDate={new Date()}
        />
      )}

      {stats && (
        <>
          <View style={styles.numbersRow}>
            <Metric value={stats.total} label="Total" />
            <Metric value={stats.daysWithConsumption} label="Jours avec" />
            <Metric value={stats.daysWithoutConsumption} label="Jours sans" />
          </View>

          <View style={styles.numbersRow}>
            <Metric value={stats.avgPerWeek.toFixed(1)} label="/ semaine" />
            <Metric value={formatInterval(stats.avgIntervalMs)} label="Intervalle moy." />
            <Metric
              value={(() => {
                const total = stats.daysWithConsumption + stats.daysWithoutConsumption;
                if (total === 0) return '—';
                const pct = (stats.daysWithConsumption / total) * 100;
                return `${pct.toFixed(0)}%`;
              })()}
              label="Jours consommés"
            />
          </View>

          {/* Pause/série sur historique COMPLET */}
          <View style={styles.numbersRow}>
            {mode === 'substance' && fullSubStats ? (
              <>
                <Metric value={formatDaysLong(fullSubStats.longestSoberStreak)} label="+ longue pause" />
                <Metric value={formatDaysLong(fullSubStats.longestActiveStreak)} label="+ longue série" />
                <Metric value={formatDaysLong(fullSubStats.currentSoberStreak)} label="Pause en cours" />
              </>
            ) : (
              <>
                <Metric value={stats.longestSoberStreak ? formatDaysLong(stats.longestSoberStreak) : '—'} label="+ longue pause" />
                <Metric value={stats.longestActiveStreak ? formatDaysLong(stats.longestActiveStreak) : '—'} label="+ longue série" />
                <Metric value={stats.currentSoberStreak ? formatDaysLong(stats.currentSoberStreak) : '—'} label="Pause en cours" />
              </>
            )}
          </View>

          {stats.hasDosageData && (
            <ChartCard title={`Dosage (${stats.dosageCount} valeur${stats.dosageCount > 1 ? 's' : ''})`}>
              <View style={styles.dosageRow}>
                <View style={styles.dosageCell}>
                  <Text style={styles.dosageValue}>{stats.dosageTotal.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</Text>
                  <Text style={styles.dosageLabel}>Total cumulé</Text>
                </View>
                <View style={styles.dosageCell}>
                  <Text style={styles.dosageValue}>{stats.dosageAvg != null ? stats.dosageAvg.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'}</Text>
                  <Text style={styles.dosageLabel}>Moyenne par prise</Text>
                </View>
              </View>
            </ChartCard>
          )}

          {mode === 'global' && globalStats && distinctActiveSubsCount > 0 && pieSelection && (
            <ChartCard title={
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitleText}>Répartition des jours</Text>
                <TouchableOpacity onPress={() => setInfoVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            }>
              <View style={styles.pieRow}>
                <PieChart size={130} data={pieData} />
                <View style={[styles.pieCheckboxList, { flex: 1 }]}>
                  {globalStats.jourssobresEntry && (
                    <PieCheckbox id="sobres" label="Jours sobres" value={globalStats.jourssobresEntry.count} color={theme.colors.textFaint} checked={!!pieSelection.sobres} onToggle={() => togglePieItem('sobres')} />
                  )}
                  {sortedBreakdown.map((b) => (
                    <PieCheckbox key={b.substance.id} id={b.substance.id} label={b.substance.name} value={b.count} color={b.substance.color} checked={!!pieSelection[b.substance.id]} onToggle={() => togglePieItem(b.substance.id)} />
                  ))}
                </View>
              </View>
              <Text style={styles.pieNote}>En jours · {globalStats.totalDaysInWindow}j au total</Text>
            </ChartCard>
          )}

          <Modal visible={infoVisible} transparent animationType="fade" onRequestClose={() => setInfoVisible(false)}>
            <Pressable style={styles.infoOverlay} onPress={() => setInfoVisible(false)}>
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Comment lire ce camembert</Text>
                <Text style={styles.infoText}>
                  Chaque tranche représente un nombre de <Text style={styles.infoEmphasis}>jours</Text> sur la période.{'\n\n'}
                  Décocher une substance l'exclut aussi du timeline et des autres graphiques.{'\n\n'}
                  <Text style={styles.infoEmphasis}>Jours sobres</Text> = jours sans aucune consommation.
                </Text>
                <TouchableOpacity onPress={() => setInfoVisible(false)} style={styles.infoClose}>
                  <Text style={styles.infoCloseText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>

          <ChartCard title={
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitleText}>Activité dans le temps</Text>
              <TouchableOpacity
                style={styles.capsule}
                activeOpacity={0.7}
                onPress={() => setUseDoses((v) => !v)}
              >
                <View style={[styles.capsuleIndicator, useDoses && styles.capsuleIndicatorRight]} />
                <View style={styles.capsuleLabel}>
                  <Text style={[styles.capsuleText, !useDoses && styles.capsuleTextActive]}>Prises</Text>
                </View>
                <View style={styles.capsuleLabel}>
                  <Text style={[styles.capsuleText, useDoses && styles.capsuleTextActive]}>Dosage</Text>
                </View>
              </TouchableOpacity>
            </View>
          }>
            {mode === 'global' && multiCurves && multiCurves.length > 0 ? (
              <MultiLineChart curves={multiCurves} height={140} forcePoints={windowId === '30d'} />
            ) : stats.timeline && stats.timeline.length > 0 && stats.total > 0 ? (
              <LineChart data={stats.timeline} color={dominantColor} height={140} segmentColors={segmentColors} />
            ) : (
              <View style={styles.emptyChart}><Text style={styles.emptyChartText}>Pas de consommation sur la période</Text></View>
            )}
          </ChartCard>

          <ChartCard title="Heure de la journée">
            {stats.total > 0 ? (
              <BarChart data={stats.hourDistribution} labels={HOUR_LABELS_24} color={dominantColor} height={100} />
            ) : (
              <View style={styles.emptyChart}><Text style={styles.emptyChartText}>Pas de consommation sur la période</Text></View>
            )}
          </ChartCard>

          <ChartCard title="Jour de la semaine">
            {stats.total > 0 ? (
              <BarChart data={stats.weekdayDistribution} labels={WEEKDAY_LABELS} color={dominantColor} height={100} />
            ) : (
              <View style={styles.emptyChart}><Text style={styles.emptyChartText}>Pas de consommation sur la période</Text></View>
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
      <Text style={styles.metricValue} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
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
      <Text style={[styles.pieCheckboxLabel, !checked && styles.pieCheckboxLabelOff]} numberOfLines={1}>{label}</Text>
      <Text style={styles.pieCheckboxValue}>{value}j</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingTop: theme.spacing.sm, paddingBottom: 20 },
  globalHero: {
    alignItems: 'center', paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  globalHeroLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: theme.spacing.xs,
  },
  counterWrap: {
    minHeight: 36, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: theme.spacing.md, width: '100%',
  },
  globalHeroCounter: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.xl, fontWeight: '300', letterSpacing: 0.5,
    fontVariant: ['tabular-nums'], textAlign: 'center', flexShrink: 1,
  },
  globalHeroSubLabel: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontWeight: '300',
    letterSpacing: 0.5, marginTop: theme.spacing.sm,
  },
  globalHeroValue: {
    color: theme.colors.text, fontSize: 56, fontWeight: '200',
    fontVariant: ['tabular-nums'], letterSpacing: 1,
  },
  windowSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.xs },
  windowChip: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
  windowChipText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300', letterSpacing: 0.5 },
  customRangeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: theme.spacing.md, marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md, marginTop: theme.spacing.xs,
  },
  customDateBtn: {
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    minWidth: 90, alignItems: 'center',
  },
  customDateText: { fontSize: theme.font.sizes.sm, fontWeight: '300', letterSpacing: 1 },
  customSep: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '200' },
  periodBand: {
    fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 1,
    textAlign: 'center', opacity: 0.6,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  numbersRow: { flexDirection: 'row', paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.md, gap: theme.spacing.sm },
  metricCell: { flex: 1, backgroundColor: theme.colors.surface, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, alignItems: 'center', minHeight: 90, justifyContent: 'center' },
  metricValueAlign: { textAlign: 'center' },
  metricValue: { color: theme.colors.text, fontSize: theme.font.sizes.lg, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: 0.5, textAlign: 'center' },
  metricLabel: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.5, textTransform: 'lowercase', marginTop: 4, textAlign: 'center' },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  pieNote: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.5, textAlign: 'center', marginTop: theme.spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  cardTitleText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '400', letterSpacing: 1.5, textTransform: 'uppercase', flex: 1 },
  pieCheckboxList: { paddingLeft: theme.spacing.sm, gap: 4 },
  pieCheckboxRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3 },
  pieCheckboxBox: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: theme.colors.textMuted, justifyContent: 'center', alignItems: 'center' },
  pieCheckboxDot: { width: 7, height: 7, borderRadius: 3.5 },
  pieCheckboxLabel: { flex: 1, color: theme.colors.text, fontSize: 11, fontWeight: '300' },
  pieCheckboxLabelOff: { color: theme.colors.textFaint },
  pieCheckboxValue: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '300', fontVariant: ['tabular-nums'] },
  chartExpandWrap: { position: 'relative' },
  expandIcon: {
    position: 'absolute', top: 0, right: 4,
    padding: 4, opacity: 0.6,
  },
  exploreHint: {
    color: theme.colors.textFaint, fontSize: 10, fontWeight: '300',
    textAlign: 'center', marginTop: theme.spacing.xs,
    letterSpacing: 0.5, fontStyle: 'italic',
  },
  modeSwitch: { flexDirection: 'row', gap: 0 },
  capsule: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 2,
    position: 'relative',
    width: 130,
    height: 26,
  },
  capsuleIndicator: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 63,
    height: 22,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.text,
  },
  capsuleIndicatorRight: {
    left: 65,
  },
  capsuleLabel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  capsuleText: {
    color: theme.colors.textFaint,
    fontSize: 10,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  capsuleTextActive: {
    color: theme.colors.text,
    fontWeight: '500',
  },
  modeBtn: {
    paddingHorizontal: theme.spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  modeBtnActive: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.text,
  },
  modeBtnText: {
    color: theme.colors.textFaint, fontSize: 10,
    fontWeight: '300', letterSpacing: 0.5,
  },
  modeBtnTextActive: {
    color: theme.colors.text, fontWeight: '400',
  },
  dosesToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dosesBox: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: theme.colors.textMuted, justifyContent: 'center', alignItems: 'center' },
  dosesLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '300' },
  perPriseToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  perPriseBox: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: theme.colors.textMuted, justifyContent: 'center', alignItems: 'center' },
  perPriseLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '300' },
  infoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
  infoCard: { backgroundColor: theme.colors.surface, borderRadius: 6, padding: theme.spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  infoTitle: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '400', letterSpacing: 0.5, marginBottom: theme.spacing.md },
  infoText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300', lineHeight: 20, marginBottom: theme.spacing.lg },
  infoEmphasis: { color: theme.colors.text, fontWeight: '400' },
  infoClose: { alignSelf: 'flex-end', paddingVertical: theme.spacing.sm },
  infoCloseText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '400', letterSpacing: 1 },
  emptyChart: { height: 80, justifyContent: 'center', alignItems: 'center' },
  emptyChartText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontWeight: '300', fontStyle: 'italic', textAlign: 'center' },
  dosageRow: { flexDirection: 'row', gap: theme.spacing.md },
  dosageCell: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm },
  dosageValue: { color: theme.colors.text, fontSize: theme.font.sizes.lg, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  dosageLabel: { color: theme.colors.textFaint, fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.5, textTransform: 'lowercase', marginTop: 2 },
});
