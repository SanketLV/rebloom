import { router } from 'expo-router';

import { Button, TextButton } from '@/components/Button';

import { AccountScreen, Body, Small } from './AccountScreen';
import { leaveAccount } from './navigation';

// Artboard 18. Phase 1: email only (Google comes in phase 2, Apple in phase 3).
export function SignInView() {
  return (
    <AccountScreen
      top={{ kind: 'close', onPress: leaveAccount }}
      title="Keep your plants safe"
      body={
        <Body>Save your plants, photos and treatment history, so nothing is lost if you change phones.</Body>
      }
      footer={
        <>
          <Button
            label="Continue with email"
            variant="secondary"
            onPress={() => router.push('/account/email')}
          />
          <TextButton label="Not now" onPress={leaveAccount} />
          <Small>Scanning works without an account. We never post anything or sell your data.</Small>
        </>
      }
    />
  );
}
