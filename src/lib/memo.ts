/**
 * 生活記事手帳與備忘解析工具
 */

import { CalendarSystem, MemoRepeatFrequency } from './lunar';
import { computeNextRelayReminderDate } from './dateParser';
import { stripInvoiceTag } from './invoice';
import {
  isGroupOrderMemo,
  detectCollaborativeOrderMode,
  extractStoreNameFromMemo,
  computeGroupOrderSummary,
} from './groupOrder';
export * from './dateParser';

export const DEFAULT_MEMO_QUICK_TAGS = [
  '📌 待辦清單',
  '🛒 採買清單',
  '🧋 點餐開團',
  '📦 網購湊單',
  '🏠 家中缺貨',
  '🧹 家事懸賞',
  '🗳️ 家庭投票',
  '📅 行程安排',
  '🎒 學校親子',
  '🙏 祭祀拜拜',
  '🎂 紀念日',
  '💡 靈感筆記',
  '🏠 家居修繕',
  '🩺 健康用藥',
  '💼 重要備忘',
];

export const MEMO_QUICK_TAGS = DEFAULT_MEMO_QUICK_TAGS;

/**
 * 生活記事置頂數量上限常數
 * - 全家共享公用置頂：最多 5 筆
 * - 個人專屬置頂：每位成員最多 5 筆
 */
export const MAX_PINNED_MEMOS_FAMILY = 5;
export const MAX_PINNED_MEMOS_PERSONAL = 5;

/**
 * 判斷指定字串是否為開團/看板快捷動作按鈕標籤 (如 +我要買、＋加湊/代領、＋提案/投票、我要點)
 * 此類動詞屬面板操作指引，嚴格禁止作為生活記事主題標籤或快捷標籤
 */
export function isMemoActionTag(tagText?: string): boolean {
  if (!tagText) return false;
  const trimmed = tagText.trim();
  if (!trimmed) return false;

  // 1. 以半形 + 或全形 ＋ 開頭 (如 +我要買, ＋加湊/代領, ＋提案/投票, ＋ 認領/新任務)
  if (/^[+＋]/.test(trimmed)) {
    return true;
  }

  // 2. 快捷引導按鈕專用提示字樣 (如 提案/投票, 加湊/代領, 我要買, 認領/新任務 等操作動詞)
  // 排除使用者正常建立的各種主題標籤 (如 🗳️ 家庭投票, 晚餐投票, 去哪玩投票, 50嵐開團 等)
  const core = trimmed.replace(EMOJI_REGEX, '').trim();
  if (/^(?:我要買|加湊\/代領|我也要|我要點|認領\/新任務|加單|提案\/投票)$/.test(core)) {
    return true;
  }

  return false;
}

/**
 * 判斷一則記事是否屬於「五大協作看板」（點餐開團、家事懸賞、家庭投票、賣場採買、網購湊單）
 * 協作看板在進行中時天然保證常駐於首頁最上方，不佔用也不受限於常態靜態置頂配額（5 筆）
 */
export function isCollabActivityMemo(title?: string, content?: string): boolean {
  const t = (title || '').trim().toLowerCase();
  const c = (content || '').trim().toLowerCase();
  const text = `${t}\n${c}`;

  // 1. 嚴格排除非協作活動（日常備忘、慢箋、就醫、家中缺貨等）
  if (t.includes('家中缺貨') || c.includes('家中缺貨') || c.includes('缺貨待補')) {
    return false;
  }
  const excludes = ['回診', '慢箋', '慢籤', '就醫', '門診', '掛號', '看診', '健保', '生活記事與待辦', '待辦清單'];
  if (excludes.some(ex => t.includes(ex) || c.includes(ex))) {
    return false;
  }

  // 2. 命中五大協作主題關鍵字
  const collabKeywords = [
    '點餐開團', '點餐', '開團', '🧋',
    '家事懸賞', '家庭家務', '大掃除', '家事分工', '任務懸賞', '🧹',
    '家庭投票', '投票看板', '投票決策', '🗳️',
    '採買清單', '採買補貨', '賣場採買', '我要買', '🛒',
    '網購湊單', '包裹代領', '湊免運', '📦',
  ];
  return collabKeywords.some(kw => text.includes(kw));
}

/**
 * 智慧合併生活記事標籤：固定內建核心項目在最前面維持位置穩定，使用者自訂或歷史常用標籤接在後面
 * 嚴格排除已被使用者長按主動移除的黑名單標籤 (dismissedTags) 與動作操作標籤
 */
export function getMergedMemoTags(recentTags: string[] = [], dismissedTags: string[] = []): string[] {
  const pool: string[] = [];
  const seen = new Set<string>();
  const dismissedSet = new Set((dismissedTags || []).map(t => (t || '').trim().toLowerCase()));

  // 1. 內建項目固定排在最前面，順序永遠固定不跳動
  for (const t of DEFAULT_MEMO_QUICK_TAGS) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      pool.push(t);
    }
  }

  // 2. 使用者自訂/新增的歷史常用標籤排在後面 (排除已包含的內建項目，且排除動作標籤與黑名單項目)
  for (const t of recentTags) {
    const clean = (t || '').trim();
    if (!clean) continue;
    if (isMemoActionTag(clean)) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key) && !dismissedSet.has(key)) {
      seen.add(key);
      pool.push(clean);
    }
  }

  // 最多保留前 24 個標籤，兼顧豐富度與版面整潔
  return pool.slice(0, 24);
}

/**
 * 徹底剔除生活記事文字中可能殘留的系統內部中繼標籤 (如 [memo|done:...], [remind:...])
 * 無論長度多長或含有管線符號，一律乾淨剝除，還原使用者真實記事內容
 */
export function stripMemoInternalTag(text?: string): string {
  if (!text) return '';
  let cleaned = text;
  while (/^[\[［【]\s*(?:memo|remind:)[^\]］】]*[\]］】]\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^[\[［【]\s*(?:memo|remind:)[^\]］】]*[\]］】]\s*/i, '');
  }
  return cleaned.trim();
}

/**
 * 判斷指定字串是否為合法的消費店家名稱 (過濾系統中繼標籤、UUID、memo 等非商家字串)
 */
export function isValidMerchantName(name?: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.length > 40) return false;

  // 1. 包含系統中繼標籤特徵 (如 memo|done:..., remind:...)
  if (
    trimmed.startsWith('memo') ||
    trimmed.startsWith('remind:') ||
    trimmed.includes('done:') ||
    trimmed.includes('done_at:') ||
    trimmed.includes('cal:') ||
    trimmed.includes('rep:') ||
    trimmed.includes('tgt:') ||
    trimmed.includes('pin:') ||
    trimmed.includes('|')
  ) {
    return false;
  }

  // 2. 包含 UUID 特徵 (如 8a0505f0-cdd6-4948-9cec-1926805e2e1d)
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(trimmed)) {
    return false;
  }

  // 3. 包含日期時間戳記特徵 (如 2026-11-09T10:32:43.983Z)
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return false;
  }

  return true;
}

/**
 * 尋找內文中的首個有效生活記事主題標籤 (支援 [標籤]、［標籤］、【標籤】)
 * 自動避開 Markdown 檢核清單方框 (如 - [ ]、- [x]、[✓]) 與系統中繼標籤
 */
export function findMemoTopicTagMatch(text?: string): RegExpExecArray | null {
  if (!text) return null;
  const cleaned = stripMemoInternalTag(text);
  if (!cleaned) return null;

  const tagRegex = /[\[［【]([^\[\]［］【】\n]{1,16})[\]］】]/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(cleaned)) !== null) {
    const rawInner = match[1];
    const trimmed = rawInner.trim();

    // 1. 排除待辦方框：空白/無內容、x、X、✓、✔、v、V 等
    if (!trimmed || ['x', 'X', '✓', '✔', 'v', 'V'].includes(trimmed)) {
      continue;
    }

    // 2. 排除網址與系統內部標籤
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed === '辦妥' ||
      trimmed.startsWith('memo') ||
      trimmed.startsWith('remind:') ||
      trimmed.startsWith('done:') ||
      trimmed.startsWith('merchant:') ||
      trimmed.startsWith('id:') ||
      trimmed.startsWith('linked:') ||
      trimmed.includes('|')
    ) {
      continue;
    }

    // 3. 排除開團與看板快捷動作按鈕提示 (如 【＋我要買】、【＋加湊/代領】、【＋提案/投票】)
    if (isMemoActionTag(trimmed)) {
      continue;
    }

    // 找到首個真正的主題標籤
    return match;
  }

  return null;
}

/**
 * 從文字中提取生活記事標籤（支援 [標籤]、［標籤］、【標籤】）
 */
export function extractMemoTag(text?: string): string | undefined {
  if (!text) return undefined;
  const match = findMemoTopicTagMatch(text);
  if (!match) return undefined;
  const raw = match[1].trim();
  if (!raw || raw.length < 2) return undefined;
  return raw;
}

export interface ParsedMemo {
  title: string;
  icon: string;
  cleanContent: string;
  rawTag?: string;
}

const EMOJI_REGEX = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}]+)*/u;

