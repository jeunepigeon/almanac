import { useMemo, useState, useRef, useCallback, memo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Pressable,
  Animated,
  Easing as EasingLib,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import haptics from '../utils/haptics';

// Calendrier scrollable vertical inversé (v1.1.12).
// - Mois courant EN BAS, on remonte vers le passé EN HAUT
// - chevron-UP = mois précédent (car passé est en haut)
// - chevron-DOWN = mois suivant (car présent est en bas)
// - double chevron-DOWN = aller au présent (en bas)
// - Rebond du contenu quand on scrolle au-delà des bornes (iOS/Instagram like)

const DAYS_FR_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const MONTHS_TO_SHOW = 48;
const MONTH_ITEM_HEIGHT = 300;

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }
function dayKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Grille 1 à 10 points dans une cellule.
// 1-5 = 1 ligne centrée. 6-10 = 2 lignes (5 en haut, N-5 en bas selon disposition symétrique).
// Écart vertical = écart horizontal. Max 10 points affichés.
// Les markers sont déjà triés chronologiquement par le parent.
const DOT_SIZE = 5;
const DOT_GAP = 3;
const PITCH = DOT_SIZE + DOT_GAP; // 8px entre centres

function MarkersGrid({ markers }) {
  const n = Math.min(markers.length, 10);
  if (n === 0) return null;

  // Toujours centré sur l'axe vertical du jour.
  // Row 1 : min(n, 5) points, positions en "demi-pas" (halfPitch = PITCH/2) depuis le centre.
  //   n=1 : [0]
  //   n=2 : [-1, 1]
  //   n=3 : [-2, 0, 2]
  //   n=4 : [-3, -1, 1, 3]
  //   n=5 : [-4, -2, 0, 2, 4]
  // Row 2 (si n>=6) : positions aussi en demi-pas, référence = row1 à 5 points
  //   n=6 : [0]
  //   n=7 : [-1, 1] (entre pts 2-3 et 3-4)
  //   n=8 : [-2, 0, 2] (sous pts 2, 3, 4)
  //   n=9 : [-3, -1, 1, 3] (quinconce entre toutes les paires)
  //   n=10 : [-4, -2, 0, 2, 4] (sous tous les 5 pts)
  const ROW1_HALF = {
    1: [0],
    2: [-1, 1],
    3: [-2, 0, 2],
    4: [-3, -1, 1, 3],
    5: [-4, -2, 0, 2, 4],
  };
  const ROW2_HALF = {
    6: [0],
    7: [-1, 1],
    8: [-2, 0, 2],
    9: [-3, -1, 1, 3],
    10: [-4, -2, 0, 2, 4],
  };

  const row1Count = Math.min(n, 5);
  const row1Half = ROW1_HALF[row1Count];
  const row2Half = ROW2_HALF[n] || [];
  const row1 = markers.slice(0, row1Count);
  const row2 = markers.slice(row1Count, row1Count + row2Half.length);

  const halfPitch = PITCH / 2;
  // Container : largeur fixe pour accueillir 5 points + marges
  const containerW = 5 * PITCH;

  return (
    <View style={[styles.markersGrid, { width: containerW }]}>
      <View style={styles.markersRow2}>
        {row1.map((color, idx) => {
          const halfIdx = row1Half[idx];
          const left = containerW / 2 + halfIdx * halfPitch - DOT_SIZE / 2;
          return (
            <View
              key={`r1-${idx}`}
              style={[styles.markerAbs, { left, top: 0, backgroundColor: color }]}
            />
          );
        })}
      </View>
      {row2.length > 0 && (
        <View style={styles.markersRow2}>
          {row2.map((color, idx) => {
            const halfIdx = row2Half[idx];
            const left = containerW / 2 + halfIdx * halfPitch - DOT_SIZE / 2;
            return (
              <View
                key={`r2-${idx}`}
                style={[styles.markerAbs, { left, top: 0, backgroundColor: color }]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const DayCell = memo(function DayCell({ date, markers, isToday, isFuture, isSober, onPress, flashColor, flashNonce }) {
  const flash = useRef(new Animated.Value(0)).current;
  // Couleur du flash gardée localement : l'overlay reste monté jusqu'à la FIN du fondu
  // (avant : démonté par le parent en plein fondu → palier « opacité faible » puis disparition sèche).
  const [activeFlash, setActiveFlash] = useState(null);
  useEffect(() => {
    if (!flashColor || !flashNonce) {
      // Ce jour n'est plus la cible (spam) : on coupe son flash immédiatement
      flash.stopAnimation();
      flash.setValue(0);
      setActiveFlash(null);
      return;
    }
    setActiveFlash(flashColor);
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(flash, {
        toValue: 0, duration: 600, useNativeDriver: true,
        easing: EasingLib.out(EasingLib.quad),
      }),
    ]).start(({ finished }) => { if (finished) setActiveFlash(null); });
  }, [flashNonce]); // eslint-disable-line
  if (!date) return <View style={styles.dayCell} />;
  const overlayOpacity = flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.65] });
  return (
    <TouchableOpacity
      style={[styles.dayCell, isToday && styles.dayCellToday]}
      onPress={isFuture ? undefined : onPress}
      disabled={isFuture}
      activeOpacity={0.6}
    >
      <View style={[styles.dayNumberWrap, isSober && styles.dayNumberWrapSober]}>
        <Text style={[
          styles.dayNumber,
          isFuture && styles.dayNumberFuture,
          isToday && styles.dayNumberToday,
        ]}>
          {date.getDate()}
        </Text>
      </View>
      <MarkersGrid markers={markers} />
      {activeFlash && (
        <Animated.View
          pointerEvents="none"
          style={[styles.flashOverlay, { backgroundColor: activeFlash, opacity: overlayOpacity }]}
        />
      )}
    </TouchableOpacity>
  );
});

const MonthGrid = memo(function MonthGrid({ year, month, markersByDay, onDayPress, showSoberFill, todayTime, flashKey, flashColor, flashNonce }) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ key: `e${i}`, date: null });
    } else {
      const date = new Date(year, month, dayNum);
      const key = dayKeyOf(date);
      const markers = markersByDay[key] || [];
      const isToday = date.getTime() === todayTime;
      const isFuture = date.getTime() > todayTime;
      const isSober = showSoberFill && !isFuture && !isToday && markers.length === 0;
      cells.push({ key, date, markers, isToday, isFuture, isSober, timestamp: date.getTime() });
    }
  }

  return (
    <View style={styles.monthWrap}>
      <Text style={styles.monthLabel}>{MONTHS_FR[month]} {year}</Text>
      <View style={styles.weekHeader}>
        {DAYS_FR_SHORT.map((d, i) => (
          <Text key={i} style={styles.weekHeaderText}>{d}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((c) => (
          <DayCell
            key={c.key}
            date={c.date}
            markers={c.markers || []}
            isToday={c.isToday}
            isFuture={c.isFuture}
            isSober={c.isSober}
            flashColor={flashKey && c.key === flashKey ? flashColor : null}
            flashNonce={flashKey && c.key === flashKey ? flashNonce : null}
            onPress={c.date ? () => onDayPress?.(c.key, c.timestamp) : undefined}
          />
        ))}
      </View>
    </View>
  );
});

export default function ScrollableCalendar({
  markersByDay = {},
  onDayPress,
  showSoberFill = false,
  showJumpButtons = false,
  substanceColor = null,
}) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const todayTime = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }, []);

  // Flash : state éphémère pour flasher un jour au saut.
  const [flashKey, setFlashKey] = useState(null);
  const [flashNonce, setFlashNonce] = useState(0);
  const flashTimer = useRef(null);
  const triggerFlash = useCallback((dayKey) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashKey(dayKey);
    setFlashNonce((n) => n + 1);  // force re-render de l'animation
    flashTimer.current = setTimeout(() => setFlashKey(null), 1000);
  }, []);
  useEffect(() => () => flashTimer.current && clearTimeout(flashTimer.current), []);

  // Butée haptic : évite de déclencher plusieurs fois pendant un overscroll continu.
  const bounceLockRef = useRef(false);
  const triggerBounce = () => {
    if (bounceLockRef.current) return;
    bounceLockRef.current = true;
    haptics.warning();
    setTimeout(() => { bounceLockRef.current = false; }, 400);
  };

  // Premier mois à afficher = mois du plus ancien marker. Sinon mois courant uniquement.
  const firstMonthFromMarkers = useMemo(() => {
    const keys = Object.keys(markersByDay);
    if (keys.length === 0) return { year: currentYear, month: currentMonth };
    let bestY = Infinity, bestM = 0;
    for (const k of keys) {
      const [y, m] = k.split('-');
      const yN = parseInt(y, 10); const mN = parseInt(m, 10) - 1;
      if (yN < bestY || (yN === bestY && mN < bestM)) { bestY = yN; bestM = mN; }
    }
    return { year: bestY === Infinity ? currentYear : bestY, month: bestM };
  }, [markersByDay, currentYear, currentMonth]);

  // Liste des mois : du 1er marker (haut) → mois courant (bas). Pas de mois antérieur.
  const months = useMemo(() => {
    const arr = [];
    const totalMonths = (currentYear - firstMonthFromMarkers.year) * 12
      + (currentMonth - firstMonthFromMarkers.month) + 1;
    const count = Math.max(1, totalMonths);
    for (let i = 0; i < count; i++) {
      const d = new Date(currentYear, currentMonth - (count - 1 - i), 1);
      arr.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return arr;
  }, [currentYear, currentMonth, firstMonthFromMarkers]);

  // Set des idx de mois contenant au moins une prise (pour les boutons jump)
  const monthsWithLogs = useMemo(() => {
    const set = new Set();
    for (const dayKey of Object.keys(markersByDay)) {
      // dayKey format : "YYYY-MM-DD"
      const [y, m] = dayKey.split('-');
      const yearN = parseInt(y, 10);
      const monthN = parseInt(m, 10) - 1;
      // Trouver l'idx dans months
      for (let i = 0; i < months.length; i++) {
        if (months[i].year === yearN && months[i].month === monthN) {
          set.add(i);
          break;
        }
      }
    }
    return set;
  }, [markersByDay, months]);

  const currentIdx = months.length - 1;
  const [visibleIdx, setVisibleIdx] = useState(currentIdx);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dropdownLayout, setDropdownLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const flatListRef = useRef(null);
  const visibleIdxRef = useRef(currentIdx);
  useEffect(() => { visibleIdxRef.current = visibleIdx; }, [visibleIdx]);

  // Scroll initial vers le mois courant (en bas).
  // Ouverture : on démarre sur le mois courant via initialScrollIndex (cf. FlatList),
  // + re-calage dès que la taille du contenu change tant que l'utilisateur n'a pas touché.
  const userTouchedRef = useRef(false);
  const navigatedRef = useRef(false); // true dès la 1re navigation (chevrons, dropdown, prise)
  const snapToPresent = useCallback(() => {
    // Uniquement à l'ouverture : sinon un saut lointain (qui charge de nouveaux mois et change la
    // taille du contenu) déclenchait ce recalage et ramenait au présent.
    if (userTouchedRef.current || navigatedRef.current) return;
    try {
      flatListRef.current?.scrollToOffset({ offset: currentIdx * MONTH_ITEM_HEIGHT, animated: false });
      setVisibleIdx(currentIdx);
    } catch {}
  }, [currentIdx]);

  // --- Fin de scroll programmé : détectée quand les events onScroll s'arrêtent (≈70ms de silence).
  // Plus réactif que onMomentumScrollEnd (pas toujours émis sur un scroll programmé Android).
  const programmedScrollRef = useRef(false);
  const pendingFlashRef = useRef(null); // { dayKey }
  const scrollEndTimerRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const finishProgrammedScroll = useCallback(() => {
    if (scrollEndTimerRef.current) { clearTimeout(scrollEndTimerRef.current); scrollEndTimerRef.current = null; }
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    programmedScrollRef.current = false;
    if (pendingFlashRef.current) {
      const { dayKey } = pendingFlashRef.current;
      pendingFlashRef.current = null;
      triggerFlash(dayKey);
    }
  }, [triggerFlash]);

  const scrollToIdx = useCallback((idx, animated = true) => {
    if (!flatListRef.current) return;
    navigatedRef.current = true;
    programmedScrollRef.current = true;
    try {
      flatListRef.current.scrollToOffset({ offset: idx * MONTH_ITEM_HEIGHT, animated });
    } catch {}
    setVisibleIdx(idx);
    // Filet de sécurité si aucun event de scroll n'arrive
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(finishProgrammedScroll, animated ? 700 : 60);
  }, [finishProgrammedScroll]);

  const onScrollEvent = useCallback(() => {
    if (!programmedScrollRef.current) return;
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(finishProgrammedScroll, 70);
  }, [finishProgrammedScroll]);

  // --- Prises triées
  const sortedPriseDays = useMemo(() => {
    const list = Object.keys(markersByDay).map((k) => {
      const [y, m, d] = k.split('-');
      return { key: k, ts: new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime() };
    });
    list.sort((a, b) => a.ts - b.ts);
    return list;
  }, [markersByDay]);

  // Curseur = dernière prise atteinte via les chevrons prise.
  // Il est EFFACÉ dès que l'utilisateur se déplace autrement (scroll doigt, chevrons mois, dropdown) :
  // les chevrons prise repartent alors du mois affiché.
  const priseCursorRef = useRef(null);
  const clearCursor = () => { priseCursorRef.current = null; };

  const monthBounds = () => {
    const m = months[visibleIdxRef.current];
    if (!m) return null;
    return {
      start: new Date(m.year, m.month, 1).getTime(),
      end: new Date(m.year, m.month + 1, 0, 23, 59, 59).getTime(),
    };
  };

  const cursorIdx = () => {
    if (!priseCursorRef.current) return -1;
    return sortedPriseDays.findIndex((d) => d.key === priseCursorRef.current);
  };

  // Index cible pour « prise précédente » (-1 = aucune)
  const prevTargetIdx = () => {
    const c = cursorIdx();
    if (c >= 0) return c - 1;
    const b = monthBounds();
    if (!b) return sortedPriseDays.length - 1;
    // Dernière prise dans ou avant le mois affiché
    for (let i = sortedPriseDays.length - 1; i >= 0; i--) {
      if (sortedPriseDays[i].ts <= b.end) return i;
    }
    return -1;
  };
  // Index cible pour « prise suivante » (-1 = aucune)
  const nextTargetIdx = () => {
    const c = cursorIdx();
    if (c >= 0) return c + 1 < sortedPriseDays.length ? c + 1 : -1;
    const b = monthBounds();
    if (!b) return -1;
    // Première prise dans ou après le mois affiché
    for (let i = 0; i < sortedPriseDays.length; i++) {
      if (sortedPriseDays[i].ts >= b.start) return i;
    }
    return -1;
  };

  // Jump : déjà sur le bon mois → flash immédiat ; sinon scroll puis flash dès l'arrêt du scroll.
  const jumpToDay = (dayKey, dayTs) => {
    const d = new Date(dayTs);
    const idx = months.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth());
    priseCursorRef.current = dayKey;
    navigatedRef.current = true;
    // Annule tout flash/scroll en attente d'un appui précédent (spam des chevrons)
    pendingFlashRef.current = null;
    if (scrollEndTimerRef.current) { clearTimeout(scrollEndTimerRef.current); scrollEndTimerRef.current = null; }
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    if (idx < 0 || idx === visibleIdxRef.current) {
      programmedScrollRef.current = false;
      triggerFlash(dayKey);
      return;
    }
    pendingFlashRef.current = { dayKey };
    scrollToIdx(idx, true);
  };

  const goPrev = () => {
    clearCursor();
    const cur = visibleIdxRef.current;
    if (cur > 0) { haptics.light(); scrollToIdx(cur - 1); } else { triggerBounce(); }
  };
  const goNext = () => {
    clearCursor();
    const cur = visibleIdxRef.current;
    if (cur < currentIdx) { haptics.light(); scrollToIdx(cur + 1); } else { triggerBounce(); }
  };
  const goToday = () => {
    clearCursor();
    const cur = visibleIdxRef.current;
    if (cur < currentIdx) { haptics.light(); scrollToIdx(currentIdx); } else { triggerBounce(); }
  };

  const goPrevLog = () => {
    if (sortedPriseDays.length === 0) { triggerBounce(); return; }
    const t = prevTargetIdx();
    if (t >= 0) {
      haptics.light();
      jumpToDay(sortedPriseDays[t].key, sortedPriseDays[t].ts);
    } else {
      // Butée : haptic + flash de la toute première prise
      triggerBounce();
      jumpToDay(sortedPriseDays[0].key, sortedPriseDays[0].ts);
    }
  };

  const goNextLog = () => {
    if (sortedPriseDays.length === 0) { triggerBounce(); return; }
    const t = nextTargetIdx();
    if (t >= 0) {
      haptics.light();
      jumpToDay(sortedPriseDays[t].key, sortedPriseDays[t].ts);
    } else {
      // Butée : haptic + flash de la toute dernière prise
      triggerBounce();
      const last = sortedPriseDays[sortedPriseDays.length - 1];
      jumpToDay(last.key, last.ts);
    }
  };

  const canGoPrevLog = showJumpButtons && sortedPriseDays.length > 0 && prevTargetIdx() >= 0;
  const canGoNextLog = showJumpButtons && sortedPriseDays.length > 0 && nextTargetIdx() >= 0;

  const canGoPrev = visibleIdx > 0;
  const canGoNext = visibleIdx < currentIdx;
  const canGoToday = visibleIdx !== currentIdx;

  const visibleLabel = months[visibleIdx]
    ? `${MONTHS_FR[months[visibleIdx].month]} ${months[visibleIdx].year}`
    : '';

  const getItemLayout = (_data, index) => ({
    length: MONTH_ITEM_HEIGHT,
    offset: MONTH_ITEM_HEIGHT * index,
    index,
  });

  const renderItem = useCallback(({ item }) => (
    <MonthGrid
      year={item.year}
      month={item.month}
      markersByDay={markersByDay}
      onDayPress={onDayPress}
      showSoberFill={showSoberFill}
      todayTime={todayTime}
      flashKey={flashKey && flashKey.startsWith(`${item.year}-${pad2(item.month + 1)}-`) ? flashKey : null}
      flashNonce={flashKey && flashKey.startsWith(`${item.year}-${pad2(item.month + 1)}-`) ? flashNonce : null}
      flashColor={substanceColor || '#FFFFFF'}
    />
  ), [markersByDay, onDayPress, showSoberFill, todayTime, flashKey, flashNonce, substanceColor]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    // Ignore pendant un scroll programmé (évite la désynchro entre scroll + dropdown)
    if (programmedScrollRef.current) return;
    if (viewableItems.length > 0) {
      // Prend l'item CENTRAL (pas le dernier) : plus proche de ce que l'user voit vraiment
      const middle = viewableItems[Math.floor(viewableItems.length / 2)];
      if (middle?.index != null) setVisibleIdx(middle.index);
    }
  }, []);

  const viewabilityConfig = useMemo(() => ({
    itemVisiblePercentThreshold: 50,
  }), []);

  return (
    <View style={styles.container}>
      <View style={styles.navBar}>
        {/* Chevron haut : mois précédent */}
        <TouchableOpacity
          onPress={goPrev}
          style={styles.navBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-up" size={20} color={canGoPrev ? theme.colors.text : theme.colors.textFaint} />
        </TouchableOpacity>

        {/* Chevron + point : prise précédente (uniquement calendrier substance) */}
        {showJumpButtons && (
          <TouchableOpacity
            onPress={goPrevLog}
            style={styles.navBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={{ alignItems: 'center' }}>
              <View style={[styles.jumpDot, { backgroundColor: canGoPrevLog ? theme.colors.text : theme.colors.textFaint }]} />
              <Ionicons name="chevron-up" size={16} color={canGoPrevLog ? theme.colors.text : theme.colors.textFaint} style={{ marginTop: 0 }} />
            </View>
          </TouchableOpacity>
        )}

        {/* Double chevron bas : aller à aujourd'hui */}
        <TouchableOpacity
          onPress={goToday}
          style={styles.todayBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-down" size={12} color={canGoToday ? '#01C853' : theme.colors.textFaint} />
          <Ionicons name="chevron-down" size={12} color={canGoToday ? '#01C853' : theme.colors.textFaint} style={{ marginTop: -6 }} />
        </TouchableOpacity>

        {/* Chevron + point : prise suivante (uniquement calendrier substance) */}
        {showJumpButtons && (
          <TouchableOpacity
            onPress={goNextLog}
            style={styles.navBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="chevron-down" size={16} color={canGoNextLog ? theme.colors.text : theme.colors.textFaint} />
              <View style={[styles.jumpDot, { backgroundColor: canGoNextLog ? theme.colors.text : theme.colors.textFaint, marginTop: 0 }]} />
            </View>
          </TouchableOpacity>
        )}

        {/* Chevron bas : mois suivant */}
        <TouchableOpacity
          onPress={goNext}
          style={styles.navBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-down" size={20} color={canGoNext ? theme.colors.text : theme.colors.textFaint} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            setDropdownLayout({ x, y, width, height });
          }}
          style={styles.dropdown}
          activeOpacity={0.7}
        >
          <Text style={styles.dropdownText}>{visibleLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={months}
        keyExtractor={(m) => `${m.year}-${m.month}`}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="always"
        initialScrollIndex={currentIdx}
        onContentSizeChange={snapToPresent}
        onLayout={snapToPresent}
        onScrollBeginDrag={() => { userTouchedRef.current = true; clearCursor(); }}
        onScroll={(e) => {
          onScrollEvent();
          const y = e.nativeEvent.contentOffset.y;
          const h = e.nativeEvent.layoutMeasurement.height;
          const content = e.nativeEvent.contentSize.height;
          if (y < -40 || y + h > content + 40) {
            triggerBounce();
          }
        }}
        scrollEventThrottle={32}
        onMomentumScrollEnd={() => { if (programmedScrollRef.current) finishProgrammedScroll(); }}
      />

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setPickerOpen(false)}>
          <View style={[
            styles.dropdownList,
            {
              top: dropdownLayout.y + dropdownLayout.height + 60,
              right: 16,
              width: 200,
            },
          ]}>
            <FlatList
              data={[...months].reverse()}
              keyExtractor={(m) => `p-${m.year}-${m.month}`}
              renderItem={({ item }) => {
                const actualIdx = months.findIndex((m) => m.year === item.year && m.month === item.month);
                return (
                  <TouchableOpacity
                    style={[
                      styles.dropdownRow,
                      actualIdx === visibleIdx && styles.dropdownRowActive,
                    ]}
                    onPress={() => {
                      haptics.light();
                      clearCursor();
                      scrollToIdx(actualIdx);
                      setPickerOpen(false);
                    }}
                  >
                    <Text style={[
                      styles.dropdownRowText,
                      actualIdx === visibleIdx && styles.dropdownRowTextActive,
                    ]}>
                      {MONTHS_FR[item.month]} {item.year}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 360 }}
              showsVerticalScrollIndicator
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  navBtn: {
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
    borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border,
  },
  // Point à côté du chevron pour "prise précédente/suivante" (A1 collé)
  jumpDot: { width: 5, height: 5, borderRadius: 2.5 },
  btnDisabled: { opacity: 0.4 },
  todayBtn: {
    width: 44, height: 36, justifyContent: 'center', alignItems: 'center',
    borderRadius: 6, borderWidth: 1, borderColor: '#01C853',
    paddingTop: 3,
  },
  dropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginLeft: theme.spacing.xs,
  },
  dropdownText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.sm,
    fontWeight: '400',
  },
  monthWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: MONTH_ITEM_HEIGHT,
  },
  monthLabel: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 1,
    textTransform: 'lowercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  weekHeader: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingBottom: 4,
  },
  weekHeaderText: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  flashOverlay: {
    position: 'absolute',
    top: '6%', left: '6%', right: '6%', bottom: '6%',
    borderRadius: 6,
  },
  dayCellToday: { backgroundColor: 'rgba(1, 200, 83, 0.15)' },
  dayNumberWrap: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 1, marginBottom: 0,
  },
  dayNumberWrapSober: {
    borderWidth: 1.2,
    borderColor: '#01C853',
    borderRadius: 15,
  },
  dayNumber: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
  },
  dayNumberFuture: { color: theme.colors.textFaint },
  dayNumberToday: { fontWeight: '500' },
  markersGrid: {
    marginTop: 1,
    alignItems: 'center',
  },
  markersRow2: {
    position: 'relative',
    width: '100%',
    height: DOT_SIZE,
    marginBottom: DOT_GAP,
  },
  markerAbs: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  // Styles legacy (gardés au cas où MonthCalendar les utilise)
  markersRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
  },
  marker: {
    width: 5, height: 5, borderRadius: 3,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dropdownList: {
    position: 'absolute',
    backgroundColor: theme.colors.surface,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
    overflow: 'hidden',
  },
  dropdownRow: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  dropdownRowActive: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  dropdownRowText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    letterSpacing: 0.3,
  },
  dropdownRowTextActive: {
    color: '#01C853',
    fontWeight: '500',
  },
});
