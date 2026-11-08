import { useId } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Logo } from '@/components/Logo';
import {
  cameraColors,
  colors,
  overlayOpacity,
  photoScrim,
  photoScrimOpacity,
  spacing,
  type,
} from '@/theme/tokens';

import { photoFrame } from './photoFrame';
import type { SCREENS } from './screens';

const TEXT_FADE = 96;
const PHOTO_FADE = 200;
const TOP_FADE = 48;
const LOGO_WIDTH = 104;

// A vertical gradient of cameraColors.ground. Stops are [offset, opacity].
function GroundFade({ height, stops }: { height: number; stops: [number, number][] }) {
  // Unique per fade: on web, gradient ids are shared by the whole document.
  const id = useId();
  return (
    <Svg width="100%" height={height} accessible={false}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([offset, opacity], i) => (
            <Stop
              key={i}
              offset={offset}
              stopColor={cameraColors.ground}
              stopOpacity={opacity}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

type Props = {
  screen: (typeof SCREENS)[number];
  size: { width: number; height: number };
  topInset: number;
  // Room the fixed dots and actions take below the text.
  footerHeight: number;
  showLogo: boolean;
  // Off-screen pages stay out of the screen reader's reach.
  current: boolean;
};

export function OnboardingPage({ screen, size, topInset, footerHeight, showLogo, current }: Props) {
  const frame = photoFrame(size, screen.focus);
  const topHeight = topInset + TOP_FADE;
  return (
    <View
      style={[styles.page, size]}
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}>
      <Image
        testID="onboarding-photo"
        source={screen.photo}
        style={[styles.absolute, frame]}
        resizeMode="cover"
        accessible={false}
      />
      {/* Melts the photo's lower edge into the background, so moving it up leaves no seam. */}
      <View style={[styles.absolute, styles.full, { top: frame.top + frame.height - PHOTO_FADE }]}>
        <GroundFade
          height={PHOTO_FADE}
          stops={[
            [0, 0],
            [1, 1],
          ]}
        />
      </View>
      {/* Keeps the light status bar icons readable over a bright window. */}
      <View style={[styles.absolute, styles.full, { top: 0 }]}>
        <GroundFade
          height={topHeight}
          stops={[
            [0, overlayOpacity],
            [topInset / topHeight, overlayOpacity],
            [1, 0],
          ]}
        />
      </View>
      {showLogo && (
        <View style={[styles.absolute, styles.logo, { top: topInset + spacing.sm }]}>
          <Logo wordmark={colors.surface} leaf={colors.reward} width={LOGO_WIDTH} />
        </View>
      )}
      {/* Anchored to its content, so text of any size stays on the full-strength scrim. */}
      <View style={[styles.absolute, styles.full, styles.panel]}>
        <GroundFade
          height={TEXT_FADE}
          stops={[
            [0, 0],
            [1, photoScrimOpacity],
          ]}
        />
        <View style={[styles.copy, { paddingBottom: footerHeight }]}>
          {/* Sizes to its text. Only in a window too short for it does it start to scroll. */}
          <ScrollView
            testID="onboarding-text"
            style={{ maxHeight: Math.max(0, size.height - topInset - TEXT_FADE - footerHeight) }}
            contentContainerStyle={styles.textContent}
            bounces={false}
            overScrollMode="never">
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={1.5}
              style={[type.title, styles.onPhoto]}>
              {screen.title}
            </Text>
            <Text maxFontSizeMultiplier={2} style={[type.body, styles.onPhoto]}>
              {screen.body}
            </Text>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { overflow: 'hidden', backgroundColor: cameraColors.ground },
  absolute: { position: 'absolute' },
  full: { left: 0, right: 0 },
  logo: { left: spacing.xl },
  panel: { bottom: 0 },
  copy: {
    backgroundColor: photoScrim,
    paddingHorizontal: spacing.xl,
  },
  textContent: { gap: spacing.sm },
  onPhoto: { color: cameraColors.text },
});
