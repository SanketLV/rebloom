import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { ChevronLeftIcon } from '@/components/icons';
import { IconButton } from '@/components/IconButton';
import { Placeholder } from '@/components/Placeholder';
import { goBackOr } from '@/lib/goBack';
import { colors } from '@/theme/tokens';

// Opened cold from a rebloom:// link, nothing is beneath Settings and the
// header has no back button, so add one. `canGoBack` comes from the header,
// which sees the committed stack; the screen itself renders before its push
// lands. With history, returning null keeps the native back button on iOS
// and Android. Web's header has none of its own, so it always gets this one.
function headerLeft({ canGoBack }: { canGoBack?: boolean }) {
  if (canGoBack && Platform.OS !== 'web') return null;
  return (
    <IconButton label="Back" onPress={() => goBackOr('/')}>
      <ChevronLeftIcon color={colors.text} size={22} />
    </IconButton>
  );
}

export default function SettingsScreen() {
  return (
    <>
      <Stack.Screen options={{ headerLeft }} />
      <Placeholder title="Settings" artboard="16 Settings" insetTop={false} />
    </>
  );
}
