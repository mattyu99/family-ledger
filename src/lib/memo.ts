/**
 * 生活記事手帳與備忘解析工具
 */

export const MEMO_QUICK_TAGS = [
  '📌 待辦清單',
  '🛒 採買清單',
  '💡 靈感筆記',
  '🏠 家居修繕',
  '🩺 健康用藥',
  '🎂 紀念日',
  '💼 重要備忘',
];

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
  const match = raw.match(/\[([^\[\]\n]{1,16})\]/) || raw.match(/【([^【】\n]{1,16})】/);

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
  const match = currentNote.match(/\[([^\[\]\n]{1,16})\]/) || currentNote.match(/【([^【】\n]{1,16})】/);
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
 * - 原本無標籤：加到文字字首
 */
export function toggleMemoTag(currentNote: string, tag: string): string {
  const match = currentNote.match(/\[([^\[\]\n]{1,16})\]/) || currentNote.match(/【([^【】\n]{1,16})】/);
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
  return currentNote.trim() ? `[${tag}] ${currentNote.trim()}` : `[${tag}] `;
}

