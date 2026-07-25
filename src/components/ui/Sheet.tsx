import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface SheetProps {
  isOpen: boolean;
  /** Called on backdrop tap, grabber-area swipe-down intent, or hardware back. */
  onClose: () => void;
  /** Rendered as the sheet's heading; also anchors VoiceOver's first focus. */
  title?: string;
  children: ReactNode;
}

/** Slide timings; exit is quicker than entry, like every iOS sheet. */
const ENTER_MS = 280;
const EXIT_MS = 200;
/** Fallback slide distance until the panel reports its measured height. */
const FALLBACK_HEIGHT = 400;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A bottom sheet in the iOS idiom (DESIGN_REVIEW.md §4: 24 pt top radius,
 * system-style grabber), built on the plain `Modal` — no gesture library,
 * no new dependency.
 *
 * Mount/unmount is decoupled from `isOpen` so the exit animation gets to
 * finish: closing animates the panel down over `EXIT_MS`, then unmounts.
 * Under Reduce Motion both directions snap, and the unmount timer simply
 * fires early into an already-settled layout.
 */
export function Sheet({ isOpen, onClose, title, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  const [isMounted, setIsMounted] = useState(false);
  const progress = useSharedValue(0);
  const panelHeight = useSharedValue(FALLBACK_HEIGHT);

  // The latest onClose without re-arming the close timer.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // One effect owns both the mount lifecycle and the tweens: opening defers
  // mounting a tick so the Modal exists before the slide-in starts, then this
  // re-runs on the mount flip and starts the entry; closing runs the exit and
  // unmounts after it lands.
  useEffect(() => {
    if (isOpen) {
      if (!isMounted) {
        const timer = setTimeout(() => setIsMounted(true), 0);
        return () => clearTimeout(timer);
      }
      progress.value = withTiming(1, {
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      });
      return;
    }

    if (!isMounted) return;
    progress.value = withTiming(0, {
      duration: EXIT_MS,
      easing: Easing.in(Easing.ease),
      reduceMotion: ReduceMotion.System,
    });
    const timer = setTimeout(() => setIsMounted(false), EXIT_MS + 30);
    return () => clearTimeout(timer);
  }, [isOpen, isMounted, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.6 }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * panelHeight.value }],
  }));

  if (!isMounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onCloseRef.current()}
    >
      <View className="flex-1 justify-end">
        <AnimatedPressable
          style={backdropStyle}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => onCloseRef.current()}
          className="absolute inset-0 bg-black"
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            style={[panelStyle, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
            onLayout={(event) => {
              panelHeight.value = event.nativeEvent.layout.height;
            }}
            accessibilityViewIsModal
            className="rounded-t-sheet border-t border-hairline bg-canvas-raised px-4 pt-3"
          >
            {/* System-style grabber: decorative — the backdrop and hardware
                back both close, so it needs no gesture of its own. */}
            <View
              accessibilityElementsHidden
              className="mb-4 h-1 w-9 self-center rounded-full bg-canvas-overlay"
            />
            {title ? (
              <Text
                accessibilityRole="header"
                maxFontSizeMultiplier={1.4}
                className="mb-4 text-title2 font-semibold text-ink"
              >
                {title}
              </Text>
            ) : null}
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
