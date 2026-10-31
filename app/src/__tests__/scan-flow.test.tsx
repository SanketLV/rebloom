import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AccessibilityInfo, BackHandler } from 'react-native';

import type { Diagnosis } from '@/diagnosis/types';
import { CACHE, DOCUMENT, fakeFs } from '@/testing/fileSystemFake';
import { mockCamera, mockManipulator, mockSqlite } from '@/testing/nativeMocks';

afterEach(() => jest.restoreAllMocks());

jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

// A diagnoser each test controls.
const mockDiagnose = jest.fn<Promise<Diagnosis>, unknown[]>();
jest.mock('@/diagnosis/engine', () => ({
  diagnoser: { id: 'fake-v1', diagnose: (...args: unknown[]) => mockDiagnose(...args) },
}));

// No 1.2s pause per test; a short limit so the timeout test is quick.
let mockTimeoutMs = 10_000;
jest.mock('@/scan/runDiagnosis', () => {
  const actual = jest.requireActual('@/scan/runDiagnosis');
  return {
    ...actual,
    runDiagnosis: (input: unknown, options: object) =>
      actual.runDiagnosis(input, { minMs: 0, timeoutMs: mockTimeoutMs, ...options }),
  };
});

const CONFIDENT: Diagnosis = {
  diagnoserId: 'fake-v1',
  candidates: [
    { conditionId: 'underwatering', confidence: 0.6 },
    { conditionId: 'overwatering', confidence: 0.3 },
    { conditionId: 'low_light', confidence: 0.06 },
  ],
};
const UNSURE: Diagnosis = {
  diagnoserId: 'fake-v1',
  candidates: [
    { conditionId: 'overwatering', confidence: 0.41 },
    { conditionId: 'underwatering', confidence: 0.33 },
    { conditionId: 'low_light', confidence: 0.18 },
  ],
};

// Android Back: calls the newest hardwareBackPress listener that's still registered.
const BackHandlerMock = {
  listeners: [] as { handler: () => boolean | null | undefined; removed: boolean }[],
  press() {
    for (const entry of [...BackHandlerMock.listeners].reverse()) {
      if (!entry.removed && entry.handler()) return true;
    }
    router.back();
    return false;
  },
};

beforeEach(() => {
  BackHandlerMock.listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const entry = { handler: handler as () => boolean, removed: false };
    BackHandlerMock.listeners.push(entry);
    return { remove: () => void (entry.removed = true) };
  });
  mockCamera.setPermission('granted');
  mockTimeoutMs = 10_000;
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(CONFIDENT);
});

async function openScan(initialUrl = '/scan') {
  const view = await renderRouter('./src/app', { initialUrl });
  await screen.findByRole('button', { name: 'Close camera', includeHiddenElements: true }, { timeout: 5000 });
  return view;
}

async function shoot() {
  const view = await openScan();
  await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
  return view;
}

