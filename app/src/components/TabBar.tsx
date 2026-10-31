import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CameraIcon, PlantsIcon, TodayIcon } from '@/components/icons';
import { colors, spacing, touchTarget, type } from '@/theme/tokens';

const ICONS: Record<string, typeof TodayIcon> = { index: TodayIcon, plants: PlantsIcon };

const SCAN_SIZE = 60;
const SCAN_LIFT = 28;

// Artboard "10 Today": two real tabs with a raised Scan button between them.
// Scan is a modal route, not a tab, so closing it returns to the tab you came from.
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const router = useRouter();

  const tabs = state.routes.map((route, index) => {
    const focused = state.index === index;
    const label = descriptors[route.key].options.title ?? route.name;
    const Icon = ICONS[route.name];
    const color = focused ? colors.primary : colors.textSecondary;

    const onPress = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        style={styles.item}>
        {Icon ? <Icon color={color} strokeWidth={focused ? 2.2 : 2} /> : null}
        <Text style={[focused ? type.tabLabelActive : type.tabLabel, { color }]}>{label}</Text>
      </Pressable>
    );
  });

  const scan = (
    <Pressable
      key="scan"
      onPress={() => router.push('/scan')}
      accessibilityRole="button"
      accessibilityLabel="Scan"
      style={styles.item}>
      <View style={styles.scanCircle}>
        <CameraIcon color={colors.reward} size={26} />
      </View>
      <Text style={[type.tabLabelActive, { color: colors.text }]}>Scan</Text>
    </Pressable>
  );

  const [first, ...rest] = tabs;

  // The bar's layout box includes the raised part of the Scan circle, so the
  // whole circle is tappable (Android drops touches outside a parent's bounds).
  // The visible bar is drawn underneath, starting SCAN_LIFT down.
  // Trade-off: screens end SCAN_LIFT above the visible bar, so scroll content
  // stops there instead of sliding under it. Revisit with the first long list.
  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      style={[styles.bar, { paddingBottom: spacing.sm + Math.max(insets.bottom, spacing.sm) }]}>
      <View testID="tab-bar-background" style={styles.background} />
      {first}
      {scan}
      {rest}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
  },
  background: {
    position: 'absolute',
    pointerEvents: 'none',
    top: SCAN_LIFT,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  item: {
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 72,
    minHeight: touchTarget,
  },
  scanCircle: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: SCAN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
