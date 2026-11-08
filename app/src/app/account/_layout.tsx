import { Stack } from 'expo-router';

// Account: the sign-in steps and the account screen. Each screen draws its own top bar.
export default function AccountLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
