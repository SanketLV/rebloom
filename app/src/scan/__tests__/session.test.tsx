import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Diagnosis, PreparedPhoto } from '@/diagnosis/types';
import { CACHE, fakeFs } from '@/testing/fileSystemFake';

import { ScanSessionProvider, useScanSession } from '../session';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ScanSessionProvider>{children}</ScanSessionProvider>
);

const shot = (name: string) => {
  const uri = `${CACHE}/Camera/${name}.jpg`;
  fakeFs.put(uri, { size: 3_000_000, width: 4032, height: 3024 });
  return uri;
};

const prepared = (scanId: string): PreparedPhoto => {
  const uri = `${CACHE}/scans/${scanId}.jpg`;
  fakeFs.put(uri, { size: 90_000, width: 800, height: 600 });
  return { uri, width: 800, height: 600, sizeBytes: 90_000 };
};

const diagnosis: Diagnosis = {
  diagnoserId: 'fake-v1',
  candidates: [
    { conditionId: 'underwatering', confidence: 0.45 },
    { conditionId: 'overwatering', confidence: 0.35 },
    { conditionId: 'low_light', confidence: 0.1 },
  ],
};

async function setup() {
  const hook = await renderHook(() => useScanSession(), { wrapper });
  return { ...hook, session: () => hook.result.current };
}

test('starts empty', async () => {
  const { session } = await setup();
  expect(session().state).toMatchObject({
    sourceUri: null,
    photo: null,
    diagnosis: null,
    result: null,
    answers: {},
  });
});

test('a new photo starts a new scan with a new id', async () => {
  const { session } = await setup();
  await act(async () => session().startScan(shot('a')));
  const first = session().state.scanId;
  await act(async () => session().startScan(shot('b')));
  expect(session().state.scanId).not.toBe(first);
  expect(session().state.sourceUri).toBe(`${CACHE}/Camera/b.jpg`);
});

test('a new photo deletes the previous temp photo and source', async () => {
  const { session } = await setup();
  const first = shot('a');
  await act(async () => session().startScan(first));
  const firstPhoto = prepared(session().state.scanId);
  await act(async () => session().setPrepared(firstPhoto));
  await act(async () => session().startScan(shot('b')));
  expect(fakeFs.has(firstPhoto.uri)).toBe(false);
  expect(fakeFs.has(first)).toBe(false);
});

test('a new photo clears the diagnosis, answers and saved flags, even after a save', async () => {
  const { session } = await setup();
  await act(async () => session().startScan(shot('a')));
  await act(async () => {
    session().setPrepared(prepared(session().state.scanId));
    session().setDiagnosis(diagnosis);
    session().answer('watering', 'water_2_3_days');
    session().finish();
    session().markPhotoStored();
    session().markPersisted();
  });
  expect(session().state).toMatchObject({ persisted: true, photoStored: true });

  await act(async () => session().startScan(shot('b')));
  expect(session().state).toMatchObject({
    photo: null,
    diagnosis: null,
    result: null,
    answers: {},
    persisted: false,
    photoStored: false,
  });
});

test('finish re-ranks the diagnosis with the answers', async () => {
  const { session } = await setup();
  await act(async () => session().startScan(shot('a')));
  await act(async () => {
    session().setDiagnosis(diagnosis);
    session().answer('watering', 'water_2_3_days');
    session().answer('light', 'not_sure');
    session().finish();
  });
  expect(session().state.answers).toEqual({ watering: 'water_2_3_days', light: 'not_sure' });
  expect(session().state.result?.candidates[0].conditionId).toBe('overwatering');
  expect(session().state.diagnosis).toEqual(diagnosis);
});

test('changing an answer and finishing again updates the result', async () => {
  const { session } = await setup();
  await act(async () => session().startScan(shot('a')));
  await act(async () => {
    session().setDiagnosis(diagnosis);
    session().answer('watering', 'water_2_3_days');
    session().finish();
  });
  await act(async () => {
    session().answer('watering', 'water_2_weeks');
    session().finish();
  });
  expect(session().state.result?.candidates[0].conditionId).toBe('underwatering');
});

test('closing the scan deletes the temp photo and the source', async () => {
  const { session, unmount } = await setup();
  const source = shot('a');
  await act(async () => session().startScan(source));
  const photo = prepared(session().state.scanId);
  await act(async () => session().setPrepared(photo));
  await unmount();
  expect(fakeFs.has(photo.uri)).toBe(false);
  expect(fakeFs.has(source)).toBe(false);
});

