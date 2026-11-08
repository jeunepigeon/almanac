// Partage (1.38) : choix des éléments → aperçu → image PNG → menu de partage Android
// (story, message privé, enregistrer dans un fichier…).
// 1.62 — refonte :
//  - 2 onglets à cocher (glisser ou toucher) : Substances (celles ayant au moins une prise) | Bandeaux
//    (ceux de la liste, sauf « 24 h », dessinés comme la liste, sans date ni cloche) ; rien de coché à
//    l'ouverture ; ordre de départ = ordre de sélection (un ajout arrive à la fin de sa section) ;
//  - bouton « Aperçu / Réorganisation » → écran suivant : l'image en réorganisation PERMANENTE (cases
//    qui vibrent, déplacement dans sa section, pris en compte tout de suite, sans « Terminé ») ;
//    une languette par section, à la hauteur de sa section : y lâcher un élément bascule cette section
//    en 1 ↔ 2 colonnes ; puis Enregistrer / Partager ;
//  - l'image capturée est dessinée à part (taille réelle), avec le même ordre et les mêmes colonnes.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, ActivityIndicator, Animated, Image,
  useWindowDimensions,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Reanimated, { useSharedValue, useDerivedValue, useEvent } from 'react-native-reanimated';
import { GestureHandlerRootView, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { useStore } from '../store';
import haptics from '../utils/haptics';
import SubstanceIcon from './SubstanceIcon';
import LiveCounter from './LiveCounter';
import InfoModal from './InfoModal';
import ShareImage, { SHARE_W, SHARE_SCALE, BAN_H, SUB_H, FOOT_H, shareSize, ShareSubRow } from './ShareImage';
import { useShareBanners, renderShareBanner } from './ShareBanners';
import BannerGrid, { gridHeight, effectiveCols, LANGUETTE } from './BannerGrid';
import Languette from './Languette';
import AnimatedTabs from './AnimatedTabs';
import { getOrPickImageDir, writeBase64ImageToDir, makeUniqueFilename, dirLabel, debugLastError } from '../utils/saf';
import { fmtDateTiretHM } from '../utils/snapshots';

const SOBRE_ID = '__sobre';
const DIM = '#2F2F2F';
const DIM_TEXT = '#3A3A3A';

function Choice({ label, color, icon, ts, checked, onToggle }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    haptics.light();
    scale.setValue(0.96);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 14 }).start();
    onToggle();
  };
  const c = checked ? color : DIM_TEXT;
  return (
    <Animated.View style={[styles.choiceOuter, { transform: [{ scale }] }]}>
      <Pressable onPress={press} style={[styles.choice, { borderColor: checked ? color : DIM }]}>
        <View style={[styles.choiceIcon, { borderColor: c }]}>
          {icon === SOBRE_ID
            ? <MaterialCommunityIcons name="all-inclusive" size={16} color={c} />
            : <SubstanceIcon iconId={icon} size={16} color={c} />}
        </View>
        <Text style={[styles.choiceName, { color: checked ? theme.colors.text : DIM_TEXT }]} numberOfLines={1}>{label}</Text>
        <LiveCounter timestamp={ts} style={[styles.choiceCounter, { color: checked ? theme.colors.textMuted : DIM_TEXT }]} numberOfLines={1} />
        <View style={styles.checkSlot}>
          {checked && <MaterialCommunityIcons name="check" size={20} color={color} />}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// 1.39 : la Modal est dessinée bord à bord (sous l'heure et la caméra) → marges de sécurité mesurées
// DANS la Modal (fournisseur propre à sa fenêtre). 1.62 : racine des gestes DANS la Modal (Android).
export default function ShareModal({ visible, onClose, demo = false }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => backRef.current?.()}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ShareScreen visible={visible} onClose={onClose} demo={demo} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}
// Retour Android : Aperçu → choix, choix → fermeture (fourni par l'écran affiché)
const backRef = { current: null };

const AnimatedPager = Reanimated.createAnimatedComponent(PagerView);
const TAB_LABELS = ['Substances', 'Bandeaux'];
const GUTTER = 40;   // marge gauche de l'aperçu (languettes)
const RIGHT = 16;
const LANG_GAP = 56; // écart minimal entre les deux languettes (centres)
const LANG = LANGUETTE.size;
const LOGO = require('../../assets/share-logo.png');
const LOGO_RATIO = 485 / 440;

