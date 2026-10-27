// Champ PIN 4 chiffres custom :
//  - 4 dots visuels dont les positions remplies sont pleines, les vides sont évidées
//  - le dot courant (position = value.length) PULSE légèrement quand le champ a le focus
//  - shake + haptic error + message rouge sous le champ
//  - pas de cursor Android (caretHidden) — l'indicateur de focus est le dot qui pulse

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, Animated, Text, Pressable } from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const PinField = forwardRef(function PinField(
  {
    value, onChangeText,
    autoFocus = false,
    onSubmitEditing,
    returnKeyType = 'next',
    testID,
  },
  ref
) {
  const inputRef = useRef(null);
  const shake = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [errorMsg, setErrorMsg] = useState(null);
  const [focused, setFocused] = useState(false);

  // Pulse de l'indicateur de focus (dot courant)
  useEffect(() => {
    if (!focused) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [focused, pulse]);

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

  useImperativeHandle(ref, () => ({
    shake: (msg) => triggerShake(msg),
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    clearError: () => setErrorMsg(null),
  }));

  const activeIdx = Math.min(value.length, 3);

  // Opacité et scale du dot pulsant
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] });

  const dotColor = errorMsg ? theme.colors.danger : theme.colors.text;
  const emptyDotColor = errorMsg ? theme.colors.danger : theme.colors.textMuted;

  return (
    <View style={styles.wrap} testID={testID}>
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <Pressable onPress={() => inputRef.current?.focus()} style={styles.dotsRow}>
          {[0, 1, 2, 3].map((i) => {
            const filled = i < value.length;
            const isActive = focused && i === activeIdx;
            if (filled) {
              return (
                <View
                  key={i}
                  style={[styles.dot, { backgroundColor: dotColor, borderColor: dotColor }]}
                />
              );
            }
            if (isActive) {
              return (
                <Animated.View
                  key={i}
                  style={[
                    styles.dot,
                    styles.dotEmpty,
                    { borderColor: dotColor, opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
                  ]}
                />
              );
            }
            return (
              <View
                key={i}
                style={[styles.dot, styles.dotEmpty, { borderColor: emptyDotColor, opacity: 0.5 }]}
              />
            );
          })}
        </Pressable>
      </Animated.View>

      {/* TextInput invisible pour capter la saisie clavier */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) => {
          onChangeText(v.replace(/\D/g, '').slice(0, 4));
          if (errorMsg) setErrorMsg(null);
        }}
        style={styles.hiddenInput}
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />

      <Text style={[styles.errorText, { opacity: errorMsg ? 1 : 0 }]}>
        {errorMsg || ' '}
      </Text>
    </View>
  );
});

export default PinField;

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5,
  },
  dotEmpty: {
    backgroundColor: 'transparent',
  },
  hiddenInput: {
    // Caché mais pas display:none (sinon pas de focus clavier)
    position: 'absolute',
    width: 1, height: 1,
    opacity: 0,
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
