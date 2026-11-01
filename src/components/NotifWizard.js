// Gestion des notifications de paliers (1.25).
//
// Écrans (dans une seule fenêtre, pas de fenêtre sur fenêtre) :
//  'list'    : cibles ayant au moins 1 notification active (« Toutes » d'abord, puis catégories,
//              puis substances dans l'ordre de la liste) + « + » blanc pour en ajouter une ;
//  'pick'    : choix de la cible (Toutes / catégories ≥ 2 substances / substances) ;
//  'target'  : notifications actives de la cible, poubelle par ligne + « + » à la couleur de la cible ;
//  'palier'  : choix du palier (24 h, 48 h, 7 j, 15 j, Tous les mois) ;
//  'confirm' : confirmation de suppression.
// Ouvert depuis le calendrier d'une substance : directement sur 'target' (sélection sautée).

import { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, ScrollView, Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useStore, notifRuleId } from '../store';
import SubstanceIcon from './SubstanceIcon';
import haptics from '../utils/haptics';
import { PALIERS, PALIER_ORDER, palierLabel, ensureNotifPermission } from '../utils/notifications';

// Couleur hex → rgba (fond pâle / liseré des lignes, style B de la planche)
function rgba(hex, a) {
  const h = (hex || '#EDEDED').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16); const g = parseInt(h.slice(2, 4), 16); const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
const rowTint = (c) => ({ backgroundColor: rgba(c, 0.14), borderColor: rgba(c, 0.7) });

const sameTarget = (a, b) => a && b && a.target === b.target && (a.key || null) === (b.key || null);

