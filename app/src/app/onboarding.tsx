import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextButton } from '@/components/Button';
import { CameraIcon } from '@/components/icons';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { useOnboarding } from '@/onboarding/context';
import { OnboardingPage } from '@/onboarding/OnboardingPage';
import { SCREENS } from '@/onboarding/screens';
import { buttonHeight, cameraColors, colors, radius, spacing, touchTarget } from '@/theme/tokens';

const LAST = SCREENS.length - 1;
// "Scan a plant" takes Next's place, so the second tap of a double tap on Next would land on it.
const DOUBLE_TAP_MS = 300;
// Longer than any paging animation, so it only ends a scroll that was cut short.
const AIM_TIMEOUT_MS = 1000;
const DOT_SIZE = 8;

export default function OnboardingScreen() {
  const { finish } = useOnboarding();
  // The window until the first layout, then this screen's real size: pages and the
  // footer must agree on where the bottom is.
  const [{ width, height }, setSize] = useState<{ width: number; height: number }>(() =>
    Dimensions.get('window'),
  );
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  // The page an animated scroll of ours is heading for. Until it arrives, its
  // positions must not overwrite the index, which is already right.
  const scrollTarget = useRef<number | null>(null);
  const lastX = useRef(0);
  // Whether a position came in since the target was set, and the timer that gives up on it.
  const movedSinceAim = useRef(false);
  const aimTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shownAt = useRef(0);
  const announced = useRef(index);

  const bottomPadding = Math.max(insets.bottom, spacing.lg);
  const actionsHeight = buttonHeight + spacing.sm + touchTarget + bottomPadding;
  const dotsHeight = spacing.lg + DOT_SIZE + spacing.lg;
  const isLast = index === LAST;

  useEffect(() => {
    shownAt.current = Date.now();
    if (announced.current === index) return;
    announced.current = index;
    const { title, body } = SCREENS[index];
    AccessibilityInfo.announceForAccessibility(
      `Step ${index + 1} of ${SCREENS.length}. ${title}. ${body}`,
    );
  }, [index]);

  // A scroll can be cut short with no drag (screen reader paging), so the target never
  // arrives. After AIM_TIMEOUT_MS, stop waiting and follow the last position.
  // ponytail: fixed timeout, a scroll-end event per platform if it ever proves too short.
  const aimAt = useCallback(
    (target: number | null) => {
      clearTimeout(aimTimer.current);
      scrollTarget.current = target;
      movedSinceAim.current = false;
      if (target === null) return;
      aimTimer.current = setTimeout(() => {
        if (scrollTarget.current !== target) return;
        scrollTarget.current = null;
        if (movedSinceAim.current && width > 0) {
          setIndex(Math.min(LAST, Math.max(0, Math.round(lastX.current / width))));
        }
      }, AIM_TIMEOUT_MS);
    },
    [width],
  );
  useEffect(() => () => clearTimeout(aimTimer.current), []);

  const goTo = useCallback(
    (next: number) => {
      aimAt(reduceMotion ? null : next);
      setIndex(next);
      pager.current?.scrollTo({ x: next * width, animated: !reduceMotion });
    },
    [width, reduceMotion, aimAt],
  );

  // Keeps the current screen aligned when the width changes (split screen, foldables).
  const laidOutWidth = useRef(width);
  useEffect(() => {
    if (laidOutWidth.current === width) return;
    laidOutWidth.current = width;
    // The offset moves to fit the new width, and those positions aren't a page change.
    // If it's already in place no event comes, so nothing is waited for.
    const x = index * width;
    aimAt(Math.abs(lastX.current - x) > 1 ? index : null);
    pager.current?.scrollTo({ x, animated: false });
  }, [width, index, aimAt]);

  useFocusEffect(
    useCallback(() => {
      if (index === 0) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        goTo(index - 1);
        return true;
      });
      return () => subscription.remove();
    }, [index, goTo]),
  );

  // Follows the position rather than one end-of-scroll event: momentum-end doesn't fire
  // for every drag, nor for screen reader paging.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    const { x } = event.nativeEvent.contentOffset;
    lastX.current = x;
    movedSinceAim.current = true;
    if (scrollTarget.current !== null) {
      if (Math.abs(x - scrollTarget.current * width) > 1) return;
      scrollTarget.current = null;
    }
    setIndex(Math.min(LAST, Math.max(0, Math.round(x / width))));
  };

  const scanPlant = () => {
    if (Date.now() - shownAt.current < DOUBLE_TAP_MS) return;
    finish(true);
  };

  return (
    <View
      testID="onboarding-screen"
      style={styles.screen}
      onLayout={(event) => setSize(event.nativeEvent.layout)}>
      <StatusBar style="light" />
      <ScrollView
        ref={pager}
        testID="onboarding-pager"
        horizontal
        pagingEnabled
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => aimAt(null)}
        onScroll={onScroll}>
        {SCREENS.map((screen, i) => (
          <OnboardingPage
            key={screen.title}
            screen={screen}
            size={{ width, height }}
            topInset={insets.top}
            footerHeight={actionsHeight + dotsHeight}
            showLogo={i === 0}
            current={i === index}
          />
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
        <View
          style={styles.dots}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {SCREENS.map((screen, i) => (
            <View key={screen.title} style={[styles.dot, i === index && styles.dotCurrent]} />
          ))}
        </View>
        {isLast ? (
          <Button
            label="Scan a plant"
            tone="onDark"
            icon={<CameraIcon color={colors.text} size={22} />}
            onPress={scanPlant}
          />
        ) : (
          <Button label="Next" tone="onDark" onPress={() => goTo(index + 1)} />
        )}
        <View style={styles.secondary}>
          <TextButton
            label={isLast ? 'Look around first' : 'Skip'}
            tone="onDark"
            onPress={() => finish()}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: cameraColors.ground },
  footer: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 0,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    height: DOT_SIZE,
    marginBottom: spacing.lg,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.pill,
    backgroundColor: cameraColors.caption,
    opacity: 0.55,
  },
  dotCurrent: { width: 24, backgroundColor: cameraColors.text, opacity: 1 },
  secondary: { marginTop: spacing.sm },
});
