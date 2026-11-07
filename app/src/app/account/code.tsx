import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, type TextInput } from 'react-native';

import { AccountScreen, Body, Small } from '@/account/AccountScreen';
import { cleanCode, isEmailShape, normalizeEmail } from '@/account/input';
import { errorMessage } from '@/account/messages';
import { showAccount } from '@/account/navigation';
import { useAccount } from '@/account/store';
import { useResendTimer } from '@/account/useResendTimer';
import { sendEmailCode, verifyEmailCode } from '@/backend/auth';
import { Button, TextButton } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useSingleFlight } from '@/lib/useSingleFlight';
import { colors, type } from '@/theme/tokens';

const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// Artboard 18b. Any app can open rebloom://account/code, so the address is checked again here.
export default function CodeScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = normalizeEmail(typeof params.email === 'string' ? params.email : '');
  if (!isEmailShape(email)) return <Redirect href="/account/email" />;
  return <CodeForm email={email} />;
}

function CodeForm({ email }: { email: string }) {
  const account = useAccount();
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const resend = useResendTimer();

  // A sign-in that went through, even one that answered after our time limit: show the account.
  const signedIn = account.status === 'signed_in';
  useEffect(() => {
    if (signedIn) showAccount();
  }, [signedIn]);

  // One flight for both auto-submit at 6 digits and the Continue button.
  const verify = useSingleFlight(async (digits: string) => {
    setError(null);
    const result = await verifyEmailCode(email, digits);
    if (result.ok) return;
    setError(errorMessage('verify', result.error));
    if (result.error === 'invalid_code') setCode('');
    field.current?.focus();
  });

  const sendAgain = useSingleFlight(async () => {
    setError(null);
    const result = await sendEmailCode(email);
    if (!result.ok) {
      setError(errorMessage('send', result.error));
      return;
    }
    resend.restart();
    AccessibilityInfo.announceForAccessibility('We sent a new code.');
  });

  const onChange = (text: string) => {
    const digits = cleanCode(text);
    setCode(digits);
    if (digits.length === 6) void verify.run(digits);
    else setError(null);
  };

  return (
    <AccountScreen
      top={{ kind: 'back', onPress: () => router.back() }}
      title="Check your email"
      body={
        <Body>
          Enter the 6-digit code we sent to <Text style={styles.email}>{email}</Text>.
        </Body>
      }
      footer={
        <>
          <Button
            label="Continue"
            busy={verify.busy}
            disabled={code.length !== 6}
            onPress={() => void verify.run(code)}
          />
          <Small>Can&apos;t find it? Check your spam folder.</Small>
        </>
      }>
      <TextField
        ref={field}
        label="6-digit code"
        value={code}
        onChangeText={onChange}
        error={error}
        big
        placeholder="000000"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        editable={!verify.busy}
      />
      <View style={styles.links}>
        <TextButton
          label={resend.ready ? 'Send a new code' : `Send a new code in ${minutes(resend.secondsLeft)}`}
          disabled={!resend.ready || sendAgain.busy}
          onPress={() => void sendAgain.run()}
        />
        <TextButton label="Use a different email" onPress={() => router.back()} />
      </View>
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  email: { ...type.bodyStrong, color: colors.text },
  links: { alignItems: 'flex-start' },
});
