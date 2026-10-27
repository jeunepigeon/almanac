// Champ PIN 4 chiffres v1.1.18.5
//  - 4 dots visuels ; le dot courant PULSE quand le champ a le focus
//    (si le champ est plein, c'est le 4e dot plein qui pulse)
//  - Le TextInput couvre toute la zone des dots (transparent) → 1 seul tap pour sélectionner,
//    plus de focus() JS sur un input caché (source du « 1er tap ferme juste le clavier »)
//  - shake + haptic error + message rouge sous le champ (place réservée)

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, Animated, Text } from 'react-native';
import { theme } from '../theme';
import haptics from '../utils/haptics';

const PinField = forwardRef(function PinField(
  { value, onChangeText, autoFocus = false, onSubmitEditing, returnKeyType = 'next' },
  ref
) {
  const inputRef = useRef(null);
  const shake = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [errorMsg, setErrorMsg] = useState(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]));
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
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.2] });
  const dotColor = errorMsg ? theme.colors.danger : theme.colors.text;
  const emptyColor = errorMsg ? theme.colors.danger : theme.colors.textMuted;

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shake }] }]}>
        <View style={styles.dotsInner} pointerEvents="none">
          {[0, 1, 2, 3].map((i) => {
            const filled = i < value.length;
            const pulsing = focused && i === activeIdx;
            const base = [
              styles.dot,
              filled ? { backgroundColor: dotColor, borderColor: dotColor } : [styles.dotEmpty, { borderColor: pulsing ? dotColor : emptyColor }],
            ];
            if (pulsing) {
              return (
                <Animated.View
                  key={i}
                  style={[...base, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]}
                />
              );
            }
            return <View key={i} style={[...base, !filled && { opacity: 0.5 }]} />;
          })}
        </View>
        {/* TextInput transparent posé PAR-DESSUS les dots : tap direct = focus natif */}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(v) => {
            onChangeText(v.replace(/\D/g, '').slice(0, 4));
            if (errorMsg) setErrorMsg(null);
          }}
          style={styles.overlayInput}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          maxLength={4}
          autoCorrect={false}
          caretHidden
          contextMenuHidden
          selectionColor="transparent"
          underlineColorAndroid="transparent"
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          blurOnSubmit={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </Animated.View>
      <Text style={[styles.errorText, { opacity: errorMsg ? 1 : 0 }]}>{errorMsg || ' '}</Text>
    </View>
  );
});

export default PinField;

const styles = StyleSheet.create({
  wrap: { marginBottom: 2 },
  dotsRow: {
    position: 'relative',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  dotsInner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  dotEmpty: { backgroundColor: 'transparent' },
  overlayInput: {
    ...StyleSheet.absoluteFillObject,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 1,
    padding: 0,
  },
  errorText: {
    marginTop: 4, minHeight: 14,
    color: theme.colors.danger, fontSize: 11, fontWeight: '400',
    textAlign: 'center', letterSpacing: 0.3,
  },
});
