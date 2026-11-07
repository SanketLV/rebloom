import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileIcon } from '@/components/icons';
import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

import { signedInWith } from './methodLabel';
import { refreshAccount, useAccount } from './store';

// The account card at the top of Settings (artboard 16). Hidden when the app has no backend, so
// there's never a dead end.
export function AccountCard() {
  const account = useAccount();
  if (account.status === 'unconfigured') return null;

  const openAccount = () => router.push('/account');
  let title: string;
  let line: string;
  let action: { label: string; onPress: () => void; reward: boolean } | null;
  switch (account.status) {
    case 'loading':
      return (
        <View style={styles.card} accessible accessibilityLabel="Checking your account">
          <Avatar />
          <ActivityIndicator color={colors.onPrimarySoft} />
        </View>
      );
    case 'offline':
      title = 'Account';
      line = "Can't check your account right now";
      action = { label: 'Try again', onPress: () => void refreshAccount(), reward: false };
      break;
    case 'signed_in':
      title = account.user.email ?? 'Your account';
      line = signedInWith(account.user.provider);
      action = { label: 'Account', onPress: openAccount, reward: false };
      break;
    case 'expired':
      title = 'Signed out';
      line = 'Sign in again to keep your account';
      action = { label: 'Sign in', onPress: openAccount, reward: true };
      break;
    case 'guest':
      title = 'Guest';
      line = 'Plants are saved on this phone only';
      action = { label: 'Save plants', onPress: openAccount, reward: true };
      break;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Avatar />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.line}>{line}</Text>
        </View>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [
              styles.button,
              action.reward ? styles.reward : styles.quiet,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.buttonText, action.reward ? styles.rewardText : styles.quietText]}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {account.status === 'guest' && account.notice === 'deleted' ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          Your account is deleted.
        </Text>
      ) : null}
    </View>
  );
}

function Avatar() {
  return (
    <View style={styles.avatar}>
      <ProfileIcon color={colors.onPrimarySoft} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  avatar: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: colors.primaryRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.bodyStrong, fontFamily: type.section.fontFamily, color: colors.onPrimarySoft },
  line: { ...type.small, color: colors.onPrimaryMuted },
  button: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.md + 2,
    borderRadius: spacing.md,
    justifyContent: 'center',
  },
  reward: { backgroundColor: colors.reward },
  quiet: { backgroundColor: colors.primaryRaised },
  pressed: { opacity: 0.85 },
  buttonText: { ...type.chip, fontFamily: type.tabLabelActive.fontFamily },
  rewardText: { color: colors.text },
  quietText: { color: colors.onPrimarySoft },
  notice: { ...type.caption, color: colors.textSecondary, paddingHorizontal: spacing.xs },
});
