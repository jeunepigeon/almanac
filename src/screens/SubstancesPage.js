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
import ReorderList from '../components/ReorderList';
import ColorBannerAddModal from '../components/ColorBannerAddModal';
import haptics from '../utils/haptics';

const ROW_HEIGHT = 68; // doit matcher le style de SubstanceRow (padding + content)
const BANNER_HEIGHT = 102; // bandeau par couleur (≈ hauteur du bandeau « Sobre de tout »)

// Bannière "Sobre de tout depuis". Clic → scroll vers la dernière substance consommée + flash.
function SobreBanner({ lastGlobalTimestamp, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.bannerPress}>
      <View style={styles.banner}>
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

// Bandeau « Sobre depuis » d'une couleur (1.22) : libellé + compteur dans la couleur.
// Hauteur fixe (BANNER_HEIGHT, séparateur compris) pour pouvoir être réorganisé comme les substances.
function ColorBanner({ color, lastTimestamp }) {
  return (
    <View style={styles.colorBanner}>
      <Text style={[styles.bannerLabel, { color }]}>SOBRE DEPUIS</Text>
      <View style={styles.bannerCounterWrap}>
        {lastTimestamp ? (
          <LiveCounter timestamp={lastTimestamp} style={[styles.bannerCounter, { color }]} />
        ) : (
          <Text style={[styles.bannerCounter, { color }]}>—</Text>
        )}
      </View>
    </View>
  );
}

function SubstanceRow({
  substance, lastTimestamp, inReorder, isFlashed, onMenu,
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
      <View style={[styles.iconWrap, { borderColor: substance.color }]}>
        <SubstanceIcon iconId={substance.icon} size={18} color={substance.color} />
      </View>
      <View style={styles.rowMiddle}>
        <Text style={styles.rowName} numberOfLines={1}>{substance.name}</Text>
      </View>
      {/* Compteur et ⋯ masqués pendant TOUT le mode réorganisation (pas lié au wiggle) */}
      {!inReorder && <LiveCounter timestamp={lastTimestamp} style={styles.rowCounter} />}
      {!inReorder && (
        <TouchableOpacity
          onPress={onMenu}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.menuBtn}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
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

  // null | 'subs' (réorganiser les substances) | 'banners' (réorganiser les bandeaux de couleur)
  const [reorderMode, setReorderMode] = useState(null);
  const [bannerActionsFor, setBannerActionsFor] = useState(null); // couleur
  const [addBannerOpen, setAddBannerOpen] = useState(false);
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

  const scrollRef = useRef(null);
  const bannerHeightRef = useRef(0);
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
    const listStart = listTop || bannerHeightRef.current || 110;
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

  // Ouvre le menu « ⋯ » de CETTE substance (bouton ⋯ ou appui long) ; chaque action agit sur elle seule
  const openActions = (sub) => setActionSheetFor(sub);

  const actionItems = (sub) => [
    { id: 'reorder', label: 'Réorganiser', icon: 'drag', onPress: () => setReorderMode('subs') },
    { id: 'rename', label: 'Renommer', icon: 'pencil-outline', onPress: () => setEditMode({ sub, mode: 'rename' }) },
    { id: 'color', label: 'Changer la couleur', icon: 'palette-outline', onPress: () => setEditMode({ sub, mode: 'color' }) },
    { id: 'icon', label: "Changer l'icône", icon: 'shape-outline', onPress: () => setEditMode({ sub, mode: 'icon' }) },
    { id: 'delete', label: 'Supprimer', icon: 'trash-can-outline', destructive: true, onPress: () => setPendingDelete(sub) },
  ];

  const bannerActionItems = (color) => [
    ...(bannerInfo.visible.length >= 2
      ? [{ id: 'reorder', label: 'Réorganiser', icon: 'drag', onPress: () => setReorderMode('banners') }]
      : []),
    { id: 'delete', label: 'Supprimer', icon: 'trash-can-outline', destructive: true, onPress: () => removeColorBanner(color) },
  ];

  const sobreBanner = (
    <View onLayout={(e) => { bannerHeightRef.current = e.nativeEvent.layout.height; }}>
      <SobreBanner
        lastGlobalTimestamp={lastGlobalTimestamp}
        onPress={() => handleBannerPress(lastGlobalSubId)}
      />
    </View>
  );

  // Espace entre bandeaux et substances, avec la pilule « + » posée sur le séparateur.
  // marginTop négatif : la zone remonte sur le séparateur pour que la pilule soit centrée
  // dessus ET entièrement touchable (Android ignore les touchers hors des limites du parent).
  const pillSpacer = (withPill) => (
    <View pointerEvents="box-none" style={styles.pillSpacer}>
      {withPill && (
        <TouchableOpacity
          style={styles.pill}
          onPress={() => { haptics.light(); setAddBannerOpen(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          activeOpacity={0.6}
        >
          <MaterialCommunityIcons name="plus" size={14} color={theme.colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );

  // En-tête normal / réorg des substances : « Sobre de tout » + bandeaux de couleur + pilule
  const fullHeader = (
    <View>
      {sobreBanner}
      {bannerInfo.visible.map((b) => (
        <Pressable
          key={b.id}
          style={styles.colorBannerWrap}
          disabled={!!reorderMode}
          onPress={() => handleBannerPress(b.lastSubId)}
          onLongPress={() => { haptics.medium(); setBannerActionsFor(b.color); }}
          delayLongPress={400}
        >
          <ColorBanner color={b.color} lastTimestamp={b.lastTs} />
        </Pressable>
      ))}
      {pillSpacer(!reorderMode)}
    </View>
  );

  // Réorg des bandeaux : « Sobre de tout » reste fixe en tête, les substances sont grisées dessous
  const bannersReorder = reorderMode === 'banners';
  const dimmedSubstances = bannersReorder ? (
    <View pointerEvents="none" style={styles.dimmed}>
      {pillSpacer(false)}
      {substances.map((sub) => (
        <View key={sub.id} style={styles.dimmedRow}>
          <SubstanceRow substance={sub} lastTimestamp={lastTimestamps[sub.id]} inReorder isFlashed={false} />
        </View>
      ))}
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {substances.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Ajoute au moins 1 substance pour utiliser l'app</Text>
        </View>
      ) : (
        <ReorderList
          data={bannersReorder ? bannerInfo.visible : substances}
          itemHeight={bannersReorder ? BANNER_HEIGHT : ROW_HEIGHT}
          active={!!reorderMode}
          onItemLongPress={(sub) => openActions(sub)}
          onDeactivate={() => setReorderMode(null)}
          onReorder={(newIds) => {
            if (bannersReorder) reorderColorBanners(newIds.map((id) => id.replace(/^banner:/, '')));
            else reorderSubstances(newIds);
          }}
          onItemTap={(sub) => navigation.navigate('Substance', { substanceId: sub.id })}
          onScrollY={handleScroll}
          onScrollEnd={handleScrollEnd}
          onMetrics={(m) => { metricsRef.current = m; }}
          headerComponent={bannersReorder ? sobreBanner : fullHeader}
          footerComponent={dimmedSubstances}
          scrollRef={scrollRef}
          renderItem={({ item, inReorder }) => (bannersReorder ? (
            <ColorBanner color={item.color} lastTimestamp={item.lastTs} />
          ) : (
            <SubstanceRow
              substance={item}
              lastTimestamp={lastTimestamps[item.id]}
              inReorder={inReorder}
              isFlashed={flashedSubId === item.id}
              onMenu={() => openActions(item)}
            />
          ))}
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

      <ActionSheet
        visible={!!bannerActionsFor}
        title={bannerActionsFor ? `Bandeau · ${(bannerInfo.visible.find((b) => b.color === bannerActionsFor)?.names || []).join(' · ')}` : ''}
        items={bannerActionsFor ? bannerActionItems(bannerActionsFor) : []}
        onClose={() => setBannerActionsFor(null)}
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
  colorBannerWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  // 16 px d'espace sous les bandeaux ; remonte de 11 px sur le séparateur pour y centrer la pilule
  pillSpacer: { marginTop: -11, height: 11 + theme.spacing.md, alignItems: 'center' },
  pill: {
    height: 22, width: 40, borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  dimmed: { opacity: 0.3 },
  dimmedRow: {
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
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
  rowCounter: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300',
    fontVariant: ['tabular-nums'], letterSpacing: 0.5, textAlign: 'right',
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
