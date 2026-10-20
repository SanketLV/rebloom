import { useRouter } from 'expo-router';

import { CloseIcon } from '@/components/icons';
import { IconButton } from '@/components/IconButton';
import { Placeholder } from '@/components/Placeholder';
import { colors } from '@/theme/tokens';

export default function ScanScreen() {
  const router = useRouter();
  return (
    <Placeholder
      title="Scan"
      artboard="04 Camera"
      action={
        <IconButton label="Close camera" onPress={() => router.back()}>
          <CloseIcon color={colors.text} size={22} />
        </IconButton>
      }
    />
  );
}
