import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Pressable,
} from 'react-native';
import { theme } from '../theme';
import { formatDateLong, formatTime } from '../utils/dates';

export default function GlobalHistoryView({ consumptions, substancesById, onTapConsumption }) {
  const [selectedSet, setSelectedSet] = useState(null);

  const presentSubstances = useMemo(() => {
    if (!consumptions) return [];
    const ids = new Set();
    for (const c of consumptions) {
      const sid = c.substanceId ?? c.substance_id;
      if (sid) ids.add(sid);
    }
    return Array.from(ids)
      .map((id) => substancesById?.[id])
      .filter(Boolean)
      .sort((a, b) => a.color.localeCompare(b.color));
  }, [consumptions, substancesById]);

  const filtered = useMemo(() => {
    if (!consumptions) return null;
    if (!selectedSet) return consumptions; // Toutes

    // Pour chaque jour, regroupe les substances consommées
    const subsByDay = new Map();
    for (const c of consumptions) {
      const d = new Date(c.timestamp);
      d.setHours(0, 0, 0, 0);
      const dayKey = d.getTime();
      const sid = c.substanceId ?? c.substance_id;
      if (!subsByDay.has(dayKey)) subsByDay.set(dayKey, new Set());
      subsByDay.get(dayKey).add(sid);
    }

    // Garde uniquement les jours qui contiennent TOUTES les substances cochées (AND)
    const matchingDays = new Set();
    for (const [day, subs] of subsByDay.entries()) {
      let allMatch = true;
      for (const wanted of selectedSet) {
        if (!subs.has(wanted)) { allMatch = false; break; }
      }
      if (allMatch) matchingDays.add(day);
    }

    // Pour ces jours, on retourne uniquement les consos des substances cochées
    return consumptions.filter((c) => {
      const d = new Date(c.timestamp);
      d.setHours(0, 0, 0, 0);
      const sid = c.substanceId ?? c.substance_id;
      return matchingDays.has(d.getTime()) && selectedSet.has(sid);
    });
  }, [consumptions, selectedSet]);

  const grouped = useMemo(() => {
    if (!filtered) return [];
    const map = new Map();
    for (const c of filtered) {
      const d = new Date(c.timestamp);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([k, items]) => ({
        dayTs: k,
        items: items.sort((a, b) => b.timestamp - a.timestamp),
      }));
  }, [filtered]);

  const toggleSubstance = (subId) => {
    setSelectedSet((prev) => {
      if (!prev) return new Set([subId]);
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      if (next.size === 0) return null;
      return next;
    });
  };

  const selectAll = () => setSelectedSet(null);

  if (!consumptions || consumptions.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Aucune consommation enregistrée</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pillsRow}>
        <Pill
          label="Toutes"
          active={selectedSet === null}
          color={theme.colors.text}
          onPress={selectAll}
        />
        {presentSubstances.map((sub) => (
          <Pill
            key={sub.id}
            label={sub.name}
            color={sub.color}
            active={selectedSet !== null && selectedSet.has(sub.id)}
            onPress={() => toggleSubstance(sub.id)}
          />
        ))}
      </View>

      {grouped.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Aucune conso correspondante</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(item) => String(item.dayTs)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View>
              <Text style={styles.dayHeader}>{formatDateLong(item.dayTs)}</Text>
              {item.items.map((c) => {
                const sid = c.substanceId ?? c.substance_id;
                const sub = substancesById?.[sid];
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onTapConsumption?.(c)}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  >
                    <View style={[styles.bullet, { backgroundColor: sub?.color || theme.colors.textFaint }]} />
                    <Text style={styles.time}>{formatTime(c.timestamp)}</Text>
                    <Text style={styles.subName} numberOfLines={1}>{sub?.name || '—'}</Text>
                    {c.dosage != null && c.dosage !== '' && (
                      <Text style={styles.dosage}>{c.dosage}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        />
      )}
    </View>
  );
}

function Pill({ label, color, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        active && { borderColor: color, backgroundColor: theme.colors.surfaceAlt },
      ]}
      activeOpacity={0.7}
    >
      <Text
        style={[styles.pillText, { color: active ? color : theme.colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
    marginBottom: 8,
    height: 30,
    justifyContent: 'center',
    minWidth: 60,
  },
  pillText: {
    fontSize: theme.font.sizes.xs,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  listContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: 60 },
  dayHeader: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.xs,
    fontWeight: '400',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rowPressed: { backgroundColor: theme.colors.surface },
  bullet: { width: 8, height: 8, borderRadius: 4 },
  time: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    minWidth: 50,
  },
  subName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  dosage: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  placeholderText: {
    color: theme.colors.textFaint,
    fontSize: theme.font.sizes.sm,
    fontWeight: '300',
    fontStyle: 'italic',
  },
});
