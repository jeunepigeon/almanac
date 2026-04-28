import { useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated,
  PanResponder, Dimensions, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

const { height: SCREEN_H } = Dimensions.get('window');
const MAX_HEIGHT = SCREEN_H * 0.85;

// Bottom sheet réutilisable.
// - hauteur adaptative au contenu (jusqu'à 85% de l'écran)
// - drag down pour fermer (au-delà d'un seuil)
// - bouton X dans le header
// Props:
//   visible, title, onClose, children
export default function BottomSheet({ visible, title, onClose, children }) {
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const dragY = useRef(0);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SCREEN_H,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          translateY.setValue(g.dy);
          dragY.current = g.dy;
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.8) {
          // ferme
          Animated.timing(translateY, {
            toValue: SCREEN_H,
            duration: 180,
            useNativeDriver: true,
          }).start(() => onClose?.());
        } else {
          // remet en place
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
        dragY.current = 0;
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
          onStartShouldSetResponder={() => true}
        >
          <Pressable onPress={() => {}} style={styles.inner}>
            <View {...panResponder.panHandlers} style={styles.dragArea}>
              <View style={styles.handle} />
            </View>

            <View style={styles.header}>
              {title ? <Text style={styles.title}>{title}</Text> : <View />}
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.body}>{children}</View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: MAX_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  inner: { paddingBottom: theme.spacing.lg },
  dragArea: { paddingVertical: theme.spacing.sm, alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.textFaint, opacity: 0.6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.sizes.md,
    fontWeight: '300',
    letterSpacing: 1,
    textTransform: 'lowercase',
    flex: 1,
  },
  closeBtn: { padding: theme.spacing.xs },
  body: { paddingTop: theme.spacing.xs },
});
