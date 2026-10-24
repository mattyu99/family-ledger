import * as QuickActions from 'expo-quick-actions';
import { Platform } from 'react-native';

export type QuickActionKind = 'expense' | 'income' | 'scan' | 'memo';

export interface QuickActionItemConfig {
  id: string;
  kind: QuickActionKind;
  title: string;
  subtitle: string;
  iconName: string;
}

export const QUICK_ACTIONS_CONFIG: QuickActionItemConfig[] = [
  {
    id: 'quick_expense',
    kind: 'expense',
    title: '記一筆支出',
    subtitle: '記錄日常花費與消費',
    iconName: 'compose',
  },
  {
    id: 'quick_income',
    kind: 'income',
    title: '記一筆收入',
    subtitle: '薪資、獎金或入帳',
    iconName: 'add',
  },
  {
    id: 'quick_scan',
    kind: 'scan',
    title: '掃描發票 / 收據',
    subtitle: '相機拍照與 QR 碼辨識',
    iconName: 'capturePhoto',
  },
  {
    id: 'quick_memo',
    kind: 'memo',
    title: '隨手記記事',
    subtitle: '備忘、拜拜與待辦提醒',
    iconName: 'task',
  },
];

/**
 * 依據不同作業系統轉換合適之圖示名稱
 */
const QUICK_ACTION_ITEMS: QuickActions.Action[] = QUICK_ACTIONS_CONFIG.map(item => ({
  id: item.id,
  title: item.title,
  subtitle: item.subtitle,
  icon: Platform.select({
    ios: item.iconName,
    android: undefined,
    default: undefined,
  }),
  params: {
    mode: item.kind,
  },
}));

/**
 * 初始化並向系統註冊手機桌面長按快捷動作 (3D Touch / Quick Actions)
 */
export async function setupQuickActions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const supported = await QuickActions.isSupported();
    if (supported) {
      await QuickActions.setItems(QUICK_ACTION_ITEMS);
      return true;
    }
  } catch (err) {
    console.warn('[QuickActions] 註冊桌面快捷動作失敗:', err);
  }
  return false;
}

/**
 * 檢查目前裝置是否支援桌面快捷動作
 */
export async function isQuickActionSupported(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await QuickActions.isSupported();
  } catch {
    return false;
  }
}

/**
 * 解析 QuickActions.Action 物件轉為內部 Action 類型
 */
export function parseQuickAction(action?: QuickActions.Action | null): QuickActionKind | null {
  if (!action) return null;
  const paramMode = action.params?.mode as string | undefined;
  if (paramMode === 'expense' || action.id === 'quick_expense') return 'expense';
  if (paramMode === 'income' || action.id === 'quick_income') return 'income';
  if (paramMode === 'scan' || action.id === 'quick_scan') return 'scan';
  if (paramMode === 'memo' || action.id === 'quick_memo') return 'memo';
  return null;
}

/**
 * 解析外部 Deep Link URL（例如 familyledger://quick-action?mode=scan）
 */
export function parseQuickActionUrl(url?: string | null): QuickActionKind | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const lower = url.toLowerCase();
    if (!lower.includes('quick-action') && !lower.includes('mode=') && !lower.includes('action=')) {
      return null;
    }
    if (lower.includes('mode=scan') || lower.includes('action=scan')) return 'scan';
    if (lower.includes('mode=income') || lower.includes('action=income')) return 'income';
    if (lower.includes('mode=memo') || lower.includes('action=memo')) return 'memo';
    if (lower.includes('mode=expense') || lower.includes('action=expense')) return 'expense';
  } catch {}
  return null;
}