function BannerChoice({ item, checked, onToggle, sobreTs }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    haptics.light();
    scale.setValue(0.97);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 14 }).start();
    onToggle();
  };
  const c = item.color === theme.colors.text ? theme.colors.textMuted : item.color;
  return (
    <Animated.View style={[styles.choiceOuter, { transform: [{ scale }] }]}>
      <Pressable onPress={press} style={[styles.banChoice, { borderColor: checked ? c : DIM }]}>
        <View style={{ opacity: checked ? 1 : 0.35 }} pointerEvents="none">
          {renderShareBanner(item, {}, sobreTs)}
        </View>
        {checked && (
          <View style={styles.banCheck} pointerEvents="none">
            <MaterialCommunityIcons name="check" size={20} color={item.color} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function ShareScreen({ visible, onClose, demo }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const substances = useStore((s) => s.substances);
  const lastTimestamps = useStore((s) => s.lastTimestamps);
  const listColumns = useStore((s) => s.bannerColumns);
  const banners = useShareBanners();

  // Seulement les substances avec au moins une prise, dans l'ordre de la liste
  const candidates = useMemo(
    () => substances.filter((s) => (lastTimestamps || {})[s.id]),
    [substances, lastTimestamps],
  );
  const sobreTs = useMemo(() => {
    const vals = Object.values(lastTimestamps || {}).filter(Boolean);
    return vals.length ? Math.max(...vals) : null;
  }, [lastTimestamps]);

  const [step, setStep] = useState('choose');   // 'choose' | 'preview'
  const [subOrder, setSubOrder] = useState([]);  // ids, dans l'ordre de l'image
  const [banOrder, setBanOrder] = useState([]);  // entrées de bandeaux, dans l'ordre de l'image
  const [banCols, setBanCols] = useState(1);
  const [subCols, setSubCols] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);
  const [dragging, setDragging] = useState(false);
  const shotRef = useRef(null);
  const pagerRef = useRef(null);
  const banLangRef = useRef(null);
  const subLangRef = useRef(null);

  // Ouverture : rien de coché, colonnes des bandeaux = celles de la liste, substances en 1 colonne
  useEffect(() => {
    if (!visible) return;
    setStep('choose'); setSubOrder([]); setBanOrder([]);
    setBanCols(listColumns === 2 ? 2 : 1); setSubCols(1);
  }, [visible]); // eslint-disable-line
  // L'aperçu suit l'heure (toutes les horloges au même instant)
  useEffect(() => {
    if (!visible || step !== 'preview') return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible, step]);
  backRef.current = () => { if (step === 'preview') setStep('choose'); else onClose(); };

  const toggleSub = (id) => setSubOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const toggleBan = (e) => setBanOrder((o) => (o.includes(e) ? o.filter((x) => x !== e) : [...o, e]));

  const subItems = subOrder
    .map((id) => candidates.find((s) => s.id === id)).filter(Boolean)
    .map((s) => ({ id: `sub:${s.id}`, name: s.name, color: s.color, icon: s.icon, ts: lastTimestamps[s.id] }));
  const banItems = banOrder.map((e) => banners.find((b) => b.entry === e)).filter(Boolean);
  const empty = subItems.length === 0 && banItems.length === 0;
  const bc = effectiveCols(banCols, banItems.length);
  const sc = effectiveCols(subCols, subItems.length);
  const size = shareSize(banItems.length, bc, subItems.length, sc);

  // Onglets des choix
  const spos = useSharedValue(0);
  const tabPos = useDerivedValue(() => spos.value + 1);
  const onPageScroll = useEvent((e) => { 'worklet'; spos.value = e.position + e.offset; }, ['onPageScroll']);

  // Photo prise MAINTENANT : on fige l'instant, on laisse 2 images se dessiner, puis capture
  const capture = async (result) => {
    setNow(Date.now());
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return captureRef(shotRef, {
      format: 'png',
      quality: 1,
      result,
      width: SHARE_W * SHARE_SCALE,
      height: Math.round(size.height * SHARE_SCALE),
    });
  };

  // 1.39 — Enregistrer : PNG écrit dans un dossier du téléphone choisi une fois (ex. Images/Almanac),
  // via le même mécanisme que les exports (aucune autorisation « photos » demandée).
  // Appui long : changer de dossier.
  const save = async (forcePick = false) => {
    if (demo) return; // Debug : démonstration, ne fait rien
    if (empty || busy) return;
    setBusy(true);
    try {
      const dirUri = await getOrPickImageDir({ forcePick });
      if (!dirUri) { if (debugLastError()?.includes('refusée')) return; throw new Error(debugLastError() || 'Aucun dossier choisi'); }
      const b64 = await capture('base64');
      const name = await makeUniqueFilename(dirUri, `almanac-${fmtDateTiretHM()}.png`);
      const uri = await writeBase64ImageToDir(dirUri, name, b64);
      if (!uri) throw new Error(debugLastError() || "Écriture impossible");
      haptics.success?.();
      setInfo({ title: 'Image enregistrée', message: `${name}\ndans ${dirLabel(dirUri)}\n\nAppui long sur Enregistrer pour changer de dossier.` });
    } catch (e) {
      setInfo({ title: "L'enregistrement n'a pas pu aboutir", message: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (demo) return;
    if (empty || busy) return;
    setBusy(true);
    let uri = null;
    try {
      uri = await capture('tmpfile');
      if (!(await Sharing.isAvailableAsync())) {
        setInfo({ title: 'Partage indisponible', message: "Le partage n'est pas disponible sur ce téléphone." });
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partager' });
    } catch (e) {
      setInfo({ title: "Le partage n'a pas pu aboutir", message: String(e?.message || e) });
    } finally {
      if (uri) { try { releaseCapture(uri); } catch (e) { /* rien */ } }
      setBusy(false);
    }
  };

  // --- Aperçu : géométrie (l'image à la largeur disponible, échelle u) ---
  const Wp = Math.max(200, winW - GUTTER - RIGHT);
  const u = Wp / SHARE_W;
  const banCell = useMemo(() => ({ h1: BAN_H * u, u }), [u]);
  const subCell = useMemo(() => ({ h1: SUB_H * u, u }), [u]);
  const banH = gridHeight(banItems.length, bc, banCell);
  const subH = gridHeight(subItems.length, sc, subCell);
  const banHAnim = useRef(new Animated.Value(0)).current;
  const subHAnim = useRef(new Animated.Value(0)).current;
  // Languettes : centrées sur leur section, écartées d'au moins LANG_GAP
  const hasBan = banItems.length > 0; const hasSub = subItems.length > 0;
  const banCenter = banH / 2;
  let subCenter = banH + subH / 2;
  if (hasBan && hasSub && subCenter - banCenter < LANG_GAP) subCenter = banCenter + LANG_GAP;
  const banLangTop = banCenter - LANG / 2;
  const subLangTop = subCenter - LANG / 2;
  const geo = useRef({});
  geo.current = { banLangTop, subLangTop, banH };

  const banGrid = hasBan && (
    <Animated.View style={{ height: banHAnim }}>
      <BannerGrid
        items={banItems}
        columns={banCols}
        active
        heightAnim={banHAnim}
        cell={banCell}
        spacer={0}
        showAdd={false}
        externalLang
        langX0={-GUTTER}
        getLangY={() => geo.current.banLangTop}
        onLangActive={(on) => banLangRef.current?.setActive(on)}
        onLangHover={(on) => banLangRef.current?.setHover(on)}
        renderBanner={(it, o) => renderShareBanner(it, o, sobreTs)}
        onReorder={(ids) => setBanOrder(ids.map((x) => x.slice(7)))}
        onToggleColumns={(cols, ids) => { setBanOrder(ids.map((x) => x.slice(7))); setBanCols(cols); }}
        onDragChange={setDragging}
      />
    </Animated.View>
  );
  const subGrid = hasSub && (
    <Animated.View style={{ height: subHAnim }}>
      <BannerGrid
        items={subItems}
        columns={subCols}
        active
        heightAnim={subHAnim}
        cell={subCell}
        spacer={0}
        showAdd={false}
        externalLang
        langX0={-GUTTER}
        getLangY={() => geo.current.subLangTop - geo.current.banH}
        onLangActive={(on) => subLangRef.current?.setActive(on)}
        onLangHover={(on) => subLangRef.current?.setHover(on)}
        renderBanner={(it, o) => <ShareSubRow sub={it} now={now} isWiggling={o.isWiggling} phase={o.phase} />}
        onReorder={(ids) => setSubOrder(ids.map((x) => x.slice(4)))}
        onToggleColumns={(cols, ids) => { setSubOrder(ids.map((x) => x.slice(4))); setSubCols(cols); }}
        onDragChange={setDragging}
      />
    </Animated.View>
  );

  if (step === 'preview') {
    return (
      <>
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          {/* Image capturée : dessinée à part, en taille réelle, invisible */}
          <View style={styles.offscreen} pointerEvents="none">
            <ShareImage ref={shotRef} banners={banItems} subs={subItems} banCols={bc} subCols={sc} now={now} sobreTs={sobreTs} />
          </View>

          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('choose')} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Aperçu</Text>
          </View>

          <GHScrollView scrollEnabled={!dragging} contentContainerStyle={styles.previewScroll}>
            <View>
              <View style={[styles.previewImage, { width: Wp, marginLeft: GUTTER }]}>
                {banGrid}
                {subGrid}
                <View style={[styles.previewFoot, { height: FOOT_H * u, gap: 8 * u }]}>
                  <Image source={LOGO} style={{ height: 20 * u, width: 20 * u * LOGO_RATIO }} resizeMode="contain" />
                  <Text style={[styles.wordmark, { fontSize: 12 * u, letterSpacing: 3 * u }]}>almanac</Text>
                </View>
              </View>
              {/* Une languette par section, à sa hauteur (grisée si la section ne peut pas basculer) */}
              {hasBan && (
                <Languette ref={banLangRef} visible top={banLangTop} cols={bc} dim={banItems.length < 2} />
              )}
              {hasSub && (
                <Languette ref={subLangRef} visible top={subLangTop} cols={sc} dim={subItems.length < 2} />
              )}
            </View>
          </GHScrollView>

          {/* Enregistrer (contour) + Partager (plein), au-dessus de la barre de navigation */}
          <View style={[styles.bottom, { paddingBottom: theme.spacing.md + insets.bottom }]}>
            <TouchableOpacity
              onPress={() => save(false)}
              onLongPress={() => save(true)}
              delayLongPress={450}
              disabled={empty || busy}
              style={[styles.saveBtn, (empty || busy) && { opacity: 0.35 }]}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="download" size={18} color={theme.colors.text} />
              <Text style={styles.saveText}>Enregistrer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={share}
              disabled={empty || busy}
              style={[styles.shareBtn, (empty || busy) && { opacity: 0.35 }]}
              activeOpacity={0.7}
            >
              {busy
                ? <ActivityIndicator color={theme.colors.background} />
                : (
                  <>
                    <MaterialCommunityIcons name="share-variant" size={18} color={theme.colors.background} />
                    <Text style={styles.shareText}>Partager</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>
        </View>
        <InfoModal visible={!!info} title={info?.title} message={info?.message} onClose={() => setInfo(null)} />
      </>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.title}>Partager</Text>
      </View>
      <AnimatedTabs pos={tabPos} labels={TAB_LABELS} onPress={(i) => pagerRef.current?.setPage(i)} />

      <AnimatedPager ref={pagerRef} style={{ flex: 1 }} initialPage={0} onPageScroll={onPageScroll}>
        <View key="subs" style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            {candidates.map((s) => (
              <Choice key={s.id} label={s.name} color={s.color} icon={s.icon} ts={lastTimestamps[s.id]}
                checked={subOrder.includes(s.id)} onToggle={() => toggleSub(s.id)} />
            ))}
            {candidates.length === 0 && (
              <Text style={styles.emptyText}>Aucune prise enregistrée pour l'instant.</Text>
            )}
          </ScrollView>
        </View>
        <View key="bans" style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            {banners.map((b) => (
              <BannerChoice key={b.id} item={b} sobreTs={sobreTs}
                checked={banOrder.includes(b.entry)} onToggle={() => toggleBan(b.entry)} />
            ))}
            {banners.length === 0 && (
              <Text style={styles.emptyText}>Aucun bandeau dans la liste.</Text>
            )}
          </ScrollView>
        </View>
      </AnimatedPager>

      <View style={[styles.bottom, { paddingBottom: theme.spacing.md + insets.bottom }]}>
        <TouchableOpacity
          onPress={() => setStep('preview')}
          disabled={empty}
          style={[styles.shareBtn, empty && { opacity: 0.35 }]}
          activeOpacity={0.7}
        >
          <Text style={styles.shareText}>Aperçu / Réorganisation</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={theme.colors.background} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    height: 56, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 52,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  closeBtn: { position: 'absolute', left: theme.spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
  title: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  scroll: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  section: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: theme.spacing.sm, marginLeft: 2,
  },
  choiceOuter: { paddingVertical: 4, paddingHorizontal: 2 },
  banChoice: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  banCheck: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  previewScroll: { paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xl },
  previewImage: { backgroundColor: theme.colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  previewFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  wordmark: { color: theme.colors.textMuted, fontWeight: '300' },
  offscreen: { position: 'absolute', left: 0, top: 0, opacity: 0, zIndex: -1 },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10,
  },
  choiceIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  choiceName: { flex: 1, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.5 },
  choiceCounter: { fontSize: theme.font.sizes.sm, fontWeight: '300', fontVariant: ['tabular-nums'] },
  checkSlot: { width: 22, alignItems: 'center' },
  previewArea: {
    minHeight: 80, justifyContent: 'center', borderRadius: 10, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  emptyText: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontStyle: 'italic',
    textAlign: 'center', paddingVertical: theme.spacing.lg,
  },
  bottom: {
    flexDirection: 'row', gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
  },
  saveBtn: {
    flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.textMuted,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 0.5 },
  shareBtn: {
    flex: 1, height: 48, borderRadius: 24, backgroundColor: theme.colors.text,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  shareText: { color: theme.colors.background, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 0.5 },
});
