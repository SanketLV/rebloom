import { ChevronLeftIcon } from '@/components/icons';
import { IconButton } from '@/components/IconButton';
import { Placeholder } from '@/components/Placeholder';
import { goBackOr } from '@/lib/goBack';
import { colors } from '@/theme/tokens';

export default function TreatmentScreen() {
  return (
    <Placeholder
      title="Treatment plan"
      artboard="08 Treatment"
      action={
        <IconButton label="Back" onPress={() => goBackOr('/')}>
          <ChevronLeftIcon color={colors.text} size={22} />
        </IconButton>
      }
    />
  );
}