/**
 * 智慧解析生活記事內容：
 * 1. 支援字首、字尾或內文任意處的 [標籤] 或 【標籤】(1~16字元)
 * 2. 自動識別標籤內的 Emoji 作為卡片圖示徽章
 * 3. 內文自動移除重複的括號標籤，還原乾淨排版
 * 4. 徹底告別財務分類 (如「餐飲伙食」) 的干擾
 * 5. 智慧保護 Markdown 待辦清單方框 (- [ ] / - [x]) 不被誤判或抹除
 */
export function parseMemoNote(noteText?: string, categoryName?: string, categoryIcon?: string): ParsedMemo {
  const cleanedText = stripMemoInternalTag(noteText);
  if (!cleanedText) {
    return {
      title: '生活記事',
      icon: '📌',
      cleanContent: '(無內容)',
    };
  }

  const raw = cleanedText;
  // 支援半形中括號 [標籤]、全形中括號 ［標籤］、粗括號 【標籤】 (依文本出現順序由左至右優先解析首個主題標籤，自動略過待辦方框 - [ ] / [x])
  const match = findMemoTopicTagMatch(raw);

  if (!match) {
    const isMemoCategory =
      categoryName &&
      !['餐飲伙食', '其他', '一般', '飲食', '支出', '收入'].includes(categoryName) &&
      (categoryName.includes('記事') || categoryName.includes('備忘') || categoryName.includes('手帳'));

    return {
      title: isMemoCategory ? categoryName : '生活記事',
      icon: isMemoCategory && categoryIcon ? categoryIcon : '📌',
      cleanContent: raw,
    };
  }

  const rawTag = match[1].trim();
  let cleanContent = raw.replace(match[0], '').trim();
  if (!cleanContent) {
    cleanContent = rawTag;
  }

  const emojiMatch = rawTag.match(EMOJI_REGEX);
  const icon = emojiMatch ? emojiMatch[0] : '📌';

  let title = rawTag;
  if (emojiMatch) {
    const withoutEmoji = rawTag.replace(EMOJI_REGEX, '').trim();
    if (withoutEmoji.length > 0) {
      title = withoutEmoji;
    }
  }

  return {
    title: title || '生活記事',
    icon,
    cleanContent,
    rawTag,
  };
}

/**
 * 判斷指定標籤是否已在備忘內容中被選取 / 填寫
 */
export function isMemoTagActive(currentNote: string, tag: string): boolean {
  if (!currentNote) return false;
  const match = findMemoTopicTagMatch(currentNote);
  if (!match) return false;
  const raw = match[1].trim();
  const core = raw.replace(EMOJI_REGEX, '').trim();
  const tagCore = tag.replace(EMOJI_REGEX, '').trim();
  return raw === tag || (!!core && core === tagCore);
}

/**
 * 快捷切換備忘標籤：
 * - 點擊相同標籤：鎖定選取，保留不變（防止誤觸刪除開頭標籤）
 * - 點擊不同標籤：替換既有括號標籤
 * - 原本無標籤：加到文字字首 (若已有清單則以換行隔開)
 */
export function toggleMemoTag(currentNote: string, tag: string): string {
  const match = findMemoTopicTagMatch(currentNote);
  const tagCore = tag.replace(EMOJI_REGEX, '').trim();

  if (match) {
    const existingRaw = match[1].trim();
    const existingCore = existingRaw.replace(EMOJI_REGEX, '').trim();

    // 點擊同一個標籤 -> 維持鎖定選取，安全保留既有標籤不被誤刪
    if (existingRaw === tag || (existingCore && existingCore === tagCore)) {
      return currentNote;
    }

    // 點擊不同標籤 -> 替換既有標籤
    return currentNote.replace(match[0], `[${tag}]`).trim();
  }

  // 若原本沒有標籤 -> 加到開頭
  return currentNote.trim() ? `[${tag}]\n${currentNote.trim()}` : `[${tag}] `;
}

/**
 * 取得裝置本地時區的 YYYY-MM-DD 日期字串 (避免 toISOString() 造成 UTC 與本地時區差問題)
 */
