import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable, Alert, Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
const PILL_HALF = 7;       // demi-hauteur de la pilule (1.25 : plus basse et plus longue)

// Flash d'un bandeau (tap sur une notification « Toutes » / catégorie) — animation native
function BannerFlash({ tick, color, max = 0.3 }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tick) return;
    op.setValue(0);
    Animated.sequence([
      Animated.timing(op, { toValue: max, duration: 150, useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 650, useNativeDriver: true }),
    ]).start();
  }, [tick]); // eslint-disable-line
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: op }]} />;
}

// Bannière "Sobre de tout depuis". Clic → scroll vers la dernière substance consommée + flash.
function SobreBanner({ lastGlobalTimestamp, onPress, flashTick }) {
  return (
    <Pressable onPress={onPress} style={styles.bannerPress}>
      <View style={styles.banner}>
        <BannerFlash tick={flashTick} color="#FFFFFF" max={0.22} />
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
      </View>
    </Pressable>
  );
}

// Bandeau « Sobre depuis » d'une couleur : libellé + compteur dans la couleur.
// En réorganisation : seuls libellé et compteur vibrent ; poubelle fixe à droite.
function ColorBanner({ color, lastTimestamp, inReorder, isWiggling, phase, onDelete, flashTick }) {
  return (
    <View style={styles.colorBanner}>
      <BannerFlash tick={flashTick} color={color} max={0.3} />
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
    </View>
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
  const [reorderMode, setReorderMode] = useState(false);
  const [pendingBannerDelete, setPendingBannerDelete] = useState(null); // couleur
  const [addBannerOpen, setAddBannerOpen] = useState(false);
  const [sobreH, setSobreH] = useState(110); // hauteur mesurée du bandeau « Sobre de tout »
  const [bannerFlash, setBannerFlash] = useState(null); // { id, tick } — flash d'un bandeau

  // Tap sur une notification « Toutes » / catégorie : liste en haut + flash du bandeau responsable
  // (blanc pour « Sobre de tout », couleur pour un bandeau de catégorie ; à défaut « Sobre de tout »)
  const notifFocus = useStore((s) => s.notifFocus);
  useEffect(() => {
    if (!notifFocus?.tick || notifFocus.tick === lastHandledNotifTick) return;
    lastHandledNotifTick = notifFocus.tick; // pas de re-flash si la page est remontée
    setReorderMode(false);
    const id = notifFocus.kind === 'color' && useStore.getState().colorBanners.includes(notifFocus.color)
      ? `banner:${notifFocus.color}` : '__sobre';
    const t1 = setTimeout(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }), 250);
    const t2 = setTimeout(() => setBannerFlash({ id, tick: Date.now() }), 650);
    return () => { clearTimeout(t1); clearTimeout(t2); };
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

  // Liste unique : « Sobre de tout » (fixe) · bandeaux (groupe) · espace + pilule (fixe) · substances (groupe)
  const listData = useMemo(() => [
    { id: '__sobre', static: true, kind: 'sobre' },
    ...bannerInfo.visible.map((b) => ({ ...b, kind: 'banner', group: 'banners' })),
    { id: '__spacer', static: true, kind: 'spacer', containerStyle: { marginTop: -PILL_HALF, height: PILL_HALF + SPACER_HEIGHT } },
    ...substances.map((sub) => ({ id: sub.id, kind: 'sub', group: 'subs', sub })),
  ], [bannerInfo, substances]);

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
    const listStart = (listTop || 0) + sobreH + bannerInfo.visible.length * BANNER_HEIGHT + SPACER_HEIGHT;
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
    const newBanners = newIds.filter((id) => id.startsWith('banner:')).map((id) => id.slice(7));
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
    if (item.kind === 'spacer') {
      // Remonte de PILL_HALF sur le séparateur : pilule centrée dessus et entièrement touchable
      return (
        <View pointerEvents="box-none" style={styles.pillSpacer}>
          {(
            // Visible et active aussi en réorganisation (on y reste après l'ajout / l'annulation)
            <TouchableOpacity
              style={styles.pill}
              onPress={() => { haptics.light(); setAddBannerOpen(true); }}
              hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
              activeOpacity={0.6}
            >
              <MaterialCommunityIcons name="plus" size={11} color={theme.colors.background} />
            </TouchableOpacity>
          )}
        </View>
      );
    }
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
  // Conteneur (marge négative PILL_HALF) fourni par ReorderList via containerStyle ; pilule en haut
  pillSpacer: { flex: 1, alignItems: 'center' },
  pill: {
    height: PILL_HALF * 2, width: 40, borderRadius: PILL_HALF,
    backgroundColor: theme.colors.text,
    alignItems: 'center', justifyContent: 'center',
  },
  colorBannerContent: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  rowWiggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
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

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    // Séparateur : porté par le conteneur de ligne dans ReorderList (ne vibre pas)
    gap: theme.spacing.md,
    height: ROW_HEIGHT - StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  rowMiddle: { flex: 1, marginRight: theme.spacing.sm, justifyContent: 'center' },
  rowName: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.5 },
  // Colonne fixe, texte centré (1.24) : les compteurs s'alignent sur un même axe central
  rowCounter: {
    width: 150, // texte réduit automatiquement s'il dépasse (ex. « 29 jours 23 heures »)
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
