// Mock AsyncStorage for Node.js test environment
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-url-polyfill for Node.js test environment
jest.mock('react-native-url-polyfill/auto', () => ({}));

// Mock global WebSocket for Supabase realtime in Node.js test environment
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = class MockWebSocket {
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

// Mock react-native Platform & NativeModules
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: jest.fn((obj) => obj.android ?? obj.default),
  },
  NativeModules: {},
}));

// Mock expo-quick-actions
jest.mock('expo-quick-actions', () => ({
  setItems: jest.fn(),
  isSupported: jest.fn(() => Promise.resolve(true)),
  maxCount: 4,
}));