function Dot({ color, size = 10 }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export default function NotifWizard({ visible, initialTarget = null, onClose }) {
  const substances = useStore((s) => s.substances);
  const colorBanners = useStore((s) => s.colorBanners);
  const notifRules = useStore((s) => s.notifRules);
  const addNotifRule = useStore((s) => s.addNotifRule);
  const removeNotifRule = useStore((s) => s.removeNotifRule);

  const [step, setStep] = useState('list');
  const [target, setTarget] = useState(null);       // { target, key }
  const [pendingDelete, setPendingDelete] = useState(null); // règle
  const [permDenied, setPermDenied] = useState(false);
  const [fromPick, setFromPick] = useState(false); // nouvelle notif : cible choisie → palier directement

  useEffect(() => {
    if (!visible) return;
    setPermDenied(false);
    setPendingDelete(null);
    if (initialTarget) { setTarget(initialTarget); setStep('target'); }
    else { setTarget(null); setStep('list'); }
  }, [visible]); // eslint-disable-line

  // Catégories = couleurs avec ≥ 2 substances (ordre : bandeaux, puis palette)
  const categories = useMemo(() => {
    const count = {};
    for (const s of substances) count[s.color] = (count[s.color] || 0) + 1;
    const order = [...colorBanners, ...theme.substanceColors.filter((c) => !colorBanners.includes(c))];
    return order.filter((c) => (count[c] || 0) >= 2);
  }, [substances, colorBanners]);

  // Toutes les cibles possibles, dans l'ordre d'affichage
  const allTargets = useMemo(() => [
    { target: 'all', key: null },
    ...categories.map((c) => ({ target: 'color', key: c })),
    ...substances.map((s) => ({ target: 'sub', key: s.id })),
  ], [categories, substances]);

  const rulesOf = (t) => notifRules
    .filter((r) => sameTarget(r, t))
    .sort((a, b) => PALIER_ORDER.indexOf(a.palier) - PALIER_ORDER.indexOf(b.palier));

  const activeTargets = allTargets.filter((t) => rulesOf(t).length > 0);

  const colorOf = (t) => {
    if (!t || t.target === 'all') return theme.colors.text;
    if (t.target === 'color') return t.key;
    return substances.find((s) => s.id === t.key)?.color || theme.colors.text;
  };

  const renderTargetLabel = (t, style, forPick = false) => {
    if (t.target === 'sub') {
      const sub = substances.find((s) => s.id === t.key);
      return (
        <View style={styles.labelRow}>
          <SubstanceIcon iconId={sub?.icon} size={16} color={sub?.color || theme.colors.text} />
          <Text style={[styles.label, style]} numberOfLines={1}>{sub?.name || '—'}</Text>
        </View>
      );
    }
    // « Toutes substances » / « Toutes les ● »
    return (
      <View style={styles.labelRow}>
        <Text style={[styles.label, style]} numberOfLines={1}>
          {t.target === 'color' ? 'Toutes les' : (forPick ? 'Toutes les substances' : 'Toutes substances')}
        </Text>
        {t.target === 'color' && <Dot color={t.key} size={12} />}
      </View>
    );
  };

  const goBack = () => {
    if (step === 'palier' && fromPick) { setStep('pick'); return; }
    if (step === 'confirm' || step === 'palier') { setStep('target'); return; }
    if (step === 'target') { if (initialTarget) onClose(); else setStep('list'); return; }
    if (step === 'pick') { setStep('list'); return; }
    onClose();
  };

  const openTarget = (t) => { haptics.light(); setFromPick(false); setTarget(t); setStep('target'); };
  // Depuis « + » de la liste : la cible choisie n'a encore aucune notification → choix du palier direct
  const pickTarget = (t) => { haptics.light(); setFromPick(true); setPermDenied(false); setTarget(t); setStep('palier'); };

  const addPalier = async (palier) => {
    haptics.light();
    const ok = await ensureNotifPermission();
    if (!ok) { setPermDenied(true); return; }
    addNotifRule({ target: target.target, key: target.key, palier });
    haptics.success();
    setFromPick(false);
    setStep('target'); // on atterrit sur l'écran de la cible pour voir la notification ajoutée
  };

  const confirmDelete = () => {
    if (pendingDelete) { removeNotifRule(pendingDelete); haptics.success(); }
    setPendingDelete(null);
    setStep('target');
  };

  const titles = {
    list: 'Notifications',
    pick: 'Nouvelle notification',
    palier: 'Choisir un palier',
    confirm: 'Supprimer la notification ?',
  };

  // Bouton « + » rond à liseré, centré (option 1 de la planche)
  const AddBox = ({ color, onPress }) => (
    <TouchableOpacity style={[styles.addBox, { borderColor: color }]} onPress={onPress} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <MaterialCommunityIcons name="plus" size={20} color={color} />
    </TouchableOpacity>
  );

  let body = null;
  if (step === 'list') {
    body = (
      <>
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {activeTargets.length === 0 && <Text style={styles.empty}>Aucune notification active</Text>}
          {activeTargets.map((t) => {
            const n = rulesOf(t).length;
            return (
              <TouchableOpacity key={`${t.target}:${t.key}`} style={[styles.row, rowTint(colorOf(t))]} onPress={() => openTarget(t)} activeOpacity={0.7}>
                {renderTargetLabel(t)}
                <Text style={styles.count}>{n} notif{n > 1 ? 's' : ''}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <AddBox color={theme.colors.text} onPress={() => { haptics.light(); setStep('pick'); }} />
      </>
    );
  } else if (step === 'pick') {
    // Seulement les cibles qui n'ont encore AUCUNE notification (les autres : depuis la liste)
    const free = allTargets.filter((t) => rulesOf(t).length === 0);
    body = free.length === 0 ? (
      <Text style={styles.empty}>Toutes les cibles ont déjà des notifications</Text>
    ) : (
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {free.map((t) => (
          <TouchableOpacity key={`${t.target}:${t.key}`} style={[styles.row, rowTint(colorOf(t))]} onPress={() => pickTarget(t)} activeOpacity={0.7}>
            {renderTargetLabel(t, null, true)}
            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  } else if (step === 'target' && target) {
    const rules = rulesOf(target);
    body = (
      <>
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {rules.length === 0 && <Text style={styles.empty}>Aucune notification</Text>}
          {rules.map((r) => (
            <View key={notifRuleId(r)} style={[styles.row, rowTint(colorOf(target))]}>
              <MaterialCommunityIcons name="bell-outline" size={18} color={colorOf(target)} />
              <Text style={[styles.label, { flex: 1 }]}>{palierLabel(r.palier)}</Text>
              <TouchableOpacity
                onPress={() => { haptics.light(); setPendingDelete(r); setStep('confirm'); }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        {rules.length < PALIERS.length && (
          <AddBox color={colorOf(target)} onPress={() => { haptics.light(); setPermDenied(false); setFromPick(false); setStep('palier'); }} />
        )}
      </>
    );
  } else if (step === 'palier' && target) {
    const active = new Set(rulesOf(target).map((r) => r.palier));
    body = (
      <>
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {PALIERS.filter((p) => !active.has(p.id)).map((p) => (
            <TouchableOpacity key={p.id} style={[styles.row, rowTint(colorOf(target))]} onPress={() => addPalier(p.id)} activeOpacity={0.7}>
              <Text style={[styles.label, { flex: 1 }]}>{p.label}</Text>
              <MaterialCommunityIcons name="plus" size={18} color={colorOf(target)} />
            </TouchableOpacity>
          ))}
        </ScrollView>
        {permDenied ? (
          <View style={styles.permBox}>
            <Text style={styles.permText}>Les notifications d'Almanac sont désactivées sur ce téléphone.</Text>
            <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.permBtn}>
              <Text style={styles.permBtnText}>Ouvrir les réglages</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hint}>Notification silencieuse, comptée depuis la dernière prise. Elle peut arriver jusqu'à environ 1 h après le palier.</Text>
        )}
      </>
    );
  } else if (step === 'confirm' && pendingDelete) {
    body = (
      <>
        <Text style={styles.confirmText}>
          {'« '}{palierLabel(pendingDelete.palier)}{' » pour '}
          {target?.target === 'sub'
            ? (substances.find((s) => s.id === target.key)?.name || '—')
            : (target?.target === 'color' ? 'toutes les' : 'toutes substances')}
          {target?.target === 'color' ? ' ' : ''}
          {target?.target === 'color' && <Text style={{ color: target.key, fontSize: 18 }}>●</Text>}
          {' sera supprimée.'}
        </Text>
        <View style={styles.confirmActions}>
          <TouchableOpacity onPress={() => setStep('target')} style={styles.actionBtn}>
            <Text style={styles.actionMuted}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDelete} style={styles.actionBtn}>
            <Text style={styles.actionDanger}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    // Retour Android : ferme complètement ; le chevron « < » revient d'un écran (ferme depuis la liste)
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            {/* Chevron toujours au même endroit (on peut l'enchaîner) */}
            <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.back}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <View style={styles.titleWrap}>
              {step === 'target' && target
                ? renderTargetLabel(target, styles.title)
                : <Text style={styles.title}>{titles[step]}</Text>}
            </View>
            <View style={styles.back} />
          </View>
          {/* Taille fixe pour tous les écrans (celle d'une cible avec ses 5 paliers), sauf la
              sélection d'une nouvelle cible qui peut être plus haute */}
          <View style={step === 'pick' ? styles.bodyPick : styles.bodyFixed}>{body}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 10,
    padding: theme.spacing.lg, width: '100%', maxWidth: 420, maxHeight: '82%',
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md },
  back: { width: 28 },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 0.3 },
  list: { flexGrow: 0, flexShrink: 1 },
  // Contenu centré verticalement (messages vides, bouton +, confirmation)
  bodyFixed: { height: 292, justifyContent: 'center' },
  bodyPick: { maxHeight: 460, minHeight: 120, justifyContent: 'center' },
  empty: { color: theme.colors.textMuted, textAlign: 'center', fontSize: theme.font.sizes.sm, paddingVertical: theme.spacing.lg },
  // Lignes plus fines (1.26), fond pâle + liseré à la couleur de la cible
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    borderWidth: 1, borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: theme.spacing.md,
    marginBottom: 7,
  },
  labelRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  label: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 0.3, flexShrink: 1 },
  count: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm },
  addBox: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, textAlign: 'center', marginTop: theme.spacing.sm, lineHeight: 16 },
  permBox: { alignItems: 'center', marginTop: theme.spacing.sm },
  permText: { color: theme.colors.danger, fontSize: theme.font.sizes.sm, textAlign: 'center', marginBottom: theme.spacing.sm },
  permBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, paddingVertical: 6, paddingHorizontal: theme.spacing.md },
  permBtnText: { color: theme.colors.text, fontSize: theme.font.sizes.sm },
  confirmText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, lineHeight: 22, textAlign: 'center', marginBottom: theme.spacing.md },
  confirmActions: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.xl },
  actionBtn: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
  actionMuted: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, letterSpacing: 1 },
  actionDanger: { color: theme.colors.danger, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 1 },
  closeBtn: { alignSelf: 'center', paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xl, marginTop: theme.spacing.sm },
  closeText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600', letterSpacing: 1 },
});