describe('Analyzing', () => {
  test('a confident result goes on to the questions', async () => {
    const view = await shoot();
    await waitFor(() => expect(view).toHavePathname('/scan/questions'));
    // The diagnoser reads the prepared photo, not the full-size capture.
    expect(mockDiagnose).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringMatching(/^file:\/\/\/cache\/scans\/.+\.jpg$/),
        width: 800,
      }),
    );
  });

  test('shows the steps, the offline promise and the Demo tag while it works', async () => {
    mockDiagnose.mockReturnValue(new Promise(() => {}));
    const view = await shoot();
    expect(view).toHavePathname('/scan/analyzing');
    expect(await screen.findByText('Photo ready')).toBeOnTheScreen();
    expect(screen.getByText('Checking color, spots and edges')).toBeOnTheScreen();
    expect(screen.getByText('Comparing likely causes')).toBeOnTheScreen();
    expect(screen.getByText('Your photo stays on your phone')).toBeOnTheScreen();
    expect(screen.getByText('Demo')).toBeOnTheScreen();
  });

  test('screen readers hear each step as it starts (iOS has no live regions)', async () => {
    // The preset's AccessibilityInfo is already a jest.fn that keeps earlier tests' calls.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    let finish!: (d: Diagnosis) => void;
    mockDiagnose.mockReturnValue(new Promise((r) => (finish = r)));
    await shoot();
    await waitFor(() =>
      expect(announce).toHaveBeenLastCalledWith('Photo ready. Checking color, spots and edges'),
    );
    await act(async () => finish(UNSURE));
    await waitFor(() => expect(announce).toHaveBeenLastCalledWith('Comparing likely causes'));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  test('a low-confidence result asks for a better photo first', async () => {
    mockDiagnose.mockResolvedValue(UNSURE);
    const view = await shoot();
    expect(await screen.findByText("We couldn't get a clear read")).toBeOnTheScreen();
    expect(view).toHavePathname('/scan/analyzing');
  });

  test('"Use it anyway" goes on to the questions', async () => {
    mockDiagnose.mockResolvedValue(UNSURE);
    const view = await shoot();
    await fireEvent.press(await screen.findByRole('button', { name: 'Use it anyway' }));
    await waitFor(() => expect(view).toHavePathname('/scan/questions'));
  });

  test('"Retake photo" goes back to the camera', async () => {
    mockDiagnose.mockResolvedValue(UNSURE);
    const view = await shoot();
    await fireEvent.press(await screen.findByRole('button', { name: 'Retake photo' }));
    await waitFor(() => expect(view).toHavePathname('/scan'));
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeOnTheScreen();
  });

  test('a photo that cannot be read shows the error, and Try again recovers', async () => {
    mockManipulator.failNext = new Error('decode failed');
    const view = await shoot();
    expect(
      await screen.findByRole('header', { name: "We couldn't read this photo" }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(view).toHavePathname('/scan/questions'));
  });

  test('a diagnoser that hangs times out to the error state', async () => {
    mockTimeoutMs = 50;
    mockDiagnose.mockReturnValue(new Promise(() => {}));
    await shoot();
    expect(
      await screen.findByRole('header', { name: "We couldn't read this photo" }),
    ).toBeOnTheScreen();
  });

  test('Try again after a diagnose failure reuses the prepared photo', async () => {
    mockDiagnose.mockRejectedValueOnce(new Error('model crashed'));
    const view = await shoot();
    await screen.findByRole('header', { name: "We couldn't read this photo" });
    const rendersBefore = mockManipulator.manipulate.mock.calls.length;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(view).toHavePathname('/scan/questions'));
    expect(mockManipulator.manipulate.mock.calls.length).toBe(rendersBefore);
  });

  test('"Scan another plant" from the error goes back to the camera', async () => {
    mockDiagnose.mockRejectedValue(new Error('model crashed'));
    const view = await shoot();
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan another plant' }));
    await waitFor(() => expect(view).toHavePathname('/scan'));
  });

  test('going back mid-run cancels it: the late result is ignored', async () => {
    let finish!: (d: Diagnosis) => void;
    mockDiagnose.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const view = await shoot();
    await screen.findByText('Photo ready');
    // What Android Back does.
    await act(async () => router.back());
    expect(view).toHavePathname('/scan');
    await act(async () => finish(CONFIDENT));
    expect(view).toHavePathname('/scan');
  });

  test('opened with no photo (a deep link), it sends the user to the camera', async () => {
    const view = await renderRouter('./src/app', { initialUrl: '/scan/analyzing' });
    await waitFor(() => expect(view).toHavePathname('/scan'));
    expect(mockDiagnose).not.toHaveBeenCalled();
  });

  test('the camera preview is paused while Analyzing is on top', async () => {
    mockDiagnose.mockReturnValue(new Promise(() => {}));
    await shoot();
    await screen.findByText('Photo ready');
    const camera = screen.getByTestId('camera-view', { includeHiddenElements: true });
    expect(camera.props.accessibilityState).toEqual({ disabled: true });
  });

  test('the full-size capture is deleted once the photo is prepared', async () => {
    const view = await shoot();
    await waitFor(() => expect(view).toHavePathname('/scan/questions'));
    expect(fakeFs.under(`${CACHE}/Camera`)).toEqual([]);
  });
});

async function reachQuestions() {
  const view = await shoot();
  await screen.findByText('How often do you water it?');
  return view;
}

