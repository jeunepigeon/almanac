import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, ScrollView,
  TouchableOpacity, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { formatDateLong, formatTime } from '../utils/dates';

export default function GlobalHistoryView({ consumptions, substancesById, onTapConsumption }) {
  const [query, setQuery] = useState('');
  const [filterSubId, setFilterSubId] = useState(null);

  // Liste de toutes les substances présentes dans l'historique (uniques)
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

  // Filtrage : substance + texte
  const filtered = useMemo(() => {
    if (!consumptions) return null;
    const q = query.trim().toLowerCase();
    return consumptions.filter((c) => {
      const sid = c.substanceId ?? c.substance_id;
      if (filterSubId && sid !== filterSubId) return false;
      if (!q) return true;
      const sub = substancesById?.[sid];
      const name = (sub?.name || '').toLowerCase();
      const notes = (c.notes || '').toLowerCase();
      const dosage = String(c.dosage ?? '').toLowerCase();
      return name.includes(q) || notes.includes(q) || dosage.includes(q);
    });
  }, [consumptions, query, filterSubId, substancesById]);

  // Groupe par jour
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

  if (!consumptions || consumptions.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Aucune consommation enregistrée</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Barre de recherche */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher dans l'historique..."
          placeholderTextColor={theme.colors.textFaint}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Pills filtres substances */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsRow}
      >
        <Pill
          label="Toutes"
          active={filterSubId === null}
          color={theme.colors.text}
          onPress={() => setFilterSubId(null)}
        />
        {presentSubstances.map((sub) => (
          <Pill
            key={sub.id}
            label={sub.name}
            color={sub.color}
            active={filterSubId === sub.id}
            onPress={() => setFilterSubId(filterSubId === sub.id ? null : sub.id)}
          />
        ))}
      </ScrollView>

      {/* Liste */}
      {grouped.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Aucun résultat</Text>
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
                    <Text style={styles.subName}>{sub?.name || '—'}</Text>
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
      <Text style={[styles.pillText, { color: active ? color : theme.colors.textMuted }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface, borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1, color: theme.colors.text, fontSize: theme.font.sizes.sm,
    fontWeight: '300', padding: 0,
  },
  pillsRow: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  pill: {
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs,
    borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border,
    marginRight: theme.spacing.xs,
  },
  pillText: { fontSize: theme.font.sizes.xs, fontWeight: '300', letterSpacing: 0.5 },
  listContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: 60 },
  dayHeader: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.xs,
    fontWeight: '400', letterSpacing: 1.5, textTransform: 'uppercase',
    marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  rowPressed: { backgroundColor: theme.colors.surface },
  bullet: { width: 8, height: 8, borderRadius: 4 },
  time: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', minWidth: 50,
  },
  subName: {
    flex: 1, color: theme.colors.text, fontSize: theme.font.sizes.sm,
    fontWeight: '300', letterSpacing: 0.5,
  },
  dosage: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '300', fontVariant: ['tabular-nums'],
  },
  placeholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  placeholderText: {
    color: theme.colors.textFaint, fontSize: theme.font.sizes.sm,
    fontWeight: '300', fontStyle: 'italic',
  },
});
