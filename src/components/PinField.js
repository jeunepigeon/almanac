// Champ PIN 4 chiffres avec tremblement des asterisques + haptic error au PIN incorrect.
// Durée courte (~300ms, 3 oscillations).

import { useRef, useImperativeHandle, forwardRef } from 'react';
import { View, TextInput, StyleSheet, Animated } from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const PinField = forwardRef(function PinField(
  { value, onChangeText, placeholder = '••••', autoFocus = true },
  ref
) {
  const shake = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    haptics.error();
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  useImperativeHandle(ref, () => ({
    shake: triggerShake,
  }));

  return (
    <Animated.View style={{ transform: [{ translateX: shake }] }}>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/\D/g, '').slice(0, 4))}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textFaint}
        style={styles.input}
        secureTextEntry
        autoFocus={autoFocus}
        keyboardType="number-pad"
        maxLength={4}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="oneTimeCode"
      />
    </Animated.View>
  );
});

export default PinField;

const styles = StyleSheet.create({
  input: {
    color: theme.colors.text, fontSize: theme.font.sizes.lg,
    fontWeight: '400', letterSpacing: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
});
