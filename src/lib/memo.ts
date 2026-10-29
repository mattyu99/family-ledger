/**
 * 生活記事手帳與備忘解析工具
 */

import { CalendarSystem, MemoRepeatFrequency } from './lunar';

export const DEFAULT_MEMO_QUICK_TAGS = [
  '📌 待辦清單',
  '🛒 採買清單',
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
 * 尋找內文中的首個有效生活記事主題標籤 (支援 [標籤]、［標籤］、【標籤】)
 * 自動避開 Markdown 檢核清單方框 (如 - [ ]、- [x]、[✓]) 與系統中繼標籤
 */
export function findMemoTopicTagMatch(text?: string): RegExpExecArray | null {
  if (!text) return null;
  const tagRegex = /[\[［【]([^\[\]［］【】\n]{1,16})[\]］】]/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
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
      trimmed.startsWith('remind:') ||
      trimmed.startsWith('done:') ||
      trimmed.startsWith('merchant:') ||
      trimmed.startsWith('id:') ||
      trimmed.startsWith('linked:')
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
  if (!noteText || !noteText.trim()) {
    return {
      title: '生活記事',
      icon: '📌',
      cleanContent: '(無內容)',
    };
  }

  const raw = noteText.trim();
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
 * 格式範例：remind:2026-10-25|cal:lunar|rep:lunar_1_15|done:uuid|done_at:2026-10-29T16:30:00.000Z
 */
export function encodeMemoMerchantTag(options: {
  reminderDate?: string;
  reminderCalendar?: CalendarSystem;
  reminderRepeat?: MemoRepeatFrequency;
  completedBy?: string;
  completedAt?: string;
}): string {
  const { reminderDate, reminderCalendar, reminderRepeat, completedBy, completedAt } = options;
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
  completedBy?: string;
  completedAt?: string;
} {
  if (!rawMerchant) return { isMemo: false };
  const trimmed = rawMerchant.trim();
  if (!trimmed.startsWith('remind:') && !trimmed.startsWith('memo')) {
    return { isMemo: false };
  }

  let reminderDate: string | undefined;
  let reminderCalendar: CalendarSystem | undefined;
  let reminderRepeat: MemoRepeatFrequency | undefined;
  let completedBy: string | undefined;
  let completedAt: string | undefined;

  const segments = trimmed.split('|');
  for (const seg of segments) {
    if (seg.startsWith('remind:')) {
      reminderDate = seg.slice(7).trim() || undefined;
    } else if (seg.startsWith('cal:')) {
      const calVal = seg.slice(4).trim();
      reminderCalendar = calVal === 'lunar' ? 'lunar' : 'solar';
    } else if (seg.startsWith('rep:')) {
      const repVal = seg.slice(4).trim() as MemoRepeatFrequency;
      if (['once', 'monthly', 'lunar_1_15', 'lunar_2_16', 'yearly'].includes(repVal)) {
        reminderRepeat = repVal;
      }
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
    completedBy,
    completedAt,
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
  if (!noteText || !noteText.trim()) {
    return { isChecklist: false, items: [], completedCount: 0, totalCount: 0 };
  }

  const lines = noteText.split('\n');
  const items: MemoChecklistItem[] = [];
  const prefixLines: string[] = [];
  const suffixLines: string[] = [];
  let hasSeenFirstItem = false;

  for (const line of lines) {
    const trimmed = line.trim();
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
  items: string[];
}

export const BUILTIN_MEMO_TEMPLATES: MemoChecklistTemplate[] = [
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
  const templateBody = [
    `[${template.tag}]`,
    ...template.items.map(it => `- [ ] ${it}`),
  ].join('\n');

  if (append && existingNote && existingNote.trim()) {
    return `${existingNote.trim()}\n\n${templateBody}`;
  }
  return templateBody;
}



