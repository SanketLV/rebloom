// Test-only stand-ins for the native modules the scan flow uses. jest.setup.ts
// installs them; tests drive them through the `mock*` controls exported here.
import type { PermissionResponse } from 'expo-camera';
import type { ImagePickerResult } from 'expo-image-picker';
import type { ImageResult } from 'expo-image-manipulator';
import {
  createContext,
  createElement,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';

import type { Db } from '@/storage/db';

import { CACHE, fakeFs } from './fileSystemFake';
import { createTestDb, type TestDb } from './sqljs';

// ---------- expo-camera ----------

type PermissionState = 'undetermined' | 'granted' | 'denied';

const permissionListeners = new Set<() => void>();
let shot = 0;

type Shot = { uri: string; width: number; height: number; format: 'jpg' };
let shotSize = { width: 4032, height: 3024 };

export const mockCamera = {
  permission: 'undetermined' as PermissionState,
  canAskAgain: true,
  // What the system dialog answers when the app asks.
  answer: 'granted' as Exclude<PermissionState, 'undetermined'>,
  // Off: the camera only becomes ready when a test calls `becomeReady()`.
  autoReady: true,
  readyCallbacks: [] as (() => void)[],
  setShotSize(size: { width: number; height: number }) {
    shotSize = size;
  },
  takePicture: jest.fn(async (): Promise<Shot> => {
    const uri = `${CACHE}/Camera/shot-${++shot}.jpg`;
    fakeFs.put(uri, { size: 3_000_000, ...shotSize });
    return { uri, ...shotSize, format: 'jpg' };
  }),
  request: jest.fn(),
  get: jest.fn(),
  // A change made outside the app, e.g. in the phone's Settings.
  setPermission(state: PermissionState, canAskAgain = state !== 'denied') {
    mockCamera.permission = state;
    mockCamera.canAskAgain = canAskAgain;
  },
  becomeReady() {
    for (const ready of mockCamera.readyCallbacks.splice(0)) ready();
  },
  reset() {
    mockCamera.permission = 'undetermined';
    mockCamera.canAskAgain = true;
    mockCamera.answer = 'granted';
    mockCamera.autoReady = true;
    mockCamera.readyCallbacks = [];
    shotSize = { width: 4032, height: 3024 };
    mockCamera.takePicture.mockClear();
    mockCamera.request.mockClear();
    mockCamera.get.mockClear();
    shot = 0;
  },
};

function permissionResponse(): PermissionResponse {
  return {
    status: mockCamera.permission as PermissionResponse['status'],
    granted: mockCamera.permission === 'granted',
    canAskAgain: mockCamera.canAskAgain,
    expires: 'never',
  };
}

function notifyPermission() {
  for (const listener of permissionListeners) listener();
}

function useCameraPermissions() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    permissionListeners.add(listener);
    return () => void permissionListeners.delete(listener);
  }, []);
  const request = async () => {
    mockCamera.request();
    const canAsk = mockCamera.permission === 'undetermined' || (mockCamera.permission === 'denied' && mockCamera.canAskAgain);
    if (canAsk) {
      mockCamera.permission = mockCamera.answer;
      mockCamera.canAskAgain = mockCamera.answer !== 'denied';
    }
    notifyPermission();
    return permissionResponse();
  };
  const get = async () => {
    mockCamera.get();
    notifyPermission();
    return permissionResponse();
  };
  return [permissionResponse(), request, get] as const;
}

type CameraProps = { active?: boolean; onCameraReady?: () => void; children?: ReactNode };
type CameraHandle = { takePictureAsync: () => Promise<Shot> };

const CameraView = forwardRef<CameraHandle, CameraProps>(function CameraView({ active = true, onCameraReady }, ref) {
  useImperativeHandle(ref, () => ({ takePictureAsync: () => mockCamera.takePicture() }));
  useEffect(() => {
    if (!active || !onCameraReady) return;
    if (mockCamera.autoReady) onCameraReady();
    else mockCamera.readyCallbacks.push(onCameraReady);
  }, [active, onCameraReady]);
  return createElement(View, { testID: 'camera-view', accessibilityState: { disabled: !active } });
});

export const cameraModule = { CameraView, useCameraPermissions };

// ---------- expo-image-picker ----------

let picked = 0;

