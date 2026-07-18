// Jest globals are declared in eslint.config.js rather than via an
// `/* eslint-env */` comment, which flat config no longer honors.

// The native module has no JS implementation to fall back on, so anything that
// imports it needs a stub under Node. Only the surface used by tests is mocked;
// the Vision pipeline itself is exercised on-device, not here.
jest.mock('ocular-vision', () => ({
  OcularVisionModule: {
    isSupported: true,
    landmarkRevision: 3,
    getCameraPermissionsAsync: jest.fn(async () => ({
      status: 'granted',
      granted: true,
      canAskAgain: false,
    })),
    requestCameraPermissionsAsync: jest.fn(async () => ({
      status: 'granted',
      granted: true,
      canAskAgain: false,
    })),
    openSettingsAsync: jest.fn(async () => undefined),
  },
  OcularVisionView: 'OcularVisionView',
}));

// Supabase reads validated env at import time; tests should not depend on a
// developer's local .env.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
