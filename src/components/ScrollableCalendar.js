import { useMemo, useState, useRef, useCallback, memo } from 'react';
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

// Calendrier scrollable vertical avec mois empilés, optimisé perf.
// - Mois courant EN HAUT, chevron-DOWN = mois précédent (descendre dans le passé)
// - chevron-UP = mois suivant (remonter vers le présent)
// - double chevron-up = aller à aujourd'hui
// - Rebond visuel si on essaie d'aller dans le futur
// - Dropdown vraiment ancrée sous le bouton

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

// --- Cellule jour mémoïsée ---
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
      {markers.length > 0 && (
        <View style={styles.markersRow}>
          {markers.slice(0, 5).map((color, idx) => (
            <View key={idx} style={[styles.marker, { backgroundColor: color }]} />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
});

// --- Grille mensuelle mémoïsée ---
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

  // Liste des mois : index 0 = mois courant, index +N = N mois plus ancien
  const months = useMemo(() => {
    const arr = [];
    for (let i = 0; i < MONTHS_TO_SHOW; i++) {
      const d = new Date(currentYear, currentMonth - i, 1);
      arr.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return arr;
  }, [currentYear, currentMonth]);

  const [visibleIdx, setVisibleIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dropdownLayout, setDropdownLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const flatListRef = useRef(null);

  // Anim rebond pour bouton "futur"
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const runShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const scrollToIdx = useCallback((idx) => {
    if (!flatListRef.current) return;
    flatListRef.current.scrollToIndex({ index: idx, animated: true });
    setVisibleIdx(idx);
  }, []);

  // Down = passé = idx augmente
  const goPrev = () => {
    if (visibleIdx < months.length - 1) {
      scrollToIdx(visibleIdx + 1);
    }
  };
  // Up = présent = idx diminue
  const goNext = () => {
    if (visibleIdx > 0) {
      scrollToIdx(visibleIdx - 1);
    } else {
      runShake();
    }
  };
  const goToday = () => {
    if (visibleIdx > 0) scrollToIdx(0);
    else runShake();
  };

  const canGoPrev = visibleIdx < months.length - 1;
  const canGoNext = visibleIdx > 0;

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
      const first = viewableItems[0];
      if (first.index != null) setVisibleIdx(first.index);
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
          style={[styles.navBtn, !canGoPrev && styles.btnDisabled]}
          disabled={!canGoPrev}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-down" size={20} color={canGoPrev ? theme.colors.text : theme.colors.textFaint} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToday}
          style={styles.todayBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-up" size={12} color="#01C853" />
          <Ionicons name="chevron-up" size={12} color="#01C853" style={{ marginTop: -6 }} />
        </TouchableOpacity>

        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <TouchableOpacity
            onPress={goNext}
            style={styles.navBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-up" size={20} color={canGoNext ? theme.colors.text : theme.colors.textFaint} />
          </TouchableOpacity>
        </Animated.View>

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
      />

      {/* Dropdown ancrée sous le bouton */}
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
              data={months}
              keyExtractor={(m) => `p-${m.year}-${m.month}`}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownRow,
                    index === visibleIdx && styles.dropdownRowActive,
                  ]}
                  onPress={() => {
                    scrollToIdx(index);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={[
                    styles.dropdownRowText,
                    index === visibleIdx && styles.dropdownRowTextActive,
                  ]}>
                    {MONTHS_FR[item.month]} {item.year}
                  </Text>
                </TouchableOpacity>
              )}
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
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 4,
  },
  dayCellToday: { backgroundColor: 'rgba(1, 200, 83, 0.15)' },
  dayNumberWrap: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2, marginBottom: 2,
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
