// Grille des bandeaux de la liste (1.48) : 1 ou 2 colonnes, réorganisation, bascule par languette.
//
// Disposition
//  - 1 colonne : bandeaux pleine largeur (hauteur BANNER_HEIGHT).
//  - 2 colonnes : demi-cases = bandeau entier réduit à HALF_SCALE (marges réduites). Nombre impair →
//    la 1re case est un bandeau normal pleine largeur. Ordre lu ligne par ligne.
//  - Moins de 2 bandeaux : toujours 1 colonne (le parent repasse le réglage à 1).
//  - Toute variation (ajout, suppression, bascule) : chaque case glisse / change de taille vers sa
//    nouvelle place PENDANT le fondu (même durée), la grille et la pilule « + » suivent en même temps.
//
// Réorganisation (même logique que la liste : 1er appui long = mode, puis appui long = saisie)
//  - Vertical, dans sa colonne : les autres bandeaux de la colonne sont chassés en direct, trait fin
//    (55 % de la colonne) à la place visée ; butées haut / bas de la grille : vibration + trait au bord.
//  - Horizontal : doigt dans l'autre colonne → échange avec le bandeau sous le doigt (il part dans
//    l'emplacement vide, vibration). Retour dans sa colonne → l'échange est annulé.
//  - Case large (nombre impair) : y entrer = échange ; la saisir puis la poser ailleurs = échange.
//    La copie prend la taille de sa future place (large / demi) dès l'échange.
//  - Côtés : la copie s'arrête au bord de l'écran (sans vibration ni trait).
//
// Bascule 1 ↔ 2 colonnes (à partir de 2 bandeaux), façon poubelle des stories :
//  - saisie → une languette sort du bord DROIT, juste sous la barre « Réorganisation » (1.49) ;
//    pas de languette quand on tient la case large (en 2 colonnes, elle se déplace seulement) ;
//  - doigt sur la languette → cadre en pointillés à la future place du bandeau tenu, reste assombri :
//    1 → 2 colonnes : toujours une petite case (la 1re ; nombre impair → sous la case large, que prend
//    le 1er des autres) ; 2 → 1 colonne : pleine largeur en haut (le bandeau tenu devient le 1er) ;
//  - doigt dans le cadre → aimant : le bandeau tenu prend la taille de la case et s'y colle (contour
//    blanc, vibration) ; ressortir annule ;
//  - lâcher dans le cadre → bascule ; la réorganisation continue.
// 1.49 : le centre de la copie reste sous le doigt (saisie, changement de taille).
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Pressable, TouchableOpacity, Easing, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import haptics from '../utils/haptics';
import { BANNER_HEIGHT, HALF_SCALE, FADE_MS } from './Banners';

const H1 = BANNER_HEIGHT;
const HH = BANNER_HEIGHT * HALF_SCALE;
export const SPACER_HEIGHT = 16;   // espace sous les bandeaux (pilule « + » posée sur la dernière ligne)
const PILL_HALF = 6;
const PILL_HIT = 30; // 1.51 : hauteur de la zone de toucher de la pilule « + »
const LONG_PRESS_MS = 400;
const SHIFT_MS = 140;              // glissement des autres pendant le drag (= liste)
const DROP_MS = 180;               // la case lâchée rejoint sa place
const MORPH_MS = FADE_MS;          // ajout / suppression / bascule : même durée que le fondu
const PICKUP_SCALE = 1.06;
const PICKUP_OPACITY = 0.92;
const BOUND_PX = 6;
const DIM = theme.dim;
const LANG = 32;                   // languette (cercle), à moitié sortie du bord droit
const LANG_TOP = 44;               // sous la barre « Réorganisation » (posée par-dessus le haut de la liste)
const LANG_VISIBLE = 16;           // 1.56 : à GAUCHE, moitié visible
const LANG_ZONE_X = 56;            // zone de survol de la languette (depuis le bord GAUCHE, 1.56)
const LANG_ZONE_PAD = 14;
const EASE = Easing.out(Easing.cubic);
const EASE_SOFT = Easing.inOut(Easing.cubic); // 1.49 : glissements pendant le fondu (pilule comprise)
const CENTER_MS = 150;             // la copie vient se centrer sous le doigt à la saisie
const LANG_COPY_SCALE = 0.7;       // 1.50 : la copie rétrécit un peu au-dessus de la languette

