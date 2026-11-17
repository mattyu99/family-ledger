import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { getDeviceId, getDeviceName, getDevicePlatform } from './device';
import { SWEETHOME_LEDGER_ID, SWEETHOME_MEMBERS } from '../constants/sweethomeDemo';
import { APP_FULL_VERSION } from '../constants/version';
import { STORAGE_KEYS } from '../constants/ledgerDefaults';

// 智爸與全家人的日常主力真實帳本 ID（測試記帳本🍟）
export const PRODUCTION_FAMILY_LEDGER_ID = 'ab10fe7e-d0d8-4bc9-b338-24620d26d924';

// 智爸與家人信箱白名單（嚴格排除打點，絕不灌水）
export const INTERNAL_EXCLUDE_EMAILS = [
  'mattyu09@gmail.com',
  'poonechin3683@gmail.com',
  '智爸@family.local',
  '瑩媽@family.local',
  '洋洋@family.local',
  '豆豆@family.local',
];

export interface DemoTryoutsStats {
  totalVisitors: number;
  androidCount: number;
  webCount: number;
  iosCount: number;
  latestActiveAt?: string;
}

/**
 * 三層立體過濾檢查：判定當前操作者是否為「智爸、家人或開發環境」
 * 若為內部成員或開發環境，回傳 true（自動排除，不計入訪客統計）
 */
export async function shouldExcludeFromDemoAnalytics(options?: {
  userEmail?: string | null;
  authEmail?: string | null;
  currentLedgerId?: string | null;
  inAdminMode?: boolean;
}): Promise<boolean> {
  try {
    // 1. 開發測試環境過濾
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      return true;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('192.168.')) {
        return true;
      }
    }

    // 2. 管理員模式過濾
    if (options?.inAdminMode) {
      return true;
    }
    const savedAdminMode = await AsyncStorage.getItem('@family_ledger_admin_mode');
    if (savedAdminMode === 'true') {
      return true;
    }

    // 3. 信箱白名單過濾（智爸與家人信箱）
    const emailToCheck = (options?.authEmail || options?.userEmail || '').trim().toLowerCase();
    if (emailToCheck && INTERNAL_EXCLUDE_EMAILS.some(ie => ie.toLowerCase() === emailToCheck)) {
      return true;
    }

    // 檢查本機儲存的使用者帳號資訊
    const savedUserStr = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (savedUserStr) {
      try {
        const savedUser = JSON.parse(savedUserStr);
        const savedEmail = (savedUser.auth_email || savedUser.email || '').trim().toLowerCase();
        if (savedEmail && INTERNAL_EXCLUDE_EMAILS.some(ie => ie.toLowerCase() === savedEmail)) {
          return true;
        }
      } catch {}
    }

    // 4. 當前帳本為全家主力帳本（測試記帳本🍟）過濾
    if (options?.currentLedgerId === PRODUCTION_FAMILY_LEDGER_ID) {
      return true;
    }

    const savedLedgerStr = await AsyncStorage.getItem(STORAGE_KEYS.LEDGER);
    if (savedLedgerStr) {
      try {
        const savedLedger = JSON.parse(savedLedgerStr);
        if (savedLedger.id === PRODUCTION_FAMILY_LEDGER_ID) {
          return true;
        }
      } catch {}
    }

    const knownLedgersStr = await AsyncStorage.getItem('@family_ledger_known_ledgers');
    if (knownLedgersStr) {
      try {
        const knowns = JSON.parse(knownLedgersStr);
        if (Array.isArray(knowns) && knowns.some((k: any) => k?.id === PRODUCTION_FAMILY_LEDGER_ID)) {
          return true;
        }
      } catch {}
    }

    return false;
  } catch (err) {
    console.warn('判定訪客過濾異常，預設不排除:', err);
    return false;
  }
}

