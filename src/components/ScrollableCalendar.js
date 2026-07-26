import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

// Calendrier scrollable vertical avec mois empilés.
// - Mois courant en haut, on scroll vers le BAS pour voir les mois PLUS ANCIENS
// - Pas de scroll vers le futur
// - Barre de nav sticky en haut : chevron-back (mois précédent) | chevron-up-double (aller à aujourd'hui) | chevron-forward (mois suivant) | dropdown sélecteur

const DAYS_FR_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }
function dayKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function MonthGrid({ year, month, markersByDay, onDayPress, showSoberFill }) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Grille : cellules vides avant le premier jour + jours + éventuellement cellules vides après
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
    } else {
      cells.push(new Date(year, month, dayNum));
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
        {cells.map((date, i) => {
          if (!date) return <View key={i} style={styles.dayCell} />;
          const key = dayKeyOf(date);
          const markers = markersByDay[key] || [];
          const isToday = date.getTime() === today.getTime();
          const isFuture = date.getTime() > today.getTime();
          const isSober = showSoberFill && !isFuture && !isToday && markers.length === 0;

          return (
            <TouchableOpacity
              key={i}
              style={[styles.dayCell, isToday && styles.dayCellToday]}
              onPress={() => !isFuture && onDayPress?.(key, date.getTime())}
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
        })}
      </View>
    </View>
  );
}

export default function ScrollableCalendar({ markersByDay = {}, onDayPress, showSoberFill = false }) {
  // Générer les mois à afficher : depuis N mois en arrière jusqu'au mois courant
  const MONTHS_TO_SHOW = 48; // 4 ans d'historique max initial
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Ordre : mois courant EN HAUT, mois plus anciens en dessous
  const months = useMemo(() => {
    const arr = [];
    for (let i = 0; i < MONTHS_TO_SHOW; i++) {
      const d = new Date(currentYear, currentMonth - i, 1);
      arr.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return arr;
  }, [currentYear, currentMonth]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState({ year: currentYear, month: currentMonth });
  const scrollRef = useRef(null);

  const scrollToMonth = useCallback((year, month) => {
    // Trouver l'index dans months
    const idx = months.findIndex((m) => m.year === year && m.month === month);
    if (idx < 0 || !scrollRef.current) return;
    // Estim : chaque mois fait ~ 320-360px
    scrollRef.current.scrollTo({ y: idx * 340, animated: true });
    setVisibleMonth({ year, month });
  }, [months]);

  const goToday = () => scrollToMonth(currentYear, currentMonth);
  const goPrev = () => {
    const d = new Date(visibleMonth.year, visibleMonth.month - 1, 1);
    scrollToMonth(d.getFullYear(), d.getMonth());
  };
  const goNext = () => {
    // Pas de futur
    if (visibleMonth.year > currentYear ||
        (visibleMonth.year === currentYear && visibleMonth.month >= currentMonth)) return;
    const d = new Date(visibleMonth.year, visibleMonth.month + 1, 1);
    scrollToMonth(d.getFullYear(), d.getMonth());
  };

  const canGoNext = visibleMonth.year < currentYear ||
    (visibleMonth.year === currentYear && visibleMonth.month < currentMonth);
  const canGoToday = !(visibleMonth.year === currentYear && visibleMonth.month === currentMonth);

  const visibleLabel = `${MONTHS_FR[visibleMonth.month]} ${visibleMonth.year}`;

  return (
    <View style={styles.container}>
      {/* Barre de nav en haut */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={goPrev} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={canGoToday ? goToday : undefined}
          style={[styles.todayBtn, !canGoToday && styles.btnDisabled]}
          disabled={!canGoToday}
        >
          <Ionicons name="chevron-up" size={14} color={canGoToday ? '#01C853' : theme.colors.textFaint} />
          <Ionicons name="chevron-up" size={14} color={canGoToday ? '#01C853' : theme.colors.textFaint} style={{ marginTop: -8 }} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={canGoNext ? goNext : undefined}
          style={styles.navBtn}
          disabled={!canGoNext}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={20} color={canGoNext ? theme.colors.text : theme.colors.textFaint} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          style={styles.dropdown}
        >
          <Text style={styles.dropdownText}>{visibleLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const idx = Math.floor(y / 340);
          if (months[idx]) setVisibleMonth(months[idx]);
        }}
        scrollEventThrottle={100}
      >
        {months.map((m) => (
          <MonthGrid
            key={`${m.year}-${m.month}`}
            year={m.year}
            month={m.month}
            markersByDay={markersByDay}
            onDayPress={onDayPress}
            showSoberFill={showSoberFill}
          />
        ))}
      </ScrollView>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Aller au mois</Text>
            <FlatList
              data={months}
              keyExtractor={(m) => `${m.year}-${m.month}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    scrollToMonth(item.year, item.month);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={[
                    styles.pickerRowText,
                    item.year === visibleMonth.year && item.month === visibleMonth.month && styles.pickerRowActive,
                  ]}>
                    {MONTHS_FR[item.month]} {item.year}
                  </Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
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
    paddingTop: 4,
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
  scrollContent: {
    paddingBottom: 80,
  },
  monthWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  monthLabel: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 1,
    textTransform: 'lowercase',
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
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
    marginTop: 4,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 4,
  },
  dayCellToday: { backgroundColor: theme.colors.surface },
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
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
  },
  pickerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: theme.spacing.lg,
    width: '80%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  pickerTitle: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  pickerRow: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pickerRowText: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  pickerRowActive: {
    color: '#01C853',
    fontWeight: '500',
  },
});
