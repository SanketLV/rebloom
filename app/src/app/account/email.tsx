import { router, useNavigation } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountScreen, Body, Small } from '@/account/AccountScreen';
import { noteCodeSent, secondsUntilResend, setCodeEmail } from '@/account/codeSends';
import { isEmailShape, normalizeEmail } from '@/account/input';
import { errorMessage } from '@/account/messages';
import { useShowAccountWhenSignedIn } from '@/account/navigation';
import { sendEmailCode } from '@/backend/auth';
import { Button, TextButton } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { goBackOr } from '@/lib/goBack';
import { useSingleFlight } from '@/lib/useSingleFlight';

// Artboard 18a. The address is normalized before it's checked or sent (review rule); signing in
// and creating an account are one step, so the screen never says whether an account exists.
export default function EmailScreen() {
  useShowAccountWhenSignedIn();
  const navigation = useNavigation();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const email = normalizeEmail(raw);
  const valid = isEmailShape(email);

  const openCode = () => {
    setCodeEmail(email);
    // Only if the user is still here: a send that answers after Back mustn't pull them back.
    if (navigation.isFocused()) router.push('/account/code');
  };

  const { run, busy } = useSingleFlight(async () => {
    setError(null);
    // A code went to this address less than a minute ago: it still works, and the server would
    // refuse another one yet.
    if (secondsUntilResend(email) > 0) return openCode();
    const result = await sendEmailCode(email);
    if (!result.ok) {
      setError(errorMessage('send', result.error));
      return;
    }
    noteCodeSent(email);
    openCode();
  });
  const send = () => {
    if (valid) void run();
  };

  const hint = !valid && email.length > 3 ? 'Check the address. It should look like name@example.com.' : null;

  return (
    <AccountScreen
      backFallback="/account"
      top={{ kind: 'back', onPress: () => goBackOr('/account') }}
      title="Sign in with email"
      body={<Body>We&apos;ll email you a 6-digit code. No password needed.</Body>}
      footer={
        <>
          <Button label="Send code" busy={busy} disabled={!valid} onPress={send} />
          <Small>Scanning works without an account.</Small>
        </>
      }>
      <TextField
        label="Email"
        value={raw}
        onChangeText={(text) => {
          setRaw(text);
          setError(null);
        }}
        error={error}
        hint={hint}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="send"
        onSubmitEditing={send}
        maxLength={320}
        editable={!busy}
      />
      {/* The send may have timed out yet the email is out there (a slow request, or a send from
          before a restart): a way in that asks nothing from the server. */}
      {error !== null ? (
        <View style={styles.links}>
          <TextButton label="Enter a code I already received" onPress={openCode} />
        </View>
      ) : null}
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  links: { alignItems: 'flex-start' },
});
