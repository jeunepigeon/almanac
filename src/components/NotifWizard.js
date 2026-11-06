// Gestion des notifications de paliers (1.25).
// 1.40 : liste / nouvelle notif = substances uniquement ; bandeaux via leur cloche (initialTarget).
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
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import { useStore, notifRuleId } from '../store';
import SubstanceIcon from './SubstanceIcon';
import haptics from '../utils/haptics';
import { PALIERS, palierLabel, ensureNotifPermission, toastNotifOn } from '../utils/notifications';

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
  const notifRules = useStore((s) => s.notifRules);
  const customBanners = useStore((s) => s.customBanners);
  const addNotifRule = useStore((s) => s.addNotifRule);
  const removeNotifRule = useStore((s) => s.removeNotifRule);

  // 1.41 : 'list' (substances avec notifs, poubelle) · 'pick' (nouvelle) · 'target' (5 paliers à
  // cocher) · 'confirm' (supprimer toutes les notifs d'une substance)
  const [step, setStep] = useState('list');
  const [target, setTarget] = useState(null);       // { target, key }
  const [pendingDelete, setPendingDelete] = useState(null); // cible dont on supprime tout
  const [permDenied, setPermDenied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPermDenied(false);
    setPendingDelete(null);
    if (initialTarget) { setTarget(initialTarget); setStep('target'); }
    else { setTarget(null); setStep('list'); }
  }, [visible]); // eslint-disable-line

  // 1.40 : la cloche principale ne gère que les SUBSTANCES de la liste. « Toutes », catégories et
  // bandeaux personnalisés se règlent depuis la cloche de leur bandeau (ouverture directe).
  const allTargets = useMemo(
    () => substances.map((s) => ({ target: 'sub', key: s.id })),
    [substances],
  );

  const rulesOf = (t) => notifRules.filter((r) => sameTarget(r, t));
  const activeTargets = allTargets.filter((t) => rulesOf(t).length > 0);

  const colorOf = (t) => {
    if (!t || t.target === 'all' || t.target === 'custom') return theme.colors.text;
    if (t.target === 'color') return t.key;
    return substances.find((s) => s.id === t.key)?.color || theme.colors.text;
  };

  // Nom en clair (titre, message flottant)
  const nameOf = (t) => {
    if (!t) return '';
    if (t.target === 'sub') return substances.find((s) => s.id === t.key)?.name || '—';
    if (t.target === 'custom') return `Sobre de ${customBanners.find((b) => b.id === t.key)?.name || ''}`;
    if (t.target === 'color') return substances.filter((s) => s.color === t.key).map((s) => s.name).join(' • ');
    return 'Sobre de tout';
  };

  const renderTargetLabel = (t, style) => {
    if (t.target === 'sub') {
      const sub = substances.find((s) => s.id === t.key);
      return (
        <View style={styles.labelRow}>
          <SubstanceIcon iconId={sub?.icon} size={16} color={sub?.color || theme.colors.text} />
          <Text style={[styles.label, style]} numberOfLines={1}>{sub?.name || '—'}</Text>
        </View>
      );
    }
    return (
      <View style={styles.labelRow}>
        {t.target === 'color' && <Dot color={t.key} size={12} />}
        <Text style={[styles.label, style]} numberOfLines={1}>
          {t.target === 'color' ? 'Catégorie' : nameOf(t)}
        </Text>
      </View>
    );
  };

  const goBack = () => {
    if (step === 'confirm') { setStep('list'); return; }
    if (step === 'target') { if (initialTarget) onClose(); else setStep('list'); return; }
    if (step === 'pick') { setStep('list'); return; }
    onClose();
  };

  const openTarget = (t) => { haptics.light(); setPermDenied(false); setTarget(t); setStep('target'); };

  // Palier coché ↔ décoché ; à l'activation, message flottant Android
  const togglePalier = async (palier, active) => {
    haptics.light();
    const rule = { target: target.target, key: target.key, palier };
    if (active) { removeNotifRule(rule); return; }
    const ok = await ensureNotifPermission();
    if (!ok) { setPermDenied(true); return; }
    addNotifRule(rule);
    toastNotifOn(`${palierLabel(palier)} · ${nameOf(target)}`);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      rulesOf(pendingDelete).forEach((r) => removeNotifRule(r));
      haptics.success();
    }
    setPendingDelete(null);
    setStep('list');
  };

  const titles = {
    list: 'Notifications',
    pick: 'Nouvelle notification',
    confirm: 'Supprimer les notifications ?',
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
        {activeTargets.length === 0 ? (
          // 1.41 : vraiment centré dans la hauteur disponible
          <View style={styles.centerFill}><Text style={styles.empty}>Aucune notification active</Text></View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} showsVerticalScrollIndicator={false}>
            {activeTargets.map((t) => {
              const n = rulesOf(t).length;
              return (
                <TouchableOpacity key={`${t.target}:${t.key}`} style={[styles.row, rowTint(colorOf(t))]} onPress={() => openTarget(t)} activeOpacity={0.7}>
                  {renderTargetLabel(t)}
                  <Text style={styles.count}>{n} notif{n > 1 ? 's' : ''}</Text>
                  <TouchableOpacity
                    onPress={() => { haptics.light(); setPendingDelete(t); setStep('confirm'); }}
                    hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.danger} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        <AddBox color={theme.colors.text} onPress={() => { haptics.light(); setStep('pick'); }} />
      </>
    );
  } else if (step === 'pick') {
    body = (
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} showsVerticalScrollIndicator={false}>
        {allTargets.map((t) => (
          <TouchableOpacity key={`${t.target}:${t.key}`} style={[styles.row, rowTint(colorOf(t))]} onPress={() => openTarget(t)} activeOpacity={0.7}>
            {renderTargetLabel(t)}
            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  } else if (step === 'target' && target) {
    // 1.41 : les 5 paliers toujours listés, à cocher / décocher (comme la sélection des bandeaux)
    const active = new Set(rulesOf(target).map((r) => r.palier));
    const c = colorOf(target);
    body = (
      <>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} showsVerticalScrollIndicator={false}>
          {PALIERS.map((p) => {
            const on = active.has(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.row, on ? rowTint(c) : { borderColor: rgba(c, 0.3) }]}
                onPress={() => togglePalier(p.id, on)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name={on ? 'bell' : 'bell-outline'} size={18} color={on ? c : theme.colors.textMuted} />
                <Text style={[styles.label, { flex: 1, color: on ? theme.colors.text : theme.colors.textMuted }]}>{p.label}</Text>
                {on && <MaterialCommunityIcons name="check" size={18} color={c} />}
              </TouchableOpacity>
            );
          })}
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
    const n = rulesOf(pendingDelete).length;
    body = (
      <View style={styles.centerFill}>
        <Text style={styles.confirmText}>
          {n > 1 ? `Les ${n} notifications de ` : 'La notification de '}
          {nameOf(pendingDelete)}
          {n > 1 ? ' seront supprimées.' : ' sera supprimée.'}
        </Text>
        <View style={styles.confirmActions}>
          <TouchableOpacity onPress={() => setStep('list')} style={styles.actionBtn}>
            <Text style={styles.actionMuted}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDelete} style={styles.actionBtn}>
            <Text style={styles.actionDanger}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    // Retour Android : ferme complètement ; le chevron « < » revient d'un écran (ferme depuis la liste)
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
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
  emptyWrap: { height: 200, justifyContent: 'center' },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Lignes en haut, bouton + en bas (1.29) ; messages vides et confirmation centrés
  bodyFixed: { height: 292, justifyContent: 'space-between' },
  bodyPick: { maxHeight: 460 },
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
  // 1.41 : nombre de notifs plus lisible (info principale de la ligne avec le nom)
  count: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '600' },
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
