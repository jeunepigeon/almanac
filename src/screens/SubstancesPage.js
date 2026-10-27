import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable, Alert, Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { getIconById } from '../icons';
import LiveCounter from '../components/LiveCounter';
import SubstanceFormModal from '../components/SubstanceFormModal';
import ActionSheet from '../components/ActionSheet';
import ConfirmModal from '../components/ConfirmModal';
import ReorderList from '../components/ReorderList';
import haptics from '../utils/haptics';

const ROW_HEIGHT = 68; // doit matcher le style de SubstanceRow (padding + content)

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

function SubstanceRow({
  substance, lastTimestamp, isWiggling, isPickup, isFlashed, onMenu,
}) {
  const iconEntry = getIconById(substance.icon);
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
        <MaterialCommunityIcons name={iconEntry.icon} size={18} color={substance.color} />
      </View>
      <View style={styles.rowMiddle}>
        <Text style={styles.rowName} numberOfLines={1}>{substance.name}</Text>
      </View>
      {!isWiggling && <LiveCounter timestamp={lastTimestamp} style={styles.rowCounter} />}
      {!isWiggling && (
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

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingArchivedConflict, setPendingArchivedConflict] = useState(null);
  const [actionSheetFor, setActionSheetFor] = useState(null);
  const [editMode, setEditMode] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const [reorderMode, setReorderMode] = useState(false);
  const [flashedSubId, setFlashedSubId] = useState(null);

  // Verrouille le PagerView (swipe gauche/droite vers Global) tant qu'on est en mode réorg.
  const setPagerLocked = useStore((s) => s.setPagerLocked);
  useEffect(() => {
    setPagerLocked(reorderMode);
    return () => setPagerLocked(false);
  }, [reorderMode, setPagerLocked]);

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

  const handleBannerPress = () => {
    if (!lastGlobalSubId) return;
    haptics.medium();
    const idx = substances.findIndex((s) => s.id === lastGlobalSubId);
    if (idx < 0) return;
    const bannerH = bannerHeightRef.current || 110;
    const y = Math.max(0, bannerH + idx * ROW_HEIGHT - 100);
    const flash = () => {
      setFlashedSubId(lastGlobalSubId);
      setTimeout(() => setFlashedSubId(null), 520);
    };
    if (Math.abs(scrollYRef.current - y) <= 10) { flash(); return; }
    pendingBannerFlashRef.current = flash;
    scrollRef.current?.scrollTo?.({ y, animated: true });
    // Filet de sécurité (cible hors limite de scroll, pas d'event…)
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
    { id: 'reorder', label: 'Réorganiser', icon: 'drag', onPress: () => setReorderMode(true) },
    { id: 'rename', label: 'Renommer', icon: 'pencil-outline', onPress: () => setEditMode({ sub, mode: 'rename' }) },
    { id: 'color', label: 'Changer la couleur', icon: 'palette-outline', onPress: () => setEditMode({ sub, mode: 'color' }) },
    { id: 'icon', label: "Changer l'icône", icon: 'shape-outline', onPress: () => setEditMode({ sub, mode: 'icon' }) },
    { id: 'delete', label: 'Supprimer', icon: 'trash-can-outline', destructive: true, onPress: () => setPendingDelete(sub) },
  ];

  const banner = lastGlobalTimestamp !== undefined ? (
    <View onLayout={(e) => { bannerHeightRef.current = e.nativeEvent.layout.height; }}>
      <SobreBanner
        lastGlobalTimestamp={lastGlobalTimestamp}
        onPress={handleBannerPress}
      />
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
          data={substances}
          itemHeight={ROW_HEIGHT}
          active={reorderMode}
          onItemLongPress={(sub) => openActions(sub)}
          onDeactivate={() => setReorderMode(false)}
          onReorder={(newIds) => reorderSubstances(newIds)}
          onItemTap={(sub) => navigation.navigate('Substance', { substanceId: sub.id })}
          onScrollY={handleScroll}
          onScrollEnd={handleScrollEnd}
          headerComponent={banner}
          scrollRef={scrollRef}
          renderItem={({ item, isWiggling, isPickup }) => (
            <SubstanceRow
              substance={item}
              lastTimestamp={lastTimestamps[item.id]}
              isWiggling={isWiggling}
              isPickup={isPickup}
              isFlashed={flashedSubId === item.id}
              onMenu={() => openActions(item)}
            />
          )}
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
    marginBottom: theme.spacing.md,
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
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
    height: ROW_HEIGHT,
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
