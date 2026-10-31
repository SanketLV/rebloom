import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, touchTarget } from '@/theme/tokens';

type Props = { label: string; onPress: () => void; children: ReactNode };

// 44×44 round button from the "10 Today" header (profile icon).
export function IconButton({ label, onPress, children }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  pressed: { backgroundColor: colors.line },
});
