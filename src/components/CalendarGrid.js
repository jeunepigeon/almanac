import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import {
  buildMonthGrid,
  formatMonthYear,
  startOfDay,
  DAYS_FR_INITIALS,
} from '../utils/dates';

// CalendarGrid affiche une grille mensuelle navigable.
// Props :
// - dotsByDay : Map ou objet { dayTimestamp: [{color, count?}] }
//   Pour chaque jour, on passe un tableau d'objets avec une couleur (et un éventuel count, non utilisé pour l'affichage des points)
// - onDayPress(dayTs) : appelé quand on tape sur un jour
// - initialDate : Date de départ (par défaut : aujourd'hui)
export default function CalendarGrid({ dotsByDay = {}, onDayPress, initialDate }) {
  const [cursor, setCursor] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor]
  );

  const goPrev = () => {
    setCursor((c) => {
      const m = c.month - 1;
      if (m < 0) return { year: c.year - 1, month: 11 };
      return { year: c.year, month: m };
    });
  };

  const goNext = () => {
    setCursor((c) => {
      const m = c.month + 1;
      if (m > 11) return { year: c.year + 1, month: 0 };
      return { year: c.year, month: m };
    });
  };

  const goToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const monthLabelTs = new Date(cursor.year, cursor.month, 1).getTime();

  return (
    <View style={styles.container}>
      {/* Header navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goPrev} hitSlop={12} style={styles.navBtn}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={goToday} style={styles.titleBtn}>
          <Text style={styles.title}>{formatMonthYear(monthLabelTs)}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={goNext} hitSlop={12} style={styles.navBtn}>
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* En-tête jours */}
      <View style={styles.weekRow}>
        {DAYS_FR_INITIALS.map((d, i) => (
          <View key={i} style={styles.weekCell}>
            <Text style={styles.weekText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Grille */}
      <View style={styles.grid}>
        {cells.map((cell, idx) => {
          const dots = dotsByDay[cell.dayTs] || [];
          return (
            <DayCell
              key={cell.dayTs + '-' + idx}
              cell={cell}
              dots={dots}
              onPress={() => {
                if (cell.isFuture) return;
                onDayPress?.(cell.dayTs);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function DayCell({ cell, dots, onPress }) {
  const date = new Date(cell.dayTs);
  const dayNum = date.getDate();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        pressed && !cell.isFuture && styles.cellPressed,
      ]}
      disabled={cell.isFuture}
    >
      <Text
        style={[
          styles.dayNum,
          cell.isOtherMonth && styles.dayNumOther,
          cell.isFuture && styles.dayNumFuture,
          cell.isToday && styles.dayNumToday,
        ]}
      >
        {dayNum}
      </Text>

      <View style={styles.dotsRow}>
        {dots.slice(0, 6).map((dot, i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: dot.color }]}
          />
        ))}
        {dots.length > 6 && (
          <Text style={styles.moreText}>+{dots.length - 6}</Text>
        )}
      </View>
    </Pressable>
  );
}

const CELL_HEIGHT = 52;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  navBtn: {
    padding: theme.spacing.xs,
  },
  titleBtn: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '400',
    letterSpacing: 1,
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  weekText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.xs,
    fontWeight: '400',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    height: CELL_HEIGHT,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  cellPressed: {
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
  },
  dayNum: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  dayNumOther: {
    color: theme.colors.textFaint,
  },
  dayNumFuture: {
    color: theme.colors.textFaint,
    opacity: 0.4,
  },
  dayNumToday: {
    color: theme.colors.text,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  moreText: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '400',
    marginLeft: 1,
  },
});
