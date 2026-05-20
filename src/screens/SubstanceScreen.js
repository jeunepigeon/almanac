import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable, ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { getIconById } from '../icons';
import { formatDateLong, formatTime } from '../utils/dates';
import LiveCounter from '../components/LiveCounter';
import LogConsumptionModal from '../components/LogConsumptionModal';
import ConfirmModal from '../components/ConfirmModal';
import MonthCalendar from '../components/MonthCalendar';
import DayDetailModal from '../components/DayDetailModal';
import StatsView from '../components/StatsView';

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function SubstanceScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { substanceId, focusDate } = route.params || {};

  const substance = useStore((s) =>
    [...s.substances, ...s.archivedSubstances].find((x) => x.id === substanceId)
  );
  const lastTimestamp = useStore((s) => s.lastTimestamps[substanceId]);
  const consumptions = useStore(
    (s) => s.consumptionsBySubstance[substanceId] || null
  );
  const loadConsumptionsForSubstance = useStore((s) => s.loadConsumptionsForSubstance);
  const createConsumption = useStore((s) => s.createConsumption);
  const updateConsumption = useStore((s) => s.updateConsumption);
  const deleteConsumption = useStore((s) => s.deleteConsumption);

  const [activeTab, setActiveTab] = useState('calendar');
  const [logOpen, setLogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const [prefilledDate, setPrefilledDate] = useState(null);

  useEffect(() => {
    if (substanceId && consumptions === null) {
      loadConsumptionsForSubstance(substanceId);
    }
  }, [substanceId, consumptions, loadConsumptionsForSubstance]);

  useEffect(() => {
    navigation.setOptions({ title: substance?.name ?? 'Substance' });
  }, [navigation, substance]);

  useEffect(() => {
    if (focusDate && consumptions !== null) {
      setDayDetail({ dayTimestamp: focusDate, dayKey: dayKeyOf(focusDate) });
      navigation.setParams({ focusDate: undefined });
    }
  }, [focusDate, consumptions, navigation]);

  const markersByDay = useMemo(() => {
    if (!consumptions || !substance) return {};
    const map = {};
    for (const c of consumptions) {
      const k = dayKeyOf(c.timestamp);
      if (!map[k]) map[k] = [substance.color];
    }
    return map;
  }, [consumptions, substance]);

  const consosForDay = useMemo(() => {
    if (!dayDetail || !consumptions) return [];
    return consumptions.filter((c) => dayKeyOf(c.timestamp) === dayDetail.dayKey);
  }, [dayDetail, consumptions]);

  if (!substance) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFound}>Substance introuvable</Text>
      </View>
    );
  }

  const iconEntry = getIconById(substance.icon);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={[styles.heroIcon, { borderColor: substance.color }]}>
          <MaterialCommunityIcons name={iconEntry.icon} size={28} color={substance.color} />
        </View>
        <Text style={styles.heroLabel}>Temps depuis la dernière</Text>
        <View style={styles.counterWrap}>
          <LiveCounter
            timestamp={lastTimestamp}
            style={[styles.heroCounter, { color: substance.color }]}
          />
        </View>
      </View>

      <View style={styles.tabs}>
        <Tab label="Calendrier" active={activeTab === 'calendar'} onPress={() => setActiveTab('calendar')} />
        <Tab label="Historique" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
        <Tab label="Stats" active={activeTab === 'stats'} onPress={() => setActiveTab('stats')} />
      </View>

      {activeTab === 'calendar' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <MonthCalendar
            markersByDay={markersByDay}
            initialMonth={focusDate ? new Date(focusDate) : undefined}
            onDayPress={(dayKey, dayTimestamp) => setDayDetail({ dayKey, dayTimestamp })}
          />
        </ScrollView>
      )}
      {activeTab === 'history' && (
        <HistoryList consumptions={consumptions} color={substance.color} onEdit={(c) => setEditing(c)} />
      )}
      {activeTab === 'stats' && (
        <StatsView
          mode="substance"
          consumptions={consumptions || []}
          color={substance.color}
          navigation={navigation}
          substanceId={substanceId}
        />
      )}

      <FAB color={substance.color} onPress={() => setLogOpen(true)} />

      <LogConsumptionModal
        visible={logOpen}
        mode="create"
        substance={substance}
        prefilledDate={prefilledDate}
        onSubmit={async (payload) => {
          await createConsumption({ substanceId: substance.id, ...payload });
          setLogOpen(false);
          setPrefilledDate(null);
        }}
        onClose={() => { setLogOpen(false); setPrefilledDate(null); }}
      />

      <LogConsumptionModal
        visible={!!editing}
        mode="edit"
        substance={substance}
        initial={editing}
        onSubmit={async (payload) => {
          if (editing) await updateConsumption(editing.id, substance.id, payload);
          setEditing(null);
        }}
        onDelete={() => { setPendingDelete(editing); setEditing(null); }}
        onClose={() => setEditing(null)}
      />

      <ConfirmModal
        visible={!!pendingDelete}
        title="Supprimer cette consommation ?"
        message="Cette entrée sera retirée de l'historique."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await deleteConsumption(pendingDelete.id, substance.id);
          setPendingDelete(null);
        }}
      />

      <DayDetailModal
        visible={!!dayDetail}
        dayTimestamp={dayDetail?.dayTimestamp}
        consumptions={consosForDay}
        singleSubstance={substance}
        onTapConsumption={(c) => {
          setDayDetail(null);
          setTimeout(() => setEditing(c), 100);
        }}
        onAddPress={() => {
          const dt = dayDetail?.dayTimestamp;
          setDayDetail(null);
          setPrefilledDate(dt);
          setTimeout(() => setLogOpen(true), 100);
        }}
        onClose={() => setDayDetail(null)}
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

