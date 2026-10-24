import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PreparedPhoto } from '@/diagnosis/types';

// Longest side of the photo the diagnoser reads (Tech Stack: ~800px, 1–2 MP).
export const MAX_SIDE = 800;
const JPEG_QUALITY = 0.8;

// Temp photos for the scan in progress. Swept whenever Scan opens.
const scansDir = () => new Directory(Paths.cache, 'scans');
// Photos of saved plants. The OS never clears this folder.
const photosDir = () => new Directory(Paths.document, 'photos');

const withoutTrailingSlash = (uri: string) => uri.replace(/\/+$/, '');

// True only for a file inside the app cache. Any "." or ".." segment is
// refused outright, so a crafted path can't climb out of the cache.
export function isInAppCache(uri: string): boolean {
  const prefix = `${withoutTrailingSlash(Paths.cache.uri)}/`;
  if (!uri.startsWith(prefix)) return false;
  const rest = uri.slice(prefix.length).split('/');
  return (
    rest.length > 0 &&
    rest.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

// Best-effort delete: cleanup must never turn a success into an error.
export function deletePhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Left for the next sweep.
  }
}

// Resizes to MAX_SIDE on the longest side (never upscales) and re-encodes as
// JPEG, which drops EXIF, GPS included. The full-size source is deleted when
// it's an app-cache file (camera capture, picker copy); nothing else is touched.
export async function preparePhoto(sourceUri: string, scanId: string): Promise<PreparedPhoto> {
  // Decode first: the decoded size is the truth, the camera's numbers can be pre-rotation.
  const decoded = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const context = ImageManipulator.manipulate(decoded);
  if (Math.max(decoded.width, decoded.height) > MAX_SIDE) {
    context.resize(decoded.width >= decoded.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const output = await (
    await context.renderAsync()
  ).saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });

  const dir = scansDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, `${scanId}.jpg`);
  try {
    if (target.exists) target.delete();
    await new File(output.uri).move(target);
  } catch (error) {
    deletePhoto(output.uri);
    throw error;
  }

  if (sourceUri !== target.uri) deleteCachedPhoto(sourceUri);
  return { uri: target.uri, width: output.width, height: output.height, sizeBytes: target.size };
}

// Deletes a photo only if it's an app-cache file, so a user's own photo
// (e.g. a gallery original) can never be deleted.
export function deleteCachedPhoto(uri: string): void {
  if (isInAppCache(uri)) deletePhoto(uri);
}

// Copies a temp photo to permanent storage. `created` is false when an earlier
// save already stored it, so a failed save knows not to delete it.
export async function persistPhoto(
  tempUri: string,
  scanId: string,
): Promise<{ path: string; created: boolean }> {
  const path = `photos/${scanId}.jpg`;
  const dir = photosDir();
  const target = new File(dir, `${scanId}.jpg`);
  if (target.exists) return { path, created: false };
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  try {
    await new File(tempUri).copy(target);
  } catch (error) {
    // A half-written copy would look like a stored photo on the next try.
    deletePhoto(target.uri);
    throw error;
  }
  return { path, created: true };
}

// A stored photo path (relative, survives iOS container moves) as a file uri.
export function photoUri(path: string): string {
  return new File(Paths.document, path).uri;
}

export function deleteStoredPhoto(path: string): void {
  deletePhoto(photoUri(path));
}

// Deletes leftover temp photos: from a killed app, or a late write after the
// scan closed. Run before a new scan starts, so no live photo can be hit.
export function sweepTempPhotos(): void {
  try {
    const dir = scansDir();
    if (!dir.exists) return;
    for (const item of dir.list()) if (item instanceof File) deletePhoto(item.uri);
  } catch {
    // Nothing to do; the next sweep tries again.
  }
}
