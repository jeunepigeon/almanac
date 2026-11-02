import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable, Alert, Animated, AppState,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { getIconById } from '../icons';
import SubstanceIcon from '../components/SubstanceIcon';
import LiveCounter from '../components/LiveCounter';
import SubstanceFormModal from '../components/SubstanceFormModal';
import ActionSheet from '../components/ActionSheet';
import ConfirmModal from '../components/ConfirmModal';
import ReorderList, { WiggleContent } from '../components/ReorderList';
import ColorBannerAddModal from '../components/ColorBannerAddModal';
import haptics from '../utils/haptics';

const ROW_HEIGHT = 68; // doit matcher le style de SubstanceRow (padding + content)
const BANNER_HEIGHT = 102; // bandeau par couleur (≈ hauteur du bandeau « Sobre de tout »)
const SPACER_HEIGHT = 16;  // espace entre bandeaux et substances (pilule « + » posée sur le séparateur)
let lastHandledNotifTick = 0;
const FADE_MS = 450;     // fondu d'un bandeau supprimé
const COLLAPSE_MS = 260; // puis la place se referme en douceur (le séparateur glisse au lieu de sauter)
const PILL_HALF = 6;       // demi-hauteur de la pilule (1.25 : plus basse et plus longue)

// Flash d'un bandeau (tap sur une notification « Toutes » / catégorie).
// 1.29 : même technique que le flash des lignes de substance (qui fonctionne) : couleur de FOND
// du bandeau animée (pilote JS), au lieu d'un calque superposé animé en natif (jamais visible).
function hexToRgba(hex, a) {
  const h = (hex || '#FFFFFF').replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
function useFlashBg(tick, toColor, label) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tick) return;
    useStore.getState().traceNotif('animation lancée', label);
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.delay(250),
      Animated.timing(v, { toValue: 0, duration: 700, useNativeDriver: false }),
    ]).start();
  }, [tick]); // eslint-disable-line
  return v.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', toColor] });
}

