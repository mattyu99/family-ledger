import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shouldExcludeFromDemoAnalytics,
  INTERNAL_EXCLUDE_EMAILS,
  PRODUCTION_FAMILY_LEDGER_ID,
} from '../demoAnalytics';

describe('demoAnalytics 試玩過濾與統計模組測試', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('智爸信箱應被自動排除', async () => {
    const isExcluded = await shouldExcludeFromDemoAnalytics({
      authEmail: 'mattyu09@gmail.com',
    });
    expect(isExcluded).toBe(true);
  });

  test('瑩媽信箱應被自動排除', async () => {
    const isExcluded = await shouldExcludeFromDemoAnalytics({
      userEmail: 'poonechin3683@gmail.com',
    });
    expect(isExcluded).toBe(true);
  });

  test('當前帳本為全家主力帳本（測試記帳本🍟）時應被自動排除', async () => {
    const isExcluded = await shouldExcludeFromDemoAnalytics({
      currentLedgerId: PRODUCTION_FAMILY_LEDGER_ID,
    });
    expect(isExcluded).toBe(true);
  });

  test('參數傳入 inAdminMode: true 應被自動排除', async () => {
    const isExcluded = await shouldExcludeFromDemoAnalytics({
      inAdminMode: true,
    });
    expect(isExcluded).toBe(true);
  });

  test('AsyncStorage 記錄管理員模式應被自動排除', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === '@family_ledger_admin_mode') return Promise.resolve('true');
      return Promise.resolve(null);
    });
    const isExcluded = await shouldExcludeFromDemoAnalytics({});
    expect(isExcluded).toBe(true);
  });

  test('全新外部陌生訪客且無任何排除條件時正常判定', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const isExcluded = await shouldExcludeFromDemoAnalytics({
      authEmail: 'visitor123@example.com',
      currentLedgerId: 'some-random-ledger-id',
      inAdminMode: false,
    });
    expect(isExcluded).toBe(false);
  });
});