const answerQuestion = async (option: string) => {
  await fireEvent.press(screen.getByRole('radio', { name: option }));
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
};

describe('Questions', () => {
  test('the header card names the two likeliest causes and is marked Demo', async () => {
    await reachQuestions();
    expect(screen.getByText('Underwatering or overwatering?')).toBeOnTheScreen();
    expect(screen.getByText('Two causes look alike. Your answers decide.')).toBeOnTheScreen();
    expect(screen.getByText('Demo')).toBeOnTheScreen();
  });

  test('one question at a time, with progress, and Continue only after an answer', async () => {
    await reachQuestions();
    expect(screen.getByText('1 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pick an answer' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('radio', { name: 'Every 2–3 days' }));
    expect(screen.getByRole('radio', { name: 'Every 2–3 days' })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('2 of 3')).toBeOnTheScreen();
    expect(screen.getByText('How much light does it get?')).toBeOnTheScreen();
  });

  test('"I\'m not sure" counts as an answer and moves on', async () => {
    await reachQuestions();
    await fireEvent.press(screen.getByRole('button', { name: "I'm not sure" }));
    expect(screen.getByText('2 of 3')).toBeOnTheScreen();
  });

  test('back on a later question goes to the previous one, keeping its answer', async () => {
    await reachQuestions();
    await answerQuestion('Every 2–3 days');
    await fireEvent.press(screen.getByRole('button', { name: 'Previous question' }));
    expect(screen.getByText('1 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Every 2–3 days' })).toBeChecked();
  });

  test('Android Back on a later question goes to the previous one', async () => {
    await reachQuestions();
    await answerQuestion('Every 2–3 days');
    await act(async () => {
      BackHandlerMock.press();
    });
    expect(screen.getByText('1 of 3')).toBeOnTheScreen();
  });

  test('back on the first question goes to the camera, not Analyzing', async () => {
    const view = await reachQuestions();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to camera' }));
    await waitFor(() => expect(view).toHavePathname('/scan'));
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeOnTheScreen();
  });

  test('the last answer leads to the diagnosis', async () => {
    const view = await reachQuestions();
    await answerQuestion('Every 2–3 days');
    await answerQuestion('Bright, indirect light');
    await fireEvent.press(screen.getByRole('radio', { name: 'Repotted it' }));
    await fireEvent.press(screen.getByRole('button', { name: 'See my diagnosis' }));
    await waitFor(() => expect(view).toHavePathname('/scan/result'));
  });

  test('the question scrolls on small screens and with large text', async () => {
    await reachQuestions();
    expect(screen.getByTestId('questions-scroll').type).toBe('RCTScrollView');
  });

  test('opened with no diagnosis (a deep link), it sends the user to the camera', async () => {
    const view = await renderRouter('./src/app', { initialUrl: '/scan/questions' });
    await waitFor(() => expect(view).toHavePathname('/scan'));
  });
});

type NavState = { routes: { name: string; state?: NavState }[] } | undefined;

// Screen names in the scan modal's stack, or null when the modal is closed.
function scanStack(view: { getRouterState(): unknown }): string[] | null {
  const find = (state: NavState): string[] | null => {
    for (const route of state?.routes ?? []) {
      if (route.name === 'scan') return route.state?.routes.map((r) => r.name) ?? ['index'];
      const inner = find(route.state);
      if (inner) return inner;
    }
    return null;
  };
  return find(view.getRouterState() as NavState);
}

async function reachResult(
  answers: string[] = ['Every 2–3 days', 'Bright, indirect light', 'Repotted it'],
) {
  const view = await reachQuestions();
  for (const [i, answer] of answers.entries()) {
    await fireEvent.press(screen.getByRole('radio', { name: answer }));
    await fireEvent.press(
      screen.getByRole('button', {
        name: i === answers.length - 1 ? 'See my diagnosis' : 'Continue',
      }),
    );
  }
  await screen.findByText('Most likely');
  return view;
}

