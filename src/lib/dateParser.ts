/**
 * 生活記事與待辦備忘之智慧日期解析引擎
 * 支援民國年、西元年、月/日簡寫、跨年自動推導、相對日期詞，並具備就醫號碼牌等防呆過濾
 */

export interface ExtractedDateResult {
  /** 匹配到的原始文字，例如 "116/1/9"、"12/9"、"明天" */
  rawMatch: string;
  /** 換算後的西元標準日期字串 "YYYY-MM-DD" */
  formattedYmd: string;
  /** 友善顯示字串，例如 "2027-01-09 (民國116/1/9)" */
  displayLabel: string;
  year: number;
  month: number;
  day: number;
  /** 是否為民國年換算 */
  isRocYear?: boolean;
}

/**
 * 補零輔助工具
 */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 驗證年月日是否為合法日曆日期
 */
function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

/**
 * 將指定 YYYY-MM-DD 加上或減去指定天數
 */
export function offsetDateYmd(ymd: string, offsetDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + offsetDays);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/**
 * 從生活記事文字中自動擷取最佳之提醒日期
 *
 * @param text 記事內容或標題
 * @param referenceDate 基準參考時間 (預設為當前系統時間)
 */
export function extractDateFromText(
  text: string,
  referenceDate: Date = new Date()
): ExtractedDateResult | null {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  // -------------------------------------------------------------
  // 1. 相對日期詞 (大後天、後天、明天、今天)
  // 中文詞彙無需 word boundary，由長到短優先匹配
  // -------------------------------------------------------------
  const relPatterns = [
    { regex: /大後天/, offset: 3, label: '大後天' },
    { regex: /後天/, offset: 2, label: '後天' },
    { regex: /(?:明天|明日)/, offset: 1, label: '明天' },
    { regex: /(?:今天|今日)/, offset: 0, label: '今天' },
  ];

  for (const { regex, offset, label } of relPatterns) {
    const match = trimmed.match(regex);
    if (match) {
      const dt = new Date(referenceDate);
      dt.setDate(dt.getDate() + offset);
      const y = dt.getFullYear();
      const m = dt.getMonth() + 1;
      const d = dt.getDate();
      const ymd = `${y}-${pad2(m)}-${pad2(d)}`;
      return {
        rawMatch: match[0],
        formattedYmd: ymd,
        displayLabel: `${ymd} (${label})`,
        year: y,
        month: m,
        day: d,
      };
    }
  }

  // -------------------------------------------------------------
  // 2. 民國年格式：例如 "116/1/9"、"116.1.29"、"115-11-8"、"民國116年1月9日"
  // 民國年合理範圍設定為 100 ~ 199 (即西元 2011 ~ 2110)
  // 日期兩位數優先匹配 ([12]\d|3[01]|0?[1-9])
  // -------------------------------------------------------------
  const rocRegex = /(?:民國\s*)?(1[0-2]\d)[年\/\.\-\_](1[0-2]|0?[1-9])[月\/\.\-\_]([12]\d|3[01]|0?[1-9])日?/g;
  let rocMatch: RegExpExecArray | null;
  while ((rocMatch = rocRegex.exec(trimmed)) !== null) {
    const rocYear = parseInt(rocMatch[1], 10);
    const m = parseInt(rocMatch[2], 10);
    const d = parseInt(rocMatch[3], 10);
    const westernYear = rocYear + 1911;

    if (isValidDate(westernYear, m, d)) {
      const ymd = `${westernYear}-${pad2(m)}-${pad2(d)}`;
      return {
        rawMatch: rocMatch[0],
        formattedYmd: ymd,
        displayLabel: `${ymd} (民國${rocYear}/${m}/${d})`,
        year: westernYear,
        month: m,
        day: d,
        isRocYear: true,
      };
    }
  }

  // -------------------------------------------------------------
  // 3. 西元完整年月日格式：例如 "2026/12/9"、"2027-01-09"、"2026年12月9日"
  // -------------------------------------------------------------
  const westernRegex = /(20\d{2})[年\/\.\-\_](1[0-2]|0?[1-9])[月\/\.\-\_]([12]\d|3[01]|0?[1-9])日?/g;
  let westernMatch: RegExpExecArray | null;
  while ((westernMatch = westernRegex.exec(trimmed)) !== null) {
    const y = parseInt(westernMatch[1], 10);
    const m = parseInt(westernMatch[2], 10);
    const d = parseInt(westernMatch[3], 10);

    if (isValidDate(y, m, d)) {
      const ymd = `${y}-${pad2(m)}-${pad2(d)}`;
      return {
        rawMatch: westernMatch[0],
        formattedYmd: ymd,
        displayLabel: ymd,
        year: y,
        month: m,
        day: d,
        isRocYear: false,
      };
    }
  }

  // -------------------------------------------------------------
  // 4. 簡易月／日格式：例如 "12/9"、"12-9"、"12.9"、"12月9日"、"12月9號"
  // -------------------------------------------------------------
  // 4-A. 中文格式 "M月D日" 或 "M月D號"
  const cnMonthDayRegex = /(1[0-2]|0?[1-9])\s*月\s*([12]\d|3[01]|0?[1-9])\s*[日號号]/g;
  let cnMdMatch: RegExpExecArray | null;
  while ((cnMdMatch = cnMonthDayRegex.exec(trimmed)) !== null) {
    const m = parseInt(cnMdMatch[1], 10);
    const d = parseInt(cnMdMatch[2], 10);

    let targetYear = refYear;
    if (m < refMonth || (m === refMonth && d < refDay)) {
      targetYear = refYear + 1;
    }

    if (isValidDate(targetYear, m, d)) {
      const ymd = `${targetYear}-${pad2(m)}-${pad2(d)}`;
      return {
        rawMatch: cnMdMatch[0],
        formattedYmd: ymd,
        displayLabel: ymd,
        year: targetYear,
        month: m,
        day: d,
      };
    }
  }

  // 4-B. 符號分隔格式 "M/D" 或 "M-D" (如 "12/9"、"1/9")
  // 前面不能緊接數字 (避免成為時間如 10/12/9 或金額 100/2)
  // 後面不能緊接數字或金額單位
  const symMonthDayRegex = /(?:^|[^\d\$\￥])(1[0-2]|0?[1-9])[\/\-]([12]\d|3[01]|0?[1-9])(?!\d)/g;
  let symMdMatch: RegExpExecArray | null;
  while ((symMdMatch = symMonthDayRegex.exec(trimmed)) !== null) {
    const m = parseInt(symMdMatch[1], 10);
    const d = parseInt(symMdMatch[2], 10);

    // 檢查匹配位置後方是否為金額或量詞單位 (如 "元", "塊", "折", "km")
    const matchFullStr = symMdMatch[0];
    const matchStart = symMdMatch.index;
    const matchEndIdx = matchStart + matchFullStr.length;
    const postSnippet = trimmed.slice(matchEndIdx, matchEndIdx + 3);
    if (/^[元塊度折kmKM]/.test(postSnippet)) {
      continue;
    }

    let targetYear = refYear;
    if (m < refMonth || (m === refMonth && d < refDay)) {
      targetYear = refYear + 1;
    }

    if (isValidDate(targetYear, m, d)) {
      const ymd = `${targetYear}-${pad2(m)}-${pad2(d)}`;
      return {
        rawMatch: `${m}/${d}`,
        formattedYmd: ymd,
        displayLabel: ymd,
        year: targetYear,
        month: m,
        day: d,
      };
    }
  }

  return null;
}