export const LANGUETTE = { size: LANG, top: LANG_TOP, visible: LANG_VISIBLE };
export function effectiveCols(columns, n) { return columns === 2 && n >= 2 ? 2 : 1; }

export function gridHeight(n, cols) {
  if (n <= 0) return 0;
  if (cols === 1) return n * H1;
  const odd = n % 2 === 1;
  return (odd ? H1 : 0) + ((n - (odd ? 1 : 0)) / 2) * HH;
}

// Géométrie de la case i (ordre lu ligne par ligne)
function geom(i, n, cols, W) {
  if (cols === 1) return { x: 0, y: i * H1, w: W, h: H1, s: 1, wide: true, col: -1 };
  const odd = n % 2 === 1;
  if (odd && i === 0) return { x: 0, y: 0, w: W, h: H1, s: 1, wide: true, col: -1 };
  const j = i - (odd ? 1 : 0);
  const row = Math.floor(j / 2); const col = j % 2;
  return { x: (col * W) / 2, y: (odd ? H1 : 0) + row * HH, w: W / 2, h: HH, s: HALF_SCALE, wide: false, col };
}
const keyOf = (g) => `${g.x}|${g.y}|${g.w}|${g.h}|${g.s}`;
const sameArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Une case : position / taille animées ; contenu = bandeau entier (largeur L) réduit à s
const Cell = memo(function Cell({
  item, anim, L, compact, col2, active, hidden, dimmed, isWiggling, phase,
  renderBanner, onTap, onLongPress, handlersRef,
}) {
  const idRef = useRef(item.id);
  idRef.current = item.id;
  const gesture = useMemo(() => Gesture.Pan()
    .enabled(!!active)
    .activateAfterLongPress(LONG_PRESS_MS)
    .runOnJS(true)
    .onStart((e) => handlersRef.current.start(idRef.current, e))
    .onUpdate((e) => handlersRef.current.move(e))
    .onEnd(() => handlersRef.current.end())
    .onFinalize(() => handlersRef.current.finalize()), [handlersRef, active]);

  const content = (
    <Animated.View style={[styles.content, { width: L, transform: [{ scale: anim.s }] }]}>
      {renderBanner(item, { compact, layoutWidth: L, inReorder: active, isWiggling, phase })}
    </Animated.View>
  );
  // 1.51 : même arbre en réorganisation ou non (le geste est seulement activé / désactivé) → pas de
  // remontage des bandeaux à l'entrée / sortie du mode (icônes qui bougeaient, clignotements)
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        // Case saisie : entièrement transparente (fond compris) → l'emplacement vide laisse voir la case qui y arrive
        style={[styles.cell, { left: anim.x, top: anim.y, width: anim.w, height: anim.h, opacity: hidden ? 0 : anim.o }]}
      >
        <View style={[StyleSheet.absoluteFill, dimmed && { opacity: DIM }]} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            disabled={active}
            onPress={() => onTap?.(item)}
            onLongPress={() => { haptics.medium(); onLongPress?.(); }}
            delayLongPress={LONG_PRESS_MS}
          >
            {content}
          </Pressable>
          <View pointerEvents="none" style={styles.lineBottom} />
          {col2 && <View pointerEvents="none" style={styles.lineRight} />}
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

export default function BannerGrid({
  items,                // bandeaux visibles, dans l'ordre : [{ id, entry, ... }]
  columns = 1,          // réglage (1 | 2)
  active,               // mode réorganisation
  heightAnim,           // Animated.Value : hauteur grille + espace (partagée avec la liste)
  renderBanner,         // (item, { compact, layoutWidth, inReorder, isWiggling, phase }) → bandeau
  onTap, onEnterReorder,
  onReorder,            // (ids) → nouvel ordre
  onToggleColumns,      // (cols, ids) → bascule + nouvel ordre (le bandeau tenu en 1er)
  onDragChange,         // (bool) → bloque le défilement de la liste
  onDimChange,          // (bool) → assombrit les substances (cadre de bascule affiché)
  onAddPress,           // pilule « + »
  showAdd = true,       // 1.51 : pilule « + » (cachée en dessous de 2 substances)
  externalLang = false, // 1.55 : languette dessinée par le parent (fixe à l'écran, visible en réorganisation)
  onLangActive = null,  // (bool) → bandeau tenu, bascule possible : la languette est mise en avant
  onLangHover = null,   // (bool) → survol aimanté de la languette
  getScrollY = () => 0, // défilement de la liste (la languette est fixe à l'écran, pas dans la grille)
  onLangCols = null,    // (cols) → icône de la languette
  onSlots = null,       // 1.52 : cases en pointillés dessinées par le parent, en haut de l'écran
  beforeToggle = null,  // 1.53 : () → ms d'attente (la liste remonte d'abord en haut), ou 0
}) {
  const { width: winW } = useWindowDimensions();
  const [W, setW] = useState(winW); // largeur réelle de la grille (mesurée)
  const liveIds = items.map((it) => it.id);
  const liveRef = useRef(liveIds);
  liveRef.current = liveIds;
  const byId = useRef({});
  items.forEach((it) => { byId.current[it.id] = it; });

  // --- Valeurs animées par case ---
  const anims = useRef({});      // id → { x, y, w, h, s, o }
  const targets = useRef({});    // id → clé de géométrie visée
  const lastGeom = useRef({});   // id → dernière géométrie visée (L / compact des fantômes)
  const mounted = useRef(false);
  const appearing = useRef([]); // cases créées après le 1er affichage : apparition en fondu
  const animOf = (id, g, appear) => {
    if (!anims.current[id]) {
      if (appear) appearing.current.push(id);
      anims.current[id] = {
        x: new Animated.Value(g.x), y: new Animated.Value(g.y), w: new Animated.Value(g.w),
        h: new Animated.Value(g.h), s: new Animated.Value(g.s), o: new Animated.Value(appear ? 0 : 1),
      };
      targets.current[id] = keyOf(g);
      lastGeom.current[id] = g;
    }
    return anims.current[id];
  };
  const moveTo = (id, g, dur, force = false) => {
    const a = anims.current[id];
    if (!a) return;
    const k = keyOf(g);
    if (!force && targets.current[id] === k) return;
    targets.current[id] = k;
    lastGeom.current[id] = g;
    if (!dur) { a.x.setValue(g.x); a.y.setValue(g.y); a.w.setValue(g.w); a.h.setValue(g.h); a.s.setValue(g.s); return; }
    Animated.parallel(['x', 'y', 'w', 'h', 's'].map((p) => Animated.timing(a[p], {
      toValue: g[p], duration: dur, easing: dur >= MORPH_MS ? EASE_SOFT : EASE, useNativeDriver: false,
    }))).start();
  };

  // --- Drag ---
  const [pickId, setPickId] = useState(null);
  const [arr, setArr] = useState(null);           // ordre provisoire pendant le drag
  const [stage, setStage] = useState(0);          // 0 normal · 1 cadre affiché · 2 aimanté
  const [bar, setBar] = useState(null);           // { x, y, w } trait fin
  const [copyType, setCopyType] = useState({ L: W, compact: false });
  const [pending, setPending] = useState(null);   // { ids, cols } : ordre lâché, en attente du parent
  // Copie : centre = doigt (fx, fy), décalage de saisie (ox, oy → 0), aimant m (0 → 1) vers le cadre (frx, fry)
  const copy = useRef({
    fx: new Animated.Value(0), fy: new Animated.Value(0), ox: new Animated.Value(0), oy: new Animated.Value(0),
    m: new Animated.Value(0), frx: new Animated.Value(0), fry: new Animated.Value(0),
    w: new Animated.Value(0), h: new Animated.Value(0),
    s: new Animated.Value(1), k: new Animated.Value(1), line: new Animated.Value(0), op: new Animated.Value(PICKUP_OPACITY),
  }).current;
  const copyPos = useMemo(() => {
    const free = (f, size, off) => Animated.add(Animated.subtract(f, Animated.multiply(size, 0.5)), off);
    const mix = (a, b) => Animated.add(Animated.multiply(a, Animated.subtract(1, copy.m)), Animated.multiply(b, copy.m));
    return { left: mix(free(copy.fx, copy.w, copy.ox), copy.frx), top: mix(free(copy.fy, copy.h, copy.oy), copy.fry) };
  }, [copy]);
  const langX = useRef(new Animated.Value(4000)).current;
  const drag = useRef({ id: null }).current;

  // Ordre affiché : drag en cours > ordre lâché en attente > ordre du parent
  let cols = effectiveCols(columns, liveIds.length);
  let order = liveIds;
  if (pickId && arr) order = arr;
  else if (pending && sameArr([...pending.ids].sort(), [...liveIds].sort())) {
    order = pending.ids;
    if (pending.cols) cols = effectiveCols(pending.cols, liveIds.length);
  }
  useEffect(() => {
    if (!pending) return;
    const colsOk = !pending.cols || pending.cols === columns;
    if (sameArr(pending.ids, liveIds) && colsOk) setPending(null);
  }, [pending, liveIds.join('|'), columns]); // eslint-disable-line
  useEffect(() => { // filet : le parent n'a pas suivi
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 1200);
    return () => clearTimeout(t);
  }, [pending]);

  const n = order.length;
  useEffect(() => { onLangCols?.(cols); }, [cols]); // eslint-disable-line

  // Bandeaux retirés : gardés en fondu à leur place pendant que les autres glissent
  const prevItems = useRef(items);
  const [ghosts, setGhosts] = useState([]);
  useLayoutEffect(() => {
    const cur = new Set(liveIds);
    const gone = prevItems.current.filter((it) => !cur.has(it.id) && anims.current[it.id]);
    prevItems.current = items;
    if (gone.length === 0) return;
    setGhosts((g) => [...g.filter((x) => !gone.some((y) => y.id === x.id)), ...gone]);
    gone.forEach((it) => {
      Animated.timing(anims.current[it.id].o, { toValue: 0, duration: FADE_MS, useNativeDriver: false }).start(() => {
        setGhosts((g) => g.filter((x) => x.id !== it.id));
        if (!liveRef.current.includes(it.id)) { delete anims.current[it.id]; delete targets.current[it.id]; }
        else anims.current[it.id].o.setValue(1); // revenu entre-temps
      });
    });
  }, [liveIds.join('|')]); // eslint-disable-line

  // Placement : chaque case vers sa géométrie (glissement court pendant le drag, sinon durée du fondu)
  const prevShape = useRef({ n: -1, cols: 0 });
  useLayoutEffect(() => {
    const structural = prevShape.current.n !== n || prevShape.current.cols !== cols;
    const first = !mounted.current;
    order.forEach((id, i) => {
      if (id === pickId) return;
      const g = geom(i, n, cols, W);
      animOf(id, g, !first);
      moveTo(id, g, first ? 0 : (pickId ? SHIFT_MS : (structural ? MORPH_MS : SHIFT_MS)));
    });
    appearing.current.splice(0).forEach((id) => {
      const a = anims.current[id];
      if (a) Animated.timing(a.o, { toValue: 1, duration: FADE_MS, useNativeDriver: false }).start();
    });
    const h = gridHeight(n, cols) + SPACER_HEIGHT;
    if (first) heightAnim.setValue(h);
    else if (structural) Animated.timing(heightAnim, { toValue: h, duration: MORPH_MS, easing: EASE_SOFT, useNativeDriver: false }).start();
    prevShape.current = { n, cols };
    mounted.current = true;
  }); // à chaque rendu : moveTo ignore les cases déjà en route vers la bonne place
  // 1er affichage : la hauteur est reposée après le montage du conteneur parent (sinon une valeur
  // posée avant son branchement n'est pas prise en compte)
  useEffect(() => { heightAnim.setValue(gridHeight(prevShape.current.n, prevShape.current.cols) + SPACER_HEIGHT); }, []); // eslint-disable-line

  // --- Gestes ---
  const setCopyGeom = (g, dur) => {
    drag.cg = g;
    if (!dur) { copy.w.setValue(g.w); copy.h.setValue(g.h); copy.s.setValue(g.s); return; }
    Animated.parallel(['w', 'h', 's'].map((p) => Animated.timing(copy[p], { toValue: g[p], duration: dur, easing: EASE, useNativeDriver: false }))).start();
  };
  const showLang = (on) => {
    if (externalLang) { onLangActive?.(on); return; }
    if (on) langX.setValue(-LANG - 4);
    Animated.timing(langX, { toValue: on ? LANG_VISIBLE - LANG : -LANG - 4, duration: 180, easing: EASE, useNativeDriver: false }).start();
  };
  // Bascule possible ? (au moins 2 bandeaux ; jamais en tenant la case large en 2 colonnes)
  const canToggle = () => drag.n >= 2 && !(drag.cols === 2 && drag.g0.wide);
  // Position du doigt → centre de la copie (bloqué aux bords), coin haut-gauche logique
  const placeCopy = (f, gH) => {
    const cg = drag.cg;
    const cx = Math.max(cg.w / 2, Math.min(W - cg.w / 2, f.x));
    const cy = Math.max(cg.h / 2, Math.min(Math.max(cg.h / 2, gH - cg.h / 2), f.y));
    copy.fx.setValue(cx); copy.fy.setValue(cy);
    drag.cx = cx - cg.w / 2; drag.cy = cy - cg.h / 2;
  };

  const cleanup = () => {
    drag.id = null;
    setPickId(null); setArr(null); setStage(0); setBar(null);
    showLang(false); onLangHover?.(false);
    onDragChange?.(false); onDimChange?.(false);
  };

  // Ordre visé (étape 0), à partir du doigt (f) dans la grille
  const targetOrder = (f) => {
    const { base, p, n: N, cols: C } = drag;
    if (C === 1) {
      const t = Math.max(0, Math.min(N - 1, Math.floor((drag.cy + drag.cg.h / 2) / H1)));
      const next = [...base]; const [m] = next.splice(p, 1); next.splice(t, 0, m);
      let b = null;
      if (t !== p) b = { x: W * 0.225, w: W * 0.55, y: t < p ? t * H1 : (t + 1) * H1 };
      return { next, bar: b, swap: false };
    }
    const odd = N % 2 === 1; const off = odd ? 1 : 0;
    const rows = (N - off) / 2;
    const inWide = odd && f.y < H1;
    const r = Math.max(0, Math.min(rows - 1, Math.floor((f.y - (odd ? H1 : 0)) / HH)));
    const c = f.x < W / 2 ? 0 : 1;
    const slotAt = off + r * 2 + c;
    const swapWith = (q) => { const next = [...base]; [next[p], next[q]] = [next[q], next[p]]; return next; };
    if (odd && p === 0) return inWide ? { next: base, bar: null, swap: false } : { next: swapWith(slotAt), bar: null, swap: true };
    if (inWide) return { next: swapWith(0), bar: null, swap: true };
    const pc = (p - off) % 2;
    if (c !== pc) return { next: swapWith(slotAt), bar: null, swap: true };
    // Même colonne : insertion verticale dans la colonne
    const colSlots = Array.from({ length: rows }, (_, k) => off + k * 2 + pc);
    const kp = colSlots.indexOf(p);
    const ids = colSlots.map((s) => base[s]);
    const [m] = ids.splice(kp, 1); ids.splice(r, 0, m);
    const next = [...base]; colSlots.forEach((s, k) => { next[s] = ids[k]; });
    let b = null;
    if (r !== kp) {
      const gt = geom(colSlots[r], N, 2, W);
      b = { x: gt.x + (W / 2) * 0.225, w: (W / 2) * 0.55, y: r < kp ? gt.y : gt.y + HH };
    }
    return { next, bar: b, swap: false };
  };

  // Bascule de colonnes après un lâcher sur la languette : la case repart de la languette vers sa
  // nouvelle place (languette fixe à l'écran → position lue au moment de la bascule)
  const runToggle = (id, nextCols, ids) => {
    const a = anims.current[id];
    if (a) {
      const k = LANG_COPY_SCALE; const cg = drag.cg;
      const lx = LANG_VISIBLE / 2; const ly = LANG_TOP + getScrollY() + LANG / 2;
      a.x.setValue(lx - (cg.w * k) / 2); a.y.setValue(ly - (cg.h * k) / 2);
      a.w.setValue(cg.w * k); a.h.setValue(cg.h * k); a.s.setValue(cg.s * k);
      targets.current[id] = null;
    }
    haptics.success();
    setPending({ ids, cols: nextCols });
    cleanup();
    onToggleColumns?.(nextCols, ids);
  };

  const handlersRef = useRef(null);
  handlersRef.current = {
    start: (id, e) => {
      if (drag.id) return;
      const base = [...order];
      const p = base.indexOf(id);
      if (p < 0) return;
      const N = base.length; const C = effectiveCols(columns, N);
      const g = geom(p, N, C, W);
      Object.assign(drag, {
        id, base, p, n: N, cols: C, g0: g, f0x: g.x + e.x, f0y: g.y + e.y,
        cx: g.x, cy: g.y, stage: 0, bound: null, key: base.join('|'), committed: false, cg: g,
      });
      setCopyGeom(g, 0);
      // Centre sous le doigt : la copie part de la case et glisse sous le doigt
      placeCopy({ x: drag.f0x, y: drag.f0y }, gridHeight(N, C));
      copy.ox.setValue(g.x - drag.cx); copy.oy.setValue(g.y - drag.cy);
      Animated.parallel([
        Animated.timing(copy.ox, { toValue: 0, duration: CENTER_MS, easing: EASE, useNativeDriver: false }),
        Animated.timing(copy.oy, { toValue: 0, duration: CENTER_MS, easing: EASE, useNativeDriver: false }),
      ]).start();
      copy.m.setValue(0);
      copy.line.setValue(0); copy.op.setValue(PICKUP_OPACITY);
      copy.k.setValue(1);
      Animated.timing(copy.k, { toValue: PICKUP_SCALE, duration: 120, useNativeDriver: false }).start();
      setCopyType({ L: g.w / g.s, compact: !g.wide });
      haptics.medium();
      setPickId(id); setArr(base); setStage(0); setBar(null);
      onDragChange?.(true);
      if (canToggle()) showLang(true);
    },
    move: (e) => {
      if (!drag.id) return;
      const f = { x: drag.f0x + e.translationX, y: drag.f0y + e.translationY };
      const gH = gridHeight(drag.n, drag.cols);
      // Étapes de la bascule
      let st = drag.stage;
      if (canToggle()) {
        // 1.50 — Bascule en une action : la languette est la zone de dépôt (façon poubelle des stories).
        // Survol → léger aimant (la copie rétrécit et se colle), vibration, aperçu de la future
        // disposition en pointillés, le reste assombri ; quitter la languette → tout revient.
        const lt = LANG_TOP + getScrollY(); // languette fixe à l'écran → en coordonnées de la grille
        const inLang = f.x < LANG_ZONE_X && f.y > lt - LANG_ZONE_PAD && f.y < lt + LANG + LANG_ZONE_PAD;
        st = inLang ? 1 : 0;
        if (st !== drag.stage) {
          drag.stage = st;
          setStage(st);
          onLangHover?.(st === 1); // 1.56 : la languette remplace ses rayons par un liseré
          if (st === 1) {
            haptics.medium();
            setArr(drag.base); drag.key = drag.base.join('|');
            setBar(null); drag.bound = null;
            onDimChange?.(true);
            const cg = drag.cg;
            copy.frx.setValue(LANG_VISIBLE / 2 - cg.w / 2);
            copy.fry.setValue(LANG_TOP + getScrollY() + LANG / 2 - cg.h / 2);
            Animated.parallel([
              Animated.timing(copy.m, { toValue: 1, duration: SHIFT_MS, easing: EASE, useNativeDriver: false }),
              Animated.timing(copy.k, { toValue: LANG_COPY_SCALE, duration: SHIFT_MS, useNativeDriver: false }),
            ]).start();
          } else {
            onDimChange?.(false);
            Animated.parallel([
              Animated.timing(copy.m, { toValue: 0, duration: SHIFT_MS, easing: EASE, useNativeDriver: false }),
              Animated.timing(copy.k, { toValue: PICKUP_SCALE, duration: SHIFT_MS, useNativeDriver: false }),
            ]).start();
          }
        }
        if (st === 1) { placeCopy(f, gH); return; }
      }
      // La copie suit le doigt (centre sous le doigt) ; butées haut / bas (vibration + trait),
      // côtés : bord de l'écran
      const cg = drag.cg;
      placeCopy(f, gH);
      const x = drag.cx;
      const rawY = f.y - cg.h / 2;
      if (st !== 0) return;
      const b = rawY < -BOUND_PX ? 'top' : rawY > gH - cg.h + BOUND_PX ? 'bottom' : null;
      if (b !== drag.bound) { if (b) haptics.medium(); drag.bound = b; }
      const { next, bar: tb, swap } = targetOrder(f);
      const k = next.join('|');
      if (k !== drag.key) {
        drag.key = k;
        if (swap) haptics.medium(); else haptics.light();
        setArr(next);
        // La copie prend la taille de sa future place (large / demi)
        const tg = geom(next.indexOf(drag.id), drag.n, drag.cols, W);
        if (tg.wide !== drag.cg.wide) { setCopyType({ L: tg.w / tg.s, compact: !tg.wide }); setCopyGeom(tg, SHIFT_MS); }
      }
      if (b) {
        const colX = drag.cols === 1 || drag.cg.wide ? { x: W * 0.225, w: W * 0.55 }
          : { x: (x + cg.w / 2 < W / 2 ? 0 : W / 2) + (W / 2) * 0.225, w: (W / 2) * 0.55 };
        setBar({ ...colX, y: b === 'top' ? 0 : gH });
      } else setBar(tb);
    },
    end: () => {
      if (!drag.id) return;
      drag.committed = true;
      const id = drag.id;
      const a = anims.current[id];
      if (drag.stage === 1) {
        // Lâché sur la languette : bascule ; l'ordre ne change pas (le bandeau tenu garde sa place)
        const nextCols = drag.cols === 1 ? 2 : 1;
        const ids = drag.base;
        // 1.54 / 1.55 : pointillés ET assombrissement retirés dès le lâcher (aperçu = survol seulement)
        onSlots?.(null); onDimChange?.(false); setStage(0); showLang(false); onLangHover?.(false);
        // 1.53 : lâché trop bas dans la liste → elle remonte d'abord en haut (la copie s'efface sur la
        // languette, l'aperçu en pointillés reste), puis la bascule se joue sous les yeux
        const wait = beforeToggle ? beforeToggle() : 0;
        if (wait > 0) {
          Animated.timing(copy.op, { toValue: 0, duration: 150, useNativeDriver: false }).start();
          setTimeout(() => runToggle(id, nextCols, ids), wait);
          return;
        }
        runToggle(id, nextCols, ids);
        return;
      }
      const next = arr || drag.base;
      const slot = next.indexOf(id);
      const tg = geom(slot, drag.n, drag.cols, W);
      // La case repart de la position de la copie vers sa place
      if (a) {
        a.x.setValue(drag.cx); a.y.setValue(drag.cy); a.w.setValue(drag.cg.w); a.h.setValue(drag.cg.h); a.s.setValue(drag.cg.s);
        moveTo(id, tg, DROP_MS, true);
      }
      const changed = !sameArr(next, drag.base);
      if (changed) { haptics.success(); setPending({ ids: next }); }
      cleanup();
      if (changed) onReorder?.(next);
    },
    finalize: () => {
      if (!drag.id || drag.committed) return;
      const id = drag.id;
      moveTo(id, drag.g0, DROP_MS, true);
      cleanup();
    },
  };

  // Sortie du mode réorganisation pendant un drag (ex. Terminé) : on range tout
  useEffect(() => { if (!active && drag.id) { moveTo(drag.id, drag.g0, 0, true); cleanup(); } }, [active]); // eslint-disable-line

  const pickedItem = pickId ? byId.current[pickId] : null;
  const dimOthers = stage >= 1;
  // 1.52 : aperçu de la future disposition fourni au parent (affiché en haut de l'écran, visible même
  // quand on est descendu dans la liste)
  useEffect(() => {
    if (!onSlots) return;
    if (stage === 1 && drag.id) {
      onSlots(Array.from({ length: Math.min(drag.n, drag.cols === 1 ? 8 : 4) }, (_, i) => geom(i, drag.n, drag.cols === 1 ? 2 : 1, W)));
    } else onSlots(null);
  }, [stage, pickId]); // eslint-disable-line
  const pillTop = useMemo(() => Animated.subtract(heightAnim, SPACER_HEIGHT + PILL_HIT / 2), [heightAnim]);

  return (
    <View style={styles.wrap} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== W) setW(w); }}>
      {/* Bandeaux retirés (en fondu), sous les autres cases qui glissent à leur place */}
      {ghosts.filter((it) => !liveIds.includes(it.id) && anims.current[it.id]).map((it) => {
        const g = lastGeom.current[it.id] || geom(0, 1, 1, W);
        return (
          <Cell
            key={`ghost-${it.id}`}
            item={it}
            anim={anims.current[it.id]}
            L={g.w / g.s}
            compact={!g.wide}
            col2={!g.wide && g.col === 0}
            active={false}
            hidden={false}
            dimmed={false}
            isWiggling={false}
            phase={0}
            renderBanner={renderBanner}
            handlersRef={handlersRef}
          />
        );
      })}

      {/* Ordre de rendu STABLE (celui du parent) : déplacer un enfant pendant le geste l'annulerait.
          La place de chaque case vient de `order` (positions absolues). */}
      {liveIds.map((id) => {
        const it = byId.current[id];
        const i = order.indexOf(id);
        if (!it || i < 0) return null;
        const g = geom(i, n, cols, W);
        const a = animOf(id, g, mounted.current);
        return (
          <Cell
            key={id}
            item={it}
            anim={a}
            L={g.w / g.s}
            compact={!g.wide}
            col2={!g.wide && g.col === 0}
            active={active}
            hidden={id === pickId}
            dimmed={dimOthers && id !== pickId}
            isWiggling={active && !pickId}
            phase={i % 3}
            renderBanner={renderBanner}
            onTap={onTap}
            onLongPress={onEnterReorder}
            handlersRef={handlersRef}
          />
        );
      })}
      {/* Aperçu de la future disposition (survol de la languette) : cases en pointillés */}
      {!onSlots && stage === 1 && drag.id && Array.from({ length: Math.min(drag.n, drag.cols === 1 ? 8 : 4) }, (_, i) => geom(i, drag.n, drag.cols === 1 ? 2 : 1, W)).map((gq, i) => (
        <View key={`slot-${i}`} pointerEvents="none" style={[styles.slot, { left: gq.x + 3, top: gq.y + 3, width: gq.w - 6, height: gq.h - 6 }]} />
      ))}

      {/* Copie qui suit le doigt */}
      {pickedItem && (
        <Animated.View
          pointerEvents="none"
          style={[styles.copy, {
            left: copyPos.left, top: copyPos.top, width: copy.w, height: copy.h,
            opacity: copy.op, transform: [{ scale: copy.k }],
          }]}
        >
          <Animated.View style={[styles.content, { width: copyType.L, transform: [{ scale: copy.s }] }]}>
            {renderBanner(pickedItem, { compact: copyType.compact, layoutWidth: copyType.L, inReorder: true, isWiggling: true, phase: 0 })}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.copyLine, { opacity: copy.line }]} />
        </Animated.View>
      )}

      {/* Trait fin : place visée ou butée */}
      {bar && <View pointerEvents="none" style={[styles.bar, { left: bar.x, width: bar.w, top: bar.y - 0.5 }]} />}

      {/* Languette de bascule (sort du bord gauche à la saisie) */}
      {!externalLang && <Animated.View pointerEvents="none" style={[styles.lang, { left: langX }]}>
        <MaterialCommunityIcons name={cols === 1 ? 'view-grid-outline' : 'view-agenda-outline'} size={14} color={theme.colors.text} />
      </Animated.View>}

      {/* Pilule « + » sur la dernière ligne : suit la grille pendant ses animations */}
      {showAdd && <Animated.View pointerEvents="box-none" style={[styles.pillWrap, { top: pillTop }, dimOthers && { opacity: DIM }]}>
        {/* 1.51 : zone de toucher réelle (et non plus un hitSlop qui débordait sur les cases) */}
        <TouchableOpacity
          style={styles.pillHit}
          onPress={() => { haptics.light(); onAddPress?.(); }}
          activeOpacity={0.6}
        >
          <View style={styles.pill}>
            <MaterialCommunityIcons name="plus" size={10} color={theme.colors.background} />
          </View>
        </TouchableOpacity>
      </Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, position: 'relative' },
  cell: { position: 'absolute', overflow: 'hidden', backgroundColor: theme.colors.background },
  content: { height: H1, transformOrigin: 'top left' },
  lineBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  lineRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  copy: { position: 'absolute', overflow: 'hidden', backgroundColor: theme.colors.background, zIndex: 10, elevation: 10 },
  copyLine: { borderWidth: 1, borderColor: '#FFFFFF' },
  frame: {
    position: 'absolute', zIndex: 5, elevation: 5,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9A9A9A', borderRadius: 8,
    backgroundColor: 'rgba(14,14,14,0.85)', alignItems: 'center', justifyContent: 'center',
  },
  slot: {
    position: 'absolute', zIndex: 5, elevation: 5,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9A9A9A', borderRadius: 8,
  },
  bar: { position: 'absolute', height: 1, backgroundColor: '#FFFFFF', borderRadius: 1, zIndex: 15, elevation: 15 },
  lang: {
    position: 'absolute', top: LANG_TOP, width: LANG, height: LANG, borderRadius: LANG / 2,
    backgroundColor: theme.colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.textFaint,
    alignItems: 'flex-end', justifyContent: 'center', paddingRight: 1, zIndex: 20, elevation: 20,
  },
  pillWrap: { position: 'absolute', left: 0, right: 0, height: PILL_HIT, alignItems: 'center', zIndex: 12, elevation: 12 },
  pillHit: { width: 64, height: PILL_HIT, alignItems: 'center', justifyContent: 'center' },
  pill: {
    height: PILL_HALF * 2, width: 32, borderRadius: PILL_HALF,
    backgroundColor: theme.colors.text, alignItems: 'center', justifyContent: 'center',
  },
});
