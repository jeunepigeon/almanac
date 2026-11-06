import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Switch,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import { useStore } from '../store';
import { dbGetSnapshotData, dbGetAllConsumptions } from '../db';
import ConfirmModal from '../components/ConfirmModal';
import ActionSheet from '../components/ActionSheet';
import ExportIcon from '../components/ExportIcon';
import ImportIcon from '../components/ImportIcon';
import InfoModal from '../components/InfoModal';
import ResultModal from '../components/ResultModal';
import SubstanceSelectModal from '../components/SubstanceSelectModal';
import ExportWizard from '../components/ExportWizard';
import ImportWizard from '../components/ImportWizard';
import RestoreWizard from '../components/RestoreWizard';
import NotifWizard from '../components/NotifWizard';
import ShareModal from '../components/ShareModal';
import ToggleListModal from '../components/ToggleListModal';
import CustomBannerNameModal from '../components/CustomBannerNameModal';
import DayDetailModal from '../components/DayDetailModal';
import { deviceHasLock, authenticate } from '../components/AppLock';
import { scheduleTestNotification } from '../utils/notifications';
import { KDF_NATIVE_AVAILABLE, getLastKdfEngine } from '../utils/exportImport';
import { fmtDateTiretHM, fmtSize, parseSnapshot, withNotifCounts } from '../utils/snapshots';
import { useKeepAwake } from '../utils/keepAwake';
import appJson from '../../app.json';

import { JS_VERSION, JS_NOTES } from '../version';

const APP_VERSION = JS_VERSION;                       // version du code (suit les mises à jour sans build)
const APK_VERSION = appJson?.expo?.version || '?';   // version de l'APK installé

// Mises à jour sans build (EAS Update, 1.30) — require paresseux : jamais de plantage si absent
let Updates = null;
try { Updates = require('expo-updates'); } catch (e) { Updates = null; }

