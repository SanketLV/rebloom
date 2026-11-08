import { Redirect } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, type TextInput } from 'react-native';

import { AccountScreen, Body, Small } from '@/account/AccountScreen';
import { codeEmail } from '@/account/codeSends';
import { cleanCode } from '@/account/input';
import { errorMessage } from '@/account/messages';
import { useShowAccountWhenSignedIn } from '@/account/navigation';
import { useResendTimer } from '@/account/useResendTimer';
import { sendEmailCode, verifyEmailCode } from '@/backend/auth';
import { Button, TextButton } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { goBackOr } from '@/lib/goBack';
import { useSingleFlight } from '@/lib/useSingleFlight';
import { colors, type } from '@/theme/tokens';

const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// Artboard 18b. The address comes from the email screen (codeSends), never from the link, so
// rebloom://account/code can't point it anywhere; with no send in this run it goes to the email step.
export default function CodeScreen() {
  const [email] = useState(codeEmail);
  if (!email) return <Redirect href="/account/email" />;
  return <CodeForm email={email} />;
}

const toEmailStep = () => goBackOr('/account/email');

function CodeForm({ email }: { email: string }) {
  useShowAccountWhenSignedIn();
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const resend = useResendTimer(email);

  // One flight for both auto-submit at 6 digits and the Continue button.
  const verify = useSingleFlight(async (digits: string) => {
    setError(null);
    AccessibilityInfo.announceForAccessibility('Checking the code');
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
  });

  const onChange = (text: string) => {
    const digits = cleanCode(text);
    setCode(digits);
    if (digits.length === 6) void verify.run(digits);
    else setError(null);
  };

  return (
    <AccountScreen
      backFallback="/account/email"
      top={{ kind: 'back', onPress: toEmailStep }}
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
      />
      <View style={styles.links}>
        <TextButton
          label={resend.ready ? 'Send a new code' : `Send a new code in ${minutes(resend.secondsLeft)}`}
          // A resend mustn't overlap the check: its answer would mix with this one's.
          disabled={!resend.ready || sendAgain.busy || verify.busy}
          onPress={() => void sendAgain.run()}
        />
        <TextButton label="Use a different email" onPress={toEmailStep} />
      </View>
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  email: { ...type.bodyStrong, color: colors.text },
  links: { alignItems: 'flex-start' },
});
