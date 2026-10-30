// Native modules have no JS implementation in jest. These stand-ins live in
// src/testing; tests drive them through its mock* controls.
jest.mock('expo-file-system', () => require('./src/testing/fileSystemFake').fileSystemModule);
jest.mock('expo-camera', () => require('./src/testing/nativeMocks').cameraModule);
jest.mock('expo-image-picker', () => require('./src/testing/nativeMocks').imagePickerModule);
jest.mock(
  'expo-image-manipulator',
  () => require('./src/testing/nativeMocks').imageManipulatorModule,
);
jest.mock('expo-crypto', () => require('./src/testing/nativeMocks').cryptoModule);
jest.mock('expo-sqlite', () => require('./src/testing/nativeMocks').sqliteModule);

beforeEach(() => {
  require('./src/testing/nativeMocks').resetNativeMocks();
});
