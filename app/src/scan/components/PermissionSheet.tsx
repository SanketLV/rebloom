import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button, TextButton } from '@/components/Button';
import { colors, spacing, type } from '@/theme/tokens';

type Props = {
  visible: boolean;
  // False once the system won't show its prompt again: only Settings can help.
  canAskAgain: boolean;
  onAllow: () => void;
  onOpenSettings: () => void;
  onChoosePhoto: () => void;
  onClose: () => void;
};

const BLOCKED = 'Camera access is off. Turn it on in Settings, or choose a photo instead.';
const FOOTNOTE = "You can change this any time in your phone's Settings.";

// PermissionSheet artboard. Nothing is uploaded, so the copy only says scans
// run on the phone.
export function PermissionSheet({ visible, canAskAgain, onAllow, onOpenSettings, onChoosePhoto, onClose }: Props) {
  return (
    <BottomSheet visible={visible} label="Camera access" onClose={onClose}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.sheetTitle, styles.center, styles.title]}>
          Rebloom needs your camera to scan leaves
        </Text>
        <Text style={[type.body, styles.center, styles.body]}>
          {canAskAgain ? 'Scans run on your phone.' : BLOCKED}
        </Text>
      </View>
      {canAskAgain ? (
        <Button label="Allow camera" onPress={onAllow} />
      ) : (
        <Button label="Open Settings" onPress={onOpenSettings} />
      )}
      <TextButton label="Choose a photo instead" onPress={onChoosePhoto} />
      <Text style={[type.small, styles.center, styles.body]}>{FOOTNOTE}</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  center: { textAlign: 'center' },
  title: { color: colors.text },
  body: { color: colors.textSecondary },
});
