import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable, Alert, Animated, AppState,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { useFlashBackground } from '../utils/flash';
import { waitForAppReady, appStateInfo } from '../utils/appReady';
import { getIconById } from '../icons';
import SubstanceIcon from '../components/SubstanceIcon';
import LiveCounter from '../components/LiveCounter';
import SubstanceFormModal from '../components/SubstanceFormModal';
import ActionSheet from '../components/ActionSheet';
import ConfirmModal from '../components/ConfirmModal';
import ReorderList, { WiggleContent } from '../components/ReorderList';
import ToggleListModal from '../components/ToggleListModal';
import NotifWizard from '../components/NotifWizard';
import SubstanceSelectModal from '../components/SubstanceSelectModal';
import DayDetailModal from '../components/DayDetailModal';
import SubstancePicker from '../components/SubstancePicker';
import LogConsumptionModal from '../components/LogConsumptionModal';
import CustomBannerNameModal from '../components/CustomBannerNameModal';
import {
  SobreBanner, CounterBanner, RecordBanner, Last24Banner, BANNER_HEIGHT, FADE_MS,
} from '../components/Banners';
import { toastNotifOn, ensureNotifPermission } from '../utils/notifications';
import haptics from '../utils/haptics';

const ROW_HEIGHT = 68; // doit matcher le style de SubstanceRow (padding + content)
const SPACER_HEIGHT = 16;  // espace entre bandeaux et substances (pilule « + » posée sur le séparateur)
let lastHandledNotifTick = 0;
const COLLAPSE_MS = 260; // puis la place se referme en douceur (le séparateur glisse au lieu de sauter)
const EMPTY_IDS = [];
const PILL_HALF = 6;       // demi-hauteur de la pilule (1.25 : plus basse et plus longue)

// Flash des bandeaux et des lignes : utils/flash.js (1.36 : identique partout, calendrier compris)
const traceAnim = (label) => () => useStore.getState().traceNotif('animation lancée', label);

