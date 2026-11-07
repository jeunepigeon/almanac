import { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable, ScrollView, Animated,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import PagerView from 'react-native-pager-view';
import { theme } from '../theme';
import { useStore, EMPTY_LIST } from '../store';
import { getIconById } from '../icons';
import SubstanceIcon from '../components/SubstanceIcon';
import { formatDateLong, formatTime } from '../utils/dates';
import LiveCounter from '../components/LiveCounter';
import ReorgBar from '../components/ReorgBar';
import TopCounter from '../components/TopCounter';
import { DateLine } from '../components/Banners';
import { rangeFR } from '../utils/soberPeriods';
import LogConsumptionModal from '../components/LogConsumptionModal';
import ConfirmModal from '../components/ConfirmModal';
import ScrollableCalendar from '../components/ScrollableCalendar';
import DayDetailModal from '../components/DayDetailModal';
import StatsView from '../components/StatsView';
import NotifWizard from '../components/NotifWizard';
import { useFlashBackground } from '../utils/flash';
import { waitForAppReady, appStateInfo } from '../utils/appReady';

// 1.48 : onglets en pages glissables (la page suit le doigt, comme les pages principales)
const TABS = ['calendar', 'history', 'stats'];

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function SubstanceScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { substanceId, focusDate, notifFlash } = route.params || {};

  const substance = useStore((s) =>
    [...s.substances, ...s.archivedSubstances].find((x) => x.id === substanceId)
  );
  const lastTimestamp = useStore((s) => s.lastTimestamps[substanceId]);
  // 1.31 : liste complète depuis le stock central (plus de lecture en base à l'ouverture)
  const consumptions = useStore(
    (s) => (s.consumptionsLoaded ? (s.consumptionsBySubstance[substanceId] || EMPTY_LIST) : null)
  );
  // 1.40 : horodatages pour les compteurs ajoutés (précédente / plus longue)
  const consoTimestamps = useMemo(() => (consumptions || []).map((c) => c.timestamp), [consumptions]);
  const createConsumption = useStore((s) => s.createConsumption);
  // 1.46 : en vrai/faux (le store contient la portée en cours ; un texte passé à `disabled` faisait planter)
  const countersEditing = useStore((s) => !!s.countersEditing);
  const requestCountersExit = useStore((s) => s.requestCountersExit);
  const updateConsumption = useStore((s) => s.updateConsumption);
  const deleteConsumption = useStore((s) => s.deleteConsumption);

  const [activeTab, setActiveTab] = useState('calendar');
  const pagerRef = useRef(null);
  // Une page n'est construite qu'à sa 1re visite (ouverture de la page aussi rapide qu'avant)
  const [visited, setVisited] = useState({ calendar: true });
  const goTab = (t) => {
    setActiveTab(t);
    setVisited((v) => (v[t] ? v : { ...v, [t]: true }));
    pagerRef.current?.setPage(TABS.indexOf(t));
  };
  // … puis les deux autres juste après l'ouverture : prêtes quand on glisse vers elles
  useEffect(() => {
    const t = setTimeout(() => setVisited({ calendar: true, history: true, stats: true }), 400);
    return () => clearTimeout(t);
  }, []);
  const [logOpen, setLogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const [prefilledDate, setPrefilledDate] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const hasSubNotif = useStore((s) => s.notifRules.some((r) => r.target === 'sub' && r.key === substanceId));

  useEffect(() => {
    navigation.setOptions({
      title: substance?.name ?? 'Substance',
      // 1.44 : compteurs en réorganisation → flèche retour et cloche assombries et inactives
      headerTintColor: countersEditing ? theme.colors.textFaint : theme.colors.text,
      gestureEnabled: !countersEditing,
      // Cloche à la couleur de la substance : notifications de CETTE substance (sélection sautée)
      headerRight: () => (substance ? (
        <TouchableOpacity
          onPress={() => setNotifOpen(true)}
          disabled={countersEditing}
          style={countersEditing && { opacity: 0.25 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name={hasSubNotif ? 'bell' : 'bell-outline'} size={20} color={substance.color} />
        </TouchableOpacity>
      ) : null),
    });
  }, [navigation, substance, hasSubNotif, countersEditing]);

  // 1.44 : impossible de quitter la page pendant la réorganisation des compteurs (flèche retour de
  // l'en-tête bloquée ; le retour Android, lui, fait sortir de la réorganisation)
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (useStore.getState().countersEditing) e.preventDefault();
    });
    return unsub;
  }, [navigation]);

  // 1.37 — Tap sur une notification de CETTE substance : flash du bloc « Sobre depuis » (même flash
  // que partout, dans la couleur de la substance), une fois l'app visible et la page arrivée.
  const [heroFlashTick, setHeroFlashTick] = useState(0);
  const heroFlashBg = useFlashBackground(heroFlashTick, substance?.color || '#FFFFFF',
    () => useStore.getState().traceNotif('animation lancée', `page ${substance?.name || ''}`));
  useEffect(() => {
    if (!notifFlash) return undefined;
    const trace = useStore.getState().traceNotif;
    trace('page substance : demande reçue', appStateInfo());
    let t = null; let flashed = false;
    const cancelWait = waitForAppReady(() => {
      // 500 ms : laisse l'animation d'arrivée de la page se terminer
      t = setTimeout(() => {
        flashed = true;
        trace('flash envoyé', 'compteur « Sobre depuis »');
        setHeroFlashTick(Date.now());
      }, 500);
    }, trace);
    return () => {
      if (!flashed && t == null) trace('annulé', 'page quittée avant le départ');
      cancelWait(); clearTimeout(t);
    };
  }, [notifFlash]); // eslint-disable-line

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
      if (!map[c.dayKey]) map[c.dayKey] = [substance.color];
    }
    return map;
  }, [consumptions, substance]);

  const consosForDay = useMemo(() => {
    if (!dayDetail || !consumptions) return [];
    return consumptions
      .filter((c) => c.dayKey === dayDetail.dayKey)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [dayDetail, consumptions]);

  if (!substance) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFound}>Substance introuvable</Text>
      </View>
    );
  }


  return (
    <View style={styles.container}>
      {/* 1.46 : même disposition que le global — onglets en haut, petit compteur dessous, puis l'onglet.
          Pendant la réorganisation des compteurs (onglet Stats), onglets et petit compteur assombris. */}
      <View style={[styles.tabs, countersEditing && styles.dimmed]} pointerEvents={countersEditing ? 'none' : 'auto'}>
        <Tab label="Calendrier" active={activeTab === 'calendar'} onPress={() => goTab('calendar')} />
        <Tab label="Recherche" active={activeTab === 'history'} onPress={() => goTab('history')} />
        <Tab label="Stats" active={activeTab === 'stats'} onPress={() => goTab('stats')} />
      </View>
      <TopCounter
        label="Sobre depuis"
        timestamp={lastTimestamp}
        color={substance.color}
        iconId={substance.icon}
        flashBg={heroFlashBg}
        dimmed={countersEditing}
        noBorder={activeTab === 'stats'}
      />

      {/* 1.48 : glisser à gauche / droite change d'onglet ; bloqué pendant la réorganisation des compteurs */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        scrollEnabled={!countersEditing}
        onPageSelected={(e) => {
          const t = TABS[e.nativeEvent.position];
          if (!t) return;
          setActiveTab(t);
          setVisited((v) => (v[t] ? v : { ...v, [t]: true }));
        }}
      >
        <View key="calendar" style={styles.page}>
          <ScrollableCalendar
            markersByDay={markersByDay}
            showSoberFill={true}
            showJumpButtons={true}
            substanceColor={substance.color}
            onDayPress={(dayKey, dayTimestamp) => setDayDetail({ dayKey, dayTimestamp })}
          />
        </View>
        <View key="history" style={styles.page}>
          {visited.history && (
            <HistoryList consumptions={consumptions} color={substance.color} onOpenDay={(c) => setDayDetail({ dayTimestamp: c.timestamp, dayKey: dayKeyOf(c.timestamp) })} />
          )}
        </View>
        <View key="stats" style={styles.page}>
          {visited.stats && (
            <StatsView
              mode="substance"
              consumptions={consumptions || []}
              color={substance.color}
              navigation={navigation}
              substanceId={substanceId}
            />
          )}
        </View>
      </PagerView>

      <NotifWizard
        visible={notifOpen}
        initialTarget={{ target: 'sub', key: substanceId }}
        onClose={() => setNotifOpen(false)}
      />

      {!countersEditing && <FAB color={substance.color} onPress={() => setLogOpen(true)} />}
      {countersEditing && <ReorgBar onDone={requestCountersExit} />}

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
        directEdit
        substance={substance}
        initial={editing}
        onSubmit={async (payload) => {
          if (editing) await updateConsumption(editing.id, substance.id, payload);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />

      <ConfirmModal
        visible={!!pendingDelete}
        title="Supprimer cette prise ?"
        message={pendingDelete ? `${substance.name} · ${formatTime(pendingDelete.timestamp)}\nLa prise sera supprimée définitivement.` : ''}
        cancelLabel="Annuler"
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
        onDeleteConsumption={(c) => deleteConsumption(c.id, substance.id)}
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

function HistoryList({ consumptions, color, onOpenDay }) {
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
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([k, items]) => ({
        dayTs: k,
        items: items.slice().sort((a, b) => a.timestamp - b.timestamp),
      }));
  }, [consumptions]);

  if (consumptions === null) return <View style={styles.listWrap} />;
  if (consumptions.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Aucune consommation enregistrée</Text>
        <Text style={styles.placeholderHint}>Ajout avec le bouton +</Text>
      </View>
    );
  }
  return (
    <FlatList keyboardShouldPersistTaps="handled"
      data={grouped}
      keyExtractor={(item) => String(item.dayTs)}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View>
          <Text style={styles.dayHeader}>{formatDateLong(item.dayTs)}</Text>
          {item.items.map((c) => (
            <ConsumptionRow key={c.id} consumption={c} color={color} onPress={() => onOpenDay(c)} />
          ))}
        </View>
      )}
    />
  );
}

