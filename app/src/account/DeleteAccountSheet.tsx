import { useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { deleteAccount } from '@/backend/auth';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, TextButton } from '@/components/Button';
import { useSingleFlight } from '@/lib/useSingleFlight';
import { colors, radius, spacing, type } from '@/theme/tokens';

import { errorMessage } from './messages';
import { noteAccountDeleted } from './store';

type Props = { visible: boolean; onClose: () => void; onDeleted: () => void };

// Sheet · Delete account (ready / deleting / failed). Can't be closed while deleting.
export function DeleteAccountSheet({ visible, onClose, onDeleted }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useSingleFlight(async () => {
    setError(null);
    AccessibilityInfo.announceForAccessibility('Deleting your account');
    const result = await deleteAccount();
    if (!result.ok) {
      setError(errorMessage('delete', result.error));
      return;
    }
    noteAccountDeleted();
    onDeleted();
  });

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <BottomSheet visible={visible} label="Delete account" onClose={close} dismissible={!busy}>
      <View style={styles.text}>
        <Text accessibilityRole="header" style={styles.title}>
          Delete your account?
        </Text>
        <Text style={styles.body}>
          This deletes your Rebloom account and can&apos;t be undone. Plants on this phone stay.
        </Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button
        label={error ? 'Try again' : 'Delete account'}
        variant="severe"
        busy={busy}
        onPress={() => void run()}
      />
      {busy ? (
        <Text style={styles.status} accessibilityLiveRegion="polite">
          This takes a few seconds.
        </Text>
      ) : (
        <TextButton label="Cancel" onPress={close} />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  text: { gap: spacing.sm },
  title: { ...type.sheetTitle, color: colors.text },
  body: { ...type.body, fontSize: 15, color: colors.textSecondary },
  error: {
    ...type.caption,
    fontFamily: type.bodyStrong.fontFamily,
    color: colors.severe,
    backgroundColor: colors.severeBg,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  status: { ...type.caption, color: colors.textSecondary, textAlign: 'center', minHeight: 44 },
});