export interface ItemDueDateBadge {
  hasDate: boolean;
  formattedYmd: string;
  diffDays: number;
  text: string;
  color: string;
  bgColor: string;
  borderColor: string;
  isOverdue: boolean;
}

/**
 * 依據清單子項目文字與完成狀態，計算其專屬之動態彩色日期倒數標籤
 */
export function getItemDueDateBadge(
  itemText: string,
  isItemDone: boolean,
  referenceDate: Date = new Date(),
  isDark: boolean = true
): ItemDueDateBadge | null {
  const extracted = extractDateFromText(itemText, referenceDate);
  if (!extracted) return null;

  const targetDate = new Date(extracted.year, extracted.month - 1, extracted.day);
  const refDayOnly = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const diffTime = targetDate.getTime() - refDayOnly.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const isOverdue = diffDays < 0;

  if (isItemDone) {
    return {
      hasDate: true,
      formattedYmd: extracted.formattedYmd,
      diffDays,
      text: `${extracted.month}/${extracted.day} ✓`,
      color: isDark ? '#9CA3AF' : '#6B7280',
      bgColor: isDark ? 'rgba(107, 114, 128, 0.2)' : '#F3F4F6',
      borderColor: isDark ? '#4B5563' : '#E5E7EB',
      isOverdue: false,
    };
  }

  if (isOverdue) {
    return {
      hasDate: true,
      formattedYmd: extracted.formattedYmd,
      diffDays,
      text: `${extracted.month}/${extracted.day} 逾期${Math.abs(diffDays)}天`,
      color: isDark ? '#FCA5A5' : '#B91C1C',
      bgColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
      borderColor: isDark ? '#DC2626' : '#FCA5A5',
      isOverdue: true,
    };
  }

  if (diffDays === 0) {
    return {
      hasDate: true,
      formattedYmd: extracted.formattedYmd,
      diffDays,
      text: `${extracted.month}/${extracted.day} 今天到期`,
      color: isDark ? '#FDE68A' : '#B45309',
      bgColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
      borderColor: isDark ? '#F59E0B' : '#FCD34D',
      isOverdue: false,
    };
  }

  if (diffDays === 1) {
    return {
      hasDate: true,
      formattedYmd: extracted.formattedYmd,
      diffDays,
      text: `${extracted.month}/${extracted.day} 明天到期`,
      color: isDark ? '#FDE68A' : '#B45309',
      bgColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
      borderColor: isDark ? '#D97706' : '#FCD34D',
      isOverdue: false,
    };
  }

  // 未來天數
  return {
    hasDate: true,
    formattedYmd: extracted.formattedYmd,
    diffDays,
    text: `${extracted.month}/${extracted.day} 還有${diffDays}天`,
    color: isDark ? '#7DD3FC' : '#0369A1',
    bgColor: isDark ? 'rgba(14, 165, 233, 0.15)' : '#E0F2FE',
    borderColor: isDark ? 'rgba(14, 165, 233, 0.4)' : '#BAE6FD',
    isOverdue: false,
  };
}