describe('Result', () => {
  test('shows the re-ranked diagnosis: watering every 2–3 days moves overwatering to the top', async () => {
    await reachResult();
    expect(screen.getByRole('header', { name: 'Overwatering' })).toBeOnTheScreen();
    expect(screen.getByText('Moderate')).toBeOnTheScreen();
    expect(screen.getByText('Roots stressed by soggy soil')).toBeOnTheScreen();
    expect(
      screen.getByRole('progressbar', { name: 'Confidence' }).props.accessibilityValue.now,
    ).toBeGreaterThanOrEqual(50);
    expect(screen.getByText('Underwatering')).toBeOnTheScreen();
    expect(screen.getByText('Not enough light')).toBeOnTheScreen();
  });

  test('lists the answers it used and marks the result as a demo', async () => {
    await reachResult();
    expect(screen.getByText('Watered every 2–3 days')).toBeOnTheScreen();
    expect(screen.getByText('Bright, indirect light')).toBeOnTheScreen();
    expect(screen.getByText('Recently repotted')).toBeOnTheScreen();
    expect(screen.getByText('Demo diagnosis')).toBeOnTheScreen();
  });

  test('never mentions a trial or a species it did not identify', async () => {
    await reachResult();
    expect(screen.queryByText(/trial/i)).toBeNull();
    expect(screen.queryByText(/monstera/i)).toBeNull();
  });

  test('"See treatment plan" opens the treatment placeholder', async () => {
    const view = await reachResult();
    await fireEvent.press(screen.getByRole('button', { name: 'See treatment plan' }));
    await waitFor(() => expect(view).toHavePathname('/scan/treatment'));
  });

  test('still unsure after the answers: says so and makes Retake the main action', async () => {
    mockDiagnose.mockResolvedValue(UNSURE);
    const view = await shoot();
    await fireEvent.press(await screen.findByRole('button', { name: 'Use it anyway' }));
    await screen.findByText('How often do you water it?');
    for (let i = 0; i < 3; i++)
      await fireEvent.press(screen.getByRole('button', { name: "I'm not sure" }));
    await waitFor(() => expect(view).toHavePathname('/scan/result'));
    expect(await screen.findByText("We're not sure yet")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'See treatment plan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retake photo' })).toBeOnTheScreen();
  });

  test('answers that lift an unsure photo over 50% still show it as unsure', async () => {
    mockDiagnose.mockResolvedValue(UNSURE);
    const view = await shoot();
    await fireEvent.press(await screen.findByRole('button', { name: 'Use it anyway' }));
    await screen.findByText('How often do you water it?');
    await answerQuestion('Every 2–3 days');
    for (let i = 0; i < 2; i++)
      await fireEvent.press(await screen.findByRole('button', { name: "I'm not sure" }));
    await waitFor(() => expect(view).toHavePathname('/scan/result'));
    expect(await screen.findByText("We're not sure yet")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'See treatment plan' })).toBeNull();
  });

  test('Retake leaves exactly one camera in the scan stack', async () => {
    const view = await reachResult();
    await fireEvent.press(screen.getByRole('button', { name: 'Retake photo' }));
    await waitFor(() => expect(view).toHavePathname('/scan'));
    expect(scanStack(view)).toEqual(['index']);
  });

  test('back from the result returns to the last question with its answer', async () => {
    const view = await reachResult();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(view).toHavePathname('/scan/questions'));
    expect(screen.getByText('3 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Repotted it' })).toBeChecked();
  });

  test('the result scrolls on small screens and with large text', async () => {
    await reachResult();
    expect(screen.getByTestId('result-scroll').type).toBe('RCTScrollView');
  });

  test('opened with no session (a deep link), it sends the user to the camera', async () => {
    const view = await renderRouter('./src/app', { initialUrl: '/scan/result' });
    await waitFor(() => expect(view).toHavePathname('/scan'));
    await screen.findByRole('button', { name: 'Close camera', includeHiddenElements: true }, { timeout: 5000 });
  });
});