// Bannière "Sobre de tout depuis". Clic → scroll vers la dernière substance consommée + flash.
function SobreBanner({ lastGlobalTimestamp, onPress, flashTick }) {
  const flashBg = useFlashBg(flashTick, 'rgba(255,255,255,0.28)', 'sobre de tout');
  return (
    <Pressable onPress={onPress} style={styles.bannerPress}>
      <Animated.View style={[styles.banner, { backgroundColor: flashBg }]}>
        <Text style={styles.bannerLabel}>SOBRE DE TOUT DEPUIS</Text>
        {lastGlobalTimestamp ? (
          <View style={styles.bannerCounterWrap}>
            <LiveCounter timestamp={lastGlobalTimestamp} style={styles.bannerCounter} />
          </View>
        ) : (
          <>
            <Text style={styles.bannerCounter}>—</Text>
            <Text style={styles.bannerEmptyHint}>renseignez votre première consommation</Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Bandeau « Sobre depuis » d'une couleur : libellé + compteur dans la couleur.
// En réorganisation : seuls libellé et compteur vibrent ; poubelle fixe à droite.
function ColorBanner({ color, lastTimestamp, inReorder, isWiggling, phase, onDelete, flashTick, fading }) {
  // Bandeau supprimé (catégorie dissoute ou poubelle) : fondu avant de disparaître
  const fade = useRef(new Animated.Value(1)).current;
  const flashBg = useFlashBg(flashTick, hexToRgba(color, 0.4), `bandeau ${color}`);
  useEffect(() => {
    if (fading) Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
    else fade.setValue(1);
  }, [fading, fade]);
  return (
    <Animated.View style={[styles.colorBanner, { opacity: fade, backgroundColor: flashBg }]} pointerEvents={fading ? 'none' : 'auto'}>
      <WiggleContent isWiggling={!!isWiggling} phase={phase || 0} style={styles.colorBannerContent}>
        <Text style={[styles.bannerLabel, { color }]}>SOBRE DEPUIS</Text>
        <View style={styles.bannerCounterWrap}>
          {lastTimestamp ? (
            <LiveCounter timestamp={lastTimestamp} style={[styles.bannerCounter, { color }]} />
          ) : (
            <Text style={[styles.bannerCounter, { color }]}>—</Text>
          )}
        </View>
      </WiggleContent>
      {inReorder && (
        <TouchableOpacity onPress={onDelete} style={styles.bannerTrash} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// Ligne de substance.
//  - Normal : icône · nom · compteur (plus de bouton ⋯ : place pour un long nom et du vide).
//  - Réorganisation : icône + nom vibrent ; crayon (menu renommer / couleur / icône) et poubelle fixes.
function SubstanceRow({
  substance, lastTimestamp, inReorder, isWiggling, phase, isFlashed, onEdit, onDelete,
}) {
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFlashed) {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 120, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 380, useNativeDriver: false }),
      ]).start();
    }
  }, [isFlashed, flashAnim]);

  const bgInterp = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', substance.color + '55'],
  });

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
  const updateSubstance = useStore((s) => s.updateSubstance);
  const deleteSubstance = useStore((s) => s.deleteSubstance);
  const restoreSubstance = useStore((s) => s.restoreSubstance);
  const reorderSubstances = useStore((s) => s.reorderSubstances);
  const colorBanners = useStore((s) => s.colorBanners);
  const addColorBanner = useStore((s) => s.addColorBanner);
  const removeColorBanner = useStore((s) => s.removeColorBanner);
  const reorderColorBanners = useStore((s) => s.reorderColorBanners);

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
    const stateInfo = () => {
      const st = useStore.getState();
      return `app ${AppState.currentState}${st.lockActive ? ' · verrouillée' : ''}${st.updateNoticeOpen ? ' · message MAJ ouvert' : ''}`;
    };
    if (notifFocus.tick === lastHandledNotifTick) { trace('page remontée', 'demande déjà traitée → pas de flash'); return; }
    lastHandledNotifTick = notifFocus.tick; // pas de re-flash si la page est remontée
    trace('page : demande reçue', `${stateInfo()} · montages ${useStore.getState().substancesPageMounts}`);
    setReorderMode(false);
    const id = notifFocus.kind === 'color' && useStore.getState().colorBanners.includes(notifFocus.color)
      ? `banner:${notifFocus.color}` : '__sobre';
    // On attend que l'app soit au premier plan. 1.28 : filet de sécurité de 1,5 s (l'état « active »
    // pouvait déjà être passé avant l'abonnement → plus jamais de flash).
    let t1 = null; let t2 = null; let tFallback = null; let sub = null; let started = false;
    let flashed = false;
    const go = (why = 'direct') => {
      if (started) return;
      started = true;
      trace(`départ (${why})`, stateInfo());
      sub?.remove(); sub = null;
      unsubStore?.(); unsubStore = null; // eslint-disable-line no-use-before-define
      clearTimeout(tFallback);
      t1 = setTimeout(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }), 300);
      t2 = setTimeout(() => {
        flashed = true;
        trace('flash envoyé', id === '__sobre' ? 'sobre de tout' : id.replace('banner:', 'bandeau '));
        setBannerFlash({ id, tick: Date.now() });
        useStore.getState().setLastBannerFlash?.({ id, at: Date.now() });
      }, 800);
    };
    // 1.33 : le flash attend aussi que l'écran de verrouillage et le message « mis à jour » soient
    // fermés (sinon il se jouait DESSOUS : app lancée par la notification + verrouillage = rien de visible)
    let unsubStore = null;
    const blocked = () => {
      const st = useStore.getState();
      return st.lockActive || st.updateNoticeOpen;
    };
    const tryGo = () => {
      if (started) return;
      if (AppState.currentState !== 'active' || blocked()) return;
      unsubStore?.(); unsubStore = null;
      go();
    };
    // Petit délai : au retour dans l'app, le verrouillage se déclare juste APRÈS le passage à « active »
    const pending = [];
    const later = () => { pending.push(setTimeout(tryGo, 150)); };
    unsubStore = useStore.subscribe(later);
    sub = AppState.addEventListener('change', (st) => { trace(`app → ${st}`); if (st === 'active') later(); });
    // Filet de sécurité : l'état « active » peut être passé avant l'abonnement (1.28)
    tFallback = setTimeout(() => { if (!blocked()) go('filet 1,5 s'); else trace('filet 1,5 s : bloqué', stateInfo()); }, 1500);
    later();
    return () => {
      if (!flashed) trace('annulé', started ? 'page démontée avant le flash' : 'page démontée avant le départ');
      clearTimeout(t1); clearTimeout(t2); clearTimeout(tFallback); pending.forEach(clearTimeout);
      sub?.remove(); unsubStore?.();
    };
  }, [notifFocus?.tick]); // eslint-disable-line
  const [flashedSubId, setFlashedSubId] = useState(null);

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
    const visible = colorBanners
      .filter((c) => byColor[c])
      .map((c) => ({ id: `banner:${c}`, color: c, lastTs: byColor[c].lastTs || null, lastSubId: byColor[c].lastSubId, names: byColor[c].names }));
    // Couleurs proposables : ≥ 2 substances, pas encore de bandeau (ordre de la palette)
    const addOptions = theme.substanceColors
      .filter((c) => byColor[c] && byColor[c].names.length >= 2 && !colorBanners.includes(c))
      .map((c) => ({ color: c, names: byColor[c].names }));
    return { visible, addOptions };
  }, [substances, lastTimestamps, colorBanners]);

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
    { id: '__sobre', static: true, kind: 'sobre' },
    ...displayedBanners.map((b) => ({ ...b, kind: 'banner', group: 'banners' })),
    { id: '__spacer', static: true, kind: 'spacer' },
    ...substances.map((sub) => ({ id: sub.id, kind: 'sub', group: 'subs', sub })),
  ], [displayedBanners, substances]);

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
    const listStart = (listTop || 0) + sobreH + displayedBanners.length * BANNER_HEIGHT + SPACER_HEIGHT;
    // Centre de la ligne au centre de la zone visible ;
    // trop bas → tout en bas, trop haut → tout en haut.
    const rowCenter = listStart + idx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const maxY = Math.max(0, contentH - viewportH);
    const y = Math.max(0, Math.min(maxY, rowCenter - viewportH / 2));
    const flash = () => {
      setFlashedSubId(targetSubId);
      setTimeout(() => setFlashedSubId(null), 520);
    };
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
    const curBanners = bannerInfo.visible.map((b) => b.color);
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
          />
        </View>
      );
    }
    if (item.kind === 'spacer') return <View />;
    if (item.kind === 'banner') {
      return (
        <ColorBanner
          color={item.color}
          lastTimestamp={item.lastTs}
          inReorder={inReorder}
          isWiggling={isWiggling}
          phase={phase}
          onDelete={() => setPendingBannerDelete(item.color)}
          flashTick={bannerFlash?.id === item.id ? bannerFlash.tick : 0}
          fading={!!item.fading}
        />
      );
    }
    return (
      <SubstanceRow
        substance={item.sub}
        lastTimestamp={lastTimestamps[item.id]}
        inReorder={inReorder}
        isWiggling={isWiggling}
        phase={phase}
        isFlashed={flashedSubId === item.id}
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
          <Text style={styles.emptyText}>Ajoute au moins 1 substance pour utiliser l'app</Text>
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
            if (item.kind === 'banner') handleBannerPress(item.lastSubId);
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
            ? `Une substance archivée "${pendingArchivedConflict.archivedSub.name}" existe déjà avec son historique. Veux-tu la restaurer ou créer une nouvelle substance vierge ?`
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

      <ConfirmModal
        visible={!!pendingBannerDelete}
        title="Supprimer ce bandeau ?"
        message={(
          <Text>
            {'Le bandeau '}
            <Text style={{ color: pendingBannerDelete || theme.colors.text, fontSize: 18 }}>●</Text>
            {' sera retiré. Les substances et leurs prises ne sont pas affectées.'}
          </Text>
        )}
        cancelLabel="Annuler"
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setPendingBannerDelete(null)}
        onConfirm={() => {
          if (pendingBannerDelete) { haptics.success(); removeColorBanner(pendingBannerDelete); }
          setPendingBannerDelete(null);
        }}
      />

      <ColorBannerAddModal
        visible={addBannerOpen}
        options={bannerInfo.addOptions}
        onPick={(color) => { addColorBanner(color); setAddBannerOpen(false); }}
        onClose={() => setAddBannerOpen(false)}
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
            ? `"${pendingDelete.name}" sera retirée de la liste. Une sauvegarde est créée automatiquement. Vous pourrez la restaurer ou la supprimer définitivement via Paramètres > Gestionnaire de sauvegardes.`
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
    justifyContent: 'center', padding: theme.spacing.xs,
  },
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
