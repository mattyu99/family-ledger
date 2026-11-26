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

describe('transactionCardLayout - 金額／付款方式左側智慧排版與字寬校準', () => {
  // 390px 手機寬度卡片內容區寬度 = 390 - 28 - 24 - 50 = 288
  const CONTENT_WIDTH_390 = 288;
  // 360px 窄螢幕手機寬度卡片內容區寬度 = 360 - 28 - 24 - 50 = 258
  const CONTENT_WIDTH_360 = 258;

  test('getInvoiceLastThree 正確擷取末 3 碼並濾除非英數符號', () => {
    expect(getInvoiceLastThree('HU-61828449')).toBe('449');
    expect(getInvoiceLastThree('HV79049445')).toBe('445');
    expect(getInvoiceLastThree('')).toBe('');
  });

  test('實機案例 1：大樹藥局（- NT$ 550、無備註、發票 543）→ 統一進第 1 行金額左側顯示 🧾 543', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '大樹藥局',
      amountText: '- NT$ 550',
      noteContent: '',
      rightMetaWidth: calcRightMetaWidth('💳一銀iLeo卡', '🐰 瑩媽', 1.25),
      badges: [makeInvoiceBadge('AB-12345543')],
    });

    expect(result.row1Badges).toHaveLength(1);
    expect(result.row1Badges[0].text).toBe('🧾 543');
    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
  });

  test('實機案例 2：萬家福（- NT$ 274、無備註、發票 HG-76094681）→ 統一進第 1 行金額左側顯示 🧾 681', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '萬家福',
      amountText: '- NT$ 274',
      noteContent: '',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('HG-76094681')],
    });

    expect(result.row1Badges).toHaveLength(1);
    expect(result.row1Badges[0].text).toBe('🧾 681');
    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
  });

  test('實機案例 3：台北永康企業（- NT$ 390、長備註）→ 390px 125% 顯示 🧾 123，360px 超窄螢幕保全 6 字店名降為 🧾', () => {
    const res390 = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '台北永康企業',
      amountText: '- NT$ 390',
      noteContent: '大腸麵線(大) $75 燙青菜 $40 綜合滷味',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('AB-12345123')],
    });
    expect(res390.row1Badges).toHaveLength(1);
    expect(res390.row1Badges[0].text).toBe('🧾 123');
    expect(res390.row2Badges).toHaveLength(0);
    expect(res390.row3Badges).toHaveLength(0);

    const res360 = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_360,
      fontScale: 1.25,
      titleText: '台北永康企業',
      amountText: '- NT$ 390',
      noteContent: '大腸麵線(大) $75 燙青菜 $40 綜合滷味',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('AB-12345123')],
    });
    expect(res360.row1Badges).toHaveLength(1);
    expect(res360.row1Badges[0].text).toBe('🧾');
    expect(res360.row2Badges).toHaveLength(0);
    expect(res360.row3Badges).toHaveLength(0);
  });

  test('實機案例 4：達美樂披薩（- NT$ 690、長備註）→ 390px 125% 顯示 🧾 456，360px 窄螢幕降為 🧾 保全店名', () => {
    const res390 = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '達美樂披薩',
      amountText: '- NT$ 690',
      noteContent: '媽國生 大 手拍夏威夷與海鮮雙拼',
      rightMetaWidth: calcRightMetaWidth('💳聯邦賴點卡', '🐰 瑩媽', 1.25),
      badges: [makeInvoiceBadge('CD-99887456')],
    });

    expect(res390.row1Badges).toHaveLength(1);
    expect(res390.row1Badges[0].text).toBe('🧾 456');
    expect(res390.row2Badges).toHaveLength(0);
    expect(res390.row3Badges).toHaveLength(0);

    const res360 = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_360,
      fontScale: 1.25,
      titleText: '達美樂披薩',
      amountText: '- NT$ 690',
      noteContent: '媽國生 大 手拍夏威夷與海鮮雙拼',
      rightMetaWidth: calcRightMetaWidth('💳聯邦賴點卡', '🐰 瑩媽', 1.25),
      badges: [makeInvoiceBadge('CD-99887456')],
    });

    expect(res360.row1Badges).toHaveLength(1);
    expect(res360.row1Badges[0].text).toBe('🧾');
    expect(res360.row2Badges).toHaveLength(0);
    expect(res360.row3Badges).toHaveLength(0);
  });

  test('實機案例 4b：全家（2 字店名 + 3 顆標籤）→ 低優先先降成純圖示，保留 ☁️ 233 且絕不截斷「全家」', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '全家',
      amountText: '- NT$ 129',
      noteContent: '鮮乳與御飯糰',
      rightMetaWidth: calcRightMetaWidth('🟢LINE Pay·1234', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('EC-99112233', true), makeImageBadge(), makeSyncedBadge()],
    });

    expect(result.row1Badges).toHaveLength(3);
    expect(result.row1Badges[0].text).toBe('☁️ 233');
    expect(result.row1Badges[1].text).toBe('📷');
    expect(result.row1Badges[2].text).toBe('✨');
    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
  });

  test('案例 5：公車710（- NT$ 45、無備註、已核對）→ 統一放進第 1 行金額左側顯示 ✓ 核對', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '公車710',
      amountText: '- NT$ 45',
      noteContent: '',
      rightMetaWidth: calcRightMetaWidth('🚌洋國中卡', '🦊 洋洋', 1.25),
      badges: [makeReconciledBadge()],
    });

    expect(result.row1Badges).toHaveLength(1);
    expect(result.row1Badges[0].text).toBe('✓ 核對');
    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
  });

  test('案例 6：長店名（7~8 字）+ 無備註 + 發票 → 第 1 行放不下時分流至第 2 行付款方式左側', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '全聯福利中心南港店',
      amountText: '- NT$ 1,280',
      noteContent: '',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐰 瑩媽', 1.25),
      badges: [makeInvoiceBadge('EF-55667788')],
    });

    expect(result.row1Badges).toHaveLength(0);
    expect(result.row2Badges).toHaveLength(1);
    expect(result.row2Badges[0].text).toBe('🧾 788');
    expect(result.row3Badges).toHaveLength(0);
  });

  test('案例 7：長店名（7~8 字）+ 短備註 6/6 + 發票 → 分流至第 2 行付款方式左側且不截斷短備註', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '長榮物理治療復健所',
      amountText: '- NT$ 50',
      noteContent: '6/6',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐰 瑩媽', 1.25),
      badges: [makeInvoiceBadge('HU-61828449')],
    });

    expect(result.row1Badges).toHaveLength(0);
    expect(result.row2Badges).toHaveLength(1);
    expect(result.row2Badges[0].text).toBe('🧾 449');
    expect(result.row3Badges).toHaveLength(0);
  });

  test('案例 8：Coco（- NT$ 370、長備註、發票 + 連動待辦）→ 兩顆均顯示在第 1 行金額左側', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: 'Coco',
      amountText: '- NT$ 370',
      noteContent: '[辦妥] 點餐開團 12杯手搖飲合計結算',
      rightMetaWidth: calcRightMetaWidth('💵現金', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('HV-79049445'), makeMemoBadge()],
    });

    expect(result.row1Badges).toHaveLength(2);
    expect(result.row1Badges[0].text).toBe('🧾 445');
    expect(result.row1Badges[1].text).toBe('📋 待辦');
    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(0);
  });

  test('案例 9：12 字超長店名 + 長備註 + 多標籤 → 絕不截斷店名，退至第 3 行兜底', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '台灣中油直營加油站台北分站',
      amountText: '- NT$ 1,250',
      noteContent: '汽車九五無鉛汽油加滿與洗車服務備註很長',
      rightMetaWidth: calcRightMetaWidth('💳一銀iLeo卡', '🐹 智爸', 1.25),
      badges: [makeInvoiceBadge('CD-99887766'), makeImageBadge(), makeReconciledBadge()],
    });

    expect(result.row1Badges).toHaveLength(0);
    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(3);
  });

  test('案例 10：發票中獎與已兌領強制留在第 3 行醒目顯示，其餘標籤照常放第 1 行', () => {
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
      titleText: '全家便利店',
      amountText: '- NT$ 89',
      noteContent: '',
      rightMetaWidth: calcRightMetaWidth('🟢LINE Pay', '🐹 智爸', 1.25),
      badges: [wonBadge, makeReconciledBadge()],
    });

    expect(result.row1Badges).toHaveLength(1);
    expect(result.row1Badges[0].text).toBe('✓ 核對');
    expect(result.row2Badges).toHaveLength(0);
    expect(result.row3Badges).toHaveLength(1);
    expect(result.row3Badges[0].text).toBe('🎉 中獎 $1,000 (四獎)');
  });
});
