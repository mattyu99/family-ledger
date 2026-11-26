export type CardBadgeKey = 'invoice' | 'memo' | 'image' | 'reconciled' | 'synced';

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
  noteContent?: string;
  rightMetaWidth: number;
  badges: CardBadgeInput[];
}

export interface TransactionCardLayoutResult {
  row1Badges: PlacedCardBadge[];
  row2Badges: PlacedCardBadge[];
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

/**
 * 依「第 1 行金額左側優先 → 第 2 行付款方式左側分流 → 第 1 行降純圖示 → 第 2 行回填純圖示 → 第 3 行兜底」
 * 配置交易明細標籤，維持所有卡片視覺高度一致且不截斷店名與短備註。
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
    noteContent = '',
    rightMetaWidth,
    badges,
  } = input;

  if (badges.length === 0) {
    return { row1Badges: [], row2Badges: [], row3Badges: [] };
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

  // 第 1 步：計算第 1 行與第 2 行在不截斷完整店名／備註下的純餘裕寬度
  const fullTitleWidth = estimateTextWidth(titleText, 15, fontScale) * 1.07;
  const amountWidth = estimateTextWidth(amountText, 16, fontScale) * 1.09;
  const existingBadgeWidth = existingTopRightBadgeText
    ? estimateTextWidth(existingTopRightBadgeText, 10.5, fontScale) + 17 + BADGE_GAP
    : 0;
  const row1FreeWidth = Math.max(
    0,
    contentWidth - fullTitleWidth - 8 - amountWidth - existingBadgeWidth - 8
  );

  const trimmedNote = noteContent.trim();
  const fullNoteWidth = trimmedNote ? estimateTextWidth(trimmedNote, 13, fontScale) : 0;
  const row2FreeWidth = trimmedNote
    ? Math.max(0, contentWidth - fullNoteWidth - 6 - rightMetaWidth - 5)
    : Math.max(0, contentWidth - rightMetaWidth - 5);

  // 第 2 步：第 1 行優先以 compact 裝箱（維持整個清單視覺一致）
  let row1Working: WorkingBadge[] = [];
  const overflow: CardBadgeInput[] = [];

  if (candidates.length > 0 && row1FreeWidth > 0) {
    const allCompactInRow1: WorkingBadge[] = candidates.map((b) => ({ input: b, level: 'compact' }));
    if (calcWorkingListWidth(allCompactInRow1, fontScale) <= row1FreeWidth) {
      row1Working.push(...allCompactInRow1);
    } else {
      for (const badge of candidates) {
        const gapIfNeeded = row1Working.length > 0 ? BADGE_GAP : 0;
        const used = calcWorkingListWidth(row1Working, fontScale);
        const compactW = estimateBadgeWidth(badge, 'compact', fontScale);
        if (used + gapIfNeeded + compactW <= row1FreeWidth) {
          row1Working.push({ input: badge, level: 'compact' });
        } else {
          overflow.push(badge);
        }
      }
    }
  } else {
    overflow.push(...candidates);
  }

  // 第 3 步：第 1 行放不下 compact 的標籤，優先分流至第 2 行付款方式左側（保持 compact）
  const row2Working: WorkingBadge[] = [];
  const stillOverflow: CardBadgeInput[] = [];

  for (const badge of overflow) {
    const gapIfNeeded = row2Working.length > 0 ? BADGE_GAP : 0;
    const usedRow2 = calcWorkingListWidth(row2Working, fontScale);
    const compactW = estimateBadgeWidth(badge, 'compact', fontScale);
    if (usedRow2 + gapIfNeeded + compactW <= row2FreeWidth) {
      row2Working.push({ input: badge, level: 'compact' });
    } else {
      stillOverflow.push(badge);
    }
  }

  // 第 4 步：若仍有未放入的標籤，嘗試把第 1 行現有標籤與 stillOverflow 依優先順序降級為 icon 塞進第 1 行
  const leftover: CardBadgeInput[] = [];
  if (stillOverflow.length > 0) {
    if (row1FreeWidth > 0) {
      const retryPoolInputs = [...row1Working.map((w) => w.input), ...stillOverflow];
      const retryAll: WorkingBadge[] = retryPoolInputs.map((b) => ({ input: b, level: 'compact' }));
      const shrinkOrder = [...retryAll].sort((a, b) => a.input.shrinkPriority - b.input.shrinkPriority);
      let fitAllWithIcons = false;
      for (const target of shrinkOrder) {
        target.level = 'icon';
        if (calcWorkingListWidth(retryAll, fontScale) <= row1FreeWidth) {
          fitAllWithIcons = true;
          break;
        }
      }

      if (fitAllWithIcons) {
        row1Working = retryAll;
      } else {
        const nextRow1: WorkingBadge[] = [];
        for (const badge of retryPoolInputs) {
          const gapIfNeeded = nextRow1.length > 0 ? BADGE_GAP : 0;
          const used = calcWorkingListWidth(nextRow1, fontScale);
          const compactW = estimateBadgeWidth(badge, 'compact', fontScale);
          if (used + gapIfNeeded + compactW <= row1FreeWidth) {
            nextRow1.push({ input: badge, level: 'compact' });
            continue;
          }
          const iconW = estimateBadgeWidth(badge, 'icon', fontScale);
          if (used + gapIfNeeded + iconW <= row1FreeWidth) {
            nextRow1.push({ input: badge, level: 'icon' });
            continue;
          }
          leftover.push(badge);
        }
        row1Working = nextRow1;
      }
    } else {
      leftover.push(...stillOverflow);
    }
  }

  // 第 5 步：兜底回填第 2 行 icon，仍放不下才退至第 3 行
  const fallbackRow3: CardBadgeInput[] = [];
  for (const badge of leftover) {
    const gapIfNeeded = row2Working.length > 0 ? BADGE_GAP : 0;
    const usedRow2 = calcWorkingListWidth(row2Working, fontScale);
    const iconW = estimateBadgeWidth(badge, 'icon', fontScale);
    if (usedRow2 + gapIfNeeded + iconW <= row2FreeWidth) {
      row2Working.push({ input: badge, level: 'icon' });
    } else {
      fallbackRow3.push(badge);
    }
  }

  // 第 3 行寬度保護：維持單行不溢出
  const row3Working: WorkingBadge[] = [
    ...forcedRow3.map((b) => ({ input: b, level: 'full' as CardBadgeLevel })),
    ...fallbackRow3.map((b) => ({ input: b, level: 'full' as CardBadgeLevel })),
  ];

  if (calcWorkingListWidth(row3Working, fontScale) > contentWidth) {
    const shrinkable = row3Working
      .filter((w) => !w.input.forceThirdRow)
      .sort((a, b) => a.input.shrinkPriority - b.input.shrinkPriority);

    for (const target of shrinkable) {
      target.level = 'compact';
      if (calcWorkingListWidth(row3Working, fontScale) <= contentWidth) {
        break;
      }
    }
    if (calcWorkingListWidth(row3Working, fontScale) > contentWidth) {
      for (const target of shrinkable) {
        target.level = 'icon';
        if (calcWorkingListWidth(row3Working, fontScale) <= contentWidth) {
          break;
        }
      }
    }
  }

  return {
    row1Badges: row1Working.map((w) => toPlacedBadge(w.input, w.level)),
    row2Badges: row2Working.map((w) => toPlacedBadge(w.input, w.level)),
    row3Badges: row3Working.map((w) => toPlacedBadge(w.input, w.level)),
  };
};
