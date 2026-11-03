// Mock AsyncStorage for Node.js test environment
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

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
