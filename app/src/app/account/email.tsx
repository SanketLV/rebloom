import { router } from 'expo-router';
import { useState } from 'react';

import { AccountScreen, Body, Small } from '@/account/AccountScreen';
import { isEmailShape, normalizeEmail } from '@/account/input';
import { errorMessage } from '@/account/messages';
import { sendEmailCode } from '@/backend/auth';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useSingleFlight } from '@/lib/useSingleFlight';

// Artboard 18a. The address is normalized before it's checked or sent (review rule); signing in
// and creating an account are one step, so the screen never says whether an account exists.
export default function EmailScreen() {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const email = normalizeEmail(raw);
  const valid = isEmailShape(email);

  const { run, busy } = useSingleFlight(async () => {
    setError(null);
    const result = await sendEmailCode(email);
    if (!result.ok) {
      setError(errorMessage('send', result.error));
      return;
    }
    router.push({ pathname: '/account/code', params: { email } });
  });
  const send = () => {
    if (valid) void run();
  };

  const hint = !valid && email.length > 3 ? 'Check the address. It should look like name@example.com.' : null;

  return (
    <AccountScreen
      top={{ kind: 'back', onPress: () => router.back() }}
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
        error={error ?? hint}
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
    </AccountScreen>
  );
}
