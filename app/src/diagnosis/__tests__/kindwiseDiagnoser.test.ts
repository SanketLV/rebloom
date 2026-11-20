import { DiagnoseFailure, kindwiseDiagnoser } from '../kindwiseDiagnoser';
import { KINDWISE_ID } from '../kindwiseMap';

const mockPost = jest.fn();
jest.mock('@/backend/diagnose', () => ({ postDiagnose: (...args: unknown[]) => mockPost(...args) }));

const mockBase64 = jest.fn(async () => '/9j/4AAQ');
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, base64: () => mockBase64() })),
}));

const photo = { uri: 'file:///cache/scans/s1.jpg', width: 800, height: 600, sizeBytes: 1000 };

beforeEach(() => mockPost.mockReset());

test('sends the prepared photo as base64 with the scan id, and maps the answer', async () => {
  mockPost.mockResolvedValue({
    kind: 'done',
    body: { diseases: [{ id: 'd1', name: 'water deficiency', probability: 0.7 }], species: [] },
  });
  const diagnosis = await kindwiseDiagnoser.diagnose(photo, { scanId: 's1' });
  expect(mockPost).toHaveBeenCalledWith('s1', '/9j/4AAQ');
  expect(diagnosis.diagnoserId).toBe(KINDWISE_ID);
  expect(diagnosis.candidates[0]).toMatchObject({ conditionId: 'underwatering', confidence: 0.7 });
});

test.each([
  [{ kind: 'pending' }, 'pending', null],
  [{ kind: 'not_plant' }, 'not_plant', null],
  [{ kind: 'quota', resetsAt: '2026-12-01T00:00:00Z' }, 'quota', '2026-12-01T00:00:00Z'],
  [{ kind: 'busy' }, 'busy', null],
  [{ kind: 'server' }, 'server', null],
  [{ kind: 'offline' }, 'offline', null],
  [{ kind: 'error' }, 'error', null],
  [{ kind: 'not_configured' }, 'error', null],
  [{ kind: 'not_found' }, 'error', null],
])('%j → DiagnoseFailure %s', async (answer, kind, resetsAt) => {
  mockPost.mockResolvedValue(answer);
  const error = await kindwiseDiagnoser.diagnose(photo, { scanId: 's1' }).catch((e) => e);
  expect(error).toBeInstanceOf(DiagnoseFailure);
  expect(error).toMatchObject({ kind, resetsAt });
});

test('a photo that cannot be read is a server-side failure, nothing sent', async () => {
  mockBase64.mockRejectedValueOnce(new Error('gone'));
  await expect(kindwiseDiagnoser.diagnose(photo, { scanId: 's1' })).rejects.toThrow();
  expect(mockPost).not.toHaveBeenCalled();
});
