import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Transaction, Ledger, LedgerMember } from '../types';
import { getLocalDateYmd, decodeMemoMerchantTag, parseMemoNote } from './memo';
import { QUICK_ACTIONS_CONFIG, QuickActionKind } from './quickActions';

export const WIDGET_SNAPSHOT_STORAGE_KEY = '@family_ledger_widget_snapshot';

export interface WidgetPendingMemo {
  id: string;
  title: string;
  rawTitle?: string;
  badgeText?: string;
  content?: string;
  reminderDate?: string;
  isOverdue: boolean;
  assigneeName?: string;
  amount?: number;
}

export interface WidgetQuickActionItem {
  id: string;
  kind: QuickActionKind;
  title: string;
  subtitle: string;
  icon: string;
  deepLink: string;
}

export interface WidgetSnapshotData {
  ledgerName: string;
  ledgerId: string;
  updatedAt: string;
  totalTransactionsCount: number;
  pendingMemos: WidgetPendingMemo[];
  pendingMemoCount: number;
  monthlyExpense: number;
  quickActions: WidgetQuickActionItem[];
}

/**
 * 從當前帳本與明細中萃取小工具專用的輕量快照資料 (Snapshot)
 */
export function extractWidgetSnapshot(
  currentLedger?: Ledger | null,
  transactions: Transaction[] = [],
  members: any[] = []
): WidgetSnapshotData {
  const ledgerName = currentLedger?.name || '家庭記帳本';
  const ledgerId = currentLedger?.id || '';
  const todayYmd = getLocalDateYmd();

  // 1. 取得當月生活備忘與待辦（僅限未結算/未辦妥）
  const memberMap = new Map<string, string>();
  members.forEach((m: any) => {
    const id = m?.id || m?.user_id;
    const name = m?.display_name || m?.profile?.display_name;
    if (id && name) {
      memberMap.set(id, name);
    }
  });

  const activeMemos = transactions.filter(t => t.type === 'memo' && !t.is_settled);

  // 篩選與排序：今日與逾期待辦最優先，其次為未到期待辦與日常雜記
  const sortedMemos = [...activeMemos].sort((a, b) => {
    const rA = a.reminder_date || decodeMemoMerchantTag(a.merchant).reminderDate || '';
    const rB = b.reminder_date || decodeMemoMerchantTag(b.merchant).reminderDate || '';
    if (!rA && !rB) return (b.transacted_at || '').localeCompare(a.transacted_at || '');
    if (!rA) return 1;
    if (!rB) return -1;
    return rA.localeCompare(rB);
  });

  // 取前 4 筆待辦放入小工具快照
  const pendingMemos: WidgetPendingMemo[] = sortedMemos.slice(0, 4).map(item => {
    const decoded = decodeMemoMerchantTag(item.merchant);
    const parsed = parseMemoNote(item.note);
    const reminderDate = item.reminder_date || decoded.reminderDate;
    const isOverdue = Boolean(reminderDate && reminderDate < todayYmd);
    const assigneeName = item.paid_by ? memberMap.get(item.paid_by) : undefined;

    // 清理內文：剔除 Markdown 待辦清單方框符號（如 - [ ] / - [x] / * [ ]）並整理換行
    let cleanContent = (parsed.cleanContent || '')
      .replace(/^[-*]\s*\[[ xX✓✔]?\]\s*/gm, '')
      .trim();
    cleanContent = cleanContent
      .split('\n')
      .map(l => l.trim().replace(/^[-*]\s*\[[ xX✓✔]?\]\s*/, ''))
      .filter(Boolean)
      .join('、');

    let displayTitle = '';
    const hasExplicitTag = Boolean(parsed.rawTag);
    if (hasExplicitTag) {
      if (cleanContent && cleanContent !== parsed.title) {
        displayTitle = `【${parsed.title}】${cleanContent}`;
      } else {
        displayTitle = `【${parsed.title}】`;
      }
    } else if (cleanContent && cleanContent !== '(無內容)') {
      displayTitle = cleanContent;
    } else {
      displayTitle = parsed.title || item.note || '生活備忘';
    }

    // 構造狀態與日期提示（如 "已逾期" 或 "11-09 · 智爸"）
    let badgeText = '';
    if (isOverdue) {
      badgeText = '已逾期';
    } else if (reminderDate) {
      badgeText = reminderDate.slice(5);
      if (assigneeName) badgeText += ` · ${assigneeName}`;
    } else {
      badgeText = '日常';
      if (assigneeName) badgeText += ` · ${assigneeName}`;
    }

    // 複合標題：若小工具為單行渲染 (如既有 APK)，將狀態無縫融入標題尾部
    const combinedTitle = badgeText ? `${displayTitle}  (${badgeText})` : displayTitle;

    return {
      id: item.id,
      title: combinedTitle,
      rawTitle: displayTitle,
      badgeText,
      content: cleanContent || undefined,
      reminderDate: reminderDate || undefined,
      isOverdue,
      assigneeName,
      amount: item.amount > 0 ? item.amount : undefined,
    };
  });

  // 2. 計算本月總支出 (當前月份)
  const currentMonthPrefix = todayYmd.slice(0, 7); // e.g. "2026-10"
  let monthlyExpense = 0;
  for (const t of transactions) {
    if (t.type === 'expense' && (t.transacted_at || '').startsWith(currentMonthPrefix)) {
      monthlyExpense += Number(t.amount) || 0;
    }
  }

  // 3. 快捷按鈕配置
  const quickActions: WidgetQuickActionItem[] = QUICK_ACTIONS_CONFIG.map(q => ({
    id: q.id,
    kind: q.kind,
    title: q.title,
    subtitle: q.subtitle,
    icon: q.kind === 'expense' ? '💸' : q.kind === 'income' ? '💰' : q.kind === 'scan' ? '📷' : '📝',
    deepLink: `familyledger://quick-action?mode=${q.kind}`,
  }));

  return {
    ledgerName,
    ledgerId,
    updatedAt: new Date().toISOString(),
    totalTransactionsCount: transactions.length,
    pendingMemos,
    pendingMemoCount: activeMemos.length,
    monthlyExpense,
    quickActions,
  };
}

/**
 * 將小工具快照儲存至本機快取與原生共用空間
 */
export async function saveWidgetSnapshot(snapshot: WidgetSnapshotData): Promise<boolean> {
  try {
    const jsonStr = JSON.stringify(snapshot);
    await AsyncStorage.setItem(WIDGET_SNAPSHOT_STORAGE_KEY, jsonStr);

    // 若未來編譯原生 iOS / Android Widget 擴充套件，此處可透過原生橋接寫入 App Group 或 SharedPreferences
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // 預留原生 WidgetCenter / AppWidgetManager 觸發勾點
    }
    return true;
  } catch (err) {
    console.warn('[WidgetSync] 儲存小工具快照失敗:', err);
    return false;
  }
}

/**
 * 讀取本機最新小工具快照資料
 */
export async function getWidgetSnapshot(): Promise<WidgetSnapshotData | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WidgetSnapshotData;
  } catch (err) {
    console.warn('[WidgetSync] 讀取小工具快照失敗:', err);
    return null;
  }
}

/**
 * 一鍵同步小工具資料 (非同步背景執行，安全防崩潰)
 */
export async function syncWidgetData(
  currentLedger?: Ledger | null,
  transactions: Transaction[] = [],
  members: any[] = []
): Promise<WidgetSnapshotData> {
  const snapshot = extractWidgetSnapshot(currentLedger, transactions, members);
  await saveWidgetSnapshot(snapshot);
  return snapshot;
}