// 1.44 : la ligne (ou son chevron) ouvre la carte du jour de cette prise
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
      <LiveCounter timestamp={consumption.timestamp} style={styles.consoTimeAgo} />
      <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
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
  pager: { flex: 1 },
  page: { flex: 1 },
  notFound: { color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.xl },
  // 1.42 : le dernier séparateur des compteurs (avec la pilule « + ») sert de bordure basse
  hero: {
    alignItems: 'center', paddingTop: theme.spacing.sm, paddingHorizontal: theme.spacing.lg,
  },
  // 1.43 : compteurs en réorganisation → le reste de la page est assombri et figé
  dimmed: { opacity: 0.25 },
  // 1.43 : logo 40 (avant 56), marges réduites → plus de place pour le calendrier
  heroIcon: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.xs + 2,
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
  tabs: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.lg, justifyContent: 'center' },
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
  consoTools: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginLeft: theme.spacing.sm },
  consoBullet: { width: 8, height: 8, borderRadius: 4 },
  consoMiddle: { flex: 1, gap: 2 },
  consoTime: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', fontVariant: ['tabular-nums'] },
  consoTimeAgo: { color: theme.colors.text, fontSize: theme.font.sizes.sm, fontWeight: '600', fontVariant: ['tabular-nums'], marginRight: theme.spacing.sm, textAlign: 'right' },
  consoDosage: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300' },
  consoNotes: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontWeight: '300', fontStyle: 'italic' },
  fab: {
    position: 'absolute', bottom: theme.spacing.lg, right: theme.spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
});