function HistoryList({ consumptions, color, onEdit }) {
  const grouped = useMemo(() => {
    if (!consumptions) return null;
    const map = new Map();
    for (const c of consumptions) {
      const d = new Date(c.timestamp);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]).map(([k, items]) => ({ dayTs: k, items }));
  }, [consumptions]);

  if (consumptions === null) return <View style={styles.listWrap} />;
  if (consumptions.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Aucune consommation enregistrée</Text>
        <Text style={styles.placeholderHint}>Tape sur le bouton + pour en ajouter une</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={grouped}
      keyExtractor={(item) => String(item.dayTs)}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View>
          <Text style={styles.dayHeader}>{formatDateLong(item.dayTs)}</Text>
          {item.items.map((c) => (
            <ConsumptionRow key={c.id} consumption={c} color={color} onPress={() => onEdit(c)} />
          ))}
        </View>
      )}
    />
  );
}

function ConsumptionRow({ consumption, color, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.consoRow, pressed && styles.consoRowPressed]}>
      <View style={[styles.consoBullet, { backgroundColor: color }]} />
      <View style={styles.consoMiddle}>
        <Text style={styles.consoTime}>{formatTime(consumption.timestamp)}</Text>
        {consumption.dosage != null ? (
          <Text style={styles.consoDosage}>
            {Number(consumption.dosage).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}
          </Text>
        ) : null}
        {consumption.notes ? <Text style={styles.consoNotes} numberOfLines={2}>{consumption.notes}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textFaint} />
    </Pressable>
  );
}

function FAB({ color, onPress }) {
  return (
    <TouchableOpacity style={[styles.fab, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="add" size={28} color={theme.colors.background} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  notFound: { color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.xl },
  hero: {
    alignItems: 'center', paddingVertical: theme.spacing.lg, paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.sm,
  },
  heroLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '300',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: theme.spacing.xs,
  },
  counterWrap: {
    minHeight: 36, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: theme.spacing.md, width: '100%',
  },
  heroCounter: {
    fontSize: theme.font.sizes.xl, fontWeight: '300', letterSpacing: 0.5,
    fontVariant: ['tabular-nums'], textAlign: 'center', flexShrink: 1,
  },
  tabs: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.lg },
  tab: { paddingBottom: theme.spacing.sm },
  tabText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  tabTextActive: { color: theme.colors.text },
  tabUnderline: { height: 2, backgroundColor: theme.colors.text, marginTop: theme.spacing.xs },
  scrollContent: { paddingBottom: 120 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.lg },
  placeholderText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300', textAlign: 'center' },
  placeholderHint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontWeight: '300', textAlign: 'center', marginTop: theme.spacing.sm },
  listWrap: { flex: 1 },
  listContent: { paddingTop: theme.spacing.sm, paddingBottom: 120 },
  dayHeader: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '400',
    letterSpacing: 1, textTransform: 'uppercase',
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm,
  },
  consoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  consoRowPressed: { backgroundColor: theme.colors.surface },
  consoBullet: { width: 8, height: 8, borderRadius: 4 },
  consoMiddle: { flex: 1, gap: 2 },
  consoTime: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', fontVariant: ['tabular-nums'] },
  consoDosage: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  consoNotes: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontWeight: '300', fontStyle: 'italic' },
  fab: {
    position: 'absolute', bottom: theme.spacing.lg, right: theme.spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
});
