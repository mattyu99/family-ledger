import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase, isConfigured } from './supabase';
import { getDeviceId } from './device';

let cachedPushToken: string | null = null;

/**
 * 安全獲取當前裝置之 Expo Push Token
 */
export async function getExpoPushTokenSafely(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (cachedPushToken) return cachedPushToken;

  try {
    const { status } = await Notifications.getPermissionsAsync();
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

export interface PushNotificationPayload {
  ledgerId: string;
  senderName: string;
  title: string;
  body: string;
  type: 'memo_added' | 'memo_completed' | 'memo_updated' | 'transaction_added' | 'widget_sync';
  data?: Record<string, any>;
  isSilent?: boolean; // 若為 true 則不發出鈴聲，專用於靜默喚醒更新小工具
}

/**
 * 發送家庭跨裝置即時推播（自動過濾發送者本機，向同帳本其他成員裝置發送）
 */
export async function sendFamilyPushNotification(payload: PushNotificationPayload): Promise<number> {
  if (Platform.OS === 'web' || !isConfigured || !payload.ledgerId) {
    return 0;
  }

  try {
    const currentDeviceId = await getDeviceId();

    // 1. 查詢該帳本名下所有其他成員的活躍裝置與 push_token
    const { data: devices, error } = await supabase
      .from('member_devices')
      .select('device_id, push_token')
      .eq('ledger_id', payload.ledgerId)
      .neq('device_id', currentDeviceId)
      .not('push_token', 'is', null);

    if (error || !devices || devices.length === 0) {
      return 0;
    }

    const pushTokens = devices
      .map(d => (d as any).push_token)
      .filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken['));

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