/**
 * 靜默記錄示範帳本（SWEETHOME）訪客試玩打點
 * 1. 執行三層過濾（排除智爸與家人）
 * 2. 獲取本機匿名裝置 UUID
 * 3. 透過 member_devices (UNIQUE(ledger_id, device_id)) 進行 upsert，同裝置永不重複累加
 * 4. 100% 靜默容錯，絕不阻塞試玩操作
 */
export async function recordDemoTryoutSafely(options?: {
  userEmail?: string | null;
  authEmail?: string | null;
  currentLedgerId?: string | null;
  inAdminMode?: boolean;
}): Promise<boolean> {
  try {
    const isExcluded = await shouldExcludeFromDemoAnalytics(options);
    if (isExcluded) {
      return false;
    }

    const deviceId = await getDeviceId();
    const platform = getDevicePlatform();
    const deviceName = getDeviceName();

    const payload = {
      ledger_id: SWEETHOME_LEDGER_ID,
      member_id: SWEETHOME_MEMBERS[0].id,
      device_id: deviceId,
      device_name: deviceName || '訪客試玩體驗',
      platform,
      app_version: APP_FULL_VERSION,
      last_active_at: new Date().toISOString(),
    };

    // 1. 優先嘗試 Supabase SDK upsert
    try {
      const { error } = await supabase
        .from('member_devices')
        .upsert(payload, { onConflict: 'ledger_id,device_id' });
      if (!error) {
        return true;
      }
    } catch {}

    // 2. Web 網頁版或備援：使用 REST API 直接 fetch
    try {
      const url = `${SUPABASE_URL}/rest/v1/member_devices?on_conflict=ledger_id,device_id`;
      await fetch(url, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      });
      return true;
    } catch {}

    return true;
  } catch (err) {
    // 靜默容錯，不干擾使用者試用
    return false;
  }
}

/**
 * 讀取示範帳本（SWEETHOME）訪客試玩累計統計
 * 供「👑 雲端帳本總管」後台盤點顯示
 */
export async function fetchDemoTryoutsStats(): Promise<DemoTryoutsStats> {
  try {
    // 1. 優先嘗試 Supabase SDK 查詢
    const { data, error } = await supabase
      .from('member_devices')
      .select('device_id, platform, last_active_at, created_at')
      .eq('ledger_id', SWEETHOME_LEDGER_ID)
      .order('last_active_at', { ascending: false });

    let rawList: any[] = data || [];

    // 2. 備援 REST API fetch
    if (error || !data) {
      try {
        const url = `${SUPABASE_URL}/rest/v1/member_devices?ledger_id=eq.${encodeURIComponent(SWEETHOME_LEDGER_ID)}&select=device_id,platform,last_active_at,created_at&order=last_active_at.desc`;
        const res = await fetch(url, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });
        if (res.ok) {
          rawList = await res.json();
        }
      } catch {}
    }

    if (!Array.isArray(rawList)) {
      rawList = [];
    }

    // 依 device_id 去重（確保 UV 精準）
    const seenDevices = new Set<string>();
    const uniqueList: any[] = [];
    for (const item of rawList) {
      if (!item || !item.device_id) continue;
      if (!seenDevices.has(item.device_id)) {
        seenDevices.add(item.device_id);
        uniqueList.push(item);
      }
    }

    const androidCount = uniqueList.filter(d => d.platform === 'android').length;
    const webCount = uniqueList.filter(d => d.platform === 'web').length;
    const iosCount = uniqueList.filter(d => d.platform === 'ios').length;
    const latestActiveAt = uniqueList[0]?.last_active_at
      ? uniqueList[0].last_active_at.slice(0, 10)
      : undefined;

    return {
      totalVisitors: uniqueList.length,
      androidCount,
      webCount,
      iosCount,
      latestActiveAt,
    };
  } catch (err) {
    console.warn('讀取示範帳本試玩統計異常:', err);
    return {
      totalVisitors: 0,
      androidCount: 0,
      webCount: 0,
      iosCount: 0,
    };
  }
}
