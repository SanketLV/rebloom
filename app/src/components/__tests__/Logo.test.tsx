import { render, screen } from '@testing-library/react-native';

import { colors } from '@/theme/tokens';

import { Logo } from '../Logo';

test('the logo is one labelled image for screen readers', async () => {
  await render(<Logo wordmark={colors.surface} leaf={colors.reward} width={104} />);
  expect(screen.getByLabelText('Rebloom')).toBeOnTheScreen();
});
