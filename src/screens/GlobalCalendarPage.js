import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore, EMPTY_LIST } from '../store';
import ScrollableCalendar from '../components/ScrollableCalendar';
import DayDetailModal from '../components/DayDetailModal';
import SubstancePicker from '../components/SubstancePicker';
import LogConsumptionModal from '../components/LogConsumptionModal';
import StatsView from '../components/StatsView';
import GlobalHistoryView from '../components/GlobalHistoryView';
import ReorgBar from '../components/ReorgBar';
import TopCounter from '../components/TopCounter';
import AnimatedTabs from '../components/AnimatedTabs';
import { formatDayKey } from '../utils/dates';


// 1.49 — Global en 3 pages du défilement principal (Liste · Calendrier · Recherche · Stats), comme les
// onglets d'une substance. Ce module fournit les morceaux, placés par MainScreen :
//  - header : onglets + petit compteur (fixes entre les 3 onglets, glissent seulement vers la liste) ;
//  - calendar / history / stats : contenu de chaque page ;
//  - modals (une seule fois) et reorgBar (réorganisation des compteurs, par-dessus les onglets).
// activeTab : onglet affiché ; goTab(t) : aller à un onglet ; visited : pages déjà construites.
const TAB_IDS = ['calendar', 'history', 'stats'];

export function useGlobalPages({ activeTab, goTab, visited = {}, progress }) {
  const navigation = useNavigation();
  const substances = useStore((s) => s.substances);
  const archivedSubstances = useStore((s) => s.archivedSubstances);
  // 1.31 : stock central — plus de relecture complète de la base (avant : au montage x2, à chaque
  // changement de prise n'importe où, et à chaque retour sur la page, même invisible)
  const allConsumptions = useStore((s) => s.allConsumptions);
  const consumptionsBySubstance = useStore((s) => s.consumptionsBySubstance);
  const createConsumption = useStore((s) => s.createConsumption);
  const updateConsumption = useStore((s) => s.updateConsumption);
  const deleteConsumption = useStore((s) => s.deleteConsumption);
  const lastTimestampsAll = useStore((s) => s.lastTimestamps);
  const lastGlobalTs = useMemo(() => {
    const vals = Object.values(lastTimestampsAll || {}).filter(Boolean);
    return vals.length ? Math.max(...vals) : null;
  }, [lastTimestampsAll]);
  const countersEditing = useStore((s) => s.countersEditing === '__global');
  // 1.44 : réorganisation des compteurs du global → pages verrouillées comme pour la liste
  const setPagerLocked = useStore((s) => s.setPagerLocked);
  useEffect(() => {
    if (!countersEditing) return undefined;
    setPagerLocked(true);
    return () => setPagerLocked(false);
  }, [countersEditing]); // eslint-disable-line
  const requestCountersExit = useStore((s) => s.requestCountersExit);

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

  // Index jour → prises du jour (ordre chronologique), construit une fois par changement de prises
  const byDay = useMemo(() => {
    const map = {};
    for (let i = allConsumptions.length - 1; i >= 0; i--) { // du plus ancien au plus récent
      const c = allConsumptions[i];
      (map[c.dayKey] || (map[c.dayKey] = [])).push(c);
    }
    return map;
  }, [allConsumptions]);

  // Points du calendrier : substances UNIQUES du jour, dans l'ordre de leur 1re prise (max 10)
  const markersByDay = useMemo(() => {
    const result = {};
    for (const k of Object.keys(byDay)) {
      const seen = new Set();
      const colors = [];
      for (const c of byDay[k]) {
        if (seen.has(c.substanceId)) continue;
        seen.add(c.substanceId);
        const sub = substancesById[c.substanceId];
        if (sub) colors.push(sub.color);
        if (colors.length >= 10) break;
      }
      result[k] = colors;
    }
    return result;
  }, [byDay, substancesById]);

  const consosForDay = dayDetail ? (byDay[dayDetail.dayKey] || EMPTY_LIST) : EMPTY_LIST;

  const header = (
    <View style={styles.headerBox}>
      {/* 1.51 : trait et couleurs qui suivent le doigt (même composant que les substances) */}
      <AnimatedTabs progress={progress} dimmed={countersEditing} onPress={(i) => { requestCountersExit(); goTab(TAB_IDS[i]); }} />
      {/* 1.46 : petit compteur sous les onglets (même disposition que la page d'une substance) */}
      <TopCounter label="Sobre de tout depuis" timestamp={lastGlobalTs} dimmed={countersEditing} noBorder={activeTab === 'stats'} />
    </View>
  );

  // 1.51 : pages mémorisées → pas redessinées quand l'écran principal change (onglet, substance…)
  const calendar = useMemo(() => (
    <View style={{ flex: 1 }}>
      <ScrollableCalendar
        markersByDay={markersByDay}
        showSoberFill={true}
        showJumpButtons={true}
        onDayPress={(dayKey, dayTimestamp) => {
          if (!byDay[dayKey]) {
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
  ), [markersByDay, byDay]);

  const history = useMemo(() => (visited.history ? (
    <GlobalHistoryView
      consumptions={allConsumptions}
      substancesById={substancesById}
      // 1.51 : ouvre la carte du jour de Global (on reste dans Global)
      onTapConsumption={(c) => {
        const d = new Date(c.timestamp); d.setHours(0, 0, 0, 0);
        setDayDetail({ dayKey: c.dayKey || formatDayKey(c.timestamp), dayTimestamp: d.getTime() });
      }}
    />
  ) : null), [visited.history, allConsumptions, substancesById]);

  const stats = useMemo(() => (visited.stats ? (
    <View style={{ flex: 1 }}>
      <StatsView
        mode="global"
        consumptionsBySubstance={consumptionsBySubstance}
        substancesById={substancesById}
        navigation={navigation}
      />
    </View>
  ) : null), [visited.stats, consumptionsBySubstance, substancesById, navigation]);

  const modals = (
    <>
      {/* Détail d'un jour */}
      <DayDetailModal
        visible={!!dayDetail}
        dayTimestamp={dayDetail?.dayTimestamp}
        consumptions={consosForDay}
        substancesById={substancesById}
        onDeleteConsumption={(c) => deleteConsumption(c.id, c.substanceId ?? c.substance_id)}
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
        directEdit
        substance={editingConso?.substance}
        initial={editingConso?.consumption}
        onSubmit={async (payload) => {
          if (editingConso?.consumption) {
            await updateConsumption(editingConso.consumption.id, editingConso.consumption.substanceId, payload);
          }
          setEditingConso(null);
        }}
        onDelete={async () => {
          if (editingConso?.consumption) {
            await deleteConsumption(editingConso.consumption.id, editingConso.consumption.substanceId);
          }
          setEditingConso(null);
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
        }}
        onClose={() => {
          setLogFlow(null);
          setPickerForDay(null);
        }}
      />
    </>
  );

  // 1.46 : barre de réorganisation par-dessus les onglets (comme la page d'une substance)
  const reorgBar = countersEditing ? <ReorgBar onDone={requestCountersExit} /> : null;

  return { header, calendar, history, stats, modals, reorgBar };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerBox: { backgroundColor: theme.colors.background },
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
