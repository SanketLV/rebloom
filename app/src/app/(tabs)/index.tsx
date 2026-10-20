import { useRouter } from 'expo-router';

import { IconButton } from '@/components/IconButton';
import { ProfileIcon } from '@/components/icons';
import { Placeholder } from '@/components/Placeholder';
import { colors } from '@/theme/tokens';

export default function TodayScreen() {
  const router = useRouter();
  return (
    <Placeholder
      title="Today"
      artboard="10 Today"
      action={
        <IconButton label="Profile and settings" onPress={() => router.push('/settings')}>
          <ProfileIcon color={colors.text} size={22} />
        </IconButton>
      }
    />
  );
}
