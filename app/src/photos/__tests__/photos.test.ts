import { CACHE, DOCUMENT, fakeFs } from '@/testing/fileSystemFake';
import { mockManipulator } from '@/testing/nativeMocks';

import { deletePhoto, MAX_SIDE, persistPhoto, photoUri, preparePhoto, sweepTempPhotos } from '../photos';

const camera = (width: number, height: number, name = 'shot.jpg') => {
  const uri = `${CACHE}/Camera/${name}`;
  fakeFs.put(uri, { size: 3_000_000, width, height });
  return uri;
};

test('the longest side becomes 800', () => {
  expect(MAX_SIDE).toBe(800);
});

test.each([
  [4000, 3000, 800, 600],
  [3000, 4000, 600, 800],
  [800, 800, 800, 800],
  [600, 400, 600, 400],
])('a %sx%s photo comes out %sx%s, never upscaled', async (w, h, outW, outH) => {
  const photo = await preparePhoto(camera(w, h), 'scan-1');
  expect(photo).toMatchObject({ width: outW, height: outH });
});

test('uses the size of the decoded image, not what the camera reported', async () => {
  // The camera can report pre-rotation numbers; the file is what counts.
  const uri = camera(3000, 4000);
  const photo = await preparePhoto(uri, 'scan-1');
  expect(photo).toMatchObject({ width: 600, height: 800 });
});

test('writes the photo to cache/scans/<scanId>.jpg with its byte size', async () => {
  const photo = await preparePhoto(camera(4000, 3000), 'scan-1');
  expect(photo.uri).toBe(`${CACHE}/scans/scan-1.jpg`);
  expect(fakeFs.has(photo.uri)).toBe(true);
  expect(photo.sizeBytes).toBe(fakeFs.get(photo.uri)!.size);
  expect(photo.sizeBytes).toBeGreaterThan(0);
  // The manipulator's own output file doesn't linger.
  expect(fakeFs.under(`${CACHE}/ImageManipulator`)).toEqual([]);
});

test('deletes the full-size source when it is in the app cache', async () => {
  const source = camera(4000, 3000);
  await preparePhoto(source, 'scan-1');
  expect(fakeFs.has(source)).toBe(false);
});

test('never deletes a source outside the app cache', async () => {
  const source = `${DOCUMENT}/somewhere/mine.jpg`;
  fakeFs.put(source, { size: 10, width: 1000, height: 1000 });
  await preparePhoto(source, 'scan-1');
  expect(fakeFs.has(source)).toBe(true);
});

test('a failed resize rejects, keeps the source and leaves no scan file', async () => {
  const source = camera(4000, 3000);
  mockManipulator.failNext = new Error('decode failed');
  await expect(preparePhoto(source, 'scan-1')).rejects.toThrow('decode failed');
  expect(fakeFs.has(source)).toBe(true);
  expect(fakeFs.under(`${CACHE}/scans`)).toEqual([]);
});

test('persistPhoto copies into document/photos and reports that it created the copy', async () => {
  const photo = await preparePhoto(camera(4000, 3000), 'scan-1');
  await expect(persistPhoto(photo.uri, 'scan-1')).resolves.toEqual({ path: 'photos/scan-1.jpg', created: true });
  expect(fakeFs.has(`${DOCUMENT}/photos/scan-1.jpg`)).toBe(true);
  expect(fakeFs.has(photo.uri)).toBe(true);
});

test('persistPhoto again is a no-op that says it did not create anything', async () => {
  const photo = await preparePhoto(camera(4000, 3000), 'scan-1');
  await persistPhoto(photo.uri, 'scan-1');
  await expect(persistPhoto(photo.uri, 'scan-1')).resolves.toEqual({ path: 'photos/scan-1.jpg', created: false });
});

test('photoUri resolves a stored path inside the document folder', () => {
  expect(photoUri('photos/scan-1.jpg')).toBe(`${DOCUMENT}/photos/scan-1.jpg`);
});

test('deletePhoto removes a file and shrugs at a missing one', () => {
  fakeFs.put(`${CACHE}/scans/a.jpg`);
  deletePhoto(`${CACHE}/scans/a.jpg`);
  expect(fakeFs.has(`${CACHE}/scans/a.jpg`)).toBe(false);
  expect(() => deletePhoto(`${CACHE}/scans/missing.jpg`)).not.toThrow();
});

test('deletePhoto never throws, even if the file system does', () => {
  fakeFs.put(`${CACHE}/scans/a.jpg`);
  fakeFs.failNext('delete');
  expect(() => deletePhoto(`${CACHE}/scans/a.jpg`)).not.toThrow();
});

test('sweepTempPhotos empties cache/scans and touches nothing else', async () => {
  fakeFs.put(`${CACHE}/scans/old-1.jpg`);
  fakeFs.put(`${CACHE}/scans/old-2.jpg`);
  fakeFs.put(`${CACHE}/other/keep.jpg`);
  fakeFs.put(`${DOCUMENT}/photos/saved.jpg`);
  sweepTempPhotos();
  expect(fakeFs.uris()).toEqual([`${CACHE}/other/keep.jpg`, `${DOCUMENT}/photos/saved.jpg`]);
});

test('sweepTempPhotos is fine when there is nothing to sweep', () => {
  expect(() => sweepTempPhotos()).not.toThrow();
});
