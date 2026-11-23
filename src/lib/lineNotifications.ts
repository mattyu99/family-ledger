import { supabase, isConfigured } from './supabase';
import { isDemoLedgerId } from '../constants/sweethomeDemo';

export const LINE_BOT_BASIC_ID = '@436nzvzs';

export interface LineUserBindingStatus {
  isBound: boolean;
  lineDisplayName: string | null;
  enabled: boolean;
  skipQuietDay: boolean;
  boundAt: string | null;
}

export interface LineLedgerSubscriptionItem {
  ledgerId: string;
  ledgerName: string;
  role: string;
  enabled: boolean;
  includeSummary: boolean;
  includeCreditCards: boolean;
  includeMemos: boolean;
}

export interface LineGroupBindingStatus {
  isBound: boolean;
  groupName: string | null;
  enabled: boolean;
  skipQuietDay: boolean;
  includeCreditCards: boolean;
  boundAt: string | null;
}

export interface LineNotificationSettingsResponse {
  userBinding: LineUserBindingStatus;
  ledgerSubscriptions: LineLedgerSubscriptionItem[];
  groupBinding: LineGroupBindingStatus;
  isTableMissing?: boolean;
  errorMessage?: string;
}

export interface BindCodeParseResult {
  targetType: 'user' | 'group';
  code: string;
}

export interface RecipientFilterOptions {
  mode: 'legacy' | 'user' | 'group';
  recipientUserIds?: string[];
  recipientNames?: string[];
  includeCreditCards?: boolean;
  includeMemos?: boolean;
  profileMap?: Map<string, { display_name?: string }> | Record<string, { display_name?: string }>;
}

const DEFAULT_SETTINGS_RESPONSE: LineNotificationSettingsResponse = {
  userBinding: {
    isBound: false,
    lineDisplayName: null,
    enabled: false,
    skipQuietDay: false,
    boundAt: null,
  },
  ledgerSubscriptions: [],
  groupBinding: {
    isBound: false,
    groupName: null,
    enabled: false,
    skipQuietDay: false,
    includeCreditCards: false,
    boundAt: null,
  },
};