function formatDateLongFR(ts) {
  const d = new Date(ts);
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  useKeepAwake('settings-screen');
  const substances = useStore((s) => s.substances);
  const archivedSubstances = useStore((s) => s.archivedSubstances);
  const snapshots = useStore((s) => s.snapshots);
  const wipeAll = useStore((s) => s.wipeAll);
  const createSnapshotFromLive = useStore((s) => s.createSnapshotFromLive);
  const deleteSnapshotFn = useStore((s) => s.deleteSnapshot);
  const markSnapshotsConsulted = useStore((s) => s.markSnapshotsConsulted);
  const loadSnapshots = useStore((s) => s.loadSnapshots);

  const [pendingWipeStep, setPendingWipeStep] = useState(0);
  const [wipeToastVisible, setWipeToastVisible] = useState(false);

  const [snapshotAction, setSnapshotAction] = useState(null);
  const [pendingSnapDelete, setPendingSnapDelete] = useState(null);
  const [restoreSnapId, setRestoreSnapId] = useState(null);
  const [importWizardVisible, setImportWizardVisible] = useState(false);
  const [createSnapshotModal, setCreateSnapshotModal] = useState(false);
  const [infoModal, setInfoModal] = useState(null);
  const [otaBusy, setOtaBusy] = useState(false);

  // Cherche une mise à jour EAS, la télécharge et redémarre l'app dessus (sinon : appliquée au prochain lancement)
  const checkOta = async () => {
    if (!Updates?.isEnabled) {
      setInfoModal({ title: 'Mises à jour', message: 'Indisponible dans cette version (ou en mode développement).' });
      return;
    }
    setOtaBusy(true);
    try {
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) {
        setOtaBusy(false);
        setInfoModal({ title: 'Mises à jour', message: "L'app est à jour." });
        return;
      }
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (e) {
      setOtaBusy(false);
      setInfoModal({ title: 'Mises à jour', message: `Échec :\n${e?.message || e}` });
    }
  };
  const [notifOpen, setNotifOpen] = useState(false);
  const appLockEnabled = useStore((s) => s.appLockEnabled);
  const notifRules = useStore((s) => s.notifRules);
  const lastNotifTap = useStore((s) => s.lastNotifTap);
  const lastBannerFlash = useStore((s) => s.lastBannerFlash);
  const substancesPageMounts = useStore((s) => s.substancesPageMounts);
  const notifTrace = useStore((s) => s.notifTrace);

  // --- Debug notifications (1.26) : Toutes / bandeau violet / une substance / 1re notif active ---
  const debugNotifTargets = () => {
    const subs = substances;
    const count = {};
    for (const x of subs) count[x.color] = (count[x.color] || 0) + 1;
    const cats = Object.keys(count).filter((c) => count[c] >= 2);
    const violet = cats.includes('#9C28B1') ? '#9C28B1' : cats[0];
    const out = [{ id: 'all', label: 'Notif test : toutes substances', target: { target: 'all', key: null }, color: theme.colors.text }];
    if (violet) out.push({ id: 'color', label: `Notif test : catégorie${violet === '#9C28B1' ? ' violette' : ''}`, target: { target: 'color', key: violet }, color: violet });
    if (subs[0]) out.push({ id: 'sub', label: `Notif test : ${subs[0].name}`, target: { target: 'sub', key: subs[0].id }, color: subs[0].color });
    const r = notifRules[0];
    if (r) out.push({ id: 'rule', label: 'Notif test : 1re notification active', target: { target: r.target, key: r.key }, color: theme.colors.textMuted });
    return out;
  };
  const sendDebugNotif = async (d) => {
    const ok = await scheduleTestNotification(d.target, 10);
    setInfoModal(ok
      ? { title: 'Notification programmée', message: 'Elle arrive dans 10 secondes. L\'app peut être fermée pour tester le tap depuis l\'extérieur.' }
      : { title: 'Notifications désactivées', message: "Les notifications d'Almanac sont à autoriser dans les réglages du téléphone." });
  };
  const setAppLockEnabled = useStore((s) => s.setAppLockEnabled);

  // Activer / désactiver le verrouillage : confirmé par le déverrouillage du téléphone
  const toggleAppLock = async (next) => {
    if (next && !(await deviceHasLock())) {
      setInfoModal({ title: 'Aucun verrouillage', message: "Ce téléphone n'a ni empreinte ni code configuré. Configure un verrouillage d'écran pour utiliser cette option." });
      return;
    }
    const ok = await authenticate(next ? 'Activer le verrouillage' : 'Désactiver le verrouillage');
    if (ok) setAppLockEnabled(next);
  };

  // ExportWizard source : live ou snapshot
  const [exportSource, setExportSource] = useState(null);
  const [liveStatsById, setLiveStatsById] = useState({});

  // Debug button : liste de modals textuelles à parcourir
  const [debugModals, setDebugModals] = useState([]);
  const [debugIdx, setDebugIdx] = useState(0);

  // 1.32 : les sauvegardes sont marquées « consultées » en QUITTANT la page (et plus à l'arrivée) :
  // les points rouges restent visibles pendant la visite et la page n'est plus redessinée
  // pendant qu'on la fait défiler (cause probable du retour en haut).
  useFocusEffect(
    useCallback(() => () => { markSnapshotsConsulted(); }, [markSnapshotsConsulted])
  );

  useEffect(() => { loadSnapshots(); }, []); // eslint-disable-line

  // 1.32 : date de la 1re prise lue dans le stock en mémoire (plus de lecture en base après affichage)
  const allConsumptions = useStore((s) => s.allConsumptions);
  const firstConsoTs = useMemo(() => {
    let min = null;
    for (const c of allConsumptions) if (min == null || c.timestamp < min) min = c.timestamp;
    return min;
  }, [allConsumptions]);

  // 1.31 : compteurs lus directement dans la liste des sauvegardes (stockés à la création).
  // 1.32 : calculés pendant le rendu (avant : 2e rendu via un effet)
  const snapshotStats = useMemo(() => {
    const stats = {};
    for (const s of snapshots) {
      if (s.cons_count == null) continue;
      stats[s.id] = { substancesCount: s.subs_count || 0, consumptionsCount: s.cons_count || 0, size: s.size || 0 };
    }
    return stats;
  }, [snapshots]);

  const statsFromConsos = (consos) => {
    const byId = {};
    const now = Date.now();
    for (const c of consos) {
      const sid = c.substance_id ?? c.substanceId;
      if (!byId[sid]) byId[sid] = { consCount: 0, firstTs: null };
      byId[sid].consCount++;
      if (byId[sid].firstTs == null || c.timestamp < byId[sid].firstTs) byId[sid].firstTs = c.timestamp;
    }
    const out = {};
    for (const sid of Object.keys(byId)) {
      const b = byId[sid];
      out[sid] = {
        consCount: b.consCount,
        days: b.firstTs ? Math.max(1, Math.round((now - b.firstTs) / 86400000)) : 0,
      };
    }
    return out;
  };

  const openExportLive = async () => {
    const consos = await dbGetAllConsumptions();
    // Substances COMPLÈTES (icône, position, date de création…) — bug 1.16 → 1.19 : seuls id/nom/couleur
    // étaient transmis, d'où des exports sans icônes ni ordre.
    const subs = [...substances, ...archivedSubstances].map((s) => ({ ...s }));
    setExportSource({ subs, consos, statsById: withNotifCounts(statsFromConsos(consos), useStore.getState().notifRules), banners: useStore.getState().colorBanners, notifs: useStore.getState().notifRules });
  };

  const openExportSnapshot = async (snapId) => {
    const data = await dbGetSnapshotData(snapId);
    if (!data) {
      setInfoModal({ title: 'Erreur', message: 'Snapshot introuvable.' });
      return;
    }
    const parsed = parseSnapshot(data);
    const subs = parsed.substances.map((s) => ({ ...s })); // complètes (icône, position, date…)
    const consos = parsed.consumptions.map((c) => ({
      id: c.id, substance_id: c.substanceId, timestamp: c.timestamp,
      dosage: c.dosage, notes: c.notes, created_at: c.createdAt,
    }));
    setExportSource({ subs, consos, statsById: withNotifCounts(statsFromConsos(consos), parsed.notifs), banners: parsed.banners || [], notifs: parsed.notifs || [] });
  };

  const openImportWizard = () => setImportWizardVisible(true);

  const openCreateSnapshotModal = async () => {
    const consos = await dbGetAllConsumptions();
    setLiveStatsById(withNotifCounts(statsFromConsos(consos), useStore.getState().notifRules));
    setCreateSnapshotModal(true);
  };

  // Debug : enchaîne les VRAIES modals de l'app (celles qui ne font qu'info + OK, pas celles
  // avec logique de confirmation / sélection substance).
  const openDebugModals = () => {
    const list = [
      {
        kind: 'result-ok',
        title: 'Sauvegarde enregistrée',
        message: 'almanac-export-27-10-2026-0049.almanac\n1714 prises · 26 substances',
      },
      {
        kind: 'result-ko',
        title: "La sauvegarde n'a pas pu aboutir",
        message: "Permission d'écriture refusée\nou dossier non sélectionné.",
      },
      {
        kind: 'result-ko',
        title: "La sauvegarde n'a pas pu aboutir",
        message: "Erreur SAF :\n[createFile] IOException: Could not write to file",
      },
      {
        kind: 'result-ok',
        title: 'Import terminé',
        message: '2 nouvelles · 24 fusionnées · 0 déjà présentes\n1714 prises importées · 0 déjà présentes',
      },
      {
        kind: 'result-ok',
        title: 'Import terminé',
        message: '0 nouvelles · 0 fusionnées · 26 déjà présentes\n0 prises importées · 1714 déjà présentes',
      },
      {
        kind: 'result-ko',
        title: "L'import n'a pas pu aboutir",
        message: 'Format de fichier invalide.',
      },
      {
        kind: 'result-ok',
        title: 'Restauration terminée',
        message: '0 nouvelles · 26 fusionnées · 0 déjà présentes\n1714 prises restaurées · 0 déjà présentes',
      },
      {
        kind: 'info',
        title: 'Sauvegarde créée',
        message: 'Une sauvegarde a été créée.\nRestaurable ou supprimable définitivement depuis Paramètres.',
      },
      {
        kind: 'info',
        title: 'Erreur création sauvegarde',
        message: 'Database locked.\nNouvel essai possible dans quelques secondes.',
      },
      {
        kind: 'info',
        title: 'Erreur',
        message: 'Snapshot introuvable.',
      },
      // 1.42 — fenêtres ajoutées depuis, en démonstration (les boutons ne font rien, sauf passer)
      { kind: 'info', title: `Almanac mis à jour · ${JS_VERSION}`, message: JS_NOTES.map((n) => `· ${n}`).join('\n') },
      { kind: 'info', title: 'Image enregistrée', message: 'almanac-06-11-2026-1805.png\ndans Pictures/Almanac\n\nAppui long sur Enregistrer pour changer de dossier.' },
      { kind: 'info', title: "Le partage n'a pas pu aboutir", message: 'Partage indisponible sur ce téléphone.' },
      { kind: 'share' },
      { kind: 'toggle-banners' },
      { kind: 'toggle-banners-confirm' },
      { kind: 'subs-select' },
      { kind: 'custom-name' },
      { kind: 'custom-actions' },
      { kind: 'confirm', title: 'Désactiver ce bandeau ?', message: 'bandeau' },
      { kind: 'confirm', title: 'Supprimer ce bandeau ?', message: 'Le bandeau « Sobre de mes soirées » et ses notifications\nseront supprimés définitivement. Pour le retrouver, il faudra le recréer.', confirm: 'Supprimer' },
      { kind: 'confirm', title: 'Supprimer cette prise ?', message: 'Nicotine · 17:42\nLa prise sera supprimée définitivement.', confirm: 'Supprimer' },
      { kind: 'toggle-counters' },
      { kind: 'notif-list' },
      { kind: 'notif-target' },
      { kind: 'last24' },
    ];
    setDebugModals(list);
    setDebugIdx(0);
  };

  const allSubsForModal = [...substances, ...archivedSubstances]
    .map((s) => ({ id: s.id, name: s.name, color: s.color }));

  return (
    // Les modals (wizards, confirmations) sont rendues HORS de la ScrollView :
    // sinon la ScrollView parente intercepte le 1er tap quand le clavier est ouvert
    // et ferme le clavier au lieu de déclencher le bouton.
    <View style={styles.container}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* ===== SOUTENIR (sans titre, 1.26) ===== */}
      <View style={{ height: theme.spacing.md }} />
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Donations')}>
        <Text style={styles.rowLabel}>Soutenir le développement</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {/* ===== VERROUILLAGE + NOTIFICATIONS (sans titre) ===== */}
      <View style={{ height: theme.spacing.lg }} />
      <View style={styles.row}>
        <View style={[styles.rowLeft, { paddingRight: theme.spacing.md }]}>
          <MaterialCommunityIcons name="lock-outline" size={20} color={theme.colors.text} style={styles.rowIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Verrouiller Almanac</Text>
            <Text style={styles.rowDangerHint}>Empreinte ou code du téléphone à l'ouverture, puis après 5 min hors de l'app</Text>
          </View>
        </View>
        <Switch
          value={appLockEnabled}
          onValueChange={toggleAppLock}
          trackColor={{ false: theme.colors.border, true: theme.colors.textMuted }}
          thumbColor={appLockEnabled ? theme.colors.text : theme.colors.textMuted}
        />
      </View>

      <TouchableOpacity style={styles.row} onPress={() => setNotifOpen(true)}>
        <View style={styles.rowLeft}>
          {/* Cloche pleine dès qu'au moins une notification est active */}
          <MaterialCommunityIcons name={notifRules.length > 0 ? 'bell' : 'bell-outline'} size={20} color={theme.colors.text} style={styles.rowIcon} />
          <Text style={styles.rowLabel}>Gérer les notifications</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {/* ===== ACTIONS (sans titre) ===== */}
      <View style={{ height: theme.spacing.lg }} />
      <TouchableOpacity style={styles.row} onPress={openImportWizard}>
        <View style={styles.rowLeft}>
          <View style={styles.rowIcon}><ImportIcon size={18} color={theme.colors.text} /></View>
          <Text style={styles.rowLabel}>Importer</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={openExportLive}>
        <View style={styles.rowLeft}>
          <View style={styles.rowIcon}><ExportIcon size={18} color={theme.colors.text} /></View>
          <Text style={styles.rowLabel}>Exporter</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.rowNoBorder} onPress={openCreateSnapshotModal}>
        <View style={styles.rowLeft}>
          <Ionicons name="add" size={20} color={theme.colors.text} style={styles.rowIcon} />
          <Text style={styles.rowLabel}>Créer une sauvegarde</Text>
        </View>
      </TouchableOpacity>

      {/* ===== GESTIONNAIRE DE SAUVEGARDES = liste snapshots seule ===== */}
      <Text style={styles.sectionTitle}>Gestionnaire de sauvegardes</Text>
      {snapshots.length === 0 ? (
        <View style={styles.row}>
          <Text style={styles.rowValueFaint}>Aucune sauvegarde</Text>
        </View>
      ) : (
        snapshots.map((snap) => {
          const stats = snapshotStats[snap.id];
          return (
            <Pressable
              key={snap.id}
              onPress={() => setSnapshotAction({ snap })}
              style={({ pressed }) => [
                styles.snapRow,
                pressed && { backgroundColor: theme.colors.surface },
              ]}
            >
              <View style={styles.snapContent}>
                <View style={styles.snapNameRow}>
                  {!snap.consulted && <View style={styles.redDotSmall} />}
                  <Text style={styles.snapName}>{snap.name}</Text>
                </View>
                {stats && (
                  <Text style={styles.snapInfo}>
                    {stats.substancesCount} substance{stats.substancesCount > 1 ? 's' : ''} · {stats.consumptionsCount} consos · {fmtSize(stats.size)}
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons name="dots-horizontal" size={20} color={theme.colors.textMuted} />
            </Pressable>
          );
        })
      )}

      {/* ===== ZONE DE DANGER (sans titre : la ligne rouge suffit) ===== */}
      <View style={{ height: theme.spacing.lg }} />
      <TouchableOpacity style={styles.row} onPress={() => setPendingWipeStep(1)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabelDanger}>Remise à zéro complète</Text>
          <Text style={styles.rowDangerHint}>Vos données resteront dans le gestionnaire de sauvegardes</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.danger} />
      </TouchableOpacity>

      {/* ===== DEBUG ===== */}
      <Text style={styles.sectionTitle}>Debug</Text>
      <TouchableOpacity style={styles.row} onPress={openDebugModals}>
        <Text style={styles.rowLabel}>Afficher toutes les modals textuelles</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>
      {/* Mises à jour sans build : version chargée + recherche manuelle */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Code chargé</Text>
        <Text style={styles.rowValue}>
          {!Updates?.isEnabled
            ? `APK ${APK_VERSION} · mises à jour inactives`
            : Updates.isEmbeddedLaunch
              ? `intégré à l'APK ${APK_VERSION} · ${Updates.channel || '—'}`
              : `mise à jour ${String(Updates.updateId || '').slice(0, 8)} · ${Updates.createdAt ? new Date(Updates.createdAt).toLocaleDateString('fr-FR') : ''}`}
        </Text>
      </View>
      <TouchableOpacity style={styles.row} onPress={checkOta} disabled={otaBusy}>
        <Text style={styles.rowLabel}>{otaBusy ? 'Recherche…' : 'Chercher une mise à jour'}</Text>
        <MaterialCommunityIcons name="cloud-download-outline" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>
      {/* Chiffrement : module natif détecté ? moteur utilisé au dernier export / import */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Chiffrement natif</Text>
        <Text style={styles.rowValue}>{KDF_NATIVE_AVAILABLE ? 'disponible' : 'indisponible'} · dernier : {getLastKdfEngine()}</Text>
      </View>
      {/* Diagnostic : dernier tap reçu sur une notification (cible + heure + chemin) */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Dernier tap notif</Text>
        <Text style={styles.rowValue}>
          {lastNotifTap
            ? `${lastNotifTap.target} · ${new Date(lastNotifTap.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${lastNotifTap.via}`
            : 'aucun'}
        </Text>
      </View>
      {/* 1.34 : trace du dernier tap notification → page → flash (temps depuis le tap) */}
      <View style={styles.traceBox}>
        <Text style={styles.rowLabel}>Trace dernière notif</Text>
        {notifTrace.length === 0 ? (
          <Text style={styles.traceLine}>aucune</Text>
        ) : notifTrace.map((e, i) => (
          <Text key={i} style={styles.traceLine}>
            {`+${((e.at - notifTrace[0].at) / 1000).toFixed(2)} s  ${e.step}${e.info ? ` · ${e.info}` : ''}`}
          </Text>
        ))}
      </View>
      {/* Tap : rejoue ce flash (retour à la liste + même logique que le tap sur une notification) */}
      <TouchableOpacity
        style={styles.row}
        disabled={!lastBannerFlash}
        onPress={() => {
          const id = lastBannerFlash?.id;
          if (!id) return;
          useStore.getState().traceNotif('rejeu depuis Debug', id, true);
          navigation.navigate('Main', undefined, { pop: true }); // 1.35 : pas de 2e écran principal empilé
          if (id === '__sobre') useStore.getState().requestNotifFocus('all');
          else {
            const e = id.replace('banner:', ''); // 1.41 : couleur, custom:<id> ou record
            if (e.startsWith('custom:')) useStore.getState().requestNotifFocus('custom', e.slice(7));
            else if (e === 'record') useStore.getState().requestNotifFocus('record');
            else useStore.getState().requestNotifFocus('color', e);
          }
        }}
      >
        <Text style={styles.rowLabel}>Dernier flash bandeau</Text>
        <Text style={styles.rowValue}>
          {lastBannerFlash
            ? `${lastBannerFlash.id === '__sobre' ? 'sobre de tout' : lastBannerFlash.id.replace('banner:', 'bandeau ')} · ${new Date(lastBannerFlash.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
            : 'aucun'}
        </Text>
      </TouchableOpacity>
      {/* 1.32 : diagnostic de la sortie du mode réorganisation (1 = jamais remontée) */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Montages page Substances</Text>
        <Text style={styles.rowValue}>{substancesPageMounts}</Text>
      </View>
      {/* Vraies notifications (même logique que les paliers), envoyées dans 10 s */}
      {debugNotifTargets().map((d) => (
        <TouchableOpacity key={d.id} style={styles.row} onPress={() => sendDebugNotif(d)}>
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="bell-ring-outline" size={18} color={d.color} style={styles.rowIcon} />
            <Text style={styles.rowLabel}>{d.label}</Text>
          </View>
          <Text style={styles.rowValue}>10 s</Text>
        </TouchableOpacity>
      ))}

      {/* ===== À PROPOS ===== */}
      <Text style={styles.sectionTitle}>À propos</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Version</Text>
        <Text style={styles.rowValue}>{APP_VERSION}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Consos enregistrées depuis</Text>
        <Text style={styles.rowValue}>
          {firstConsoTs ? formatDateLongFR(firstConsoTs) : '—'}
        </Text>
      </View>

      <View style={styles.creditWrap}>
        <Text style={styles.creditText}>almanac — développé par pigeon</Text>
      </View>
    </ScrollView>

      {/* Action sheet snapshot */}
      <ActionSheet
        visible={!!snapshotAction}
        title={snapshotAction?.snap?.name}
        items={
          snapshotAction
            ? [
                {
                  id: 'restore',
                  label: 'Restaurer / Fusionner',
                  icon: 'set-merge',
                  onPress: () => {
                    const sid = snapshotAction.snap.id;
                    setSnapshotAction(null);
                    setRestoreSnapId(sid);
                  },
                },
                {
                  id: 'export',
                  label: 'Exporter',
                  icon: 'download-outline',
                  onPress: async () => {
                    const sid = snapshotAction.snap.id;
                    setSnapshotAction(null);
                    await openExportSnapshot(sid);
                  },
                },
                {
                  id: 'delete',
                  label: 'Supprimer définitivement',
                  icon: 'trash-can-outline',
                  destructive: true,
                  onPress: () => {
                    setPendingSnapDelete(snapshotAction.snap);
                    setSnapshotAction(null);
                  },
                },
              ]
            : []
        }
        onClose={() => setSnapshotAction(null)}
      />

      <ConfirmModal
        visible={!!pendingSnapDelete}
        title="Supprimer cette sauvegarde ?"
        message={
          pendingSnapDelete
            ? `"${pendingSnapDelete.name}" sera effacé définitivement. Cette action est irréversible.`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setPendingSnapDelete(null)}
        onConfirm={async () => {
          if (pendingSnapDelete) await deleteSnapshotFn(pendingSnapDelete.id);
          setPendingSnapDelete(null);
        }}
      />

      <ConfirmModal
        visible={pendingWipeStep === 1}
        title="Remise à zéro complète"
        message="Vos données seront remises à zéro. Une sauvegarde fantôme sera créée automatiquement et sera restaurable via les paramètres. Continuer ?"
        confirmLabel="Continuer"
        destructive
        onCancel={() => setPendingWipeStep(0)}
        onConfirm={() => setPendingWipeStep(2)}
      />

      <ConfirmModal
        visible={pendingWipeStep === 2}
        title="Confirmer l'effacement"
        message="Cette action est définitive. Une sauvegarde automatique va être créée avant."
        confirmLabel="Effacer tout"
        destructive
        onCancel={() => setPendingWipeStep(0)}
        onConfirm={async () => {
          await wipeAll();
          setPendingWipeStep(0);
          setWipeToastVisible(true);
        }}
      />

      <NotifWizard visible={notifOpen} onClose={() => setNotifOpen(false)} />

      <InfoModal
        visible={wipeToastVisible}
        title="Sauvegarde créée"
        message={'Une sauvegarde a été créée.\nRestaurable ou supprimable définitivement depuis Paramètres.'}
        onClose={() => { setWipeToastVisible(false); navigation.goBack(); }}
      />

      {/* ===== Wizards ===== */}
      <ExportWizard
        visible={!!exportSource}
        substances={exportSource?.subs || []}
        statsById={exportSource?.statsById || {}}
        consumptions={exportSource?.consos || []}
        banners={exportSource?.banners || []}
        notifs={exportSource?.notifs || []}
        onClose={() => setExportSource(null)}
      />

      <ImportWizard
        visible={importWizardVisible}
        onClose={() => setImportWizardVisible(false)}
      />

      <RestoreWizard
        visible={!!restoreSnapId}
        snapshotId={restoreSnapId}
        onClose={() => setRestoreSnapId(null)}
      />

      {/* ===== Créer sauvegarde modal ===== */}
      <SubstanceSelectModal
        visible={createSnapshotModal}
        title="Créer une sauvegarde"
        showNameField
        nameFieldLabel="Nom (optionnel)"
        nameFieldPlaceholder="sauvegarde"
        nameHint={(n) => `→ ${(n || 'sauvegarde').trim().replace(/\s+/g, '-').toLowerCase()}-${fmtDateTiretHM()}`}
        substances={allSubsForModal}
        statsById={liveStatsById}
        confirmLabel="Créer"
        onCancel={() => setCreateSnapshotModal(false)}
        onConfirm={async (ids, nameInput) => {
          const base = (nameInput || 'sauvegarde').trim().replace(/\s+/g, '-').toLowerCase();
          const fullName = `${base}-${fmtDateTiretHM()}`;
          try {
            await createSnapshotFromLive(fullName, ids);
            setCreateSnapshotModal(false);
          } catch (e) {
            setCreateSnapshotModal(false);
            setInfoModal({ title: 'Erreur création sauvegarde', message: e.message || String(e) });
          }
        }}
      />

      <InfoModal
        visible={!!infoModal}
        title={infoModal?.title}
        message={infoModal?.message}
        onClose={() => setInfoModal(null)}
      />

      {/* Debug : enchaîne les vraies modals */}
      {debugModals.length > 0 && debugIdx < debugModals.length && (() => {
        const m = debugModals[debugIdx];
        const label = debugIdx === debugModals.length - 1 ? 'Fermer' : 'Suivant';
        const close = () => {
          const next = debugIdx + 1;
          if (next >= debugModals.length) { setDebugModals([]); setDebugIdx(0); }
          else setDebugIdx(next);
        };
        const subs = useStore.getState().substances;
        const firstSub = subs[0];
        const sampleColor = firstSub?.color || theme.colors.text;
        if (m.kind === 'share') return <ShareModal visible demo onClose={close} />;
        if (m.kind === 'toggle-banners' || m.kind === 'toggle-banners-confirm') {
          return (
            <ToggleListModal
              key={m.kind}
              visible
              title="Bandeaux"
              options={[
                { id: '__sobre', color: theme.colors.text, label: 'Sobre de tout', checked: true, removeConfirm: m.kind === 'toggle-banners-confirm' ? 'Le bandeau « Sobre de tout » et ses notifications seront désactivés.' : null },
                { id: 'record', color: theme.colors.text, label: 'Plus longue sobriété de tout', checked: false },
                { id: 'last24', color: theme.colors.text, label: 'Dernières 24 h', checked: true },
                { id: 'c', color: sampleColor, label: subs.slice(0, 2).map((x) => x.name).join(' • ') || 'Catégorie', checked: true },
              ]}
              actions={[{ id: 'custom', label: 'Bandeau personnalisé', icon: 'plus', onPress: () => {} }]}
              footer={m.kind === 'toggle-banners-confirm' ? 'Démo : toucher « Sobre de tout » affiche la confirmation.' : null}
              onToggle={() => {}}
              onClose={close}
            />
          );
        }
        if (m.kind === 'toggle-counters') {
          return (
            <ToggleListModal
              visible
              title="Compteurs"
              options={[
                { id: 'prev', label: 'Période de sobriété précédente', color: sampleColor, checked: true },
                { id: 'record', label: 'Plus longue période sobre', color: sampleColor, checked: false },
              ]}
              onToggle={() => {}}
              onClose={close}
            />
          );
        }
        if (m.kind === 'subs-select') {
          return (
            <SubstanceSelectModal
              visible
              title="Bandeau personnalisé"
              intro="Substances du bandeau (au moins 2)."
              substances={subs}
              initialSelectedIds={[]}
              confirmLabel="Suivant"
              onConfirm={close}
              onCancel={close}
            />
          );
        }
        if (m.kind === 'custom-name') return <CustomBannerNameModal visible initialName="" onConfirm={close} onCancel={close} />;
        if (m.kind === 'custom-actions') {
          return (
            <ActionSheet
              visible
              title="Sobre de mes soirées"
              items={[
                { id: 'rename', label: 'Renommer', icon: 'pencil-outline', onPress: () => {} },
                { id: 'subs', label: 'Substances incluses', icon: 'format-list-checks', onPress: () => {} },
              ]}
              onClose={close}
            />
          );
        }
        if (m.kind === 'confirm') {
          return (
            <ConfirmModal
              visible
              title={m.title}
              message={m.message === 'bandeau' ? (
                <Text>
                  {'Le bandeau '}
                  <Text style={{ color: sampleColor, fontSize: 18 }}>●</Text>
                  {' et ses notifications seront désactivés. Réactivable depuis le '}
                  <Text style={{ fontWeight: '900', color: theme.colors.text }}>+</Text>
                  {'. Les substances et leurs prises ne sont pas affectées.'}
                </Text>
              ) : m.message}
              cancelLabel="Annuler"
              confirmLabel={m.confirm || 'Désactiver'}
              destructive
              onCancel={close}
              onConfirm={close}
            />
          );
        }
        if (m.kind === 'notif-list') return <NotifWizard visible demo onClose={close} />;
        if (m.kind === 'notif-target') {
          return <NotifWizard visible demo initialTarget={firstSub ? { target: 'sub', key: firstSub.id } : { target: 'all', key: null }} onClose={close} />;
        }
        if (m.kind === 'last24') {
          const from = Date.now() - 24 * 3600 * 1000;
          const byId = Object.fromEntries(subs.map((x) => [x.id, x]));
          const list = useStore.getState().allConsumptions.filter((c) => c.timestamp > from).sort((a, b) => a.timestamp - b.timestamp);
          return (
            <DayDetailModal
              visible
              title="Dernières 24 h"
              consumptions={list}
              substancesById={byId}
              onTapConsumption={() => {}}
              onDeleteConsumption={() => {}}
              onAddPress={() => {}}
              onClose={close}
            />
          );
        }
        if (m.kind === 'result-ok' || m.kind === 'result-ko') {
          return (
            <ResultModal
              visible
              ok={m.kind === 'result-ok'}
              title={m.title}
              message={m.message}
              buttonLabel={label}
              onClose={close}
            />
          );
        }
        return (
          <InfoModal
            visible
            title={m.title}
            message={m.message}
            buttonLabel={label}
            onClose={close}
          />
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  traceBox: {
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: 3,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  traceLine: { color: theme.colors.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingVertical: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  // Variante sans border-bottom pour la dernière ligne d'un groupe (Créer sauvegarde)
  rowNoBorder: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowIcon: { marginRight: theme.spacing.md },
  rowLabel: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowLabelDanger: { color: theme.colors.danger, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowDangerHint: { color: theme.colors.textMuted, fontSize: theme.font.sizes.xs, fontWeight: '400', marginTop: 3 },
  rowValue: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300' },
  rowValueFaint: { color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontStyle: 'italic' },
  snapRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  snapContent: { flex: 1 },
  snapNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  redDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B30' },
  snapName: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300' },
  snapInfo: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, marginTop: 3, fontWeight: '300' },
  creditWrap: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  creditText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    letterSpacing: 2,
    textTransform: 'lowercase',
  },
});
