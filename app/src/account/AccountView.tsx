import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { signOut, type SessionUser } from '@/backend/session';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, TextButton } from '@/components/Button';
import { ProfileIcon } from '@/components/icons';
import { useSingleFlight } from '@/lib/useSingleFlight';
import { colors, radius, spacing, type } from '@/theme/tokens';

import { AccountScreen, Small } from './AccountScreen';
import { DeleteAccountSheet } from './DeleteAccountSheet';
import { signedInWith } from './methodLabel';
import { leaveAccount } from './navigation';

// Artboard 18c, signed in. The Backup row comes with the backup spec.
export function AccountView({ user }: { user: SessionUser }) {
  const [sheet, setSheet] = useState<'sign_out' | 'delete' | null>(null);
  // The phone is signed out at once, even offline; the server is told in the background.
  const signingOut = useSingleFlight(async () => {
    const done = signOut();
    setSheet(null);
    leaveAccount();
    await done;
  });

  return (
    <AccountScreen
      top={{ kind: 'back', onPress: leaveAccount }}
      title="Account"
      sheetOpen={sheet !== null}
      overlay={
        <>
          <BottomSheet visible={sheet === 'sign_out'} label="Sign out" onClose={() => setSheet(null)}>
            <View style={styles.sheetText}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                Sign out?
              </Text>
              <Text style={styles.sheetBody}>
                Your plants stay on this phone. Sign in again any time to get back to your account.
              </Text>
            </View>
            <Button label="Sign out" busy={signingOut.busy} onPress={() => void signingOut.run()} />
            <TextButton label="Cancel" onPress={() => setSheet(null)} />
          </BottomSheet>
          <DeleteAccountSheet
            visible={sheet === 'delete'}
            onClose={() => setSheet(null)}
            onDeleted={() => {
              setSheet(null);
              leaveAccount();
            }}
          />
        </>
      }>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <ProfileIcon color={colors.text} />
        </View>
        <View style={styles.who}>
          <Text style={styles.email} numberOfLines={1}>
            {user.email ?? 'Your account'}
          </Text>
          <Text style={styles.method}>{signedInWith(user.provider)}</Text>
        </View>
      </View>
      <View style={styles.group}>
        <Row label="Sign out" onPress={() => setSheet('sign_out')} />
        <View style={styles.divider} />
        <Row label="Delete account" severe onPress={() => setSheet('delete')} />
      </View>
      <Small>Signing out never removes plants from this phone.</Small>
    </AccountScreen>
  );
}

function Row({ label, onPress, severe = false }: { label: string; onPress: () => void; severe?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text style={[styles.rowText, severe && styles.severe]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 2,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: { flex: 1, minWidth: 0, gap: 3 },
  email: { ...type.bodyStrong, fontSize: 17, fontFamily: type.section.fontFamily, color: colors.text },
  method: { ...type.caption, color: colors.textSecondary },
  group: {
    borderRadius: radius.md - 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: { minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.md + 2 },
  pressed: { backgroundColor: colors.line },
  rowText: { ...type.bodyStrong, fontSize: 15, color: colors.text },
  severe: { color: colors.severe, fontFamily: type.section.fontFamily },
  divider: { height: 1, backgroundColor: colors.line },
  sheetText: { gap: spacing.sm },
  sheetTitle: { ...type.sheetTitle, color: colors.text },
  sheetBody: { ...type.body, fontSize: 15, color: colors.textSecondary },
});
