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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

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

  // Rangée 1 : min(n, 5) points centrés
  const row1Count = Math.min(n, 5);
  const row1 = markers.slice(0, row1Count);

  // Rangée 2 : positions calculées selon n
  // Référence : positions des 5 points de la rangée 1 (-2 PITCH .. +2 PITCH)
  // On exprime les positions comme multiples de PITCH/2 (demi-pas) depuis le centre
  // Row 1 positions = [-2, -1, 0, 1, 2] × PITCH (en indices "demi-pas" = [-4, -2, 0, 2, 4])
  // Row 2 selon n :
  //   n=6 : [0]
  //   n=7 : [-1, 1]  (entre 2-3 et 3-4)
  //   n=8 : [-2, 0, 2] (sous 2, 3, 4) → indices demi-pas [-2, 0, 2]
  //   n=9 : [-3, -1, 1, 3] (entre toutes paires)
  //   n=10 : [-4, -2, 0, 2, 4] (sous 1,2,3,4,5)
  const row2Config = {
    6: [0],
    7: [-1, 1],
    8: [-2, 0, 2],
    9: [-3, -1, 1, 3],
    10: [-4, -2, 0, 2, 4],
  };
  const row2Half = row2Config[n] || [];
  const row2 = markers.slice(5, 5 + row2Half.length);

  const halfPitch = PITCH / 2;
  const containerW = 5 * PITCH; // largeur fixe pour centrer

  return (
    <View style={[styles.markersGrid, { width: containerW }]}>
      <View style={styles.markersRow2}>
        {row1.map((color, idx) => {
          // indices demi-pas pour row1 : [-4, -2, 0, 2, 4]
          // position pixel depuis centre : halfIdx * halfPitch
          const halfIdx = -4 + idx * 2;
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

const DayCell = memo(function DayCell({ date, markers, isToday, isFuture, isSober, onPress }) {
  if (!date) return <View style={styles.dayCell} />;
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
    </TouchableOpacity>
  );
});

const MonthGrid = memo(function MonthGrid({ year, month, markersByDay, onDayPress, showSoberFill, todayTime }) {
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
            onPress={c.date ? () => onDayPress?.(c.key, c.timestamp) : undefined}
          />
        ))}
      </View>
    </View>
  );
});

export default function ScrollableCalendar({ markersByDay = {}, onDayPress, showSoberFill = false }) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const todayTime = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }, []);

  // Liste des mois : ordre INVERSÉ. idx 0 = plus ancien (haut), dernier idx = mois courant (bas)
  const months = useMemo(() => {
    const arr = [];
    for (let i = 0; i < MONTHS_TO_SHOW; i++) {
      const d = new Date(currentYear, currentMonth - (MONTHS_TO_SHOW - 1 - i), 1);
      arr.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return arr;
  }, [currentYear, currentMonth]);

  const currentIdx = months.length - 1;
  const [visibleIdx, setVisibleIdx] = useState(currentIdx);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dropdownLayout, setDropdownLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const flatListRef = useRef(null);

  // Scroll initial vers le mois courant (en bas)
  useEffect(() => {
    const t = setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: currentIdx, animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [currentIdx]);

  const scrollToIdx = useCallback((idx) => {
    if (!flatListRef.current) return;
    flatListRef.current.scrollToIndex({ index: idx, animated: true });
    setVisibleIdx(idx);
  }, []);

  // Mois précédent = passé = plus haut dans la liste = idx DIMINUE
  const goPrev = () => {
    if (visibleIdx > 0) {
      scrollToIdx(visibleIdx - 1);
    }
  };
  // Mois suivant = présent = plus bas dans la liste = idx AUGMENTE
  const goNext = () => {
    if (visibleIdx < currentIdx) {
      scrollToIdx(visibleIdx + 1);
    }
  };
  const goToday = () => {
    if (visibleIdx < currentIdx) scrollToIdx(currentIdx);
  };

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
    />
  ), [markersByDay, onDayPress, showSoberFill, todayTime]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const last = viewableItems[viewableItems.length - 1];
      if (last.index != null) setVisibleIdx(last.index);
    }
  }, []);

  const viewabilityConfig = useMemo(() => ({
    itemVisiblePercentThreshold: 50,
  }), []);

  return (
    <View style={styles.container}>
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={goPrev}
          style={styles.navBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-up" size={20} color={canGoPrev ? theme.colors.text : theme.colors.textFaint} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToday}
          style={styles.todayBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-down" size={12} color={canGoToday ? '#01C853' : theme.colors.textFaint} />
          <Ionicons name="chevron-down" size={12} color={canGoToday ? '#01C853' : theme.colors.textFaint} style={{ marginTop: -6 }} />
        </TouchableOpacity>

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
