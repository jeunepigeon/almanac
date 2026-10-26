// Champ PIN 4 chiffres avec :
//  - placeholder "••••" centré, pas de blinking cursor
//  - état d'erreur (rouge + shake + haptic error) via ref.setError(msg)
//  - message d'erreur sous le champ (petit, rouge, place pré-réservée pour ne pas décaler le layout)
//  - submit (bouton clavier "entrée") → callback onSubmitEditing

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, TextInput, StyleSheet, Animated, Text } from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const PinField = forwardRef(function PinField(
  {
    value, onChangeText,
    placeholder = '••••',
    autoFocus = false,
    onSubmitEditing,
    returnKeyType = 'next',
  },
  ref
) {
  const inputRef = useRef(null);
  const shake = useRef(new Animated.Value(0)).current;
  const [errorMsg, setErrorMsg] = useState(null);

  const triggerShake = (msg = null) => {
    haptics.error();
    setErrorMsg(msg);
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const clearError = () => setErrorMsg(null);

  useImperativeHandle(ref, () => ({
    shake: (msg) => triggerShake(msg),
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    clearError,
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(v) => { onChangeText(v.replace(/\D/g, '').slice(0, 4)); if (errorMsg) clearError(); }}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textFaint}
          style={[styles.input, errorMsg && styles.inputError]}
          secureTextEntry
          autoFocus={autoFocus}
          keyboardType="number-pad"
          maxLength={4}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="oneTimeCode"
          caretHidden
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          blurOnSubmit={false}
        />
      </Animated.View>
      {/* Placeholder du message d'erreur : place toujours réservée pour éviter le décalage. */}
      <Text style={[styles.errorText, { opacity: errorMsg ? 1 : 0 }]}>
        {errorMsg || ' '}
      </Text>
    </View>
  );
});

export default PinField;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  input: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    textAlign: 'center',
  },
  inputError: {
    color: theme.colors.danger,
    borderBottomColor: theme.colors.danger,
    borderBottomWidth: 1.5,
  },
  errorText: {
    marginTop: 4,
    minHeight: 14,
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
