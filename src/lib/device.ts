import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateUUID } from './uuid';

const STORAGE_KEY_DEVICE_ID = '@family_ledger_device_id';

let cachedDeviceId: string | null = null;

/**
 * 獲取或生成本機唯一的裝置指紋 ID
 */
export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const savedId = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (savedId) {
      cachedDeviceId = savedId;
      return savedId;
    }

    const newId = generateUUID();
    await AsyncStorage.setItem(STORAGE_KEY_DEVICE_ID, newId);
    cachedDeviceId = newId;
    return newId;
  } catch {
    const fallbackId = generateUUID();
    cachedDeviceId = fallbackId;
    return fallbackId;
  }
};

/**
 * 判斷裝置運行平台
 */
export const getDevicePlatform = (): 'ios' | 'android' | 'web' => {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
};

/**
 * 取得親切的裝置名稱（例如 "Pixel 8", "iPhone", "Windows 網頁版"）
 */
export const getDeviceName = (): string => {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('windows')) return 'Windows 網頁版';
      if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac 網頁版';
      if (ua.includes('iphone')) return 'iPhone 網頁版';
      if (ua.includes('ipad')) return 'iPad 網頁版';
      if (ua.includes('android')) return 'Android 網頁版';
      if (ua.includes('linux')) return 'Linux 網頁版';
    }
    return '電腦網頁版';
  }

  if (Platform.OS === 'android') {
    const constants = Platform.constants as any;
    const model = constants?.Model;
    const brand = constants?.Brand || constants?.Manufacturer;
    if (model) {
      if (brand && !model.toLowerCase().includes(brand.toLowerCase())) {
        return `${brand} ${model}`;
      }
      return model;
    }
    return 'Android 手機';
  }

  if (Platform.OS === 'ios') {
    return Platform.isPad ? 'iPad' : 'iPhone';
  }

  return '本機設備';
};

/**
 * 取得裝置平台圖示 (📱 或 💻)
 */
export const getDevicePlatformIcon = (platform?: 'ios' | 'android' | 'web'): string => {
  if (platform === 'web') return '💻';
  return '📱';
};

/**
 * 格式化裝置最後活躍相對時間（例如 "剛剛", "5 分鐘前", "2 小時前", "3 天前"）
 */
export const formatDeviceRelativeTime = (isoDate?: string): string => {
  if (!isoDate) return '未知';
  const targetTime = new Date(isoDate).getTime();
  if (isNaN(targetTime)) return '未知';

  const diffMs = Date.now() - targetTime;
  if (diffMs < 0 || diffMs < 60 * 1000) {
    return '剛剛 · 在線';
  }

  const diffMins = Math.floor(diffMs / (60 * 1000));
  if (diffMins < 60) {
    return `${diffMins} 分鐘前`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours} 小時前`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) {
    return `${diffDays} 天前`;
  }

  const d = new Date(targetTime);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}`;
};

