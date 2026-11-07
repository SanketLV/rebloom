import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AccountScreen, Body } from '@/account/AccountScreen';
import { AccountView } from '@/account/AccountView';
import { leaveAccount } from '@/account/navigation';
import { SignInView } from '@/account/SignInView';
import { refreshAccount, useAccount } from '@/account/store';
import { Button } from '@/components/Button';
import { colors } from '@/theme/tokens';

// /account: the account when signed in, otherwise the sign-in screen. After a sign-in the steps
// are dismissed back to here, so Back from the account goes to Settings.
export default function AccountRoute() {
  const account = useAccount();
  switch (account.status) {
    case 'signed_in':
      return <AccountView user={account.user} />;
    case 'guest':
    case 'expired':
      return <SignInView />;
    case 'loading':
      return (
        <View style={styles.loading} accessible accessibilityLabel="Checking your account">
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    case 'offline':
      return (
        <AccountScreen
          top={{ kind: 'back', onPress: leaveAccount }}
          title="Can't check your account"
          body={<Body>You might be offline. Your plants are safe on this phone.</Body>}
          footer={<Button label="Try again" onPress={() => void refreshAccount()} />}
        />
      );
    case 'unconfigured':
      return (
        <AccountScreen
          top={{ kind: 'back', onPress: leaveAccount }}
          title="Accounts aren't available"
          body={<Body>This version of the app has no accounts. Your plants are saved on this phone.</Body>}
        />
      );
  }
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
