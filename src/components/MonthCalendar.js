import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

// Calendrier mensuel avec points colorés.
// Props :
// - markersByDay : Map<dayKey "YYYY-MM-DD", string[]> où string[] est la liste des couleurs à afficher comme points pour ce jour
// - onDayPress(dayKey, dayTimestamp) : callback au tap sur un jour
// - initialMonth : Date object pointant sur le mois à afficher (défaut = mois courant)
//
// La règle d'affichage des points est gérée par le parent qui construit `markersByDay`.

const DAYS_FR_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dayKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export default function MonthCalendar({ markersByDay = {}, onDayPress, initialMonth }) {
  const [viewedMonth, setViewedMonth] = useState(() => {
    const d = initialMonth ? new Date(initialMonth) : new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const grid = useMemo(() => {
    // Premier jour du mois
    const first = new Date(viewedMonth);
    // Dernier jour du mois
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    // Premier jour de la semaine (lundi=0)
    let firstWeekDay = first.getDay() - 1; // dimanche=0 -> -1
    if (firstWeekDay < 0) firstWeekDay = 6;

    const cells = [];
    // Padding début
    for (let i = 0; i < firstWeekDay; i++) {
      cells.push(null);
    }
    // Jours du mois
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(first.getFullYear(), first.getMonth(), d);
      cells.push(date);
    }
    // Padding fin pour compléter la dernière ligne
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [viewedMonth]);

  const goPrev = () => {
    const d = new Date(viewedMonth);
    d.setMonth(d.getMonth() - 1);
    setViewedMonth(d);
  };

  const goNext = () => {
    const d = new Date(viewedMonth);
    d.setMonth(d.getMonth() + 1);
    setViewedMonth(d);
  };

  const monthLabel = `${MONTHS_FR[viewedMonth.getMonth()]} ${viewedMonth.getFullYear()}`;

  return (
    <View style={styles.container}>
      {/* Header navigation */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goPrev}
          style={styles.navBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={22}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={goNext}
          style={styles.navBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Header jours de la semaine */}
      <View style={styles.weekHeader}>
        {DAYS_FR_SHORT.map((d, i) => (
          <View key={i} style={styles.weekHeaderCell}>
            <Text style={styles.weekHeaderText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Grille */}
      <View style={styles.grid}>
        {grid.map((date, i) => {
          if (!date) {
            return <View key={i} style={styles.dayCell} />;
          }
          const key = dayKeyOf(date);
          const markers = markersByDay[key] || [];
          const isToday = date.getTime() === today.getTime();
          const isFuture = date.getTime() > today.getTime();

          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.dayCell,
                isToday && styles.dayCellToday,
              ]}
              onPress={() => !isFuture && onDayPress?.(key, date.getTime())}
              disabled={isFuture}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  styles.dayNumber,
                  isFuture && styles.dayNumberFuture,
                  isToday && styles.dayNumberToday,
                ]}
              >
                {date.getDate()}
              </Text>
              {markers.length > 0 && (
                <View style={styles.markersRow}>
                  {markers.slice(0, 5).map((color, idx) => (
                    <View
                      key={idx}
                      style={[styles.marker, { backgroundColor: color }]}
                    />
                  ))}
                  {markers.length > 5 && (
                    <Text style={styles.moreMarkers}>+{markers.length - 5}</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  navBtn: {
    padding: theme.spacing.xs,
  },
  monthLabel: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 1,
    textTransform: 'lowercase',
  },
  weekHeader: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  weekHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekHeaderText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '400',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 4,
  },
  dayCellToday: {
    backgroundColor: theme.colors.surface,
  },
  dayNumber: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    marginTop: 4,
    marginBottom: 4,
  },
  dayNumberToday: {
    fontWeight: '500',
  },
  dayNumberFuture: {
    color: theme.colors.textFaint,
  },
  markersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  marker: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  moreMarkers: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '400',
    marginLeft: 1,
  },
});