function isRpcOrTableMissingError(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    code === '42P01' ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

/**
 * 組合 LINE 官方帳號預填綁定碼 Deep Link（保留 @ 符號以確保手機端正常開啟 LINE）
 */
export function buildLineBindDeepLink(
  code: string,
  botBasicId: string = LINE_BOT_BASIC_ID
): string {
  const cleanBotId = botBasicId.startsWith('@') ? botBasicId : `@${botBasicId}`;
  const cleanCode = String(code || '').trim().toUpperCase();
  return `https://line.me/R/oaMessage/${cleanBotId}/?${encodeURIComponent(cleanCode)}`;
}

/**
 * 解析 LINE 聊天訊息中的個人或群組綁定碼
 */
export function parseBindCommandCode(text: string): BindCodeParseResult | null {
  if (!text || typeof text !== 'string') return null;
  const userMatch = text.match(/\b(BIND-[A-Z0-9]{4,10})\b/i);
  if (userMatch) {
    return { targetType: 'user', code: userMatch[1].toUpperCase() };
  }
  const groupMatch = text.match(/\b(GRP-[A-Z0-9]{4,10})\b/i);
  if (groupMatch) {
    return { targetType: 'group', code: groupMatch[1].toUpperCase() };
  }
  return null;
}

/**
 * 判斷是否為應從 LINE 日報排除之示範帳本
 */
export function isExcludedDemoLedger(ledger: {
  id?: string | null;
  name?: string | null;
} | null | undefined): boolean {
  if (!ledger) return true;
  if (isDemoLedgerId(ledger.id)) return true;
  const name = String(ledger.name || '').toLowerCase();
  if (name.includes('sweethome') || name.includes('示範家庭')) return true;
  return false;
}

/**
 * 判斷該帳本本日是否為「安靜日」（無消費/收入紀錄，且無信用卡或生活待辦提醒）
 */
export function isQuietDayReport(report: {
  todayCount: number;
  billingAlertsCount: number;
  memoAlertsCount: number;
}): boolean {
  return (
    (Number(report.todayCount) || 0) === 0 &&
    (Number(report.billingAlertsCount) || 0) === 0 &&
    (Number(report.memoAlertsCount) || 0) === 0
  );
}

/**
 * 依接收者身份（個人／群組／舊版）過濾要提醒的信用卡，確保私卡不外洩
 */
export function filterCreditCardsForRecipient<T extends { user_id?: string | null }>(
  cards: T[],
  options: RecipientFilterOptions
): T[] {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  if (options.mode === 'legacy') return cards;

  if (options.mode === 'group') {
    if (!options.includeCreditCards) return [];
    // 群組即便開啟信用卡提醒，也僅播報「未指定個人持卡人」的全家公用卡，避免洩漏單一成員刷卡明細
    return cards.filter(c => !c.user_id);
  }

  // 個人模式
  if (options.includeCreditCards === false) return [];
  const uidSet = new Set((options.recipientUserIds || []).filter(Boolean));
  const nameSet = new Set((options.recipientNames || []).map(n => n.trim()).filter(Boolean));

  return cards.filter(c => {
    if (!c.user_id) return true; // 全家公用卡
    if (uidSet.has(c.user_id)) return true;
    const holder =
      options.profileMap instanceof Map
        ? options.profileMap.get(c.user_id)
        : options.profileMap?.[c.user_id];
    const holderName = holder?.display_name?.trim();
    return Boolean(holderName && nameSet.has(holderName));
  });
}

/**
 * 依接收者身份過濾生活記事與待辦，強制保護 personal 隱私記事
 */
export function filterMemosForRecipient<
  T extends { reminder_target?: string | null; paid_by?: string | null; creator_id?: string | null }
>(memos: T[], options: RecipientFilterOptions): T[] {
  if (!Array.isArray(memos) || memos.length === 0) return [];
  if (options.mode === 'legacy') return memos;
  if (options.includeMemos === false) return [];

  if (options.mode === 'group') {
    // 家庭群組公開播報：強制排除所有個人專屬記事
    return memos.filter(m => m.reminder_target !== 'personal');
  }

  // 個人模式：保留全家待辦 ＋ 指派給本人或本人建立的個人待辦
  const uidSet = new Set((options.recipientUserIds || []).filter(Boolean));
  const nameSet = new Set((options.recipientNames || []).map(n => n.trim()).filter(Boolean));

  return memos.filter(m => {
    if (m.reminder_target !== 'personal') return true;
    const assigneeId = m.paid_by || m.creator_id;
    if (!assigneeId) return false;
    if (uidSet.has(assigneeId)) return true;
    const assignee =
      options.profileMap instanceof Map
        ? options.profileMap.get(assigneeId)
        : options.profileMap?.[assigneeId];
    const assigneeName = assignee?.display_name?.trim();
    return Boolean(assigneeName && nameSet.has(assigneeName));
  });
}

/**
 * 將一或多張 Flex Bubble 封裝為單次推播載荷（多帳簿自動轉為 Carousel，節省推播額度）
 */
export function wrapFlexBubblesToPayload(bubbles: any[], altText: string): any {
  const safeAltText = String(altText || '💖 甜心記帳本・今日收支日報').slice(0, 390);
  if (bubbles.length <= 1) {
    return {
      type: 'flex',
      altText: safeAltText,
      contents: bubbles[0],
    };
  }
  return {
    type: 'flex',
    altText: safeAltText,
    contents: {
      type: 'carousel',
      contents: bubbles.slice(0, 12),
    },
  };
}

/**
 * 從雲端安全查詢成員目前的 LINE 綁定狀態、各帳簿訂閱偏好與當前帳本群組狀態
 */
export async function fetchLineNotificationSettings(
  userId?: string | null,
  ledgerId?: string | null
): Promise<LineNotificationSettingsResponse> {
  if (!isConfigured || !userId) {
    return { ...DEFAULT_SETTINGS_RESPONSE };
  }
  try {
    const safeLedgerId = ledgerId && !isDemoLedgerId(ledgerId) ? ledgerId : null;
    const { data, error } = await supabase.rpc('get_line_notification_settings', {
      p_user_id: userId,
      p_ledger_id: safeLedgerId,
    });

    if (error) {
      if (isRpcOrTableMissingError(error)) {
        return { ...DEFAULT_SETTINGS_RESPONSE, isTableMissing: true };
      }
      return { ...DEFAULT_SETTINGS_RESPONSE, errorMessage: error.message };
    }

    if (!data?.success) {
      return {
        ...DEFAULT_SETTINGS_RESPONSE,
        errorMessage: data?.message || '讀取 LINE 設定失敗',
      };
    }

    const ub = data.user_binding || {};
    const gb = data.group_binding || {};
    const subs = Array.isArray(data.ledger_subscriptions) ? data.ledger_subscriptions : [];

    return {
      userBinding: {
        isBound: Boolean(ub.is_bound),
        lineDisplayName: ub.line_display_name || null,
        enabled: Boolean(ub.enabled),
        skipQuietDay: Boolean(ub.skip_quiet_day),
        boundAt: ub.bound_at || null,
      },
      ledgerSubscriptions: subs.map((s: any) => ({
        ledgerId: String(s.ledgerId),
        ledgerName: String(s.ledgerName || '未命名帳本'),
        role: String(s.role || 'member'),
        enabled: Boolean(s.enabled),
        includeSummary: s.includeSummary !== false,
        includeCreditCards: s.includeCreditCards !== false,
        includeMemos: s.includeMemos !== false,
      })),
      groupBinding: {
        isBound: Boolean(gb.is_bound),
        groupName: gb.group_name || null,
        enabled: Boolean(gb.enabled),
        skipQuietDay: Boolean(gb.skip_quiet_day),
        includeCreditCards: Boolean(gb.include_credit_cards),
        boundAt: gb.bound_at || null,
      },
    };
  } catch (err: any) {
    return {
      ...DEFAULT_SETTINGS_RESPONSE,
      errorMessage: err?.message || '讀取 LINE 設定時發生連線異常',
    };
  }
}

/**
 * 產生 10 分鐘有效之個人 (BIND-XXXXXX) 或群組 (GRP-XXXXXX) 綁定驗證碼
 */
export async function generateLineBindCode(
  userId: string,
  targetType: 'user' | 'group',
  ledgerId?: string | null,
  adminPin?: string | null
): Promise<{ success: boolean; code?: string; expiresAt?: string; message?: string }> {
  if (!isConfigured) {
    return { success: false, message: '目前未連接雲端資料庫，無法產生綁定碼' };
  }
  try {
    const safeLedgerId = ledgerId && !isDemoLedgerId(ledgerId) ? ledgerId : null;
    const { data, error } = await supabase.rpc('generate_line_bind_code', {
      p_user_id: userId,
      p_target_type: targetType,
      p_ledger_id: safeLedgerId,
      p_admin_pin: adminPin || null,
    });
    if (error) {
      if (isRpcOrTableMissingError(error)) {
        return { success: false, message: '雲端尚未執行最新 LINE 訂閱資料庫更新，請先升級資料庫結構。' };
      }
      return { success: false, message: error.message };
    }
    if (!data?.success) {
      return { success: false, message: data?.message || '產生綁定碼失敗' };
    }
    return {
      success: true,
      code: data.code,
      expiresAt: data.expires_at,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || '網路連線異常' };
  }
}

/**
 * 儲存成員個人 LINE 全域開關或個別帳簿訂閱開關
 */
export async function saveLineUserPreferences(params: {
  userId: string;
  enabled?: boolean;
  skipQuietDay?: boolean;
  ledgerId?: string;
  ledgerEnabled?: boolean;
  includeSummary?: boolean;
  includeCreditCards?: boolean;
  includeMemos?: boolean;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('save_line_user_preferences', {
      p_user_id: params.userId,
      p_enabled: params.enabled ?? null,
      p_skip_quiet_day: params.skipQuietDay ?? null,
      p_ledger_id: params.ledgerId ?? null,
      p_ledger_enabled: params.ledgerEnabled ?? null,
      p_include_summary: params.includeSummary ?? null,
      p_include_credit_cards: params.includeCreditCards ?? null,
      p_include_memos: params.includeMemos ?? null,
    });
    if (error) return { success: false, message: error.message };
    if (!data?.success) return { success: false, message: data?.message || '儲存個人 LINE 偏好失敗' };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message || '儲存失敗' };
  }
}

