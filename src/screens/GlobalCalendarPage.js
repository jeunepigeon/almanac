import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { theme } from '../theme';
import { useStore } from '../store';
import { dbGetAllConsumptions } from '../db';
import MonthCalendar from '../components/MonthCalendar';
import ScrollableCalendar from '../components/ScrollableCalendar';
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
  const updateConsumption = useStore((s) => s.updateConsumption);
  const deleteConsumption = useStore((s) => s.deleteConsumption);

  const [allConsumptions, setAllConsumptions] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const gotoGlobalStatsTick = useStore((s) => s.gotoGlobalStatsTick);

  // Switcher sur Stats quand bannière cliquée
  useEffect(() => {
    if (gotoGlobalStatsTick > 0) setActiveTab('stats');
  }, [gotoGlobalStatsTick]);
  const [dayDetail, setDayDetail] = useState(null);

  // Flow ajout : 1) picker substance 2) modal log
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerForDay, setPickerForDay] = useState(null);
  const [logFlow, setLogFlow] = useState(null); // { substance, prefilledDate }
  const [editingConso, setEditingConso] = useState(null); // { consumption, substance }

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
    // Groupe par jour. Pour chaque jour : liste des substances UNIQUES consommées,
    // ordonnées par premier timestamp de la journée (chronologique).
    // Chaque substance → sa couleur. Deux substances différentes de même couleur = 2 points.
    const byDay = {};
    for (const c of allConsumptions) {
      const k = dayKeyOf(c.timestamp);
      if (!byDay[k]) byDay[k] = { firstTsBySub: {} };
      const subId = c.substanceId;
      // Garder le premier timestamp (minimum) de chaque substance ce jour-là
      if (byDay[k].firstTsBySub[subId] == null || c.timestamp < byDay[k].firstTsBySub[subId]) {
        byDay[k].firstTsBySub[subId] = c.timestamp;
      }
    }
    const result = {};
    for (const k of Object.keys(byDay)) {
      // Trier les subIds par leur premier timestamp dans la journée (ascendant)
      const sortedSubIds = Object.keys(byDay[k].firstTsBySub)
        .sort((a, b) => byDay[k].firstTsBySub[a] - byDay[k].firstTsBySub[b]);
      const colors = [];
      for (const subId of sortedSubIds) {
        const sub = substancesById[subId];
        if (sub) colors.push(sub.color);
      }
      // Max 10 points affichés (le reste est ignoré pour le calendrier)
      result[k] = colors.slice(0, 10);
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
        <Tab label="Recherche" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
        <Tab label="Stats" active={activeTab === 'stats'} onPress={() => setActiveTab('stats')} />
      </View>

      {activeTab === 'calendar' && (
        <View style={{ flex: 1 }}>
          <ScrollableCalendar
            markersByDay={markersByDay}
            showSoberFill={true}
            onDayPress={(dayKey, dayTimestamp) => {
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
          <TouchableOpacity
            style={styles.fab}
            activeOpacity={0.85}
            onPress={() => {
              setPickerForDay(Date.now());
              setPickerOpen(true);
            }}
          >
            <Ionicons name="add" size={26} color={theme.colors.background} />
          </TouchableOpacity>
        </View>
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
          // Ouvre la modal d'édition directement, SANS quitter le calendrier global
          const sub = substancesById[c.substanceId ?? c.substance_id];
          if (sub) {
            setEditingConso({ consumption: c, substance: sub });
          }
        }}
        onAddPress={() => {
          const dt = dayDetail?.dayTimestamp;
          setDayDetail(null);
          setPickerForDay(dt);
          setTimeout(() => setPickerOpen(true), 100);
        }}
        onClose={() => setDayDetail(null)}
      />

      {/* Modal d'édition d'une conso cliquée depuis le détail du jour */}
      <LogConsumptionModal
        visible={!!editingConso}
        mode="edit"
        substance={editingConso?.substance}
        initial={editingConso?.consumption}
        onSubmit={async (payload) => {
          if (editingConso?.consumption) {
            await updateConsumption(editingConso.consumption.id, editingConso.consumption.substanceId, payload);
          }
          setEditingConso(null);
          reload();
        }}
        onDelete={async () => {
          if (editingConso?.consumption) {
            await deleteConsumption(editingConso.consumption.id, editingConso.consumption.substanceId);
          }
          setEditingConso(null);
          reload();
        }}
        onClose={() => setEditingConso(null)}
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
  tabs: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.lg, justifyContent: 'center' },
  tab: { paddingBottom: theme.spacing.sm },
  tabText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  tabTextActive: { color: theme.colors.text },
  tabUnderline: { height: 2, backgroundColor: theme.colors.text, marginTop: theme.spacing.xs },
  scrollContent: { paddingBottom: 60 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.text,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.lg },
  placeholderText: { color: theme.colors.text, fontSize: theme.font.sizes.lg, fontWeight: '300', letterSpacing: 1, marginBottom: theme.spacing.sm },
  placeholderHint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontWeight: '300' },
});
