import { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Pressable, ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { formatDate, formatTime } from '../utils/dates';

export default function LogConsumptionModal({
  visible, mode = 'create', substance, initial, prefilledDate,
  onSubmit, onDelete, onClose,
}) {
  const [date, setDate] = useState(new Date());
  const [dosage, setDosage] = useState('');
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editLocked, setEditLocked] = useState(mode === 'edit');

  useEffect(() => {
    if (visible) {
      if (initial) {
        setDate(new Date(initial.timestamp));
        setDosage(initial.dosage != null ? String(initial.dosage) : '');
        setNotes(initial.notes ?? '');
        setEditLocked(true);
      } else if (prefilledDate) {
        const today = new Date(); today.setHours(0,0,0,0);
        const target = new Date(prefilledDate); target.setHours(0,0,0,0);
        if (target.getTime() === today.getTime()) {
          setDate(new Date());
        } else {
          const d = new Date(prefilledDate);
          d.setHours(12, 0, 0, 0);
          setDate(d);
        }
        setDosage(''); setNotes(''); setEditLocked(false);
      } else {
        setDate(new Date()); setDosage(''); setNotes(''); setEditLocked(false);
      }
    }
  }, [visible, initial, prefilledDate, mode]);

  const isLocked = mode === 'edit' && editLocked;

  const handleDateChange = (_e, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(date);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      const now = new Date();
      setDate(newDate.getTime() > now.getTime() ? now : newDate);
    }
  };

  const handleTimeChange = (_e, selectedTime) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(date);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      newDate.setSeconds(0);
      const now = new Date();
      setDate(newDate.getTime() > now.getTime() ? now : newDate);
    }
  };

  const handleSubmit = () => {
    // dosage : on accepte virgule comme séparateur décimal
    const cleaned = dosage.trim().replace(',', '.');
    let dosageValue = null;
    if (cleaned !== '') {
      const n = Number(cleaned);
      if (Number.isFinite(n)) dosageValue = n;
    }
    onSubmit({
      timestamp: date.getTime(),
      dosage: dosageValue,
      notes: notes.trim() || null,
    });
  };

  const setNow = () => setDate(new Date());

  const titles = {
    create: substance ? `Logger ${substance.name}` : 'Nouvelle consommation',
    edit: 'Consommation',
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.titleRow}>
                {substance && <View style={[styles.colorDot, { backgroundColor: substance.color }]} />}
                <Text style={styles.title}>{titles[mode]}</Text>
              </View>

              <Text style={styles.fieldLabel}>Date et heure</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity
                  onPress={() => !isLocked && setShowDatePicker(true)}
                  style={[styles.dateBtn, isLocked && styles.btnLocked]}
                  disabled={isLocked}
                >
                  <MaterialCommunityIcons name="calendar" size={16} color={theme.colors.textMuted} />
                  <Text style={styles.dateBtnText}>{formatDate(date.getTime())}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => !isLocked && setShowTimePicker(true)}
                  style={[styles.dateBtn, isLocked && styles.btnLocked]}
                  disabled={isLocked}
                >
                  <MaterialCommunityIcons name="clock-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={styles.dateBtnText}>{formatTime(date.getTime())}</Text>
                </TouchableOpacity>

                {!isLocked && (
                  <TouchableOpacity onPress={setNow} style={styles.nowBtn}>
                    <Text style={styles.nowBtnText}>maintenant</Text>
                  </TouchableOpacity>
                )}
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  onChange={handleDateChange}
                />
              )}
              {showTimePicker && (
                <DateTimePicker
                  value={date}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour
                  onChange={handleTimeChange}
                />
              )}

              <Text style={styles.fieldLabel}>Dosage (optionnel, numérique)</Text>
              <TextInput
                value={dosage}
                onChangeText={setDosage}
                placeholder="ex : 50, 0.5, 2..."
                placeholderTextColor={theme.colors.textFaint}
                style={[styles.input, isLocked && styles.inputLocked]}
                editable={!isLocked}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />

              <Text style={styles.fieldLabel}>Commentaire (optionnel)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="contexte, ressenti, unité..."
                placeholderTextColor={theme.colors.textFaint}
                style={[styles.input, styles.inputMulti, isLocked && styles.inputLocked]}
                multiline
                editable={!isLocked}
              />

              <View style={styles.actions}>
                {mode === 'edit' && onDelete && (
                  <TouchableOpacity onPress={onDelete} style={styles.actionBtn}>
                    <Text style={styles.actionDanger}>Supprimer</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={onClose} style={styles.actionBtn}>
                  <Text style={styles.actionMuted}>Fermer</Text>
                </TouchableOpacity>
                {mode === 'edit' ? (
                  isLocked ? (
                    <TouchableOpacity onPress={() => setEditLocked(false)} style={styles.actionBtn}>
                      <Text style={styles.actionPrimary}>Modifier</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={handleSubmit} style={styles.actionBtn}>
                      <Text style={styles.actionPrimary}>Enregistrer</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <TouchableOpacity onPress={handleSubmit} style={styles.actionBtn}>
                    <Text style={styles.actionPrimary}>Valider</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 4,
    padding: theme.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    maxHeight: '90%',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: theme.colors.text, fontSize: theme.font.sizes.lg, fontWeight: '300', letterSpacing: 1 },
  fieldLabel: {
    color: theme.colors.textMuted, fontSize: theme.font.sizes.sm,
    fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: theme.spacing.sm, marginTop: theme.spacing.sm,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md, flexWrap: 'wrap' },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4,
  },
  btnLocked: { opacity: 0.6 },
  dateBtnText: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300', fontVariant: ['tabular-nums'] },
  nowBtn: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  nowBtnText: { color: theme.colors.textMuted, fontSize: theme.font.sizes.sm, fontWeight: '300', letterSpacing: 0.5, textDecorationLine: 'underline' },
  input: {
    color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '300',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.md,
  },
  inputLocked: { opacity: 0.7 },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, marginTop: theme.spacing.lg, flexWrap: 'wrap' },
  actionBtn: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.sm },
  actionMuted: { color: theme.colors.textMuted, fontSize: theme.font.sizes.md, fontWeight: '300', letterSpacing: 1 },
  actionPrimary: { color: theme.colors.text, fontSize: theme.font.sizes.md, fontWeight: '400', letterSpacing: 1 },
  actionDanger: { color: theme.colors.danger, fontSize: theme.font.sizes.md, fontWeight: '400', letterSpacing: 1 },
});
