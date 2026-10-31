import { render } from '@testing-library/react-native';

import * as icons from '../icons';

const all = Object.entries(icons) as [string, (p: { color: string }) => React.JSX.Element][];

test('every scan icon from the artboards exists', () => {
  const names = all.map(([name]) => name);
  expect(names).toEqual(
    expect.arrayContaining([
      'GalleryIcon',
      'HelpIcon',
      'BookmarkIcon',
      'LockIcon',
      'CheckIcon',
      'ChevronLeftIcon',
      'FocusIcon',
      'ExpandIcon',
    ]),
  );
});

test.each(all)('%s is decorative, hidden from screen readers', async (_name, Icon) => {
  const view = await render(<Icon color="black" />);
  const svg = view.toJSON() as { props: { accessible?: boolean } };
  expect(svg.props.accessible).toBe(false);
});
