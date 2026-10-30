import { useRouter } from 'expo-router';

import { ChevronLeftIcon } from '@/components/icons';
import { IconButton } from '@/components/IconButton';
import { Placeholder } from '@/components/Placeholder';
import { colors } from '@/theme/tokens';

export default function TreatmentScreen() {
  const router = useRouter();
  return (
    <Placeholder
      title="Treatment plan"
      artboard="08 Treatment"
      action={
        <IconButton label="Back" onPress={() => router.back()}>
          <ChevronLeftIcon color={colors.text} size={22} />
        </IconButton>
      }
    />
  );
}