/**
 * 接力式推進提醒日計算：
 * 檢查記事中的子任務項目，找出未打勾項目中「最早要到期」的日期；
 * 若所有子項目皆已完成，則推進回主事件/標題日期。
 */
export function computeNextRelayReminderDate(
  noteText: string,
  referenceDate: Date = new Date()
): string | null {
  if (!noteText || typeof noteText !== 'string') return null;

  const lines = noteText.split('\n');
  const checklistLineRegex = /^\s*(?:[-*•]\s+)?(?:\[([ x✓✔])\]|([☐☑✅]))\s*(.*)$/i;

  const pendingItemDates: { ymd: string; dt: Date }[] = [];
  const completedItemDates: { ymd: string; dt: Date }[] = [];
  const headerLines: string[] = [];
  let foundFirstChecklist = false;

  for (const line of lines) {
    const match = line.match(checklistLineRegex);
    if (match) {
      foundFirstChecklist = true;
      const bracketSymbol = match[1];
      const unicodeSymbol = match[2];
      const restText = match[3].trim();

      const isCompleted = bracketSymbol !== undefined
        ? ['x', '✓', '✔'].includes(bracketSymbol.toLowerCase())
        : (unicodeSymbol === '☑' || unicodeSymbol === '✅');

      const extracted = extractDateFromText(restText, referenceDate);
      if (extracted) {
        const itemDt = new Date(extracted.year, extracted.month - 1, extracted.day);
        if (isCompleted) {
          completedItemDates.push({ ymd: extracted.formattedYmd, dt: itemDt });
        } else {
          pendingItemDates.push({ ymd: extracted.formattedYmd, dt: itemDt });
        }
      }
    } else if (!foundFirstChecklist && line.trim()) {
      headerLines.push(line.trim());
    }
  }

  // 1. 如果有未完成的子項目且帶有日期：取其中最早的日期
  if (pendingItemDates.length > 0) {
    pendingItemDates.sort((a, b) => a.dt.getTime() - b.dt.getTime());
    return pendingItemDates[0].ymd;
  }

  // 2. 如果子項目都有日期且全部打勾完成了（或者沒有子項目帶日期）：
  // 檢查主標題/前綴是否有日期 (例如 "智116/1/9早28號心臟科")
  if (headerLines.length > 0) {
    const headerText = headerLines.join('\n');
    const headerExtracted = extractDateFromText(headerText, referenceDate);
    if (headerExtracted) {
      return headerExtracted.formattedYmd;
    }
  }

  return null;
}
