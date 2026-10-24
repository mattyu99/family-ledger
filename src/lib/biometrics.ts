import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIVACY_MASK_STORAGE_KEY = '@family_ledger_biometrics_privacy_mask_enabled';
const APP_LOCK_STORAGE_KEY = '@family_ledger_biometrics_app_lock_enabled';

export interface BiometricsCapability {
  isSupported: boolean;
  isEnrolled: boolean;
  biometryType: string; // 'Face ID' | 'Touch ID' | '指紋辨識' | '人臉辨識' | '生物辨識'
}

/**
 * 檢查目前裝置之生物辨識硬體支援與錄入狀態
 */
export const checkBiometricsCapability = async (): Promise<BiometricsCapability> => {
  if (Platform.OS === 'web') {
    return {
      isSupported: false,
      isEnrolled: false,
      biometryType: '管理員安全碼',
    };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometryType = '生物辨識';
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometryType = Platform.OS === 'ios' ? 'Face ID' : '人臉辨識';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometryType = Platform.OS === 'ios' ? 'Touch ID' : '指紋辨識';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometryType = '虹膜辨識';
    }

    return {
      isSupported: hasHardware,
      isEnrolled,
      biometryType,
    };
  } catch (err) {
    console.warn('[Biometrics] 檢測硬體支援狀態失敗:', err);
    return {
      isSupported: false,
      isEnrolled: false,
      biometryType: '生物辨識',
    };
  }
};

/**
 * 觸發本機生物辨識 (Face ID / 指紋 / 系統鎖屏密碼)
 */
export const authenticateWithBiometrics = async (
  promptMessage = '請驗證身分以檢視家庭財務隱私',
  fallbackLabel = '使用手機密碼驗證'
): Promise<{ success: boolean; error?: string }> => {
  if (Platform.OS === 'web') {
    // 網頁環境不具備 Native 生物辨識 API，預設通過
    return { success: true };
  }

  try {
    const capability = await checkBiometricsCapability();
    if (!capability.isSupported || !capability.isEnrolled) {
      // 若裝置無生物辨識或未錄入指紋/臉部，嘗試使用系統鎖屏密碼
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel,
        disableDeviceFallback: false,
        cancelLabel: '取消',
      });
      return {
        success: result.success,
        error: result.success ? undefined : result.error,
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel,
      disableDeviceFallback: false,
      cancelLabel: '取消',
    });

    return {
      success: result.success,
      error: result.success ? undefined : result.error,
    };
  } catch (err: any) {
    console.warn('[Biometrics] 驗證過程發生例外:', err);
    return {
      success: false,
      error: err?.message || '驗證失敗',
    };
  }
};

/**
 * 讀取：資產淨值與餘額是否啟用「隱私遮罩」保護
 * 預設值為 true（保護隱私防窺）
 */
export const getPrivacyMaskEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(PRIVACY_MASK_STORAGE_KEY);
    return value !== null ? value === 'true' : true;
  } catch {
    return true;
  }
};

/**
 * 儲存：資產淨值與餘額「隱私遮罩」偏好
 */
export const setPrivacyMaskEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(PRIVACY_MASK_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[Biometrics] 儲存隱私遮罩偏好失敗:', err);
  }
};

/**
 * 讀取：是否啟用「啟動 App 時要求生物驗證」
 * 預設值為 false（使用者可自行於設定頁開啟）
 */
export const getAppLockEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(APP_LOCK_STORAGE_KEY);
    return value === 'true';
  } catch {
    return false;
  }
};

/**
 * 儲存：是否啟用「啟動 App 時要求生物驗證」
 */
export const setAppLockEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(APP_LOCK_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[Biometrics] 儲存 App 鎖定偏好失敗:', err);
  }
};

