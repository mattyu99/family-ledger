import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase, isConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { getDeviceId } from './device';

let cachedPushToken: string | null = null;

/**
 * 安全獲取當前裝置之 Expo Push Token
 */
export async function getExpoPushTokenSafely(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (cachedPushToken) return cachedPushToken;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '甜心生活待辦與記帳提醒',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F43F5E',
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'c85782b1-d64f-4182-a947-5d8363892f4c',
    });

    if (tokenData?.data) {
      cachedPushToken = tokenData.data;
      return tokenData.data;
    }
  } catch (err) {
    // 在模擬器或缺少 Google Play 服務時安靜降級
    console.warn('[PushDispatcher] 獲取 Push Token 失敗或環境不支援:', err);
  }
  return null;
}

/**
 * 診斷當前裝置之推播權限與 Token 狀態
 */
export async function getPushDiagnostics(): Promise<{
  platform: string;
  permissionStatus: string;
  hasToken: boolean;
  pushToken: string | null;
  error?: string;
}> {
  if (Platform.OS === 'web') {
    return { platform: 'web', permissionStatus: 'n/a', hasToken: false, pushToken: null };
  }
  try {
    const { status } = await Notifications.getPermissionsAsync();
    const token = await getExpoPushTokenSafely();
    return {
      platform: Platform.OS,
      permissionStatus: status,
      hasToken: Boolean(token),
      pushToken: token,
    };
  } catch (e: any) {
    return {
      platform: Platform.OS,
      permissionStatus: 'error',
      hasToken: false,
      pushToken: null,
      error: e?.message || String(e),
    };
  }
}

/**
 * 測試發送本機即時通知（確認手機桌面/鎖屏下拉通知能正常彈出）
 */
export async function testLocalPushNotification(title: string, body: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '甜心生活待辦與記帳提醒',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F43F5E',
      });
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
    return true;
  } catch (err) {
    console.warn('[PushDispatcher] 測試本機推播失敗:', err);
    return false;
  }
}

export interface PushNotificationPayload {
  ledgerId: string;
  senderName: string;
  title: string;
  body: string;
  type: 'memo_added' | 'memo_completed' | 'memo_updated' | 'transaction_added' | 'widget_sync';
  data?: Record<string, any>;
  isSilent?: boolean; // 若為 true 則不發出鈴聲，專用於靜默喚醒更新小工具
  targetMemberId?: string; // 🎯 精準推播：僅投遞給特定成員名下之連線裝置 (例如生活待辦辦妥僅通知紀錄者)
}

/**
 * 發送家庭跨裝置即時推播（自動過濾發送者本機，向同帳本其他成員裝置發送）
 */
export async function sendFamilyPushNotification(payload: PushNotificationPayload): Promise<number> {
  if (!isConfigured || !payload.ledgerId) {
    return 0;
  }

  try {
    const currentDeviceId = await getDeviceId();

    // 1. 查詢該帳本名下所有其他成員的活躍裝置與 push_token (具備雙軌 anon 備援，防止跨裝置 Session RLS 回傳 0 筆而漏發推播)
    let devices: any[] | null = null;
    let query = supabase
      .from('member_devices')
      .select('device_id, push_token')
      .eq('ledger_id', payload.ledgerId)
      .neq('device_id', currentDeviceId)
      .not('push_token', 'is', null);

    if (payload.targetMemberId) {
      query = query.eq('member_id', payload.targetMemberId);
    }

    const { data: clientDevs, error } = await query;

    if (!error && Array.isArray(clientDevs) && clientDevs.length > 0) {
      devices = clientDevs;
    } else {
      try {
        let anonUrl = `${SUPABASE_URL}/rest/v1/member_devices?ledger_id=eq.${encodeURIComponent(payload.ledgerId)}&device_id=neq.${encodeURIComponent(currentDeviceId)}&push_token=not.is.null&select=device_id,push_token`;
        if (payload.targetMemberId) {
          anonUrl += `&member_id=eq.${encodeURIComponent(payload.targetMemberId)}`;
        }
        const res = await fetch(
          anonUrl,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );
        if (res.ok) {
          const anonDevs = await res.json();
          if (Array.isArray(anonDevs)) {
            devices = anonDevs;
          }
        }
      } catch {}
    }

    if (!devices || devices.length === 0) {
      return 0;
    }

    const pushTokens = Array.from(
      new Set(
        devices
          .map(d => (d as any).push_token)
          .filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken['))
      )
    );

    if (pushTokens.length === 0) {
      return 0;
    }

    // 2. 組裝 Expo Push API 訊息
    const messages = pushTokens.map(token => ({
      to: token,
      sound: payload.isSilent ? undefined : 'default',
      title: payload.title,
      body: payload.body,
      data: {
        type: payload.type,
        ledgerId: payload.ledgerId,
        senderName: payload.senderName,
        timestamp: new Date().toISOString(),
        ...(payload.data || {}),
      },
      priority: 'high',
      _contentAvailable: true, // 核心：喚醒背景以同步桌面小工具快照！
    }));

    // 3. 發送至 Expo Push 閘道 (https://exp.host/--/api/v2/push/send)
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.warn('[PushDispatcher] Expo Push API 回應異常:', response.status);
      return 0;
    }

    return messages.length;
  } catch (err) {
    console.warn('[PushDispatcher] 跨裝置推播發送失敗:', err);
    return 0;
  }
}

