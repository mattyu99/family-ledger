import {
  allocateTransactionCardBadges,
  CardBadgeInput,
  estimateTextWidth,
  getInvoiceLastThree,
} from '../transactionCardLayout';

const makeInvoiceBadge = (invoiceNumber: string, isCloud = false): CardBadgeInput => {
  const icon = isCloud ? '☁️' : '🧾';
  const lastThree = getInvoiceLastThree(invoiceNumber);
  return {
    key: 'invoice',
    fullText: `${icon} ${invoiceNumber}`,
    compactText: lastThree ? `${icon} ${lastThree}` : icon,
    iconText: icon,
    shrinkPriority: 5,
  };
};

const makeMemoBadge = (): CardBadgeInput => ({
  key: 'memo',
  fullText: '📋 連動待辦',
  compactText: '📋 待辦',
  iconText: '📋',
  shrinkPriority: 4,
});

const makeImageBadge = (): CardBadgeInput => ({
  key: 'image',
  fullText: '📷 憑證',
  compactText: '📷 憑證',
  iconText: '📷',
  shrinkPriority: 3,
});

const makeReconciledBadge = (): CardBadgeInput => ({
  key: 'reconciled',
  fullText: '✓ 已核對',
  compactText: '✓ 核對',
  iconText: '✓',
  shrinkPriority: 2,
});

const makeSyncedBadge = (): CardBadgeInput => ({
  key: 'synced',
  fullText: '✨ 剛更新',
  compactText: '✨ 更新',
  iconText: '✨',
  shrinkPriority: 1,
});

const calcRightMetaWidth = (payText: string, payerText: string, fontScale: number): number => {
  const payW = payText ? estimateTextWidth(payText, 10.5, fontScale) + 18 : 0;
  const payerW = estimateTextWidth(payerText, 11, fontScale) + 14;
  return payW + (payText ? 5 : 0) + payerW;
};