export const mockPicker = {
  // undefined = the user cancels the picker.
  next: { width: 3000, height: 4000 } as { width: number; height: number } | undefined,
  launch: jest.fn(async (): Promise<ImagePickerResult> => {
    const size = mockPicker.next;
    if (!size) return { canceled: true, assets: null };
    const uri = `${CACHE}/ImagePicker/pick-${++picked}.jpg`;
    fakeFs.put(uri, { size: 2_000_000, ...size });
    return {
      canceled: false,
      assets: [{ uri, ...size, type: 'image', fileName: null, fileSize: 2_000_000, mimeType: 'image/jpeg' }],
    };
  }),
  reset() {
    mockPicker.next = { width: 3000, height: 4000 };
    mockPicker.launch.mockClear();
    picked = 0;
  },
};

export const imagePickerModule = { launchImageLibraryAsync: mockPicker.launch };

// ---------- expo-image-manipulator ----------

let saved = 0;

export const mockManipulator = {
  failNext: undefined as Error | undefined,
  // On: rendering waits until the test calls `release()` (timeout tests).
  hang: false,
  pending: [] as (() => void)[],
  manipulate: jest.fn(),
  release() {
    for (const resume of mockManipulator.pending.splice(0)) resume();
  },
  reset() {
    mockManipulator.failNext = undefined;
    mockManipulator.hang = false;
    mockManipulator.pending = [];
    mockManipulator.manipulate.mockClear();
    saved = 0;
  },
};

type Size = { width: number; height: number };

class FakeImageRef {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  async saveAsync(): Promise<ImageResult> {
    const uri = `${CACHE}/ImageManipulator/out-${++saved}.jpg`;
    // Deterministic file size, so the fake diagnoser gives stable results.
    fakeFs.put(uri, { size: Math.round((this.width * this.height) / 7), width: this.width, height: this.height });
    return { uri, width: this.width, height: this.height };
  }
}

class FakeContext {
  constructor(private size: Size) {}
  resize({ width, height }: { width?: number | null; height?: number | null }) {
    const ratio = this.size.width / this.size.height;
    if (width) this.size = { width, height: Math.round(width / ratio) };
    else if (height) this.size = { width: Math.round(height * ratio), height };
    return this;
  }
  async renderAsync() {
    if (mockManipulator.hang) await new Promise<void>((resume) => mockManipulator.pending.push(resume));
    if (mockManipulator.failNext) {
      const error = mockManipulator.failNext;
      mockManipulator.failNext = undefined;
      throw error;
    }
    return new FakeImageRef(this.size.width, this.size.height);
  }
}

function manipulate(source: string | FakeImageRef) {
  mockManipulator.manipulate(source);
  if (source instanceof FakeImageRef) return new FakeContext({ width: source.width, height: source.height });
  const entry = fakeFs.get(source);
  if (!entry?.width || !entry.height) throw new Error(`Not an image: ${source}`);
  return new FakeContext({ width: entry.width, height: entry.height });
}

export const imageManipulatorModule = {
  ImageManipulator: { manipulate },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
};

// ---------- expo-crypto ----------

let uuid = 0;

// Predictable ids in the v4 shape: 00000000-0000-4000-8000-000000000001, ...
export const cryptoModule = {
  randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
};

// ---------- expo-sqlite ----------

const DbContext = createContext<Db | null>(null);
let current: TestDb | undefined;

export const mockSqlite = {
  // The database the most recent SQLiteProvider opened.
  db(): TestDb {
    if (!current) throw new Error('No SQLiteProvider has opened a database yet');
    return current;
  },
  failNextInit: undefined as Error | undefined,
  reset() {
    current?.close();
    current = undefined;
    mockSqlite.failNextInit = undefined;
  },
};

type ProviderProps = {
  databaseName: string;
  onInit?: (db: Db) => Promise<void>;
  onError?: (error: Error) => void;
  children?: ReactNode;
};

function SQLiteProvider({ onInit, onError, children }: ProviderProps) {
  const [db, setDb] = useState<TestDb | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opened = await createTestDb();
        const failure = mockSqlite.failNextInit;
        mockSqlite.failNextInit = undefined;
        if (failure) throw failure;
        await onInit?.(opened);
        current = opened;
        if (!cancelled) setDb(opened);
      } catch (error) {
        if (!onError) throw error;
        onError(error as Error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onInit, onError]);
  return db ? createElement(DbContext.Provider, { value: db }, children) : null;
}

function useSQLiteContext(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('useSQLiteContext must be used within a <SQLiteProvider>');
  return db;
}

export const sqliteModule = { SQLiteProvider, useSQLiteContext };

export function resetNativeMocks() {
  mockCamera.reset();
  mockPicker.reset();
  mockManipulator.reset();
  mockSqlite.reset();
  fakeFs.reset();
  uuid = 0;
}