// Ligne de substance.
//  - Normal : icône · nom · compteur (plus de bouton ⋯ : place pour un long nom et du vide).
//  - Réorganisation : icône + nom vibrent ; crayon (menu renommer / couleur / icône) et poubelle fixes.
function SubstanceRow({
  substance, lastTimestamp, inReorder, isWiggling, phase, flashTick, onEdit, onDelete,
}) {
  const bgInterp = useFlashBackground(flashTick, substance.color);

  return (
    <Animated.View style={[styles.row, { backgroundColor: bgInterp }]}>
      <WiggleContent isWiggling={!!isWiggling} phase={phase || 0} style={styles.rowWiggle}>
        <View style={[styles.iconWrap, { borderColor: substance.color }]}>
          <SubstanceIcon iconId={substance.icon} size={18} color={substance.color} />
        </View>
        <View style={styles.rowMiddle}>
          <Text style={styles.rowName} numberOfLines={1}>{substance.name}</Text>
        </View>
      </WiggleContent>
      {!inReorder && <LiveCounter timestamp={lastTimestamp} style={styles.rowCounter} numberOfLines={1} adjustsFontSizeToFit />}
      {inReorder && (
        <View style={styles.rowTools}>
          <TouchableOpacity onPress={onEdit} style={styles.menuBtn} hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={styles.menuBtn} hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

function FAB({ onPress }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name="add" size={28} color={theme.colors.background} />
    </TouchableOpacity>
  );
}

export default function SubstancesPage() {
  const navigation = useNavigation();
  const substances = useStore((s) => s.substances);
  const archivedSubstances = useStore((s) => s.archivedSubstances);
  const ready = useStore((s) => s.ready);
  const lastTimestamps = useStore((s) => s.lastTimestamps);

  const lastGlobalTimestamp = useMemo(() => {
    const vals = Object.values(lastTimestamps || {});
    if (vals.length === 0) return null;
    const max = Math.max(...vals);
    return max > 0 ? max : null;
  }, [lastTimestamps]);

  // ID de la substance avec le plus grand lastTimestamp (= dernière prise globale)
  const lastGlobalSubId = useMemo(() => {
    let best = null; let bestTs = 0;
    for (const [id, ts] of Object.entries(lastTimestamps || {})) {
      if (ts > bestTs) { bestTs = ts; best = id; }
    }
    return best;
  }, [lastTimestamps]);

  const createSubstance = useStore((s) => s.createSubstance);
  const createConsumptionStore = useStore((s) => s.createConsumption);
  const updateSubstance = useStore((s) => s.updateSubstance);
  const deleteSubstance = useStore((s) => s.deleteSubstance);
  const restoreSubstance = useStore((s) => s.restoreSubstance);
  const reorderSubstances = useStore((s) => s.reorderSubstances);
  const colorBanners = useStore((s) => s.colorBanners);
  const addColorBanner = useStore((s) => s.addColorBanner);
  const removeColorBanner = useStore((s) => s.removeColorBanner);
  const reorderColorBanners = useStore((s) => s.reorderColorBanners);
  const sobreBanner = useStore((s) => s.sobreBanner);
  const setSobreBanner = useStore((s) => s.setSobreBanner);
  const notifRules = useStore((s) => s.notifRules);
  const [bannerNotif, setBannerNotif] = useState(null); // { target: 'all' | 'color', key } — cloche d'un bandeau
  const notifCountOf = (target, key = null) => notifRules.filter((r) => r.target === target && (r.key || null) === key).length;
  // 1.43 — Message de retrait d'un bandeau, identique partout (poubelle et fenêtre « + ») :
  // « Le bandeau X [et ses notifications] sera désactivé. Réactivable depuis le + » ;
  // bandeau personnalisé : « … sera supprimé. Recréable depuis le + ». Nom entre guillemets
  // insécables (le « » » ne part plus seul à la ligne).
  const bannerRemoveMessage = (e) => {
    const isCustom = e.startsWith('custom:');
    const n = e === '__sobre' ? notifCountOf('all')
      : isCustom ? notifCountOf('custom', e.slice(7))
        : e === 'record' ? notifCountOf('record')
          : e.startsWith('#') ? notifCountOf('color', e) : 0;
    const q = (t) => `«\u00A0${t}\u00A0»`;
    const def = isCustom ? useStore.getState().customBanners.find((b) => b.id === e.slice(7)) : null;
    const name = e === '__sobre' ? q('Sobre de tout')
      : e === 'record' ? q('Plus longue sobriété de tout')
        : e === 'last24' ? q('Toutes prises · dernières 24 h')
          : isCustom ? q(`Sobre de ${def?.name || ''}`) : null;
    const verb = isCustom ? 'supprimé' : 'désactivé';
    return (
      <Text>
        {'Le bandeau '}
        {name || <Text style={{ color: e || theme.colors.text, fontSize: 18 }}>●</Text>}
        {n > 0 ? ` et ${n > 1 ? 'ses notifications' : 'sa notification'} seront ${verb}s.` : ` sera ${verb}.`}
        {isCustom ? ' Recréable depuis le ' : ' Réactivable depuis le '}
        <Text style={{ fontWeight: '900', color: theme.colors.text }}>+</Text>
        {'. Les substances et leurs prises ne sont pas affectées.'}
      </Text>
    );
  };

  // 1.41 — bandeaux personnalisés / record / 24 h
  const customBanners = useStore((s) => s.customBanners);
  const createCustomBanner = useStore((s) => s.createCustomBanner);
  const updateCustomBanner = useStore((s) => s.updateCustomBanner);
  const deleteCustomBanner = useStore((s) => s.deleteCustomBanner);
  // Création / modification d'un bandeau personnalisé : { step: 'subs' | 'name', id?, subIds, name }
  const [customFlow, setCustomFlow] = useState(null);
  const [customHint, setCustomHint] = useState(null);
  const [customActions, setCustomActions] = useState(null); // bandeau dont on ouvre le crayon
  // 1.42 — carte des dernières 24 h (+ modification / ajout de prise depuis la carte)
  const [last24Open, setLast24Open] = useState(false);
  const [last24Edit, setLast24Edit] = useState(null);   // { consumption, substance }
  const [last24Picker, setLast24Picker] = useState(false);
  const [last24Log, setLast24Log] = useState(null);     // substance choisie pour une nouvelle prise
  const allConsumptions = useStore((s) => s.allConsumptions);
  const last24List = useMemo(() => {
    if (!last24Open) return EMPTY_IDS;
    const from = Date.now() - 24 * 3600 * 1000;
    return allConsumptions.filter((c) => c.timestamp > from).sort((a, b) => a.timestamp - b.timestamp);
  }, [last24Open, allConsumptions]);
  const substancesById = useMemo(() => Object.fromEntries([...substances, ...archivedSubstances].map((x) => [x.id, x])), [substances, archivedSubstances]);
  const consumptionsBySubstance = useStore((s) => s.consumptionsBySubstance);
  const subStats = useMemo(() => {
    const out = {};
    for (const sub of substances) {
      const list = consumptionsBySubstance[sub.id] || [];
      out[sub.id] = { consCount: list.length, days: new Set(list.map((c) => c.dayKey)).size };
    }
    return out;
  }, [substances, consumptionsBySubstance]);
  // Cloche du record : marche / arrêt direct (une seule notification possible)
  const toggleRecordNotif = async () => {
    haptics.light();
    const rule = { target: 'record', key: null, palier: 'record' };
    if (notifCountOf('record') > 0) { useStore.getState().removeNotifRule(rule); return; }
    if (!(await ensureNotifPermission())) {
      Alert.alert('Notifications désactivées', "Les notifications d'Almanac sont désactivées dans les réglages du téléphone.");
      return;
    }
    useStore.getState().addNotifRule(rule);
    toastNotifOn('record battu');
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingArchivedConflict, setPendingArchivedConflict] = useState(null);
  const [actionSheetFor, setActionSheetFor] = useState(null);
  const [editMode, setEditMode] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Un seul mode réorganisation (bandeaux ET substances, chacun dans sa section), ouvert par appui long
  // 1.32 : dans le store (survit à un remontage de la page → on ne sort plus du mode tout seul)
  const reorderMode = useStore((s) => s.reorderMode);
  const setReorderMode = useStore((s) => s.setReorderMode);
  const bumpMounts = useStore((s) => s.bumpSubstancesPageMounts);
  // 1.33 : après une suppression / un changement de nom, couleur ou icône, on QUITTE la réorganisation
  // (on y était venu pour cette action). Passe par ReorderList : l'ordre déjà déplacé est enregistré.
  const [finishSignal, setFinishSignal] = useState(0);
  const endReorderAfterAction = () => {
    setFinishSignal((x) => x + 1);
    // Filet : si la liste a été recréée entre-temps et n'a pas reçu le signal, on ferme quand même
    setTimeout(() => { if (useStore.getState().reorderMode) useStore.getState().setReorderMode(false); }, 400);
  };
  useEffect(() => { bumpMounts(); }, []); // eslint-disable-line
  // Plus aucune substance (dernière supprimée) : la liste disparaît → on quitte le mode
  useEffect(() => { if (reorderMode && substances.length === 0) setReorderMode(false); }, [reorderMode, substances.length]); // eslint-disable-line
  const [pendingBannerDelete, setPendingBannerDelete] = useState(null); // couleur
  const [addBannerOpen, setAddBannerOpen] = useState(false);
  const [sobreH, setSobreH] = useState(110); // hauteur mesurée du bandeau « Sobre de tout »
  const [bannerFlash, setBannerFlash] = useState(null); // { id, tick } — flash d'un bandeau

  // Tap sur une notification « Toutes » / catégorie : liste en haut + flash du bandeau responsable
  // (blanc pour « Sobre de tout », couleur pour un bandeau de catégorie ; à défaut « Sobre de tout »)
  const notifFocus = useStore((s) => s.notifFocus);
  useEffect(() => {
    if (!notifFocus?.tick) return;
    const trace = useStore.getState().traceNotif;
    const stateInfo = appStateInfo;
    if (notifFocus.tick === lastHandledNotifTick) { trace('page remontée', 'demande déjà traitée → pas de flash'); return; }
    lastHandledNotifTick = notifFocus.tick; // pas de re-flash si la page est remontée
    trace('page : demande reçue', `${stateInfo()} · montages ${useStore.getState().substancesPageMounts}`);
    setReorderMode(false);
    // 1.41 : 'color' → couleur, 'custom' → custom:<id>, 'record' → record ; sinon « Sobre de tout »
    const entry = notifFocus.kind === 'color' ? notifFocus.color
      : notifFocus.kind === 'custom' ? `custom:${notifFocus.color}`
        : notifFocus.kind === 'record' ? 'record' : null;
    const id = entry && useStore.getState().colorBanners.includes(entry) ? `banner:${entry}` : '__sobre';
    // On attend que l'app soit au premier plan. 1.28 : filet de sécurité de 1,5 s (l'état « active »
    // pouvait déjà être passé avant l'abonnement → plus jamais de flash).
    let t1 = null; let t2 = null; let started = false; let flashed = false;
    // 1.37 : attente « app visible » partagée avec la page d'une substance (utils/appReady.js)
    const cancelWait = waitForAppReady(() => {
      started = true;
      t1 = setTimeout(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }), 300);
      t2 = setTimeout(() => {
        flashed = true;
        trace('flash envoyé', id === '__sobre' ? 'sobre de tout' : id.replace('banner:', 'bandeau '));
        setBannerFlash({ id, tick: Date.now() });
        useStore.getState().setLastBannerFlash?.({ id, at: Date.now() });
      }, 800);
    }, trace);
    return () => {
      if (!flashed) trace('annulé', started ? 'page démontée avant le flash' : 'page démontée avant le départ');
      cancelWait(); clearTimeout(t1); clearTimeout(t2);
    };
  }, [notifFocus?.tick]); // eslint-disable-line
  const [flashedSub, setFlashedSub] = useState(null); // { id, tick }

  // Verrouille le PagerView (swipe gauche/droite vers Global) tant qu'on est en mode réorg.
  const setPagerLocked = useStore((s) => s.setPagerLocked);
  useEffect(() => {
    setPagerLocked(!!reorderMode);
    return () => setPagerLocked(false);
  }, [reorderMode, setPagerLocked]);

  // --- Bandeaux par couleur ---
  // Un bandeau n'est affiché que si sa couleur a encore au moins 1 substance (sinon il reste
  // enregistré et réapparaît si une substance reprend cette couleur).
  const bannerInfo = useMemo(() => {
    const byColor = {};
    for (const sub of substances) {
      const b = byColor[sub.color] || (byColor[sub.color] = { names: [], lastTs: 0, lastSubId: null });
      b.names.push(sub.name);
      const ts = (lastTimestamps || {})[sub.id] || 0;
      if (ts > b.lastTs) { b.lastTs = ts; b.lastSubId = sub.id; }
    }
    // 1.41 : une entrée de la liste = couleur (#…), custom:<id>, 'record' ou 'last24'
    const visible = [];
    for (const entry of colorBanners) {
      if (entry.startsWith('#')) {
        if (!byColor[entry]) continue;
        visible.push({ id: `banner:${entry}`, entry, type: 'color', color: entry, lastTs: byColor[entry].lastTs || null, lastSubId: byColor[entry].lastSubId, names: byColor[entry].names });
      } else if (entry.startsWith('custom:')) {
        const def = customBanners.find((b) => b.id === entry.slice(7));
        if (!def) continue;
        let lastTs = 0; let lastSubId = null;
        for (const sid of def.subIds) {
          const ts = (lastTimestamps || {})[sid] || 0;
          if (ts > lastTs) { lastTs = ts; lastSubId = sid; }
        }
        visible.push({ id: `banner:${entry}`, entry, type: 'custom', def, color: theme.colors.text, lastTs: lastTs || null, lastSubId });
      } else if (entry === 'record' || entry === 'last24') {
        visible.push({ id: `banner:${entry}`, entry, type: entry, color: theme.colors.text, lastSubId: lastGlobalSubId });
      }
    }
    // Catégories possibles (≥ 2 substances), actives d'abord dans leur ordre, puis la palette
    const colorEntries = colorBanners.filter((c) => c.startsWith('#'));
    const order = [...colorEntries, ...theme.substanceColors.filter((c) => !colorEntries.includes(c))];
    const categories = order
      .filter((c) => byColor[c] && byColor[c].names.length >= 2)
      .map((c) => ({ color: c, names: byColor[c].names, active: colorBanners.includes(c) }));
    return { visible, categories };
  }, [substances, lastTimestamps, colorBanners, customBanners, lastGlobalSubId]);

  // Bandeaux qui viennent de disparaître : gardés FADE_MS en fondu à leur place (pas de
  // disparition sèche qui ressemblerait à un bug), puis retirés.
  const prevBannersRef = useRef([]);
  const ghostsRef = useRef({}); // id → { item, index, until }
  const [ghostTick, setGhostTick] = useState(0);
  const displayedBanners = useMemo(() => {
    const now = Date.now();
    const cur = bannerInfo.visible;
    const curIds = new Set(cur.map((b) => b.id));
    prevBannersRef.current.forEach((b, i) => {
      if (!curIds.has(b.id) && !b.fading && !ghostsRef.current[b.id]) {
        // Hauteur animée : reste pleine pendant le fondu, puis se referme
        const collapse = new Animated.Value(BANNER_HEIGHT);
        Animated.sequence([
          Animated.delay(FADE_MS),
          Animated.timing(collapse, { toValue: 0, duration: COLLAPSE_MS, useNativeDriver: false }),
        ]).start();
        ghostsRef.current[b.id] = { item: { ...b, fading: true, collapse }, index: i, until: now + FADE_MS + COLLAPSE_MS };
      }
    });
    for (const id of Object.keys(ghostsRef.current)) {
      if (curIds.has(id) || ghostsRef.current[id].until <= now) delete ghostsRef.current[id];
    }
    const out = [...cur];
    Object.values(ghostsRef.current).sort((a, b) => a.index - b.index)
      .forEach((g) => out.splice(Math.min(g.index, out.length), 0, g.item));
    prevBannersRef.current = out;
    return out;
  }, [bannerInfo, ghostTick]);
  useEffect(() => {
    if (!displayedBanners.some((b) => b.fading)) return;
    const t = setTimeout(() => setGhostTick((x) => x + 1), FADE_MS + COLLAPSE_MS + 30);
    return () => clearTimeout(t);
  }, [displayedBanners]);

  // Liste unique : « Sobre de tout » (fixe) · bandeaux (groupe) · espace (fixe) · substances (groupe)
  // La pilule « + » est dessinée par-dessus la liste (renderOverlay) : jamais cachée par un bandeau saisi.
  const listData = useMemo(() => [
    ...(sobreBanner ? [{ id: '__sobre', static: true, kind: 'sobre' }] : []),
    ...displayedBanners.map((b) => ({ ...b, kind: 'banner', group: 'banners' })),
    { id: '__spacer', static: true, kind: 'spacer' },
    ...substances.map((sub) => ({ id: sub.id, kind: 'sub', group: 'subs', sub })),
  ], [displayedBanners, substances, sobreBanner]);

  const getItemHeight = (item) => (
    item.kind === 'sobre' ? sobreH
      : item.kind === 'banner' ? BANNER_HEIGHT
        : item.kind === 'spacer' ? SPACER_HEIGHT
          : ROW_HEIGHT
  );

  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const pendingBannerFlashRef = useRef(null); // flash à déclencher dès l'arrêt du scroll
  const bannerScrollTimerRef = useRef(null);
  const bannerFallbackRef = useRef(null);

  const firePendingBannerFlash = () => {
    if (bannerScrollTimerRef.current) { clearTimeout(bannerScrollTimerRef.current); bannerScrollTimerRef.current = null; }
    if (bannerFallbackRef.current) { clearTimeout(bannerFallbackRef.current); bannerFallbackRef.current = null; }
    const f = pendingBannerFlashRef.current;
    pendingBannerFlashRef.current = null;
    if (f) f();
  };

  // Mesures de la liste (zone visible, contenu, position des lignes) fournies par ReorderList
  const metricsRef = useRef({ viewportH: 0, contentH: 0, listTop: 0 });

  // Tap sur un bandeau : défile pour centrer la substance visée, puis flash à l'arrêt du défilement
  const handleBannerPress = (targetSubId = lastGlobalSubId) => {
    if (!targetSubId || reorderMode) return;
    haptics.medium();
    const idx = substances.findIndex((s) => s.id === targetSubId);
    if (idx < 0) return;
    const { viewportH, contentH, listTop } = metricsRef.current;
    // Haut des substances = Sobre de tout + bandeaux + espace
    const listStart = (listTop || 0) + (sobreBanner ? sobreH : 0) + displayedBanners.length * BANNER_HEIGHT + SPACER_HEIGHT;
    // Centre de la ligne au centre de la zone visible ;
    // trop bas → tout en bas, trop haut → tout en haut.
    const rowCenter = listStart + idx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const maxY = Math.max(0, contentH - viewportH);
    const y = Math.max(0, Math.min(maxY, rowCenter - viewportH / 2));
    const flash = () => setFlashedSub({ id: targetSubId, tick: Date.now() });
    if (Math.abs(scrollYRef.current - y) <= 2) { flash(); return; }
    pendingBannerFlashRef.current = flash;
    scrollRef.current?.scrollTo?.({ y, animated: true });
    bannerFallbackRef.current = setTimeout(firePendingBannerFlash, 700);
  };

  // Chaque event de scroll repousse le flash de 60ms : il part dès que le scroll s'arrête.
  const handleScroll = (y) => {
    scrollYRef.current = y;
    if (!pendingBannerFlashRef.current) return;
    if (bannerScrollTimerRef.current) clearTimeout(bannerScrollTimerRef.current);
    bannerScrollTimerRef.current = setTimeout(firePendingBannerFlash, 60);
  };
  const handleScrollEnd = () => {
    if (pendingBannerFlashRef.current) firePendingBannerFlash();
  };

  if (!ready) return <View style={styles.container} />;

  const handleCreateSubmit = async ({ name, color, icon }) => {
    const archivedMatch = archivedSubstances.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
    if (archivedMatch) {
      setCreateOpen(false);
      setPendingArchivedConflict({ archivedSub: archivedMatch, attempted: { name, color, icon } });
      return;
    }
    try {
      await createSubstance({ name, color, icon });
      setCreateOpen(false);
    } catch (e) {
      Alert.alert('Nom déjà utilisé', e.message || 'Une substance avec ce nom existe déjà.');
    }
  };

  const handleEditSubmit = async (payload) => {
    if (!editMode) return;
    try {
      await updateSubstance(editMode.sub.id, payload);
      setEditMode(null);
      endReorderAfterAction();
    } catch (e) {
      Alert.alert('Nom déjà utilisé', e.message || 'Une substance avec ce nom existe déjà.');
    }
  };

  const handleArchivedConflictRestore = async () => {
    await restoreSubstance(pendingArchivedConflict.archivedSub.id);
    setPendingArchivedConflict(null);
  };

  const handleArchivedConflictNew = async () => {
    const { attempted } = pendingArchivedConflict;
    try {
      await createSubstance({
        name: `${attempted.name} (nouveau)`,
        color: attempted.color, icon: attempted.icon,
      });
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
    setPendingArchivedConflict(null);
  };

  // Menu d'une substance (crayon, en mode réorganisation uniquement) : renommer / couleur / icône.
  // Réorganiser et Supprimer passent par l'appui long (mode réorganisation + poubelle).
  const openActions = (sub) => setActionSheetFor(sub);

  const actionItems = (sub) => [
    { id: 'rename', label: 'Renommer', icon: 'pencil-outline', onPress: () => setEditMode({ sub, mode: 'rename' }) },
    { id: 'color', label: 'Changer la couleur', icon: 'palette-outline', onPress: () => setEditMode({ sub, mode: 'color' }) },
    { id: 'icon', label: "Changer l'icône", icon: 'shape-outline', onPress: () => setEditMode({ sub, mode: 'icon' }) },
  ];

  // « Terminé » : enregistre l'ordre de chaque section séparément (seulement si elle a changé)
  const handleReorder = (newIds) => {
    const kept = new Set(useStore.getState().colorBanners);
    const newBanners = newIds.filter((id) => id.startsWith('banner:')).map((id) => id.slice(7)).filter((c) => kept.has(c));
    const newSubs = newIds.filter((id) => !id.startsWith('banner:') && !id.startsWith('__'));
    const curBanners = bannerInfo.visible.map((b) => b.entry);
    const curSubs = substances.map((x) => x.id);
    if (newBanners.join('|') !== curBanners.join('|')) reorderColorBanners(newBanners);
    if (newSubs.join('|') !== curSubs.join('|')) reorderSubstances(newSubs);
  };

  const renderItem = ({ item, inReorder, isWiggling, phase }) => {
    if (item.kind === 'sobre') {
      return (
        <View onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && Math.abs(h - sobreH) > 1) setSobreH(h);
        }}>
          <SobreBanner
            lastGlobalTimestamp={lastGlobalTimestamp}
            onPress={() => handleBannerPress(lastGlobalSubId)}
            flashTick={bannerFlash?.id === '__sobre' ? bannerFlash.tick : 0}
            inReorder={inReorder}
            onLongPress={() => setReorderMode(true)}
            onDelete={() => setPendingBannerDelete('__sobre')}
            hasNotif={notifCountOf('all') > 0}
            onBell={() => { haptics.light(); setBannerNotif({ target: 'all', key: null }); }}
          />
        </View>
      );
    }
    if (item.kind === 'spacer') return <View />;
    if (item.kind === 'banner') {
      const frame = {
        inReorder, isWiggling, phase,
        fading: !!item.fading,
        flashTick: bannerFlash?.id === item.id ? bannerFlash.tick : 0,
        onDelete: () => setPendingBannerDelete(item.entry),
      };
      if (item.type === 'color') {
        return (
          <CounterBanner
            {...frame}
            label="SOBRE DEPUIS"
            color={item.color}
            lastTimestamp={item.lastTs}
            bell={{ color: item.color, active: notifCountOf('color', item.color) > 0, onPress: () => { haptics.light(); setBannerNotif({ target: 'color', key: item.color }); } }}
          />
        );
      }
      if (item.type === 'custom') {
        return (
          <CounterBanner
            {...frame}
            label={`SOBRE DE ${item.def.name.toUpperCase()} DEPUIS`}
            color={theme.colors.text}
            labelColor={theme.colors.textMuted}
            lastTimestamp={item.lastTs}
            onEdit={() => setCustomActions(item.def)}
            bell={{ color: theme.colors.textMuted, active: notifCountOf('custom', item.def.id) > 0, onPress: () => { haptics.light(); setBannerNotif({ target: 'custom', key: item.def.id }); } }}
          />
        );
      }
      if (item.type === 'record') {
        return (
          <RecordBanner
            {...frame}
            bell={{ color: theme.colors.textMuted, active: notifCountOf('record') > 0, onPress: toggleRecordNotif }}
          />
        );
      }
      return <Last24Banner {...frame} />;
    }
    return (
      <SubstanceRow
        substance={item.sub}
        lastTimestamp={lastTimestamps[item.id]}
        inReorder={inReorder}
        isWiggling={isWiggling}
        phase={phase}
        flashTick={flashedSub?.id === item.id ? flashedSub.tick : 0}
        onEdit={() => openActions(item.sub)}
        onDelete={() => setPendingDelete(item.sub)}
      />
    );
  };


  // Pilule « + » posée sur le séparateur au-dessus de l'espace bandeaux / substances.
  // Dessinée par-dessus la liste ET la copie saisie : un bandeau déplacé ne la cache plus.
  const renderOverlay = ({ items, tops }) => {
    const idx = items.findIndex((it) => it.kind === 'spacer');
    if (idx < 0) return null;
    return (
      <View pointerEvents="box-none" style={[styles.pillOverlay, { top: tops[idx] - PILL_HALF }]}>
        <TouchableOpacity
          style={styles.pill}
          onPress={() => { haptics.light(); setAddBannerOpen(true); }}
          hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
          activeOpacity={0.6}
        >
          <MaterialCommunityIcons name="plus" size={10} color={theme.colors.background} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {substances.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Au moins 1 substance est nécessaire pour utiliser l'app</Text>
        </View>
      ) : (
        <ReorderList
          data={listData}
          getItemHeight={getItemHeight}
          active={reorderMode}
          onItemLongPress={() => setReorderMode(true)}
          onDeactivate={() => setReorderMode(false)}
          finishSignal={finishSignal}
          onReorder={handleReorder}
          onItemTap={(item) => {
            // 1.42 : « Toutes prises · dernières 24 h » → carte des 24 h (comme un jour du calendrier)
            if (item.kind === 'banner' && item.type === 'last24') { haptics.light(); setLast24Open(true); }
            else if (item.kind === 'banner') handleBannerPress(item.lastSubId);
            else if (item.kind === 'sub') navigation.navigate('Substance', { substanceId: item.id });
          }}
          onScrollY={handleScroll}
          onScrollEnd={handleScrollEnd}
          onMetrics={(m) => { metricsRef.current = m; }}
          scrollRef={scrollRef}
          renderItem={renderItem}
          renderOverlay={renderOverlay}
        />
      )}

      {!reorderMode && <FAB onPress={() => setCreateOpen(true)} />}

      <SubstanceFormModal
        visible={createOpen} mode="create"
        onSubmit={handleCreateSubmit}
        onClose={() => setCreateOpen(false)}
      />

      <ConfirmModal
        visible={!!pendingArchivedConflict}
        title="Une sauvegarde existe"
        message={
          pendingArchivedConflict
            ? `Une substance archivée "${pendingArchivedConflict.archivedSub.name}" existe déjà avec son historique. La restaurer, ou créer une nouvelle substance vierge ?`
            : ''
        }
        cancelLabel="Annuler"
        onCancel={() => setPendingArchivedConflict(null)}
        extraActions={[
          { label: 'Restaurer la sauvegarde', hint: "L'historique précédent revient", onPress: handleArchivedConflictRestore },
          { label: 'Créer une nouvelle', hint: 'Repart de zéro, suffixée "(nouveau)"', onPress: handleArchivedConflictNew },
        ]}
      />

      <ActionSheet
        visible={!!actionSheetFor}
        title={actionSheetFor?.name}
        items={actionSheetFor ? actionItems(actionSheetFor) : []}
        onClose={() => setActionSheetFor(null)}
      />

      {/* Poubelle d'un bandeau. 1.41 : « désactivés » ; bandeau personnalisé = suppression définitive */}
      <ConfirmModal
        visible={!!pendingBannerDelete}
        title={pendingBannerDelete?.startsWith?.('custom:') ? 'Supprimer ce bandeau ?' : 'Désactiver ce bandeau ?'}
        message={bannerRemoveMessage(pendingBannerDelete || '')}
        cancelLabel="Annuler"
        confirmLabel={pendingBannerDelete?.startsWith?.('custom:') ? 'Supprimer' : 'Désactiver'}
        destructive
        onCancel={() => setPendingBannerDelete(null)}
        onConfirm={() => {
          const e = pendingBannerDelete;
          haptics.success();
          if (e === '__sobre') setSobreBanner(false);
          else if (e?.startsWith('custom:')) deleteCustomBanner(e.slice(7));
          else if (e) removeColorBanner(e);
          setPendingBannerDelete(null);
        }}
      />

      {/* « + » = bandeaux à cocher / décocher. 1.41 : + record, 24 h, et création d'un bandeau personnalisé */}
      <ToggleListModal
        visible={addBannerOpen}
        title="Bandeaux"
        options={[
          {
            id: '__sobre', color: theme.colors.text, label: 'Sobre de tout', checked: sobreBanner,
            removeConfirm: notifCountOf('all') > 0 ? bannerRemoveMessage('__sobre') : null,
          },
          {
            id: 'record', color: theme.colors.text, label: 'Plus longue sobriété de tout', checked: colorBanners.includes('record'),
            removeConfirm: notifCountOf('record') > 0 ? bannerRemoveMessage('record') : null,
          },
          { id: 'last24', color: theme.colors.text, label: 'Toutes prises · dernières 24 h', checked: colorBanners.includes('last24') },
          ...bannerInfo.categories.map((c) => ({
            id: c.color,
            color: c.color,
            checked: c.active,
            removeConfirm: c.active && notifCountOf('color', c.color) > 0 ? bannerRemoveMessage(c.color) : null,
            label: (
              <Text style={[styles.catNames, { color: c.active ? c.color : theme.colors.textMuted }]} numberOfLines={2}>
                {/* Séparateur collé au nom SUIVANT (espace insécable) : une ligne commence par « • » */}
                {c.names.map((n, i) => (
                  <Text key={`${n}-${i}`}>
                    {i > 0 ? ' ' : ''}
                    {i > 0 && <Text style={styles.catSep}>{'•\u00A0'}</Text>}
                    {n}
                  </Text>
                ))}
              </Text>
            ),
          })),
        ]}
        actions={[{
          id: 'custom', label: 'Bandeau personnalisé', icon: 'plus',
          onPress: () => {
            setAddBannerOpen(false);
            setCustomHint(null);
            setTimeout(() => setCustomFlow({ step: 'subs', subIds: [], name: '' }), 250);
          },
        }]}
        footer={bannerInfo.categories.length === 0 ? 'Les catégories apparaissent quand 2 substances partagent une couleur.' : null}
        onToggle={(id, on) => {
          if (id === '__sobre') setSobreBanner(on);
          else if (on) addColorBanner(id);
          else removeColorBanner(id);
        }}
        onClose={() => setAddBannerOpen(false)}
      />

      {/* 1.42 — Carte des dernières 24 h glissantes */}
      <DayDetailModal
        visible={last24Open}
        title="Dernières 24 h"
        consumptions={last24List}
        substancesById={substancesById}
        onTapConsumption={(c) => {
          const sub = substancesById[c.substanceId];
          if (sub) setLast24Edit({ consumption: c, substance: sub });
        }}
        onDeleteConsumption={(c) => useStore.getState().deleteConsumption(c.id, c.substanceId)}
        onAddPress={() => { setLast24Open(false); setTimeout(() => setLast24Picker(true), 150); }}
        onClose={() => setLast24Open(false)}
      />
      <LogConsumptionModal
        visible={!!last24Edit}
        mode="edit"
        directEdit
        substance={last24Edit?.substance}
        initial={last24Edit?.consumption}
        onSubmit={async (payload) => {
          if (last24Edit) await useStore.getState().updateConsumption(last24Edit.consumption.id, last24Edit.consumption.substanceId, payload);
          setLast24Edit(null);
        }}
        onDelete={async () => {
          if (last24Edit) await useStore.getState().deleteConsumption(last24Edit.consumption.id, last24Edit.consumption.substanceId);
          setLast24Edit(null);
        }}
        onClose={() => setLast24Edit(null)}
      />
      <SubstancePicker
        visible={last24Picker}
        substances={substances}
        onPick={(sub) => { setLast24Picker(false); setTimeout(() => setLast24Log(sub), 120); }}
        onClose={() => setLast24Picker(false)}
      />
      {/* Nouvelle prise : préremplie à maintenant, modifiable comme partout */}
      <LogConsumptionModal
        visible={!!last24Log}
        mode="create"
        substance={last24Log}
        onSubmit={async (payload) => {
          if (last24Log) await createConsumptionStore({ substanceId: last24Log.id, ...payload });
          setLast24Log(null);
        }}
        onClose={() => setLast24Log(null)}
      />

      {/* 1.41 — Bandeau personnalisé : 1) substances (au moins 2)  2) nom (« Sobre de … depuis ») */}
      <SubstanceSelectModal
        visible={customFlow?.step === 'subs'}
        title="Bandeau personnalisé"
        intro="Substances du bandeau (au moins 2)."
        hint={customHint}
        substances={substances}
        minSelected={2}
        statsById={subStats}
        initialSelectedIds={customFlow?.step === 'subs' ? customFlow.subIds : EMPTY_IDS}
        confirmLabel={customFlow?.id ? 'Enregistrer' : 'Suivant'}
        onCancel={() => setCustomFlow(null)}
        onConfirm={(ids) => {
          if (ids.length < 2) { setCustomHint('Au moins 2 substances nécessaires.'); return; }
          setCustomHint(null);
          if (customFlow?.id) { // modification des substances d'un bandeau existant
            updateCustomBanner(customFlow.id, { subIds: ids });
            setCustomFlow(null);
            endReorderAfterAction();
            return;
          }
          const next = { ...customFlow, subIds: ids };
          setCustomFlow(null);
          setTimeout(() => setCustomFlow({ ...next, step: 'name' }), 250);
        }}
      />
      <CustomBannerNameModal
        visible={customFlow?.step === 'name'}
        initialName={customFlow?.name || ''}
        confirmLabel={customFlow?.id ? 'Enregistrer' : 'Créer'}
        onCancel={() => setCustomFlow(null)}
        onConfirm={(name) => {
          if (customFlow?.id) { updateCustomBanner(customFlow.id, { name }); endReorderAfterAction(); }
          else createCustomBanner(name, customFlow.subIds);
          setCustomFlow(null);
        }}
      />
      {/* Crayon d'un bandeau personnalisé (réorganisation) : nom ou substances incluses */}
      <ActionSheet
        visible={!!customActions}
        title={customActions ? `Sobre de ${customActions.name}` : ''}
        items={customActions ? [
          { id: 'rename', label: 'Renommer', icon: 'pencil-outline', onPress: () => setCustomFlow({ step: 'name', id: customActions.id, name: customActions.name, subIds: customActions.subIds }) },
          { id: 'subs', label: 'Substances incluses', icon: 'format-list-checks', onPress: () => { setCustomHint(null); setCustomFlow({ step: 'subs', id: customActions.id, name: customActions.name, subIds: customActions.subIds }); } },
        ] : []}
        onClose={() => setCustomActions(null)}
      />

      {/* 1.40 : cloche d'un bandeau → ses notifications de paliers */}
      <NotifWizard
        visible={!!bannerNotif}
        initialTarget={bannerNotif}
        onClose={() => setBannerNotif(null)}
      />

      <SubstanceFormModal
        visible={!!editMode}
        mode={editMode?.mode || 'rename'}
        initial={editMode?.sub}
        onSubmit={handleEditSubmit}
        onClose={() => setEditMode(null)}
      />

      <ConfirmModal
        visible={!!pendingDelete}
        title="Supprimer cette substance"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" sera retirée de la liste. Une sauvegarde est créée automatiquement, restaurable ou supprimable définitivement depuis Paramètres > Gestionnaire de sauvegardes.`
            : ''
        }
        cancelLabel="Annuler"
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await deleteSubstance(pendingDelete.id);
          setPendingDelete(null);
          endReorderAfterAction();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.lg },
  emptyText: { color: theme.colors.textFaint, fontSize: theme.font.sizes.md, fontWeight: '300', textAlign: 'center', letterSpacing: 0.5 },

  bannerPress: {},
  banner: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  // Bandeau couleur : contenu (séparateur porté par le conteneur, comme les lignes de substances)
  colorBanner: {
    height: BANNER_HEIGHT - StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  // Pilule « + » (overlay au-dessus de la liste)
  pillOverlay: { position: 'absolute', left: 0, right: 0, height: PILL_HALF * 2, alignItems: 'center' },
  pill: {
    height: PILL_HALF * 2, width: 32, borderRadius: PILL_HALF,
    backgroundColor: theme.colors.text,
    alignItems: 'center', justifyContent: 'center',
  },
  colorBannerContent: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  rowWiggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTools: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  bannerTrash: {
    position: 'absolute', right: theme.spacing.lg, top: 0, bottom: 0,
    justifyContent: 'center', padding: theme.spacing.xs, zIndex: 2,
  },
  // 1.40 : cloche à gauche, en miroir de la poubelle
  bannerBell: {
    position: 'absolute', left: theme.spacing.lg, top: 0, bottom: 0,
    justifyContent: 'center', padding: theme.spacing.xs, zIndex: 2,
  },
  catNames: { fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.3 },
  catSep: { fontWeight: '900', fontSize: theme.font.sizes.lg },
  bannerLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  bannerCounterWrap: {
    minHeight: 36, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: theme.spacing.md, width: '100%',
  },
  bannerCounter: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.xl,
    fontWeight: '300',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  bannerEmptyHint: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    letterSpacing: 0.5,
    fontStyle: 'italic',
    marginTop: theme.spacing.xs,
  },

  // 1.27 : marges réduites pour laisser ~20 caractères au nom (limite de saisie : 20)
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md,
    // Séparateur : porté par le conteneur de ligne dans ReorderList (ne vibre pas)
    gap: 12,
    height: ROW_HEIGHT - StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  rowMiddle: { flex: 1, justifyContent: 'center' },
  rowName: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.5 },
  // Colonne fixe, texte centré (1.24) : les compteurs s'alignent sur un même axe central
  rowCounter: {
    width: 142, // « 29 jours 23 heures » tient en taille normale ; au-delà d'un an, réduit automatiquement
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300',
    fontVariant: ['tabular-nums'], letterSpacing: 0.5, textAlign: 'center',
  },
  menuBtn: { padding: theme.spacing.xs },

  fab: {
    position: 'absolute', bottom: theme.spacing.lg, right: theme.spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: theme.colors.text, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
});
