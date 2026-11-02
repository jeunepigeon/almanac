// Partage (1.38) : choix des éléments → aperçu → image PNG → menu de partage Android
// (story, message privé, enregistrer dans un fichier…).
//  - rien n'est coché à l'ouverture ;
//  - « Sobre de tout » + les substances ayant au moins une prise (pas les catégories) ;
//  - l'aperçu EST la vue capturée (affichée réduite) : ce qu'on voit est ce qui part ;
//  - au tap sur Partager, tous les compteurs sont figés au même instant puis l'image est prise.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, ActivityIndicator, Animated,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { theme } from '../theme';
import { useStore } from '../store';
import haptics from '../utils/haptics';
import SubstanceIcon from './SubstanceIcon';
import LiveCounter from './LiveCounter';
import InfoModal from './InfoModal';
import ShareImage, { SHARE_W, SHARE_SCALE, shareLayout } from './ShareImage';

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

export default function ShareModal({ visible, onClose }) {
  const substances = useStore((s) => s.substances);
  const lastTimestamps = useStore((s) => s.lastTimestamps);

  // Seulement les substances avec au moins une prise, dans l'ordre de la liste
  const candidates = useMemo(
    () => substances.filter((s) => (lastTimestamps || {})[s.id]),
    [substances, lastTimestamps],
  );
  const sobreTs = useMemo(() => {
    const vals = Object.values(lastTimestamps || {}).filter(Boolean);
    return vals.length ? Math.max(...vals) : null;
  }, [lastTimestamps]);

  const [selected, setSelected] = useState({});
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [previewW, setPreviewW] = useState(0);
  const [info, setInfo] = useState(null);
  const shotRef = useRef(null);

  // Ouverture : rien de coché ; l'aperçu suit l'heure (toutes les horloges au même instant)
  useEffect(() => {
    if (!visible) return undefined;
    setSelected({});
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  const toggle = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const showSobre = !!selected[SOBRE_ID] && !!sobreTs;
  const chosen = candidates
    .filter((s) => selected[s.id])
    .map((s) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon, ts: lastTimestamps[s.id] }));
  const empty = !showSobre && chosen.length === 0;
  const lay = shareLayout(chosen.length, showSobre);
  const k = previewW > 2 ? Math.min(1, (previewW - 2) / SHARE_W) : 0;

  const share = async () => {
    if (empty || busy) return;
    setBusy(true);
    let uri = null;
    try {
      // Photo prise MAINTENANT : on fige l'instant, on laisse 2 images se dessiner, puis capture
      setNow(Date.now());
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      uri = await captureRef(shotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: SHARE_W * SHARE_SCALE,
        height: Math.round(lay.height * SHARE_SCALE),
      });
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.title}>Partager</Text>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <Text style={styles.section}>À inclure</Text>
          {sobreTs ? (
            <Choice label="Sobre de tout" color={theme.colors.text} icon={SOBRE_ID} ts={sobreTs}
              checked={!!selected[SOBRE_ID]} onToggle={() => toggle(SOBRE_ID)} />
          ) : null}
          {candidates.map((s) => (
            <Choice key={s.id} label={s.name} color={s.color} icon={s.icon} ts={lastTimestamps[s.id]}
              checked={!!selected[s.id]} onToggle={() => toggle(s.id)} />
          ))}
          {candidates.length === 0 && (
            <Text style={styles.emptyText}>Aucune prise enregistrée pour l'instant.</Text>
          )}

          <Text style={[styles.section, { marginTop: theme.spacing.lg }]}>Aperçu</Text>
          <View style={styles.previewArea} onLayout={(e) => setPreviewW(Math.round(e.nativeEvent.layout.width))}>
            {empty ? (
              <Text style={styles.emptyText}>Coche au moins un élément</Text>
            ) : k > 0 ? (
              // Cadre à la taille réduite ; à l'intérieur, l'image en taille réelle réduite par
              // une transformation du parent (la capture, elle, se fait en taille réelle)
              <View style={{ width: SHARE_W * k, height: lay.height * k, overflow: 'hidden', alignSelf: 'center' }}>
                <View style={{ width: SHARE_W, height: lay.height, transform: [{ scale: k }], transformOrigin: 'top left' }}>
                  <ShareImage ref={shotRef} showSobre={showSobre} sobreTs={sobreTs} subs={chosen} now={now} />
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.bottom}>
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
    </Modal>
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
    padding: theme.spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
  },
  shareBtn: {
    height: 48, borderRadius: 24, backgroundColor: theme.colors.text,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  shareText: { color: theme.colors.background, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 0.5 },
});
