import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  checkBiometricsCapability,
  authenticateWithBiometrics,
  getPrivacyMaskEnabled,
  setPrivacyMaskEnabled,
  getAppLockEnabled,
  setAppLockEnabled,
  BiometricsCapability,
} from '../lib/biometrics';

interface PrivacyContextType {
  // 財務金額遮罩 (Net Worth & Balances)
  isPrivacyMaskActive: boolean;
  togglePrivacyMask: () => Promise<boolean>;
  privacyMaskEnabled: boolean;
  updatePrivacyMaskEnabled: (enabled: boolean) => Promise<void>;

  // 全域 App 啟動防護鎖
  isAppLocked: boolean;
  appLockEnabled: boolean;
  unlockApp: () => Promise<boolean>;
  forceUnlockApp: () => void;
  updateAppLockEnabled: (enabled: boolean) => Promise<void>;

  // 硬體與生物辨識狀態
  capability: BiometricsCapability;
  refreshCapability: () => Promise<void>;
  authenticate: (prompt?: string) => Promise<boolean>;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [capability, setCapability] = useState<BiometricsCapability>({
    isSupported: false,
    isEnrolled: false,
    biometryType: '生物辨識',
  });

  const [privacyMaskEnabled, setPrivacyMaskEnabledState] = useState<boolean>(true);
  const [isPrivacyMaskActive, setIsPrivacyMaskActive] = useState<boolean>(true);

  const [appLockEnabled, setAppLockEnabledState] = useState<boolean>(false);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);

  // 1. 初始化檢測硬體與讀取設定
  const refreshCapability = useCallback(async () => {
    const cap = await checkBiometricsCapability();
    setCapability(cap);
  }, []);

  useEffect(() => {
    refreshCapability();

    getPrivacyMaskEnabled().then(enabled => {
      setPrivacyMaskEnabledState(enabled);
      setIsPrivacyMaskActive(enabled); // 預設依偏好設定啟動遮罩
    });

    getAppLockEnabled().then(enabled => {
      setAppLockEnabledState(enabled);
      if (enabled) {
        setIsAppLocked(true); // 若開啟了 App 啟動鎖，冷啟動時直接鎖定
      }
    });
  }, [refreshCapability]);

  // 2. 監聽 AppState 背景到前景（若啟用 AppLock 則重新鎖定）
  useEffect(() => {
    if (!appLockEnabled) return;

    let lastBackgroundTime = 0;
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        lastBackgroundTime = Date.now();
      } else if (nextState === 'active') {
        // 若在背景超過 15 秒，回到前景時自動鎖定
        if (Date.now() - lastBackgroundTime > 15000) {
          setIsAppLocked(true);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [appLockEnabled]);

  // 3. 通用生物驗證封裝
  const authenticate = useCallback(async (prompt?: string): Promise<boolean> => {
    const msg = prompt || `請驗證 ${capability.biometryType} 以確認身分`;
    const res = await authenticateWithBiometrics(msg);
    return res.success;
  }, [capability.biometryType]);

  // 4. 切換財務金額隱私遮罩
  const togglePrivacyMask = useCallback(async (): Promise<boolean> => {
    if (isPrivacyMaskActive) {
      // 欲解除遮罩：需進行 Face ID / 指紋驗證
      const success = await authenticate(`請驗證 ${capability.biometryType} 以顯示金額`);
      if (success) {
        setIsPrivacyMaskActive(false);
        return true;
      }
      return false;
    } else {
      // 欲重新遮蔽：無需驗證，直接上鎖
      setIsPrivacyMaskActive(true);
      return true;
    }
  }, [isPrivacyMaskActive, authenticate, capability.biometryType]);

  // 5. 更新隱私遮罩偏好
  const updatePrivacyMaskEnabled = useCallback(async (enabled: boolean) => {
    setPrivacyMaskEnabledState(enabled);
    setIsPrivacyMaskActive(enabled);
    await setPrivacyMaskEnabled(enabled);
  }, []);

  // 6. 解鎖全域 App 鎖
  const unlockApp = useCallback(async (): Promise<boolean> => {
    const success = await authenticate(`請解鎖甜心記帳本 (${capability.biometryType})`);
    if (success) {
      setIsAppLocked(false);
      return true;
    }
    return false;
  }, [authenticate, capability.biometryType]);

  const forceUnlockApp = useCallback(() => {
    setIsAppLocked(false);
  }, []);

  // 7. 更新全域 App 鎖偏好
  const updateAppLockEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      // 開啟前先驗證一次，確認本人擁有該裝置權限
      const verified = await authenticate(`啟用前請先驗證 ${capability.biometryType}`);
      if (!verified) return;
    }
    setAppLockEnabledState(enabled);
    if (!enabled) {
      setIsAppLocked(false);
    }
    await setAppLockEnabled(enabled);
  }, [authenticate, capability.biometryType]);

  return (
    <PrivacyContext.Provider
      value={{
        isPrivacyMaskActive,
        togglePrivacyMask,
        privacyMaskEnabled,
        updatePrivacyMaskEnabled,
        isAppLocked,
        appLockEnabled,
        unlockApp,
        forceUnlockApp,
        updateAppLockEnabled,
        capability,
        refreshCapability,
        authenticate,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = (): PrivacyContextType => {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
};
