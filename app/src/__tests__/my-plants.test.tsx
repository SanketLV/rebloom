import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { insertPlant } from '@/storage/plantsRepo';
import { persistScan } from '@/storage/scansRepo';
import { DOCUMENT } from '@/testing/fileSystemFake';
import { mockSqlite } from '@/testing/nativeMocks';

jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

async function openMyPlants() {
  const view = await renderRouter('./src/app', { initialUrl: '/plants' });
  await screen.findByRole('header', { name: 'My Plants' });
  return view;
}

async function savePlant(
  id: string,
  name: string,
  room: string | null,
  at: string,
  diagnoserId = 'fake-v1',
) {
  const db = mockSqlite.db();
  await insertPlant(db, { id, name, room }, at);
  await persistScan(
    db,
    {
      id: `scan-${id}`,
      plantId: id,
      photoPath: `photos/scan-${id}.jpg`,
      diagnoserId,
      modelResult: [{ conditionId: 'sunburn', confidence: 0.7 }],
      answers: {},
      finalResult: [{ conditionId: 'sunburn', confidence: 0.7 }],
    },
    at,
  );
}

// The list reloads whenever the tab comes back into view.
async function revisit() {
  await fireEvent.press(screen.getByRole('tab', { name: 'Today' }));
  await fireEvent.press(screen.getByRole('tab', { name: 'My Plants' }));
}

test('with no plants, invites the first scan', async () => {
  const view = await openMyPlants();
  expect(await screen.findByRole('header', { name: 'No plants yet' })).toBeOnTheScreen();
  expect(screen.queryByText(/free diagnosis|recovery/i)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Scan your first plant' }));
  expect(view).toHavePathname('/scan');
});

test('lists saved plants newest first with room, diagnosis and photo', async () => {
  await openMyPlants();
  await screen.findByRole('header', { name: 'No plants yet' });
  await savePlant('a', 'Old fern', 'Kitchen', '2026-10-20T09:00:00.000Z', 'tflite-v1');
  await savePlant('b', 'New pothos', null, '2026-10-24T09:00:00.000Z');
  await revisit();

  const rows = await screen.findAllByTestId('plant-row');
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText('New pothos')).toBeOnTheScreen();
  expect(within(rows[1]).getByText('Old fern')).toBeOnTheScreen();
  expect(within(rows[1]).getByText(/Kitchen/)).toBeOnTheScreen();
  expect(within(rows[0]).getByText('Sunburn')).toBeOnTheScreen();

  const photo = within(rows[0]).getByLabelText('Photo of New pothos');
  expect(photo.props.source).toEqual({ uri: `${DOCUMENT}/photos/scan-b.jpg` });
});

test('plants diagnosed by the fake engine are marked Demo', async () => {
  await openMyPlants();
  await screen.findByRole('header', { name: 'No plants yet' });
  await savePlant('a', 'Real one', null, '2026-10-20T09:00:00.000Z', 'tflite-v1');
  await savePlant('b', 'Fake one', null, '2026-10-24T09:00:00.000Z', 'fake-v1');
  await revisit();

  const rows = await screen.findAllByTestId('plant-row');
  expect(within(rows[0]).getByText('Demo')).toBeOnTheScreen();
  expect(within(rows[1]).queryByText('Demo')).toBeNull();
});

test('a list that fails to load shows a message, not a crash', async () => {
  await openMyPlants();
  await screen.findByRole('header', { name: 'No plants yet' });
  await mockSqlite.db().execAsync('DROP TABLE plants');
  await revisit();
  await waitFor(() => expect(screen.getByText("Couldn't load your plants.")).toBeOnTheScreen());
});