export function getLocalDateYmd(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 編碼生活記事之提醒與週期 메타 標籤（存入 merchant 欄位，100% 相容既有雲端資料表）
 * 格式範例：remind:2026-10-25|cal:lunar|rep:lunar_1_15|tgt:personal|pin:1|done:uuid|done_at:2026-10-29T16:30:00.000Z
 */
export function encodeMemoMerchantTag(options: {
  reminderDate?: string;
  reminderCalendar?: CalendarSystem;
  reminderRepeat?: MemoRepeatFrequency;
  reminderTarget?: 'family' | 'personal';
  completedBy?: string;
  completedAt?: string;
  isPinned?: boolean;
}): string {
  const { reminderDate, reminderCalendar, reminderRepeat, reminderTarget, completedBy, completedAt, isPinned } = options;
  const parts: string[] = [];

  if (reminderDate && reminderDate.trim()) {
    parts.push(`remind:${reminderDate.trim()}`);
    const effectiveCal: CalendarSystem =
      reminderRepeat === 'lunar_1_15' || reminderRepeat === 'lunar_2_16'
        ? 'lunar'
        : (reminderCalendar || 'solar');

    if (effectiveCal === 'lunar') {
      parts.push('cal:lunar');
    }
    if (reminderRepeat && reminderRepeat !== 'once') {
      parts.push(`rep:${reminderRepeat}`);
    }
  } else {
    parts.push('memo');
  }

  if (reminderTarget === 'personal') {
    parts.push('tgt:personal');
  } else if (reminderTarget === 'family') {
    parts.push('tgt:family');
  }

  if (isPinned) {
    parts.push('pin:1');
  }

  if (completedBy && completedBy.trim()) {
    parts.push(`done:${completedBy.trim()}`);
  }

  if (completedAt && completedAt.trim()) {
    parts.push(`done_at:${completedAt.trim()}`);
  }

  return parts.join('|');
}

/**
 * 解碼生活記事之提醒與週期 메타 標籤
 */
export function decodeMemoMerchantTag(rawMerchant?: string): {
  isMemo: boolean;
  reminderDate?: string;
  reminderCalendar?: CalendarSystem;
  reminderRepeat?: MemoRepeatFrequency;
  reminderTarget?: 'family' | 'personal';
  completedBy?: string;
  completedAt?: string;
  isPinned?: boolean;
} {
  if (!rawMerchant) return { isMemo: false, isPinned: false };
  const trimmed = rawMerchant.trim();
  if (!trimmed.startsWith('remind:') && !trimmed.startsWith('memo')) {
    return { isMemo: false, isPinned: false };
  }

  let reminderDate: string | undefined;
  let reminderCalendar: CalendarSystem | undefined;
  let reminderRepeat: MemoRepeatFrequency | undefined;
  let reminderTarget: 'family' | 'personal' | undefined;
  let completedBy: string | undefined;
  let completedAt: string | undefined;
  let isPinned = false;

  const segments = trimmed.split('|');
  for (const seg of segments) {
    if (seg.startsWith('remind:')) {
      reminderDate = seg.slice(7).trim() || undefined;
    } else if (seg.startsWith('cal:')) {
      const calVal = seg.slice(4).trim();
      reminderCalendar = calVal === 'lunar' ? 'lunar' : 'solar';
    } else if (seg.startsWith('rep:')) {
      const repVal = seg.slice(4).trim() as MemoRepeatFrequency;
      if (['once', 'weekly', 'monthly', 'lunar_1_15', 'lunar_2_16', 'yearly'].includes(repVal)) {
        reminderRepeat = repVal;
      }
    } else if (seg === 'tgt:personal') {
      reminderTarget = 'personal';
    } else if (seg === 'tgt:family') {
      reminderTarget = 'family';
    } else if (seg === 'pin:1' || seg === 'pin:true') {
      isPinned = true;
    } else if (seg.startsWith('done:')) {
      completedBy = seg.slice(5).trim() || undefined;
    } else if (seg.startsWith('done_at:')) {
      completedAt = seg.slice(8).trim() || undefined;
    }
  }

  if (reminderRepeat === 'lunar_1_15' || reminderRepeat === 'lunar_2_16') {
    reminderCalendar = 'lunar';
  }

  return {
    isMemo: true,
    reminderDate,
    reminderCalendar: reminderDate ? (reminderCalendar || 'solar') : undefined,
    reminderRepeat: reminderDate ? (reminderRepeat || 'once') : undefined,
    reminderTarget,
    completedBy,
    completedAt,
    isPinned,
  };
}

/**
 * 判斷指定項目是否處於有效置頂狀態
 * 核心防呆：一旦事項標記為辦妥 (is_settled: true)，置頂自動解除並退場！
 */
export function isMemoPinned(item?: {
  type?: string;
  is_settled?: boolean;
  is_pinned?: boolean;
  merchant?: string;
}): boolean {
  if (!item || item.type !== 'memo') return false;
  if (item.is_settled) return false;
  if (item.is_pinned !== undefined) return Boolean(item.is_pinned);
  return Boolean(decodeMemoMerchantTag(item.merchant).isPinned);
}

/**
 * 切換或設定 merchant 標籤中的置頂狀態
 */
export function toggleMemoPinnedMerchant(rawMerchant?: string, targetState?: boolean): string {
  const decoded = decodeMemoMerchantTag(rawMerchant);
  const nextPinned = targetState !== undefined ? targetState : !decoded.isPinned;
  return encodeMemoMerchantTag({
    reminderDate: decoded.reminderDate,
    reminderCalendar: decoded.reminderCalendar,
    reminderRepeat: decoded.reminderRepeat,
    reminderTarget: decoded.reminderTarget,
    completedBy: decoded.completedBy,
    completedAt: decoded.completedAt,
    isPinned: nextPinned,
  });
}

export interface PinQuotaCheckResult {
  canPin: boolean;
  currentCount: number;
  maxLimit: number;
  targetScope: 'family' | 'personal';
  errorMessage?: string;
}

/**
 * 檢查生活記事置頂配額（全家公用 5 筆、個人專屬 5 筆）
 * - 排除已辦妥 (is_settled: true) 事項（辦妥自動退場不計入上限）
 * - 支援傳入 excludeTxId，避免編輯現有已置頂項目時將自己重複計算
 */
export function checkMemoPinQuota(
  transactions: {
    id?: string;
    type?: string;
    is_settled?: boolean;
    is_pinned?: boolean;
    merchant?: string;
    reminder_target?: string | null;
    paid_by?: string | null;
    creator_id?: string | null;
    note?: string | null;
  }[],
  options: {
    targetScope?: 'family' | 'personal';
    memberId?: string | null;
    excludeTxId?: string | null;
  }
): PinQuotaCheckResult {
  const targetScope = options.targetScope === 'personal' ? 'personal' : 'family';
  const excludeTxId = options.excludeTxId;
  const maxLimit = targetScope === 'personal' ? MAX_PINNED_MEMOS_PERSONAL : MAX_PINNED_MEMOS_FAMILY;

  let currentCount = 0;
  for (const t of transactions) {
    if (t.type !== 'memo') continue;
    if (t.is_settled) continue;
    if (!isMemoPinned(t)) continue;
    if (excludeTxId && t.id === excludeTxId) continue;

    // 關鍵架構分流：進行中五大協作看板天然常駐首頁頂部，完全不佔用常態置頂的 5 筆額度！
    const parsed = parseMemoNote(t.note || undefined);
    if (isCollabActivityMemo(parsed.title, t.note || undefined)) {
      continue;
    }

    const decoded = decodeMemoMerchantTag(t.merchant);
    const resolvedTarget = t.reminder_target || decoded.reminderTarget || 'family';
    const isPersonal = resolvedTarget === 'personal';

    if (targetScope === 'family') {
      if (!isPersonal) {
        currentCount++;
      }
    } else {
      // 個人專屬
      if (isPersonal) {
        const matchesMember =
          (options.memberId && t.paid_by === options.memberId) ||
          (!t.paid_by && options.memberId && t.creator_id === options.memberId);
        if (matchesMember) {
          currentCount++;
        }
      }
    }
  }

  if (currentCount >= maxLimit) {
    const errorMessage =
      targetScope === 'family'
        ? `全家公用置頂已達上限（${maxLimit} 筆）。請先將現有置頂事項打勾辦妥或取消置頂，以保持家庭看板簡明重點！`
        : `個人專屬置頂已達上限（${maxLimit} 筆）。請先將現有個人置頂事項打勾辦妥或取消置頂，避免生活備忘堆積！`;
    return {
      canPin: false,
      currentCount,
      maxLimit,
      targetScope,
      errorMessage,
    };
  }

  return {
    canPin: true,
    currentCount,
    maxLimit,
    targetScope,
  };
}

/**
 * 格式化待辦事項辦妥日期字串 (簡潔版，僅顯示日期，適合卡片底部列避免換行遮擋)
 * 範例：10/29、2025/10/29
 */
export function formatMemoCompletedDate(completedAt?: string, fallbackTimestamp?: string): string {
  const ts = completedAt || fallbackTimestamp;
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isThisYear = d.getFullYear() === now.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  if (isThisYear) {
    return `${month}/${day}`;
  }
  return `${d.getFullYear()}/${month}/${day}`;
}

/**
 * 格式化待辦事項辦妥時間字串 (完整版，包含時與分，適合詳細彈窗與展開回報區塊)
 * 範例：今天 16:30、10/29 16:30、2025/10/29 16:30
 */
export function formatMemoCompletedTime(completedAt?: string, fallbackTimestamp?: string): string {
  const ts = completedAt || fallbackTimestamp;
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isThisYear = d.getFullYear() === now.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  const isToday = isThisYear && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (isToday) {
    return `今天 ${timeStr}`;
  }
  if (isThisYear) {
    return `${month}/${day} ${timeStr}`;
  }
  return `${d.getFullYear()}/${month}/${day} ${timeStr}`;
}

export const CHECKLIST_LINE_REGEX = /^(\s*(?:[-*]\s*)?)(?:\[([ xX✓✔])\]|([☐☑✅]))(\s*.*)$/;

export interface MemoItemReply {
  memberName: string;
  text: string;
}

export interface MemoChecklistItem {
  index: number;
  completed: boolean;
  text: string; // 純淨項目標題 (已自動剝離結尾回覆括號)
  fullText?: string; // 完整項目文字 (含回覆括號)
  replies: MemoItemReply[]; // 結構化成員回覆清單
  rawLine: string;
}

export interface ParsedMemoChecklist {
  isChecklist: boolean;
  items: MemoChecklistItem[];
  completedCount: number;
  totalCount: number;
  prefixText?: string;
  suffixText?: string;
}

/**
 * 解析單行待辦項目中的成員回覆 (支援單人或分號分隔之同行多人回覆)
 * 格式範例：
 * - 鮮奶（智爸：已買全脂2瓶）
 * - 學校問卷（洋洋：已交給老師；瑩媽：我也簽聯絡簿了）
 * 避開一般規格括號 (例如「冬瓜檸檬（半糖微冰）」不含冒號人名特徵，不會被誤判為回覆)
 */
export function parseMemoItemReplies(lineContent: string): {
  cleanText: string;
  replies: MemoItemReply[];
} {
  const trimmed = (lineContent || '').trim();
  if (!trimmed) {
    return { cleanText: '', replies: [] };
  }

  const excludedKeywords = [
    '店家', '餐廳', '規格', '備註', '說明', '提示',
    '甜度', '冰塊', '辣度', '溫度', '尺寸', '份量', '數量', '加料',
    '時間', '地址', '電話', '網址', 'http', 'https',
    '如', '例', '例如', '譬如', '包含', '包括', '注意', '重點', '範圍', '頁數', '頁碼', '科目',
  ];

  const allReplies: MemoItemReply[] = [];
  const parenRegex = /[\(（]([^\)）]+)[\)）]/g;
  const rangesToRemove: { start: number; end: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(trimmed)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;

    const segments = inner.split(/[;；]+/).map(s => s.trim()).filter(Boolean);
    if (segments.length === 0) continue;

    const candidateReplies: MemoItemReply[] = [];
    let allValid = true;

    for (const seg of segments) {
      const segMatch = seg.match(/^([^：:\-—]{1,10})[：:\-—]\s*(.+)$/);
      if (segMatch) {
        const rawMember = segMatch[1].trim();
        const member = rawMember.replace(/^[💬🗨️🗯️\s]+/, '').trim();
        const text = segMatch[2].trim();
        if (!excludedKeywords.includes(member.toLowerCase()) && !excludedKeywords.includes(member) && text) {
          candidateReplies.push({ memberName: member, text });
        } else {
          allValid = false;
          break;
        }
      } else {
        allValid = false;
        break;
      }
    }

    if (allValid && candidateReplies.length > 0) {
      allReplies.push(...candidateReplies);
      rangesToRemove.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  if (allReplies.length > 0 && rangesToRemove.length > 0) {
    let result = '';
    let lastIdx = 0;
    for (const range of rangesToRemove) {
      result += trimmed.slice(lastIdx, range.start);
      lastIdx = range.end;
    }
    result += trimmed.slice(lastIdx);
    const cleanText = result.replace(/\s{2,}/g, ' ').trim();
    return { cleanText: cleanText || trimmed, replies: allReplies };
  }

  return { cleanText: trimmed, replies: [] };
}

/**
 * 解析文字中的檢核清單項目 (支援 Markdown `-[ ]` / `-[x]` 或 `☐` / `☑`)
 */
export function parseMemoChecklist(noteText?: string): ParsedMemoChecklist {
  const cleanText = stripMemoInternalTag(noteText);
  if (!cleanText) {
    return { isChecklist: false, items: [], completedCount: 0, totalCount: 0 };
  }

  const lines = cleanText.split('\n');
  const items: MemoChecklistItem[] = [];
  const prefixLines: string[] = [];
  const suffixLines: string[] = [];
  let hasSeenFirstItem = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // 忽略獨立的中括號系統內部標籤行 (如 [memo|...] 或 [remind:...])
    if (/^[\[［【]\s*(?:memo|remind:)/i.test(trimmed)) {
      continue;
    }

    // 忽略獨立的中括號標籤行如 [✈️ 出國必備] (但排除待辦方框行)
    const tagMatch = trimmed.match(/^[\[［【]([^\[\]［］【】\n]{1,16})[\]］】]$/);
    if (tagMatch) {
      const inner = tagMatch[1].trim();
      if (inner && !['x', 'X', '✓', '✔', 'v', 'V'].includes(inner)) {
        continue;
      }
    }

    const match = line.match(CHECKLIST_LINE_REGEX);
    if (match) {
      hasSeenFirstItem = true;
      const bracketSymbol = match[2];
      const unicodeSymbol = match[3];
      const rest = match[4].trim();

      const completed = bracketSymbol !== undefined
        ? ['x', '✓', '✔'].includes(bracketSymbol.toLowerCase())
        : (unicodeSymbol === '☑' || unicodeSymbol === '✅');

      const { cleanText, replies } = parseMemoItemReplies(rest);

      items.push({
        index: items.length,
        completed,
        text: cleanText,
        fullText: rest,
        replies,
        rawLine: line,
      });
    } else {
      if (!hasSeenFirstItem) {
        if (trimmed) prefixLines.push(line);
      } else {
        if (trimmed) suffixLines.push(line);
      }
    }
  }

  return {
    isChecklist: items.length > 0,
    items,
    completedCount: items.filter(it => it.completed).length,
    totalCount: items.length,
    prefixText: prefixLines.length > 0 ? prefixLines.join('\n') : undefined,
    suffixText: suffixLines.length > 0 ? suffixLines.join('\n') : undefined,
  };
}

/**
 * 切換清單中指定項目的完成狀態 [ ] <-> [x]
 */
export function toggleChecklistItem(noteText: string, targetIndex: number): string {
  if (!noteText) return noteText;
  const lines = noteText.split('\n');
  let itemCounter = 0;
  const newLines: string[] = [];

  for (const line of lines) {
    const match = line.match(CHECKLIST_LINE_REGEX);
    if (match) {
      if (itemCounter === targetIndex) {
        const prefix = match[1];
        const bracketSymbol = match[2];
        const unicodeSymbol = match[3];
        const rest = match[4];

        if (bracketSymbol !== undefined) {
          const isCurrentlyDone = ['x', '✓', '✔'].includes(bracketSymbol.toLowerCase());
          const newSymbol = isCurrentlyDone ? '[ ]' : '[x]';
          newLines.push(`${prefix}${newSymbol}${rest}`);
        } else if (unicodeSymbol !== undefined) {
          const isCurrentlyDone = unicodeSymbol === '☑' || unicodeSymbol === '✅';
          const newSymbol = isCurrentlyDone ? '☐' : '☑';
          newLines.push(`${prefix}${newSymbol}${rest}`);
        } else {
          newLines.push(line);
        }
      } else {
        newLines.push(line);
      }
      itemCounter++;
    } else {
      newLines.push(line);
    }
  }

  return newLines.join('\n');
}

/**
 * 新增、修改或清除指定待辦項目的成員回覆
 * - 若 replyText 為空字串，則移除該 memberName 的回覆
 * - 若已有該 memberName 的回覆，更新其內容
 * - 若尚未有該 memberName 的回覆，追加在後方（以分號分隔）
 */
export function updateChecklistItemReply(
  noteText: string,
  targetIndex: number,
  memberName: string,
  replyText: string
): string {
  if (!noteText) return noteText;
  const cleanMember = (memberName || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim();
  if (!cleanMember) return noteText;

  const lines = noteText.split('\n');
  let itemCounter = 0;
  const newLines: string[] = [];

  for (const line of lines) {
    const match = line.match(CHECKLIST_LINE_REGEX);
    if (match) {
      if (itemCounter === targetIndex) {
        const prefix = match[1];
        const bracketSymbol = match[2];
        const unicodeSymbol = match[3];
        const rest = match[4].trim();

        // 取得目前的純淨項目文字與回覆
        const { cleanText, replies } = parseMemoItemReplies(rest);
        const newReplies = [...replies];

        const trimmedReply = replyText.trim();
        const existingIdx = newReplies.findIndex(
          r => r.memberName.toLowerCase() === cleanMember.toLowerCase()
        );

        if (!trimmedReply) {
          // 清除此人的回覆
          if (existingIdx >= 0) {
            newReplies.splice(existingIdx, 1);
          }
        } else {
          // 新增或更新回覆
          if (existingIdx >= 0) {
            newReplies[existingIdx] = { memberName: cleanMember, text: trimmedReply };
          } else {
            newReplies.push({ memberName: cleanMember, text: trimmedReply });
          }
        }

        // 重新組裝該行後綴
        let newRest = cleanText;
        if (newReplies.length > 0) {
          const repliesStr = newReplies.map(r => `${r.memberName}：${r.text}`).join('；');
          newRest = `${cleanText}（${repliesStr}）`;
        }

        const symbol = bracketSymbol !== undefined ? `[${bracketSymbol}]` : (unicodeSymbol || '[ ]');
        newLines.push(`${prefix}${symbol} ${newRest}`);
      } else {
        newLines.push(line);
      }
      itemCounter++;
    } else {
      newLines.push(line);
    }
  }

  return newLines.join('\n');
}

/**
 * 判斷兩篇筆記內容的差異是否「純粹僅為核取方塊的勾選或取消打勾」
 * （用於即時協同通知過濾，避免發起人備餐連續打勾時對全家造成重複泡泡轟炸）
 */
export function isChecklistOnlyChange(oldNote: string | undefined | null, newNote: string | undefined | null): boolean {
  if (!oldNote || !newNote) return false;
  if (oldNote === newNote) return true;

  const normalize = (text: string) => {
    return text
      .split('\n')
      .map(line => {
        const match = line.match(CHECKLIST_LINE_REGEX);
        if (match) {
          const prefix = match[1];
          const rest = match[4];
          return `${prefix}[ ]${rest}`;
        }
        return line;
      })
      .join('\n')
      .trim();
  };

  return normalize(oldNote) === normalize(newNote);
}

/**
 * 智慧清單輸入處理：按下 Enter 時自動為下一行補上 `- [ ] `
 */
export function handleChecklistInput(prevText: string, newText: string): string {
  if (newText.length === prevText.length + 1 && newText.endsWith('\n')) {
    const lines = prevText.split('\n');
    const lastLine = lines[lines.length - 1] || '';
    const trimmed = lastLine.trim();

    // 如果使用者在空方框上按 Enter，則退出清單模式
    if (['- [ ]', '- [x]', '[ ]', '[x]'].includes(trimmed)) {
      return lines.slice(0, -1).join('\n') + '\n';
    }

    // 如果前一行是清單項目，自動延續下一個核取方框
    if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ') || trimmed.startsWith('[ ] ') || trimmed.startsWith('[x] ')) {
      return newText + '- [ ] ';
    }
  }
  return newText;
}

/**
 * 在當前文字中插入一個新的待辦方框 `- [ ] `
 */
export function insertChecklistCheckbox(currentText: string): string {
  const trimmed = (currentText || '').trimEnd();
  if (!trimmed) {
    return '- [ ] ';
  }
  return `${trimmed}\n- [ ] `;
}

export interface MemoChecklistTemplate {
  id: string;
  title: string;
  icon: string;
  tag: string;
  description: string;
  headerText?: string;
  items: string[];
}

export const BUILTIN_MEMO_TEMPLATES: MemoChecklistTemplate[] = [
  {
    id: 'group_order_wishlist',
    title: '點餐開團／許願',
    icon: '🧋',
    tag: '🧋 點餐開團',
    description: '手搖飲、宵夜點心、便當多人自由登記報單',
    headerText: '店家：50嵐（可直接修改店名）\n截止時間：12:00（可修改時間）\n大家直接點右上方「＋我也要」快速報單！',
    items: [],
  },
  {
    id: 'school_contact_book',
    title: '學校聯絡簿快選',
    icon: '🎒',
    tag: '🎒 學校親子',
    description: '點選科目與作業類型，免打字秒速組裝今日聯絡簿清單',
    items: [],
  },
  {
    id: 'travel_abroad',
    title: '出國必備行李',
    icon: '✈️',
    tag: '✈️ 出國必備',
    description: '護照簽證、外幣卡片、漫遊與隨身常備藥品',
    items: [
      '護照正本 (效期 6 個月以上)',
      '機票與飯店入住憑證 (截圖或紙本)',
      '漫遊網卡 / 啟用出國 eSIM',
      '外幣現鈔與海外回饋信用卡',
      '萬國轉接頭與多孔充電器',
      '行動電源 (須放置於隨身行李)',
      '個人常備藥品 (暈車、感冒、胃腸藥)',
      '換洗衣物與盥洗旅行收納包',
    ],
  },
  {
    id: 'supermarket_grocery',
    title: '超市生活採買',
    icon: '🛒',
    tag: '🛒 採買清單',
    description: '生鮮食材、家庭飲品與居家消耗品',
    headerText: '賣場：全聯（可直接修改賣場）\n大家直接點右上方「＋我要買」追加補貨！',
    items: [
      '鮮奶 / 燕麥奶',
      '新鮮雞蛋 1 盒',
      '當季新鮮蔬菜與水果',
      '抽取式衛生紙 / 廚房紙巾',
      '天然洗衣精 / 洗碗精補充包',
      '家庭點心與休閒零食',
    ],
  },
  {
    id: 'online_parcel_board',
    title: '網購湊單／包裹',
    icon: '📦',
    tag: '📦 網購湊單',
    description: '酷澎/蝦皮/momo湊免運，或超商/管理室待領包裹順路代領',
    headerText: '平台：酷澎 / 超商取貨（可直接修改）\n大家直接點右上方「＋加湊/代領」登記品項或末三碼！',
    items: [],
  },
  {
    id: 'home_restock_pool',
    title: '家中缺貨隨手記',
    icon: '🏠',
    tag: '🏠 家中缺貨',
    description: '日常發現快用完的日用品或耗材隨手記，下次開團採買可一鍵匯入推車',
    items: [
      '抽取式衛生紙 / 廚房紙巾（快用完了）',
      '全脂鮮奶 / 洗選雞蛋',
      '洗衣精 / 洗碗精補充包',
    ],
  },
  {
    id: 'chores_allowance_bounty',
    title: '家事分工與懸賞',
    icon: '🧹',
    tag: '🧹 家事懸賞',
    description: '週末大掃除與家事分工，小朋友認領做完一鍵核發零用錢',
    headerText: '任務：週末家庭大掃除（可直接修改）\n大家直接點右上方「＋ 認領/新任務」認領工作！',
    items: [
      '倒垃圾與分類資源回收 $30',
      '洗碗與收拾擦拭餐桌 $50',
      '吸塵拖地整理客廳 $80',
      '曬衣服與收摺衣物 $40',
      '刷洗浴室與整理洗手台 $60',
    ],
  },
  {
    id: 'family_voting_decision',
    title: '家庭投票決策',
    icon: '🗳️',
    tag: '🗳️ 家庭投票',
    description: '週末聚餐吃什麼、連假去哪玩、好物挑選，全家人人有票自由表態',
    headerText: '主題：週末聚餐吃什麼？（可直接修改主題）\n截止時間：18:00（可修改時間）\n大家直接點右上方「＋提案/投票」投下你的一票！',
    items: [
      '🍲 鼎泰豐小籠包',
      '🍣 藏壽司迴轉壽司',
      '🥩 碳佐麻里精緻燒肉',
      '🍕 義大利麵與披薩',
    ],
  },
  {
    id: 'camping_outdoors',
    title: '親子戶外露營',
    icon: '🏕️',
    tag: '🏕️ 露營裝備',
    description: '帳篷寢具、炊事爐具與防蚊照明裝備',
    items: [
      '主帳篷、地布與營釘營槌',
      '睡袋、充氣床墊與充氣幫浦',
      '卡式爐、瓦斯罐與防風板',
      '露營燈、手電筒與備用電池',
      '折疊桌椅與環保餐具套組',
      '防蚊液、止癢藥膏與隨身急救包',
      '禦寒保暖外套與換洗衣物',
    ],
  },
  {
    id: 'school_supplies',
    title: '開學學用品準備',
    icon: '🎒',
    tag: '🎒 學校親子',
    description: '假期作業、文具用品與健康備品檢核',
    items: [
      '假期各科作業與開學回條',
      '鉛筆盒、原子筆、橡皮擦與尺',
      '隨身水壺與午餐餐盒套組',
      '室內拖鞋與體育課運動鞋',
      '隨身包衛生紙與純水濕紙巾',
      '備用換洗衣物袋',
    ],
  },
  {
    id: 'home_cleaning',
    title: '居家掃除大整理',
    icon: '🧹',
    tag: '🧹 居家生活',
    description: '全室除塵、衛浴去垢、床單曬洗與環境整頓',
    items: [
      '客廳沙發拍打與全室地板除塵拖洗',
      '廚房抽油煙機濾網與流理台去污',
      '浴室水垢除霉與乾濕分離刷洗',
      '床單被套拆洗與曬太陽',
      '冰箱過期食品清理與層架擦拭',
      '資源垃圾分類打包與傾倒',
    ],
  },
];

/**
 * 學校聯絡簿快選組裝面板：常用科目清單
 */
export const SCHOOL_SUBJECTS = [
  '國文',
  '英文',
  '數學',
  '理化',
  '生物',
  '歷史',
  '地理',
  '公民',
  '社會',
  '自然',
];

/**
 * 學校聯絡簿快選組裝面板：作業與考試類型（搭配科目組合）
 */
export const SCHOOL_TASK_TYPES = [
  '習作',
  '講義',
  '學習單',
  '課本',
  '考卷訂正',
  '小考',
  '單字',
  '注釋',
  '默寫',
  '複習',
];

/**
 * 學校聯絡簿快選組裝面板：日常必備與簽名（一鍵單獨加入）
 */
export const SCHOOL_DAILY_ITEMS = [
  '聯絡簿簽名',
  '考卷簽名',
  '通知單回條',
  '實驗衣',
  '體育服',
  '美勞用具',
  '餐袋水壺',
  '收書包',
];

export type QuickBuilderDomain = 'school' | 'health' | 'home' | 'worship' | 'travel' | 'work';

export interface MemoQuickBuilderConfig {
  domain: QuickBuilderDomain;
  defaultTag: string;
  title: string;
  subtitle: string;
  step1Label: string;
  step2LabelPrefix: string;
  step3Label: string;
  subjects: string[];
  tasks: string[];
  subjectTasksMap?: Record<string, string[]>;
  routines: string[];
}

/**
 * 依據當前記事標籤或內容，智慧感知並回傳對應情境的「三排點選式快選組裝面板」設定
 * 支援依選中主詞 (selectedSubject) 精準聯動專屬的合理項目，徹底杜絕「除濕機驗車」等不合邏輯組合
 */
export function detectMemoQuickBuilderConfig(
  noteText?: string,
  memberNames?: string[],
  selectedSubject?: string
): MemoQuickBuilderConfig | null {
  if (!noteText) return null;

  // 1. 🎒 學校親子 / 聯絡簿
  if (
    isMemoTagActive(noteText, '🎒 學校親子') ||
    noteText.includes('學校親子') ||
    noteText.includes('聯絡簿')
  ) {
    const subjectTasksMap: Record<string, string[]> = {
      國文: ['習作', '講義', '生字語詞本', '課文注釋', '成語造句', '默寫背誦', '作文學習單', '小考複習', '考卷訂正'],
      英文: ['習作', '講義', '背單字', '課文默寫', '聽力練習', '文法學習單', '小考複習', '考卷訂正'],
      數學: ['習作', '講義', '課本題目', '考卷訂正', '每日刷題', '小考複習', '帶圓規量角器'],
      理化: ['習作', '講義', '實驗紀錄本', '公式週期表', '考卷訂正', '小考複習', '帶實驗衣'],
      生物: ['習作', '講義', '實驗紀錄本', '圖表重點複習', '考卷訂正', '小考複習'],
      歷史: ['習作', '講義', '年代重點統整', '考卷訂正', '小考複習'],
      地理: ['習作', '講義', '地圖圖表統整', '考卷訂正', '小考複習'],
      公民: ['習作', '講義', '重點觀念複習', '考卷訂正', '小考複習'],
      社會: ['習作', '講義', '學習單', '考卷訂正', '小考複習'],
      自然: ['習作', '講義', '實驗觀察紀錄', '考卷訂正', '小考複習'],
    };
    const activeSubj = selectedSubject && SCHOOL_SUBJECTS.includes(selectedSubject) ? selectedSubject : SCHOOL_SUBJECTS[0];
    return {
      domain: 'school',
      defaultTag: '🎒 學校親子',
      title: '🎒 聯絡簿快選組裝',
      subtitle: '先選科目，再點作業即自動加一行待辦',
      step1Label: '1. 點選科目',
      step2LabelPrefix: '2. 點一下立即加入',
      step3Label: '3. 常態必備與簽名（點一下直接加入）：',
      subjects: SCHOOL_SUBJECTS,
      tasks: subjectTasksMap[activeSubj] || SCHOOL_TASK_TYPES,
      subjectTasksMap,
      routines: SCHOOL_DAILY_ITEMS,
    };
  }

  // 2. 🩺 健康用藥 / 生病照護 / 回診
  if (
    isMemoTagActive(noteText, '🩺 健康用藥') ||
    isMemoTagActive(noteText, '🩺 回診') ||
    noteText.includes('健康用藥') ||
    noteText.includes('回診')
  ) {
    const cleanMembers = (memberNames || []).map(n => n.trim()).filter(Boolean);
    const healthSubjects =
      cleanMembers.length > 0
        ? [...cleanMembers, '長輩', '全家']
        : ['爸爸', '媽媽', '小孩', '長輩', '全家'];
    const personalTasks = ['早餐後藥', '午餐後藥', '晚餐後藥', '睡前藥', '退燒藥', '量體溫', '點眼藥水', '塗藥膏', '洗鼻吸鼻', '益生菌'];
    const familyTasks = ['補充常備醫藥箱', '買口罩與酒精快篩', '清洗寢具防塵蟎', '預約牙科洗牙', '預約流感疫苗'];
    const subjectTasksMap: Record<string, string[]> = {};
    for (const s of healthSubjects) {
      subjectTasksMap[s] = s === '全家' ? familyTasks : personalTasks;
    }
    const activeSubj = selectedSubject && healthSubjects.includes(selectedSubject) ? selectedSubject : healthSubjects[0];
    return {
      domain: 'health',
      defaultTag: '🩺 健康用藥',
      title: '🩺 健康用藥與照護快選',
      subtitle: '先選家人，再點用藥或檢查即自動加入清單',
      step1Label: '1. 點選家人對象',
      step2LabelPrefix: '2. 點一下立即加入',
      step3Label: '3. 就醫與慢箋常態準備（點一下直接加入）：',
      subjects: healthSubjects,
      tasks: subjectTasksMap[activeSubj] || personalTasks,
      subjectTasksMap,
      routines: ['帶健保卡', '空腹抽血', '領慢箋', '預約回診', '申請診斷書', '收據留存理賠', '記錄體溫變化'],
    };
  }

  // 3. 🙏 祭祀拜拜 / 節慶供品
  if (
    isMemoTagActive(noteText, '🙏 祭祀拜拜') ||
    noteText.includes('祭祀拜拜')
  ) {
    const worshipSubjects = ['神明', '祖先', '地基主', '土地公', '床母', '普渡好兄弟', '天公'];
    const subjectTasksMap: Record<string, string[]> = {
      神明: ['三牲', '四果(奇數水果)', '鮮花一對', '清茶三杯', '發糕紅龜粿', '壽金與刈金', '甜食餅乾'],
      祖先: ['家常菜餚', '白飯與湯品', '四果水果', '湯圓或應景節食', '清茶酒水', '刈金與銀紙', '傳統糕餅'],
      地基主: ['雞腿便當(不切)', '滷蛋與青菜', '白飯兩碗與湯', '水果與飲料', '刈金與小銀', '矮桌向屋內擺放'],
      土地公: ['麻糬與花生', '甜食餅乾與飲料', '四果水果', '三牲(初二/十六)', '土地公金'],
      床母: ['麻油雞與油飯', '雞酒', '床母衣與刈金'],
      普渡好兄弟: ['整箱泡麵與餅乾', '罐頭與耐放乾糧', '三牲與四果', '臉盆毛巾', '普渡旗與插香', '普渡金與更衣'],
      天公: ['五果或四果', '鮮花與清茶', '發糕與壽桃麵線', '天公金與壽金', '齋菜六碗'],
    };
    const activeSubj = selectedSubject && worshipSubjects.includes(selectedSubject) ? selectedSubject : worshipSubjects[0];
    return {
      domain: 'worship',
      defaultTag: '🙏 祭祀拜拜',
      title: '🙏 祭祀拜拜供品快選',
      subtitle: '先選祭拜對象，自動切換專屬禮俗供品',
      step1Label: '1. 點選祭拜對象',
      step2LabelPrefix: '2. 點一下立即加入',
      step3Label: '3. 祭拜流程與備品（點一下直接加入）：',
      subjects: worshipSubjects,
      tasks: subjectTasksMap[activeSubj] || subjectTasksMap['神明'],
      subjectTasksMap,
      routines: ['整理供桌與酒杯', '準備打火機與香', '擲筊請示順遂', '燒化金紙注意安全', '供品收整惜福'],
    };
  }

  // 4. 🏠 家居修繕 / 居家生活 / 汽機車與家電定保
  if (
    isMemoTagActive(noteText, '🏠 家居修繕') ||
    isMemoTagActive(noteText, '🧹 居家生活') ||
    noteText.includes('家居修繕') ||
    noteText.includes('居家生活')
  ) {
    const homeSubjects = ['汽車', '機車', '冷氣', '濾水器', '洗衣機', '除濕機', '空氣清淨機', '廚房衛浴'];
    const subjectTasksMap: Record<string, string[]> = {
      汽車: ['定期保養換機油', '驗車', '強制險與車險續保', '輪胎胎壓檢查', '電瓶與雨刷更換', '洗車打蠟', 'eTag儲值', '繳牌照燃料稅'],
      機車: ['換機油與齒輪油', '排氣定檢', '強制險續保', '輪胎與煞車檢查', '換電瓶或火星塞', '洗車'],
      冷氣: ['清洗濾網', '預約專人洗冷氣', '遙控器換電池', '排水管與冷媒檢查'],
      濾水器: ['換第一道PP濾芯', '換活性碳濾芯', '換RO膜濾芯', '熱水膽檸檬酸除垢', '水質檢測'],
      洗衣機: ['槽洗淨消毒', '清理棉絮濾網', '檢查進排水管', '擦拭門圈防黴'],
      除濕機: ['倒水與清洗水箱', '清洗進風濾網', '外殼擦拭保養', '收納前內部風乾'],
      空氣清淨機: ['吸塵清潔前置濾網', '更換HEPA濾網', '更換活性碳濾網', '擦拭灰塵感應器'],
      廚房衛浴: ['抽油煙機洗濾網油杯', '流理台排水孔疏通', '浴室矽利康除黴', '蓮蓬頭除水垢', '熱水器換電池', '更換照明燈泡'],
    };
    const activeSubj = selectedSubject && homeSubjects.includes(selectedSubject) ? selectedSubject : homeSubjects[0];
    return {
      domain: 'home',
      defaultTag: '🏠 家居修繕',
      title: '🏠 居家與汽機車定保快選',
      subtitle: '先選設備，自動切換該設備專屬保養項目',
      step1Label: '1. 點選設備或區域',
      step2LabelPrefix: '2. 點一下立即加入',
      step3Label: '3. 出門前安全與日常檢查（點一下直接加入）：',
      subjects: homeSubjects,
      tasks: subjectTasksMap[activeSubj] || subjectTasksMap['汽車'],
      subjectTasksMap,
      routines: ['關瓦斯爐火', '關冷氣電扇', '鎖好門窗', '拔熱水瓶插頭', '倒垃圾廚餘', '繳水電瓦斯費', '領管理室包裹'],
    };
  }

  // 5. ✈️ 出國必備 / 行程安排 / 出遊防忘快檢
  if (
    isMemoTagActive(noteText, '✈️ 出國必備') ||
    isMemoTagActive(noteText, '📅 行程安排') ||
    noteText.includes('出國必備') ||
    noteText.includes('行程安排')
  ) {
    const travelSubjects = ['大人', '小孩', '全家共用', '隨身背包', '車上備用'];
    const subjectTasksMap: Record<string, string[]> = {
      大人: ['身分證健保卡駕照', '換洗衣物與外套', '手機充電線與行充', '個人常備藥保健品', '隱形眼鏡保養液', '錢包現鈔信用卡'],
      小孩: ['健保卡與兒童手冊', '多套備用換洗衣物', '水壺與環保餐具', '退燒藥與防蚊止癢膏', '繪本桌遊或安撫物', '隨身小零食濕紙巾'],
      全家共用: ['多孔充電器延長線', '牙刷毛巾盥洗包', '防曬乳與防蚊液', '雨傘與輕便雨衣', '髒衣收納袋', '隨身急救醫藥包'],
      隨身背包: ['行動電源與充電線', '面紙與酒精濕紙巾', '水壺與雨具', '薄外套(防冷氣)', '暈車藥與OK繃'],
      車上備用: ['車充線與手機架', '遮陽簾與頸枕薄毯', '備用零錢與大鈔', '嘔吐袋與衛生紙', '野餐墊或折疊傘'],
    };
    const activeSubj = selectedSubject && travelSubjects.includes(selectedSubject) ? selectedSubject : travelSubjects[0];
    return {
      domain: 'travel',
      defaultTag: '✈️ 出國必備',
      title: '✈️ 出遊與返鄉防忘快選',
      subtitle: '先選對象或位置，自動切換專屬必帶清單',
      step1Label: '1. 點選對象或位置',
      step2LabelPrefix: '2. 點一下立即加入',
      step3Label: '3. 出門前最後確認（點一下直接加入）：',
      subjects: travelSubjects,
      tasks: subjectTasksMap[activeSubj] || subjectTasksMap['大人'],
      subjectTasksMap,
      routines: ['護照身分證健保卡', '錢包現鈔與信用卡', '關瓦斯與總電源', '鎖門窗與倒廚餘', '確認訂房與車票憑證'],
    };
  }

  // 6. 💼 重要備忘 / 公司職場交辦與代墊報支
  if (
    isMemoTagActive(noteText, '💼 重要備忘') ||
    noteText.includes('重要備忘')
  ) {
    const workSubjects = ['回覆', '追蹤', '準備', '確認', '提交', '催收', '報支'];
    const subjectTasksMap: Record<string, string[]> = {
      回覆: ['客戶報價詢價', '廠商合作信件', '主管交辦事項', '會議時間確認', '同仁詢問訊息'],
      追蹤: ['客戶訂單簽回', '廠商出貨交期', '專案開發進度', '請款撥款進度', '跨部門協作進度'],
      準備: ['週會與專案簡報', '客戶提案合約', '會議室與視訊連結', '展示樣品型錄', '月度績效報表'],
      確認: ['合約條款審閱', '報價單金額毛利', '系統驗收測試', '活動出席名單', '發票抬頭與統編'],
      提交: ['費用報支申請單', '請假出差申請', '專案結案報告', '採購請購單', '主管簽核文件'],
      催收: ['客戶應收帳款', '廠商欠交發票憑證', '外包交付物原始檔', '未簽回合約正本'],
      報支: ['高鐵大眾運輸車資', '計程車收據', '客戶餐敘統編發票', '辦公耗材代墊款', '出差住宿發票', '油資與停車費'],
    };
    const activeSubj = selectedSubject && workSubjects.includes(selectedSubject) ? selectedSubject : workSubjects[0];
    return {
      domain: 'work',
      defaultTag: '💼 重要備忘',
      title: '💼 工作交辦與代墊報支快選',
      subtitle: '先選動作，自動切換對應之商務交辦或報帳項目',
      step1Label: '1. 點選工作動作',
      step2LabelPrefix: '2. 點一下立即加入',
      step3Label: '3. 公司代墊與報帳核銷（點一下直接加入）：',
      subjects: workSubjects,
      tasks: subjectTasksMap[activeSubj] || subjectTasksMap['回覆'],
      subjectTasksMap,
      routines: ['索取公司統編發票', '填寫費用報支單', '送交財務簽核', '確認代墊款已入帳', '寄出客戶文件包裹', '備份重要工作檔案'],
    };
  }

  return null;
}

/**
 * 判斷當前記事是否處於「🎒 學校親子 / 聯絡簿」模式
 */
export function isSchoolMemoMode(noteText?: string): boolean {
  if (!noteText) return false;
  return (
    isMemoTagActive(noteText, '🎒 學校親子') ||
    noteText.includes('學校親子') ||
    noteText.includes('聯絡簿')
  );
}

/**
 * 點選主詞與動作類型，自動組裝並追加一行純淨的 `- [ ] 項目` 到記事中
 */
export function appendSchoolChecklistItem(
  currentNote: string,
  subject: string | null,
  taskOrItem: string,
  defaultTag: string = '🎒 學校親子'
): string {
  const itemText = subject ? `${subject}${taskOrItem}` : taskOrItem;
  const trimmed = (currentNote || '').trim();
  if (!trimmed) {
    return `[${defaultTag}]\n- [ ] ${itemText}`;
  }
  // 若最後一行是空的待辦方框 `- [ ]`，直接填入該行
  if (/[-*]\s*\[\s*\]\s*$/.test(trimmed)) {
    return trimmed.replace(/[-*]\s*\[\s*\]\s*$/, `- [ ] ${itemText}`);
  }
  return `${trimmed}\n- [ ] ${itemText}`;
}

/**
 * 產出指定範本之完整記事文字
 */
export function applyChecklistTemplate(template: MemoChecklistTemplate, existingNote?: string, append: boolean = false): string {
  const parts: string[] = [`[${template.tag}]`];
  if (template.headerText && template.headerText.trim()) {
    parts.push(template.headerText.trim());
  }
  if (template.items && template.items.length > 0) {
    parts.push(...template.items.map(it => `- [ ] ${it}`));
  }
  const templateBody = parts.join('\n');

  if (append && existingNote && existingNote.trim()) {
    return `${existingNote.trim()}\n\n${templateBody}`;
  }
  return templateBody;
}

/**
 * 滾動生活待辦到期資訊介面 (支援未來 7 天跨月平滑預告與平鋪時間軸)
 */
export interface RollingMemoDueInfo {
  reminderYmd: string;
  daysRemaining: number;
  isOverdue: boolean;
  isToday: boolean;
  isUpcomingWithin7Days: boolean;
  badgeText: string;
  badgeColor: string;
  badgeBg: string;
}

export function getRollingMemoDueInfo(reminderYmd?: string | null, referenceYmd?: string): RollingMemoDueInfo | null {
  if (!reminderYmd || !reminderYmd.trim()) return null;
  const todayYmd = referenceYmd || getLocalDateYmd();

  const [tY, tM, tD] = todayYmd.split('-').map(Number);
  const [rY, rM, rD] = reminderYmd.split('-').map(Number);
  if (!tY || !tM || !tD || !rY || !rM || !rD) return null;

  const todayMid = new Date(tY, tM - 1, tD).getTime();
  const remindMid = new Date(rY, rM - 1, rD).getTime();
  const daysRemaining = Math.round((remindMid - todayMid) / (1000 * 60 * 60 * 24));

  const isOverdue = daysRemaining < 0;
  const isToday = daysRemaining === 0;
  const isUpcomingWithin7Days = daysRemaining > 0 && daysRemaining <= 7;

  let badgeText = '';
  let badgeColor = '#94A3B8';
  let badgeBg = 'rgba(148, 163, 184, 0.15)';

  if (isOverdue) {
    const abs = Math.abs(daysRemaining);
    badgeText = abs === 1 ? '逾期 1 天' : `逾期 ${abs} 天`;
    badgeColor = '#EF4444';
    badgeBg = 'rgba(239, 68, 68, 0.15)';
  } else if (isToday) {
    badgeText = '今日待辦';
    badgeColor = '#F59E0B';
    badgeBg = 'rgba(245, 158, 11, 0.15)';
  } else if (daysRemaining === 1) {
    badgeText = '明日待辦';
    badgeColor = '#3B82F6';
    badgeBg = 'rgba(59, 130, 246, 0.15)';
  } else if (isUpcomingWithin7Days) {
    badgeText = `${daysRemaining} 天後`;
    badgeColor = '#06B6D4';
    badgeBg = 'rgba(6, 182, 212, 0.15)';
  } else {
    badgeText = `${rM}/${rD}`;
  }

  return {
    reminderYmd,
    daysRemaining,
    isOverdue,
    isToday,
    isUpcomingWithin7Days,
    badgeText,
    badgeColor,
    badgeBg,
  };
}

/**
 * 取得生活記事之「有效生效提醒日期（Effective Reminder Date）」
 * 核心原則：
 * 1. 嚴格防呆：若該記事本來就沒有設定提醒（reminder_date 為空），嚴格維持 null（不設提醒）！
 * 2. 接力智慧對齊：
 *    - 若該記事原先有設定提醒，且包含待辦子清單（Checklist）；
 *    - 且子清單尚未全部辦妥；
 *    - 則自動解析未完成子項目中最早到期之日期（或子項目全部完成時的主標題日期）；
 *    - 若推算出的接力日期存在，則以該最緊急之接力日期為準（解決歷史舊資料提醒日停留在遙遠看診日的脫節現象）！
 * 3. 一般情況：傳回原始的 reminder_date。
 */
export function getEffectiveMemoReminderDate(
  transaction?: {
    reminder_date?: string | null;
    merchant?: string;
    note?: string;
    transacted_at?: string;
    created_at?: string;
  } | null,
  referenceDate: Date = new Date()
): string | null {
  if (!transaction) return null;

  const decodedMerchant = decodeMemoMerchantTag(transaction.merchant);
  const rawReminderDate = transaction.reminder_date || decodedMerchant.reminderDate;

  // 1. 若當初明確未設提醒，嚴格維持為 null
  if (!rawReminderDate) return null;

  // 2. 若有待辦清單，且原先有設提醒：以當前接力推進日期為有效提醒日
  if (transaction.note) {
    const anchorDate = transaction.transacted_at || transaction.created_at;
    const relayDate = computeNextRelayReminderDate(transaction.note, referenceDate, anchorDate);
    if (relayDate) {
      return relayDate;
    }
  }

  return rawReminderDate;
}

/**
 * 格式化連動交易於卡片或生活待辦膠囊上的精簡摘要文字
 * 徹底剔除 [🧾 ...] 發票中繼標籤、[rem:...] 提醒中繼標籤與換行，絕不外洩系統編碼亂碼
 */
export function formatLinkedTransactionSummary(tx?: {
  type?: string;
  amount?: number;
  note?: string;
  merchant?: string;
  is_settled?: boolean | number;
} | null): string {
  if (!tx) return '';
  const type = tx.type || 'expense';
  const amountStr = `NT$ ${Number(tx.amount || 0).toLocaleString()}`;

  // 深度淨化 note：去除發票標籤與系統中繼標籤
  const cleanNote = stripMemoInternalTag(stripInvoiceTag(tx.note || '')).trim();

  // 1. 若為支出
  if (type === 'expense') {
    let desc = '';
    // 優先 1: 店家名稱 (若合法且非通用標籤)
    if (isValidMerchantName(tx.merchant)) {
      desc = tx.merchant!.trim();
    }
    // 優先 2: 乾淨備註的第一行 (移除 [辦妥] 等前綴)
    if (!desc && cleanNote) {
      const firstLine = cleanNote.split('\n')[0].replace(/^\[(?:辦妥|完成)\]\s*/, '').trim();
      if (firstLine) {
        desc = firstLine.length > 16 ? `${firstLine.slice(0, 15)}…` : firstLine;
      }
    }
    const suffix = desc ? ` (${desc})` : ' (支出)';
    return `🔗 連動支出：${amountStr}${suffix} ›`;
  }

  // 2. 若為轉帳
  if (type === 'transfer') {
    let desc = '';
    if (isValidMerchantName(tx.merchant)) {
      desc = tx.merchant!.trim();
    }
    if (!desc && cleanNote) {
      const firstLine = cleanNote.split('\n')[0].trim();
      desc = firstLine.length > 16 ? `${firstLine.slice(0, 15)}…` : firstLine;
    }
    const suffix = desc ? ` (${desc})` : ' (轉帳)';
    return `🔗 連動轉帳：${amountStr}${suffix} ›`;
  }

  // 3. 若為收入
  if (type === 'income') {
    let desc = '';
    if (cleanNote) {
      const firstLine = cleanNote.split('\n')[0].trim();
      desc = firstLine.length > 16 ? `${firstLine.slice(0, 15)}…` : firstLine;
    }
    const suffix = desc ? ` (${desc})` : ' (收入)';
    return `🔗 連動收入：${amountStr}${suffix} ›`;
  }

  // 4. 若為接力待辦或協作看板記事 (memo)
  const isSettled = !!tx.is_settled;
  const parsed = parseMemoNote(tx.note);
  const rawTitle = (parsed.title && parsed.title !== '生活記事' && parsed.title !== '生活待辦')
    ? parsed.title
    : (cleanNote.split('\n')[0] || '生活待辦');
  const cleanTitle = rawTitle.replace(/^\[(?:.*?)]\s*/, '').trim() || rawTitle;

  const isOrder = isGroupOrderMemo(cleanTitle, cleanNote);

  // 4.0 若非五大協作看板，則為一般接力待辦
  if (!isOrder) {
    const shortTitle = cleanTitle.length > 14 ? `${cleanTitle.slice(0, 13)}…` : cleanTitle;
    const statusText = isSettled ? ' (已辦妥)' : '';
    return `🔗 接力待辦：${shortTitle}${statusText} ›`;
  }

  const mode = detectCollaborativeOrderMode(cleanTitle, cleanNote);
  const summary = computeGroupOrderSummary(cleanNote, cleanTitle);

  // 4.1 點餐開團 (food mode)
  if (mode === 'food') {
    const rawStore = extractStoreNameFromMemo(cleanTitle, cleanNote);
    const cleanStore = rawStore.replace(/^(?:🍲|🍣|🥩|🍕|🍔|🍟|🍱|☕|🥤|🧋|🍜|\s)+/u, '').trim();
    const store = cleanStore.length > 12 ? `${cleanStore.slice(0, 11)}…` : (cleanStore || '餐飲開團');

    let statusText = '';
    if (isSettled) {
      statusText = ' (已結案)';
    } else if (summary.totalCount === 0) {
      statusText = ' (等待報單中)';
    } else if (summary.totalAmount > 0) {
      statusText = ` (累計 ${summary.totalCount} 份·NT$ ${Math.round(summary.totalAmount).toLocaleString()})`;
    } else {
      statusText = ` (累計 ${summary.totalCount} 份)`;
    }
    return `🧋 連動開團：${store}${statusText} ›`;
  }

  // 4.2 家庭民主投票 (vote mode)
  if (mode === 'vote') {
    // 優先從內文提取明確的「主題：xxx」
    const topicMatch = cleanNote.match(/(?:主題|問題|議題|投票主題)[：:\s]+([^（\(\n\r]+)/i);
    let topic = topicMatch ? topicMatch[1].replace(/[可直接修改|大家投].*$/, '').trim() : '';
    if (!topic && cleanTitle && !['家庭投票', '投票', '決策', '投票看板'].includes(cleanTitle)) {
      topic = cleanTitle;
    }
    if (topic && topic.length > 10) {
      topic = `${topic.slice(0, 9)}…`;
    }

    const leading = summary.leadingOption;
    let statusText = '';

    if (isSettled) {
      if (leading?.title) {
        const cleanLead = leading.title.replace(/^(?:🍲|🍣|🥩|🍕|🍔|🍟|🍱|☕|🥤|🧋|🍜|\s)+/u, '').trim();
        const shortLead = cleanLead.length > 8 ? `${cleanLead.slice(0, 7)}…` : cleanLead;
        statusText = leading.voteCount > 0 ? ` (${shortLead} ${leading.voteCount}票拍板)` : ` (拍板：${shortLead})`;
      } else {
        statusText = ' (已拍板結案)';
      }
    } else if (leading && leading.voteCount > 0) {
      const cleanLead = leading.title.replace(/^(?:🍲|🍣|🥩|🍕|🍔|🍟|🍱|☕|🥤|🧋|🍜|\s)+/u, '').trim();
      const shortLead = cleanLead.length > 8 ? `${cleanLead.slice(0, 7)}…` : cleanLead;
      statusText = ` (領先：${shortLead} ${leading.voteCount}票)`;
    } else if ((summary.totalVotes || 0) > 0) {
      statusText = ` (投票中·累計 ${summary.totalVotes} 票)`;
    } else {
      statusText = ' (投票進行中)';
    }

    if (topic) {
      return `🗳️ 來自投票：${topic}${statusText} ›`;
    }
    if (leading?.title) {
      const cleanLead = leading.title.replace(/^(?:🍲|🍣|🥩|🍕|🍔|🍟|🍱|☕|🥤|🧋|🍜|\s)+/u, '').trim();
      const shortLead = cleanLead.length > 10 ? `${cleanLead.slice(0, 9)}…` : cleanLead;
      return `🗳️ 來自投票：${shortLead}${statusText} ›`;
    }
    return `🗳️ 來自投票：家庭投票${statusText} ›`;
  }

  // 4.3 賣場推車採買 (grocery mode)
  if (mode === 'grocery') {
    const rawStore = extractStoreNameFromMemo(cleanTitle, cleanNote);
    const cleanStore = rawStore.replace(/^(?:🛒|🛍️|\s)+/u, '').trim();
    const store = cleanStore.length > 10 ? `${cleanStore.slice(0, 9)}…` : (cleanStore || '採買推車');
    const unDoneCount = summary.totalCount - summary.completedCount;

    let statusText = '';
    if (isSettled) {
      statusText = ' (已買妥結案)';
    } else if (summary.totalCount === 0) {
      statusText = ' (推車準備中)';
    } else if (unDoneCount > 0) {
      statusText = ` (待買 ${unDoneCount} 件)`;
    } else {
      statusText = ' (已全數放推車)';
    }
    return `🛒 連動採買：${store}${statusText} ›`;
  }

  // 4.4 網購湊單與超商包裹 (parcel mode)
  if (mode === 'parcel') {
    const rawStore = extractStoreNameFromMemo(cleanTitle, cleanNote);
    const cleanStore = rawStore.replace(/^(?:📦|🚚|\s)+/u, '').trim();
    const store = cleanStore.length > 10 ? `${cleanStore.slice(0, 9)}…` : (cleanStore || '包裹湊單');
    const unDoneCount = summary.totalCount - summary.completedCount;

    let statusText = '';
    if (isSettled) {
      statusText = ' (已取件結案)';
    } else if (summary.totalCount === 0) {
      statusText = ' (湊單進行中)';
    } else if (unDoneCount > 0) {
      statusText = ` (待取 ${unDoneCount} 件)`;
    } else {
      statusText = ' (已全數取件)';
    }
    return `📦 連動包裹：${store}${statusText} ›`;
  }

  // 4.5 家事零用錢懸賞 (chore mode)
  if (mode === 'chore') {
    let choreName = cleanTitle.replace(/^(?:🧹|🧽|🏠|\s)+/u, '').trim();
    const isGeneric = !choreName || ['家事懸賞', '家事分工', '家事', '任務懸賞', '分工', '生活待辦', '生活記事'].includes(choreName);
    if (isGeneric) {
      // 嘗試從第一行去除中括號後的剩餘文字提取 (如 [🧹 家事懸賞] 客廳大掃除 -> 客廳大掃除)
      const firstLine = cleanNote.split('\n')[0] || '';
      const afterTag = firstLine.replace(/^[\[［【][^\]］】]+[\]］】]\s*/, '').trim();
      if (afterTag && !afterTag.startsWith('- [') && !afterTag.startsWith('* [')) {
        choreName = afterTag;
      } else {
        const rawStore = extractStoreNameFromMemo(cleanTitle, cleanNote);
        if (rawStore && rawStore !== '家庭任務') {
          choreName = rawStore;
        }
      }
    }
    const cleanChore = (choreName || '家事分工').replace(/^(?:🧹|🧽|🏠|\s)+/u, '').trim();
    const shortChore = cleanChore.length > 10 ? `${cleanChore.slice(0, 9)}…` : cleanChore;
    const unDoneCount = summary.totalCount - summary.completedCount;

    let statusText = '';
    if (isSettled) {
      statusText = ' (已全數完成)';
    } else if (unDoneCount > 0) {
      statusText = ` (${unDoneCount}項待認領)`;
    } else {
      statusText = ' (進行中)';
    }
    return `🧹 連動家事：${shortChore}${statusText} ›`;
  }

  // 4.6 一般接力待辦 (custom / default memo)
  const shortTitle = cleanTitle.length > 14 ? `${cleanTitle.slice(0, 13)}…` : cleanTitle;
  const statusText = isSettled ? ' (已辦妥)' : '';
  return `🔗 接力待辦：${shortTitle}${statusText} ›`;
}




