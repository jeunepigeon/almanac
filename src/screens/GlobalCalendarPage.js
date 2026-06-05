import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { theme } from '../theme';
import { useStore } from '../store';
import { dbGetAllConsumptions } from '../db';
import MonthCalendar from '../components/MonthCalendar';
import DayDetailModal from '../components/DayDetailModal';
import SubstancePicker from '../components/SubstancePicker';
import LogConsumptionModal from '../components/LogConsumptionModal';
import StatsView from '../components/StatsView';
import GlobalHistoryView from '../components/GlobalHistoryView';

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function GlobalCalendarPage() {
  const navigation = useNavigation();
  const substances = useStore((s) => s.substances);
  const archivedSubstances = useStore((s) => s.archivedSubstances);
  const consumptionsBySubstance = useStore((s) => s.consumptionsBySubstance);
  const lastTimestamps = useStore((s) => s.lastTimestamps);
  const createConsumption = useStore((s) => s.createConsumption);

  const [allConsumptions, setAllConsumptions] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [dayDetail, setDayDetail] = useState(null);

  // Flow ajout : 1) picker substance 2) modal log
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerForDay, setPickerForDay] = useState(null);
  const [logFlow, setLogFlow] = useState(null); // { substance, prefilledDate }

  const substancesById = useMemo(() => {
    const map = {};
    [...substances, ...archivedSubstances].forEach((s) => { map[s.id] = s; });
    return map;
  }, [substances, archivedSubstances]);

  const reload = async () => {
    const all = await dbGetAllConsumptions();
    setAllConsumptions(all);
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => { reload(); }, [consumptionsBySubstance, lastTimestamps, substances.length]);

  // Recharge aussi à chaque focus de la page (au cas où on est revenu d'une autre vue)
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [])
  );

  const markersByDay = useMemo(() => {
    if (!allConsumptions) return {};
    const map = {};
    for (const c of allConsumptions) {
      const k = dayKeyOf(c.timestamp);
      if (!map[k]) map[k] = new Set();
      map[k].add(c.substanceId);
    }
    const result = {};
    for (const k of Object.keys(map)) {
      const colors = [];
      for (const subId of map[k]) {
        const sub = substancesById[subId];
        if (sub) colors.push(sub.color);
      }
      result[k] = colors;
    }
    return result;
  }, [allConsumptions, substancesById]);

  const consosForDay = useMemo(() => {
    if (!dayDetail || !allConsumptions) return [];
    return allConsumptions
      .filter((c) => dayKeyOf(c.timestamp) === dayDetail.dayKey)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [dayDetail, allConsumptions]);

  const consumptionsBySubstanceForStats = useMemo(() => {
    const map = {};
    if (allConsumptions) {
      for (const c of allConsumptions) {
        if (!map[c.substanceId]) map[c.substanceId] = [];
        map[c.substanceId].push(c);
      }
    }
    return map;
  }, [allConsumptions]);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <Tab label="Calendrier" active={activeTab === 'calendar'} onPress={() => setActiveTab('calendar')} />
        <Tab label="Historique" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
        <Tab label="Stats" active={activeTab === 'stats'} onPress={() => setActiveTab('stats')} />
      </View>

      {activeTab === 'calendar' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <MonthCalendar
            markersByDay={markersByDay}
            showSoberFill={true}
            onDayPress={(dayKey, dayTimestamp) => {
              // Si pas de conso ce jour : on saute la modal détail vide
              // et on ouvre directement le flow d'ajout (picker substance + log)
              const consosOfDay = (allConsumptions || []).filter(
                (c) => dayKeyOf(c.timestamp) === dayKey
              );
              if (consosOfDay.length === 0) {
                setPickerForDay(dayTimestamp);
                setPickerOpen(true);
              } else {
                setDayDetail({ dayKey, dayTimestamp });
              }
            }}
          />
        </ScrollView>
      )}
      {activeTab === 'history' && (
        <GlobalHistoryView
          consumptions={allConsumptions || []}
          substancesById={substancesById}
          onTapConsumption={(c) => {
            const sid = c.substanceId ?? c.substance_id;
            navigation.navigate('Substance', { substanceId: sid, focusDate: c.timestamp });
          }}
        />
      )}
      {activeTab === 'stats' && (
        <StatsView
          mode="global"
          consumptionsBySubstance={consumptionsBySubstanceForStats}
          substancesById={substancesById}
          navigation={navigation}
        />
      )}

      {/* Détail d'un jour */}
      <DayDetailModal
        visible={!!dayDetail}
        dayTimestamp={dayDetail?.dayTimestamp}
        consumptions={consosForDay}
        substancesById={substancesById}
        onTapConsumption={(c) => {
          // Navigation directe vers la page substance avec calendrier sur ce jour
          // Pas d'ouverture de modal édition.
          const targetTs = c.timestamp;
          setDayDetail(null);
          setTimeout(() => {
            navigation.navigate('Substance', {
              substanceId: c.substanceId,
              focusDate: targetTs,
            });
          }, 100);
        }}
        onAddPress={() => {
          // Stocke le jour, ferme la modal détail et ouvre le picker substance
          const dt = dayDetail?.dayTimestamp;
          setDayDetail(null);
          setPickerForDay(dt);
          setTimeout(() => setPickerOpen(true), 100);
        }}
        onClose={() => setDayDetail(null)}
      />

      {/* Picker substance */}
      <SubstancePicker
        visible={pickerOpen}
        substances={substances}
        onPick={(sub) => {
          setPickerOpen(false);
          setTimeout(() => {
            setLogFlow({ substance: sub, prefilledDate: pickerForDay });
          }, 100);
        }}
        onClose={() => {
          setPickerOpen(false);
          setPickerForDay(null);
        }}
      />

      {/* Modal de log */}
      <LogConsumptionModal
        visible={!!logFlow}
        mode="create"
        substance={logFlow?.substance}
        prefilledDate={logFlow?.prefilledDate}
        onSubmit={async (payload) => {
          if (logFlow?.substance) {
            await createConsumption({
              substanceId: logFlow.substance.id,
              ...payload,
            });
          }
          setLogFlow(null);
          setPickerForDay(null);
          // Force reload du calendrier global
          reload();
        }}
        onClose={() => {
          setLogFlow(null);
          setPickerForDay(null);
        }}
      />
    </View>
  );
}

function Tab({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.tab}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {active && <View style={styles.tabUnderline} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  tabs: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.lg },
  tab: { paddingBottom: theme.spacing.sm },
  tabText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  tabTextActive: { color: theme.colors.text },
  tabUnderline: { height: 2, backgroundColor: theme.colors.text, marginTop: theme.spacing.xs },
  scrollContent: { paddingBottom: 60 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.lg },
  placeholderText: { color: theme.colors.text, fontSize: theme.font.sizes.lg, fontWeight: '300', letterSpacing: 1, marginBottom: theme.spacing.sm },
  placeholderHint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontWeight: '300' },
});