const rows = (table: string) =>
  mockSqlite.db().getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`, []);

async function saveFromResult(name = 'Fern') {
  await fireEvent.press(screen.getByRole('button', { name: 'Save to My Plants' }));
  await fireEvent.changeText(await screen.findByLabelText('Name'), name);
  await fireEvent.press(screen.getByRole('button', { name: 'Save plant' }));
}

async function giveFeedback(verdict: 'Yes' | 'Not sure') {
  await fireEvent.press(screen.getByRole('button', { name: "Doesn't look right?" }));
  await fireEvent.press(await screen.findByRole('button', { name: verdict }));
  await screen.findByText('Thanks! Your answer is saved.');
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
}

describe('end to end', () => {
  test('scan, answer, save: lands on My Plants with the plant, and the scan is gone', async () => {
    const view = await reachResult();
    await saveFromResult('Kitchen fern');
    await waitFor(() => expect(view).toHavePathname('/plants'));
    expect(scanStack(view)).toBeNull();
    expect(await screen.findByText('Kitchen fern')).toBeOnTheScreen();
    expect(await rows('plants')).toHaveLength(1);
    expect(await rows('scans')).toEqual([
      expect.objectContaining({ plant_id: (await rows('plants'))[0].id, diagnoser_id: 'fake-v1' }),
    ]);

    // Back from My Plants goes to Today (the tabs' usual Back), never into the scan.
    await act(async () => router.canGoBack() && router.back());
    expect(view).toHavePathname('/');
    expect(scanStack(view)).toBeNull();
  });

  test('the saved photo is permanent and every temp file is cleaned up', async () => {
    const view = await reachResult();
    await saveFromResult();
    await waitFor(() => expect(view).toHavePathname('/plants'));
    const [scan] = await rows('scans');
    expect(fakeFs.has(`${DOCUMENT}/${scan.photo_path}`)).toBe(true);
    expect(fakeFs.under(`${CACHE}/scans`)).toEqual([]);
    expect(fakeFs.under(`${CACHE}/Camera`)).toEqual([]);
  });

  test('closing the scan before saving stores nothing and leaves no files', async () => {
    const view = await reachResult();
    await act(async () => router.dismissTo('/'));
    await waitFor(() => expect(view).toHavePathname('/'));
    expect(await rows('plants')).toEqual([]);
    expect(await rows('scans')).toEqual([]);
    expect(fakeFs.under(CACHE)).toEqual([]);
    expect(fakeFs.under(DOCUMENT)).toEqual([]);
  });

  test('feedback, then a save that fails: the photo the feedback scan uses survives', async () => {
    const view = await reachResult();
    await giveFeedback('Yes');
    await mockSqlite
      .db()
      .execAsync(
        "CREATE TEMP TRIGGER fail_plants BEFORE INSERT ON plants BEGIN SELECT RAISE(ABORT, 'disk full'); END;",
      );
    await saveFromResult();
    expect(await screen.findByText("Couldn't save the plant. Try again.")).toBeOnTheScreen();
    expect(view).toHavePathname('/scan/result');

    const scans = await rows('scans');
    expect(scans).toHaveLength(1);
    expect(fakeFs.has(`${DOCUMENT}/${scans[0].photo_path}`)).toBe(true);
    expect(await rows('plants')).toEqual([]);
  });

  test('feedback, then changed answers, then save: one scan with the new answers', async () => {
    const view = await reachResult(['Every 2–3 days', 'Bright, indirect light', 'Repotted it']);
    await giveFeedback('Not sure');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(view).toHavePathname('/scan/questions'));
    await fireEvent.press(screen.getByRole('radio', { name: 'Nothing has changed' }));
    await fireEvent.press(screen.getByRole('button', { name: 'See my diagnosis' }));
    await screen.findByText('Most likely');
    await saveFromResult();
    await waitFor(() => expect(view).toHavePathname('/plants'));

    const scans = await rows('scans');
    expect(scans).toHaveLength(1);
    expect(JSON.parse(scans[0].answers as string)).toMatchObject({ recent_change: 'change_none' });
    expect(scans[0].plant_id).toBe((await rows('plants'))[0].id);
  });

  test('feedback, then a new photo, then save: a new scan with its own photo', async () => {
    const view = await reachResult();
    await giveFeedback('Yes');
    await fireEvent.press(screen.getByRole('button', { name: 'Retake photo' }));
    await waitFor(() => expect(view).toHavePathname('/scan'));
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    await screen.findByText('How often do you water it?');
    for (let i = 0; i < 3; i++)
      await fireEvent.press(screen.getByRole('button', { name: "I'm not sure" }));
    await screen.findByText('Most likely');
    await saveFromResult('Second');
    await waitFor(() => expect(view).toHavePathname('/plants'));

    const scans = await rows('scans');
    expect(scans).toHaveLength(2);
    const [plant] = await rows('plants');
    const saved = scans.find((s) => s.plant_id === plant.id)!;
    const feedbackOnly = scans.find((s) => s.plant_id === null)!;
    expect(saved.photo_path).not.toBe(feedbackOnly.photo_path);
    expect(fakeFs.has(`${DOCUMENT}/${saved.photo_path}`)).toBe(true);
    expect(fakeFs.has(`${DOCUMENT}/${feedbackOnly.photo_path}`)).toBe(true);
  });

  test('overlapping saves: tapping feedback then closing and saving plant keeps the photo', async () => {
    const view = await reachResult();
    await fireEvent.press(screen.getByRole('button', { name: "Doesn't look right?" }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Yes' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText('Diagnosis feedback')).toBeNull());
    await saveFromResult('Kitchen fern');
    await waitFor(() => expect(view).toHavePathname('/plants'));
    const plantRows = await rows('plants');
    expect(plantRows).toHaveLength(1);
    const scanRows = await rows('scans');
    expect(scanRows.length).toBeGreaterThanOrEqual(1);
    expect(fakeFs.has(`${DOCUMENT}/${scanRows[0].photo_path}`)).toBe(true);
  });

  test('a double tap on Save plant saves one plant', async () => {
    const view = await reachResult();
    await fireEvent.press(screen.getByRole('button', { name: 'Save to My Plants' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save plant' }));
      fireEvent.press(screen.getByRole('button', { name: 'Save plant' }));
    });
    await waitFor(() => expect(view).toHavePathname('/plants'));
    expect(await rows('plants')).toHaveLength(1);
  });
});

describe('review round 1', () => {
  test('a double tap on "See my diagnosis" opens one Result', async () => {
    const view = await reachQuestions();
    await answerQuestion('Every 2–3 days');
    await answerQuestion('Bright, indirect light');
    await fireEvent.press(screen.getByRole('radio', { name: 'Repotted it' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'See my diagnosis' }));
      fireEvent.press(screen.getByRole('button', { name: 'See my diagnosis' }));
    });
    await waitFor(() => expect(view).toHavePathname('/scan/result'));
    expect(scanStack(view)?.filter((name) => name === 'result')).toHaveLength(1);
  });

  test('Analyzing shows the prepared photo, not the deleted full-size one', async () => {
    mockDiagnose.mockReturnValue(new Promise(() => {}));
    await shoot();
    await waitFor(() => expect(fakeFs.under(`${CACHE}/scans`)).toHaveLength(1));
    const [prepared] = fakeFs.under(`${CACHE}/scans`);
    await waitFor(() =>
      expect(screen.getByLabelText('Your photo being analyzed').props.source).toEqual({
        uri: prepared,
      }),
    );
  });

  test('Back after the photo is prepared leaves no temp photo once the scan closes', async () => {
    mockDiagnose.mockReturnValue(new Promise(() => {}));
    const view = await shoot();
    await waitFor(() => expect(fakeFs.under(`${CACHE}/scans`)).toHaveLength(1));
    await act(async () => router.back());
    expect(view).toHavePathname('/scan');
    await act(async () => router.dismissTo('/'));
    await waitFor(() => expect(view).toHavePathname('/'));
    expect(fakeFs.under(CACHE)).toEqual([]);
  });
});

describe('break-test fixes', () => {
  test('opening Scan again mid-scan (a deep link) keeps the live scan photo', async () => {
    const view = await reachQuestions();
    const [live] = fakeFs.under(`${CACHE}/scans`);
    expect(live).toBeDefined();
    await act(async () => router.push('/scan'));
    await waitFor(() => expect(view).toHavePathname('/scan'));
    expect(fakeFs.has(live)).toBe(true);
  });
});