/**
 * 解除成員個人 LINE 綁定與全部訂閱紀錄
 */
export async function unbindLineUser(userId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('unbind_line_user', { p_user_id: userId });
    if (error) return { success: false, message: error.message };
    if (!data?.success) return { success: false, message: data?.message || '解除 LINE 綁定失敗' };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message || '解除失敗' };
  }
}

/**
 * 儲存目前帳本的家庭 LINE 群組播報偏好
 */
export async function saveLineGroupPreferences(params: {
  ledgerId: string;
  operatorId: string;
  enabled?: boolean;
  skipQuietDay?: boolean;
  includeCreditCards?: boolean;
  adminPin?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('save_line_group_preferences', {
      p_ledger_id: params.ledgerId,
      p_operator_id: params.operatorId,
      p_enabled: params.enabled ?? null,
      p_skip_quiet_day: params.skipQuietDay ?? null,
      p_include_credit_cards: params.includeCreditCards ?? null,
      p_admin_pin: params.adminPin || null,
    });
    if (error) return { success: false, message: error.message };
    if (!data?.success) return { success: false, message: data?.message || '儲存群組播報設定失敗' };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message || '儲存失敗' };
  }
}

/**
 * 解除目前帳本的家庭 LINE 群組綁定
 */
export async function unbindLineGroup(
  ledgerId: string,
  operatorId: string,
  adminPin?: string | null
): Promise<{ success: boolean; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('unbind_line_group', {
      p_ledger_id: ledgerId,
      p_operator_id: operatorId,
      p_admin_pin: adminPin || null,
    });
    if (error) return { success: false, message: error.message };
    if (!data?.success) return { success: false, message: data?.message || '解除群組綁定失敗' };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message || '解除失敗' };
  }
}
