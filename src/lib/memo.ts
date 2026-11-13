/**
 * 生活記事手帳與備忘解析工具
 */

import { CalendarSystem, MemoRepeatFrequency } from './lunar';
import { computeNextRelayReminderDate } from './dateParser';
export * from './dateParser';

export const DEFAULT_MEMO_QUICK_TAGS = [
  '📌 待辦清單',
  '🛒 採買清單',
  '🧋 點餐開團',
  '📦 網購湊單',
  '🏠 家中缺貨',
  '🧹 家事懸賞',
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
 * 智慧合併生活記事標籤：固定內建核心項目在最前面維持位置穩定，使用者自訂或歷史常用標籤接在後面
 * 嚴格排除已被使用者長按主動移除的黑名單標籤 (dismissedTags)
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

  // 2. 使用者自訂/新增的歷史常用標籤排在後面 (排除已包含的內建項目，且排除已被使用者移除之項目)
  for (const t of recentTags) {
    const clean = (t || '').trim();
    if (!clean) continue;
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
 * - 點擊相同標籤：取消選取 (移除)
 * - 點擊不同標籤：替換既有括號標籤
 * - 原本無標籤：加到文字字首 (若已有清單則以換行隔開)
 */
export function toggleMemoTag(currentNote: string, tag: string): string {
  const match = findMemoTopicTagMatch(currentNote);
  const tagCore = tag.replace(EMOJI_REGEX, '').trim();

  if (match) {
    const existingRaw = match[1].trim();
    const existingCore = existingRaw.replace(EMOJI_REGEX, '').trim();

    // 點擊同一個標籤 -> 取消選取 (移除標籤)
    if (existingRaw === tag || (existingCore && existingCore === tagCore)) {
      return currentNote.replace(match[0], '').trim();
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

export interface MemoChecklistItem {
  index: number;
  completed: boolean;
  text: string;
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

      items.push({
        index: items.length,
        completed,
        text: rest,
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
    headerText: '店家：50嵐（可直接修改店名）\n大家直接點右上方【＋我也要】快速報單！',
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
    headerText: '賣場：全聯（可直接修改賣場）\n大家直接點右上方【＋我要買】追加補貨！',
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
    headerText: '平台：酷澎 / 超商取貨（可直接修改）\n大家直接點右上方【＋加湊/代領】登記品項或末三碼！',
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
    headerText: '任務：週末家庭大掃除（可直接修改）\n大家直接點右上方【＋ 認領/新任務】認領工作！',
    items: [
      '倒垃圾與分類資源回收 $30',
      '洗碗與收拾擦拭餐桌 $50',
      '吸塵拖地整理客廳 $80',
      '曬衣服與收摺衣物 $40',
      '刷洗浴室與整理洗手台 $60',
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