describe('transactionCardLayout - 交易明細兩行優先智慧排版', () => {
  // 390px 手機寬度在 125% 大字級下，卡片內容區寬度 = 390 - 28 - 24 - 50 = 288
  const CONTENT_WIDTH_390 = 288;
  // 360px 窄螢幕手機寬度，卡片內容區寬度 = 360 - 28 - 24 - 50 = 258
  const CONTENT_WIDTH_360 = 258;

  test('getInvoiceLastThree 正確擷取末 3 碼並濾除非英數符號', () => {
    expect(getInvoiceLastThree('HU-61828449')).toBe('449');
    expect(getInvoiceLastThree('HV79049445')).toBe('445');
    expect(getInvoiceLastThree('')).toBe('');
  });

  test('場景 1：無備註 + 已核對（公車710）→ 放進第 2 行左側完整顯示，維持 2 行', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '公車710',
      amountText: '- NT$ 45',
      noteContent: '',
      rightMetaWidth: calcRightMetaWidth('🚌洋國中卡', '🦊 洋洋', 1.25),
      badges: [makeReconciledBadge()],
    });

    expect(result.row1Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
    expect(result.row2Badges).toHaveLength(1);
    expect(result.row2Badges[0].text).toBe('✓ 已核對');
    expect(result.row2Badges[0].level).toBe('full');
  });

  test('場景 2：短備註 6/6 + 發票號碼（長榮復健）→ 放進第 2 行不截斷備註，維持 2 行', () => {
    const resultStd = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.0,
      titleText: '長榮復健',
      amountText: '- NT$ 50',
      noteContent: '6/6',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐰 瑩媽', 1.0),
      badges: [makeInvoiceBadge('HU-61828449')],
    });
    expect(resultStd.row2Badges).toHaveLength(1);
    expect(resultStd.row2Badges[0].text).toBe('🧾 HU-61828449');
    expect(resultStd.row1Badges).toHaveLength(0);
    expect(resultStd.row3Badges).toHaveLength(0);

    // 125% 大字級下第 2 行若空間稍緊，優先放末三碼至第 2 行且絕不截斷短備註 6/6
    const resultLarge = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '長榮復健',
      amountText: '- NT$ 50',
      noteContent: '6/6',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐰 瑩媽', 1.25),
      badges: [makeInvoiceBadge('HU-61828449')],
    });
    expect(resultLarge.row3Badges).toHaveLength(0);
    expect(resultLarge.row2Badges).toHaveLength(1);
    expect(resultLarge.row2Badges[0].text).toBe('🧾 449');
  });

  test('場景 3：長備註 + 連動待辦（花博爭艷館）→ 跳過第 2 行改進第 1 行，維持 2 行且店名完整', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '花博爭艷館',
      amountText: '- NT$ 500',
      noteContent: '[💼 重要備忘] 10/11 下午家庭出遊門票',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐹 智爸', 1.25),
      badges: [makeMemoBadge()],
    });

    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
    expect(result.row1Badges).toHaveLength(1);
    expect(['📋 待辦', '📋']).toContain(result.row1Badges[0].text);
  });

  test('場景 4：長備註 + 發票號碼（康是美）→ 發票移至第 1 行顯示末 3 碼 🧾 449，維持 2 行', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '康是美',
      amountText: '- NT$ 1,068',
      noteContent: '善存維他命C綜合發泡錠禮盒組',
      rightMetaWidth: calcRightMetaWidth('💳一銀iLeo卡', '🐰 瑩媽', 1.25),
      badges: [makeInvoiceBadge('HU-61828449')],
    });

    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
    expect(result.row1Badges).toHaveLength(1);
    expect(result.row1Badges[0].text).toBe('🧾 449');
    expect(result.row1Badges[0].level).toBe('compact');
  });

  test('場景 5：短備註 停車費 $45 + 發票（歐特儀）→ 不在第 2 行硬壓純圖示，移至第 1 行顯示 🧾 372', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '歐特儀',
      amountText: '- NT$ 45',
      noteContent: '停車費 $45',
      rightMetaWidth: calcRightMetaWidth('🟢LINE Pay', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('HN-66783372')],
    });

    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
    expect(result.row1Badges).toHaveLength(1);
    expect(result.row1Badges[0].text).toBe('🧾 372');
  });

  test('場景 6：長備註 + 發票 + 連動待辦（Coco）→ 兩顆同時安插在第 1 行，維持 2 行', () => {
    const resultStd = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.0,
      titleText: 'Coco',
      amountText: '- NT$ 370',
      noteContent: '[辦妥] 點餐開團 ??杯手搖飲合計',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐹 智爸', 1.0),
      badges: [makeInvoiceBadge('HV-79049445'), makeMemoBadge()],
    });

    expect(resultStd.row2Badges).toHaveLength(0);
    expect(resultStd.row3Badges).toHaveLength(0);
    expect(resultStd.row1Badges).toHaveLength(2);
    expect(resultStd.row1Badges[0].text).toBe('🧾 445');
    expect(resultStd.row1Badges[1].text).toBe('📋 待辦');

    // 125% 大字級下，第 1 行可同時容納兩顆，低優先的連動待辦會依序自動降為 📋
    const resultLarge = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: 'Coco',
      amountText: '- NT$ 370',
      noteContent: '[辦妥] 點餐開團 ??杯手搖飲合計',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('HV-79049445'), makeMemoBadge()],
    });

    expect(resultLarge.row2Badges).toHaveLength(0);
    expect(resultLarge.row3Badges).toHaveLength(0);
    expect(resultLarge.row1Badges).toHaveLength(2);
    expect(resultLarge.row1Badges[0].text).toBe('🧾 445');
    expect(['📋 待辦', '📋']).toContain(resultLarge.row1Badges[1].text);
  });

  test('場景 7：360px 窄螢幕 + 多顆標籤空間不足時，依低優先先縮順序漸進降級為純圖示', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_360,
      fontScale: 1.25,
      titleText: '好市多賣場',
      amountText: '- NT$ 3,280',
      noteContent: '家庭日用品與鮮奶採購清單很長很多字',
      rightMetaWidth: calcRightMetaWidth('💳富邦Costco', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('AB-12345678', true), makeReconciledBadge(), makeSyncedBadge()],
    });

    const placedInRow1Or2 = [...result.row1Badges, ...result.row2Badges];
    expect(placedInRow1Or2.length + result.row3Badges.length).toBe(3);
    // 店名較長時先放進第 1 行的部分會依優先順序降級
    if (result.row1Badges.some((b) => b.key === 'synced')) {
      const synced = result.row1Badges.find((b) => b.key === 'synced');
      expect(synced?.level).toBe('icon');
    }
  });

  test('場景 8：超長店名（12 中文字）+ 長備註 + 多標籤 → 絕不截斷店名，放不下的自動退回第 3 行', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '台灣中油直營加油站台北分站',
      amountText: '- NT$ 1,250',
      noteContent: '汽車九五無鉛汽油加滿與洗車服務備註很長',
      rightMetaWidth: calcRightMetaWidth('💳中油聯名卡', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('CD-99887766'), makeImageBadge(), makeReconciledBadge()],
    });

    expect(result.row1Badges).toHaveLength(0);
    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(3);
  });

  test('場景 9：發票中獎與已兌領強制留在第 3 行醒目顯示，其餘輕量標籤仍上移', () => {
    const wonBadge: CardBadgeInput = {
      key: 'invoice',
      fullText: '🎉 中獎 $1,000 (四獎)',
      compactText: '🎉 中獎 $1,000',
      iconText: '🎉',
      forceThirdRow: true,
      shrinkPriority: 99,
    };

    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '全家便利商店',
      amountText: '- NT$ 89',
      noteContent: '',
      rightMetaWidth: calcRightMetaWidth('🟢LINE Pay', '🐹 智爸', 1.25),
      badges: [wonBadge, makeReconciledBadge()],
    });

    expect(result.row3Badges).toHaveLength(1);
    expect(result.row3Badges[0].text).toBe('🎉 中獎 $1,000 (四獎)');
    expect(result.row2Badges).toHaveLength(1);
    expect(result.row2Badges[0].text).toBe('✓ 已核對');
  });
});