test('using the session outside the scan flow is a clear error', async () => {
  await expect(renderHook(() => useScanSession())).rejects.toThrow(/ScanSessionProvider/);
});

test('never deletes a source outside the app cache, such as a gallery original', async () => {
  const { session, unmount } = await setup();
  const original = 'file:///document/DCIM/mine.jpg';
  fakeFs.put(original, { size: 1, width: 10, height: 10 });
  await act(async () => session().startScan(original));
  await act(async () => session().startScan(shot('b')));
  await unmount();
  expect(fakeFs.has(original)).toBe(true);
});

// ---- kindwise-diagnosis: pending/ready scans and the Kindwise question ----

describe('Kindwise scans', () => {
  const kw: Diagnosis = {
    diagnoserId: 'kindwise-v1',
    candidates: [
      { conditionId: null, confidence: 0.4, disease: { id: 'wet', name: 'wet', commonNames: [], description: null } },
      { conditionId: null, confidence: 0.35, disease: { id: 'fungus', name: 'fungus', commonNames: [], description: null } },
    ],
    question: { text: 'Wet?', yes: { id: 'wet', name: 'wet' }, no: { id: 'fungus', name: 'fungus' } },
  };

  async function withDiscard() {
    const onDiscard = jest.fn();
    const hook = await renderHook(() => useScanSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ScanSessionProvider onDiscard={onDiscard}>{children}</ScanSessionProvider>
      ),
    });
    return { ...hook, onDiscard, session: () => hook.result.current };
  }

  test('the Kindwise answer re-ranks before our answers; the result keeps the question', async () => {
    const { session } = await setup();
    await act(async () => session().setDiagnosis(kw));
    await act(async () => session().answerQuestion('no'));
    await act(async () => session().finish());
    expect(session().state.questionAnswer).toBe('no');
    expect(session().state.result?.candidates[0].disease?.id).toBe('fungus');
    expect(session().state.result?.question).toEqual(kw.question);
  });

  test('a new photo forgets the question answer', async () => {
    const { session } = await setup();
    await act(async () => session().answerQuestion('yes'));
    await act(async () => session().startScan(shot('a')));
    expect(session().state.questionAnswer).toBeUndefined();
  });

  test('closing with a ready, unsaved scan discards it; a pending one is kept', async () => {
    const ready = await withDiscard();
    await act(async () => ready.session().markPending());
    await act(async () => ready.session().markReady());
    const readyId = ready.session().state.scanId;
    await ready.unmount();
    expect(ready.onDiscard).toHaveBeenCalledWith(readyId);

    const pending = await withDiscard();
    await act(async () => pending.session().markPending());
    await pending.unmount();
    expect(pending.onDiscard).not.toHaveBeenCalled();
  });

  test('a saved scan is never discarded', async () => {
    const { session, unmount, onDiscard } = await withDiscard();
    await act(async () => session().markPending());
    await act(async () => session().markReady());
    await act(async () => session().markPersisted());
    await unmount();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  test('a retake discards the pending or ready scan it replaces', async () => {
    const { session, onDiscard } = await withDiscard();
    await act(async () => session().markPending());
    const first = session().state.scanId;
    await act(async () => session().startScan(shot('b')));
    expect(onDiscard).toHaveBeenCalledWith(first);
    expect(session().state.stage).toBe('none');
  });

  test('discard on purpose (not a plant) runs once and forgets the stage', async () => {
    const { session, unmount, onDiscard } = await withDiscard();
    await act(async () => session().markPending());
    await act(async () => session().discard());
    await unmount();
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  test('pending marks the photo as stored and the row as written', async () => {
    const { session } = await setup();
    await act(async () => session().markPending());
    expect(session().state).toMatchObject({ stage: 'pending', photoStored: true, persisted: true });
  });

  test('resume loads a stored ready scan at its stage', async () => {
    const { session } = await setup();
    const photo = { uri: 'file:///document/photos/s9.jpg', width: 800, height: 600, sizeBytes: 0 };
    await act(async () => session().resume({ scanId: 's9', photo, diagnosis: kw }));
    expect(session().state).toMatchObject({
      scanId: 's9',
      photo,
      diagnosis: kw,
      stage: 'ready',
      photoStored: true,
      persisted: true,
      sourceUri: null,
    });
  });
});
