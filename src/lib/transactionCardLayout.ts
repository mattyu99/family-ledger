export type CardBadgeKey = 'invoice' | 'memo' | 'image';

export type CardBadgeLevel = 'full' | 'compact' | 'icon';

export interface CardBadgeInput {
  key: CardBadgeKey;
  fullText: string;
  compactText: string;
  iconText: string;
  forceThirdRow?: boolean;
  shrinkPriority: number;
}

export interface PlacedCardBadge {
  key: CardBadgeKey;
  level: CardBadgeLevel;
  text: string;
  fullText: string;
  compactText: string;
  iconText: string;
}

export interface TransactionCardLayoutInput {
  contentWidth: number;
  fontScale: number;
  titleText: string;
  amountText: string;
  existingTopRightBadgeText?: string;
  hasReconciledCheck?: boolean;
  badges: CardBadgeInput[];
}

export interface TransactionCardLayoutResult {
  row1Badges: PlacedCardBadge[];
  row3Badges: PlacedCardBadge[];
}

const BADGE_GAP = 5;

/**
 * 校準後之字寬估算函式：細分空白、窄標點、ASCII、勾選符號、Emoji 與中文字，
 * 避免高估寬度導致實際有空間時卻誤把標籤縮成純圖示。
 */
export const estimateTextWidth = (text: string, baseFontSize: number, scale: number): number => {
  const effectiveFontSize = baseFontSize * scale;
  let total = 0;
  for (const ch of Array.from(text)) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfe0f || code === 0xfe0e || code === 0x200d) {
      continue;
    }
    if (ch === ' ') {
      total += 0.28 * effectiveFontSize;
    } else if ('-.,:/|()[]'.includes(ch)) {
      total += 0.36 * effectiveFontSize;
    } else if (code <= 0x7f) {
      total += 0.56 * effectiveFontSize;
    } else if (code === 0x2713 || code === 0x2714) {
      total += 0.85 * effectiveFontSize;
    } else if (code >= 0x1f000 || (code >= 0x2600 && code <= 0x27bf)) {
      total += 1.12 * effectiveFontSize;
    } else {
      total += 1.00 * effectiveFontSize;
    }
  }
  return total;
};

/**
 * 取得發票號碼末 3 碼（先移除連字號或空白等非英數符號）。
 */
export const getInvoiceLastThree = (invoiceNumber: string): string => {
  const cleaned = (invoiceNumber || '').replace(/[^A-Za-z0-9]/g, '');
  return cleaned.slice(-3);
};

const getLabelForLevel = (badge: CardBadgeInput, level: CardBadgeLevel): string => {
  if (level === 'full') return badge.fullText;
  if (level === 'compact') return badge.compactText;
  return badge.iconText;
};

const estimateBadgeWidth = (badge: CardBadgeInput, level: CardBadgeLevel, fontScale: number): number => {
  const label = getLabelForLevel(badge, level);
  return estimateTextWidth(label, 10.5, fontScale) + (level === 'icon' ? 13 : 17);
};

const toPlacedBadge = (badge: CardBadgeInput, level: CardBadgeLevel): PlacedCardBadge => ({
  key: badge.key,
  level,
  text: getLabelForLevel(badge, level),
  fullText: badge.fullText,
  compactText: badge.compactText,
  iconText: badge.iconText,
});

interface WorkingBadge {
  input: CardBadgeInput;
  level: CardBadgeLevel;
}

const calcWorkingListWidth = (items: WorkingBadge[], fontScale: number): number => {
  if (items.length === 0) return 0;
  const widths = items.reduce((sum, item) => sum + estimateBadgeWidth(item.input, item.level, fontScale), 0);
  return widths + (items.length - 1) * BADGE_GAP;
};

const tryFitWithProgressiveShrink = (
  pool: CardBadgeInput[],
  maxWidth: number,
  fontScale: number
): WorkingBadge[] | null => {
  const working: WorkingBadge[] = pool.map((b) => ({ input: b, level: 'compact' }));
  if (calcWorkingListWidth(working, fontScale) <= maxWidth) {
    return working;
  }
  const shrinkOrder = [...working].sort((a, b) => a.input.shrinkPriority - b.input.shrinkPriority);
  for (const target of shrinkOrder) {
    target.level = 'icon';
    if (calcWorkingListWidth(working, fontScale) <= maxWidth) {
      return working;
    }
  }
  return null;
};

/**
 * 固定座標極簡兩行排版：
 * - 發票、待辦、憑證全數固定於第 1 行金額左側（第 2 行純留給備註、付款方式與成員）；
 * - 優先保留完整店名並由低優先標籤漸進縮為純圖示；
 * - 若為超長店名仍放不下，則允許超長店名縮短至保底 4 中文字＋「...」將徽章穩留第 1 行；
 * - 第 3 行僅保留給中獎／已兌領發票醒目橫條。
 */
export const allocateTransactionCardBadges = (
  input: TransactionCardLayoutInput
): TransactionCardLayoutResult => {
  const {
    contentWidth,
    fontScale,
    titleText,
    amountText,
    existingTopRightBadgeText = '',
    hasReconciledCheck = false,
    badges,
  } = input;

  if (badges.length === 0) {
    return { row1Badges: [], row3Badges: [] };
  }

  // 第 0 步：中獎或已兌領發票強制留在第 3 行醒目顯示
  const forcedRow3: CardBadgeInput[] = [];
  const candidates: CardBadgeInput[] = [];
  for (const badge of badges) {
    if (badge.forceThirdRow) {
      forcedRow3.push(badge);
    } else {
      candidates.push(badge);
    }
  }

  const row3Badges = forcedRow3.map((b) => toPlacedBadge(b, 'full'));
  if (candidates.length === 0) {
    return { row1Badges: [], row3Badges };
  }

  // 第 1 步：計算第 1 行固定右側寬度與「完整店名 / 保底店名」兩個可用寬度門檻
  const amountWidth = estimateTextWidth(amountText, 16, fontScale) * 1.09;
  const existingBadgeWidth = existingTopRightBadgeText
    ? estimateTextWidth(existingTopRightBadgeText, 10.5, fontScale) + 17 + BADGE_GAP
    : 0;
  const reconciledWidth = hasReconciledCheck ? 18 + BADGE_GAP : 0;
  const fixedRightWidth = amountWidth + existingBadgeWidth + reconciledWidth;

  const fullTitleWidth = estimateTextWidth(titleText, 15, fontScale) * 1.07;
  const minTitleWidth = Math.min(fullTitleWidth, estimateTextWidth('四個中文...', 15, fontScale) * 1.05);

  const row1FreeWithFullTitle = Math.max(0, contentWidth - fullTitleWidth - 8 - fixedRightWidth - 8);
  const row1FreeWithMinTitle = Math.max(0, contentWidth - minTitleWidth - 8 - fixedRightWidth - 8);

  // 第 2 步：先以完整店名試放（含文字 → 漸進縮純圖示），若為超長店名再釋放至保底店名寬度，絕不另開第 3 行
  let chosen = tryFitWithProgressiveShrink(candidates, row1FreeWithFullTitle, fontScale);
  if (!chosen && row1FreeWithMinTitle > row1FreeWithFullTitle) {
    chosen = tryFitWithProgressiveShrink(candidates, row1FreeWithMinTitle, fontScale);
  }
  if (!chosen) {
    chosen = candidates.map((b) => ({ input: b, level: 'icon' }));
  }

  return {
    row1Badges: chosen.map((w) => toPlacedBadge(w.input, w.level)),
    row3Badges,
  };
};
