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
 * 依字元類型估算顯示寬度（區分 ASCII、Emoji 與全形中文字，並忽略零寬變體選擇符）。
 */
export const estimateTextWidth = (text: string, baseFontSize: number, scale: number): number => {
  const effectiveFontSize = baseFontSize * scale;
  let total = 0;
  for (const ch of Array.from(text)) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfe0f || code === 0xfe0e || code === 0x200d) {
      continue;
    }
    if (code <= 0x7f) {
      total += 0.60 * effectiveFontSize;
    } else if (code >= 0x1f000 || (code >= 0x2600 && code <= 0x27bf)) {
      total += 1.22 * effectiveFontSize;
    } else {
      total += 1.06 * effectiveFontSize;
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
  return estimateTextWidth(label, 10.5, fontScale) + (level === 'icon' ? 12 : 14);
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
 * 將交易卡片狀態與發票標籤依「第 2 行優先 → 第 1 行留白 → 第 3 行兜底」配置，
 * 確保店家名稱與短備註不被無謂截斷，同時盡可能將卡片收斂為 2 行。
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

  // 第 1 步：計算第 2 行在不截斷完整備註的前提下所剩餘的可用寬度
  const trimmedNote = noteContent.trim();
  const fullNoteWidth = trimmedNote ? estimateTextWidth(trimmedNote, 13, fontScale) : 0;
  const row2FreeWidth = trimmedNote
    ? Math.max(0, contentWidth - fullNoteWidth - 6 - rightMetaWidth - 8)
    : Math.max(0, contentWidth - rightMetaWidth - 8);

  // 第 2 步：優先將候選標籤以 full 或 compact 放入第 2 行，避免過早在第 2 行壓成純圖示
  const row2Working: WorkingBadge[] = [];
  let remaining: CardBadgeInput[] = [];

  if (candidates.length > 0 && row2FreeWidth > 0) {
    const allInRow2: WorkingBadge[] = candidates.map((b) => ({ input: b, level: 'full' }));
    if (calcWorkingListWidth(allInRow2, fontScale) <= row2FreeWidth) {
      row2Working.push(...allInRow2);
    } else {
      const shrinkOrder = [...allInRow2].sort((a, b) => a.input.shrinkPriority - b.input.shrinkPriority);
      let fitAllAtCompact = false;
      for (const target of shrinkOrder) {
        target.level = 'compact';
        if (calcWorkingListWidth(allInRow2, fontScale) <= row2FreeWidth) {
          fitAllAtCompact = true;
          break;
        }
      }

      if (fitAllAtCompact) {
        row2Working.push(...allInRow2);
      } else {
        // 全員降為 compact 仍超出時，依優先順序逐顆嘗試放入 full 或 compact，放不下留給第 1 行
        for (const badge of candidates) {
          const gapIfNeeded = row2Working.length > 0 ? BADGE_GAP : 0;
          const used = calcWorkingListWidth(row2Working, fontScale);
          const fullW = estimateBadgeWidth(badge, 'full', fontScale);
          if (used + gapIfNeeded + fullW <= row2FreeWidth) {
            row2Working.push({ input: badge, level: 'full' });
            continue;
          }
          const compactW = estimateBadgeWidth(badge, 'compact', fontScale);
          if (used + gapIfNeeded + compactW <= row2FreeWidth) {
            row2Working.push({ input: badge, level: 'compact' });
            continue;
          }
          remaining.push(badge);
        }
      }
    }
  } else {
    remaining = [...candidates];
  }

  // 第 3 步：計算第 1 行在不截斷完整店名的前提下所剩餘的可用寬度
  const fullTitleWidth = estimateTextWidth(titleText, 15, fontScale) * 1.04;
  const amountWidth = estimateTextWidth(amountText, 16, fontScale) * 1.06;
  const existingBadgeWidth = existingTopRightBadgeText
    ? estimateTextWidth(existingTopRightBadgeText, 10.5, fontScale) + 14 + 5
    : 0;
  const row1FreeWidth = Math.max(
    0,
    contentWidth - fullTitleWidth - 6 - amountWidth - existingBadgeWidth - 8
  );

  // 第 4 步：將剩餘標籤安插至第 1 行（上限為 compact）
  const row1Working: WorkingBadge[] = [];
  let leftover: CardBadgeInput[] = [];

  if (remaining.length > 0 && row1FreeWidth > 0) {
    const allInRow1: WorkingBadge[] = remaining.map((b) => ({ input: b, level: 'compact' }));
    if (calcWorkingListWidth(allInRow1, fontScale) <= row1FreeWidth) {
      row1Working.push(...allInRow1);
    } else {
      const shrinkOrder = [...allInRow1].sort((a, b) => a.input.shrinkPriority - b.input.shrinkPriority);
      let fitAllAtIcon = false;
      for (const target of shrinkOrder) {
        target.level = 'icon';
        if (calcWorkingListWidth(allInRow1, fontScale) <= row1FreeWidth) {
          fitAllAtIcon = true;
          break;
        }
      }

      if (fitAllAtIcon) {
        row1Working.push(...allInRow1);
      } else {
        // 即使全縮成 icon 仍放不下全部，逐顆放入能容納的高優先標籤，其餘交給第 5 步兜底
        for (const badge of remaining) {
          const gapIfNeeded = row1Working.length > 0 ? BADGE_GAP : 0;
          const used = calcWorkingListWidth(row1Working, fontScale);
          const compactW = estimateBadgeWidth(badge, 'compact', fontScale);
          if (used + gapIfNeeded + compactW <= row1FreeWidth) {
            row1Working.push({ input: badge, level: 'compact' });
            continue;
          }
          const iconW = estimateBadgeWidth(badge, 'icon', fontScale);
          if (used + gapIfNeeded + iconW <= row1FreeWidth) {
            row1Working.push({ input: badge, level: 'icon' });
            continue;
          }
          leftover.push(badge);
        }
      }
    }
  } else {
    leftover = [...remaining];
  }

  // 第 5 步：先嘗試把殘餘標籤以 icon 回填進第 2 行剩餘空隙，仍放不下才退至第 3 行
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
