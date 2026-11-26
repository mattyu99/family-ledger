import {
  allocateTransactionCardBadges,
  CardBadgeInput,
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

describe('transactionCardLayout - 固定座標極簡兩行排版', () => {
  // 390px 手機寬度卡片內容區寬度 = 390 - 28 - 24 - 50 = 288
  const CONTENT_WIDTH_390 = 288;
  // 360px 窄螢幕手機寬度卡片內容區寬度 = 360 - 28 - 24 - 50 = 258
  const CONTENT_WIDTH_360 = 258;

  test('getInvoiceLastThree 正確擷取末 3 碼並濾除非英數符號', () => {
    expect(getInvoiceLastThree('HU-61828449')).toBe('449');
    expect(getInvoiceLastThree('HV79049445')).toBe('445');
    expect(getInvoiceLastThree('')).toBe('');
  });

  test('實機案例 1~2：大樹藥局、萬家福 → 第 1 行金額左側顯示 🧾 末3碼，第 3 行為空', () => {
    const res1 = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '大樹藥局',
      amountText: '- NT$ 550',
      badges: [makeInvoiceBadge('AB-12345543')],
    });
    expect(res1.row1Badges).toHaveLength(1);
    expect(res1.row1Badges[0].text).toBe('🧾 543');
    expect(res1.row3Badges).toHaveLength(0);

    const res2 = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '萬家福',
      amountText: '- NT$ 274',
      badges: [makeInvoiceBadge('HG-76094681')],
    });
    expect(res2.row1Badges).toHaveLength(1);
    expect(res2.row1Badges[0].text).toBe('🧾 681');
    expect(res2.row3Badges).toHaveLength(0);
  });

  test('實機案例 3~4：台北永康企業、達美樂披薩 → 390px 125% 顯示 🧾 末3碼，360px 窄螢幕縮成 🧾 保全店名', () => {
    for (const [title, amount, inv, expected390] of [
      ['台北永康企業', '- NT$ 390', 'AB-12345123', '🧾 123'],
      ['達美樂披薩', '- NT$ 690', 'CD-99887456', '🧾 456'],
    ] as const) {
      const res390 = allocateTransactionCardBadges({
        contentWidth: CONTENT_WIDTH_390,
        fontScale: 1.25,
        titleText: title,
        amountText: amount,
        badges: [makeInvoiceBadge(inv)],
      });
      expect(res390.row1Badges).toHaveLength(1);
      expect(res390.row1Badges[0].text).toBe(expected390);
      expect(res390.row3Badges).toHaveLength(0);

      const res360 = allocateTransactionCardBadges({
        contentWidth: CONTENT_WIDTH_360,
        fontScale: 1.25,
        titleText: title,
        amountText: amount,
        badges: [makeInvoiceBadge(inv)],
      });
      expect(res360.row1Badges).toHaveLength(1);
      expect(res360.row1Badges[0].text).toBe('🧾');
      expect(res360.row3Badges).toHaveLength(0);
    }
  });

  test('hasReconciledCheck: true 正確預留右側 ✓ 寬度，避免擠壓店名或發票標籤', () => {
    // 5 字店名 + 較長金額 + 已核對勾，於 390px 125% 下應正確扣掉 ✓ 的 23px 後評估空間
    const withoutCheck = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '台北永康企業',
      amountText: '- NT$ 390',
      hasReconciledCheck: false,
      badges: [makeInvoiceBadge('AB-12345123')],
    });
    expect(withoutCheck.row1Badges[0].text).toBe('🧾 123');

    const withCheck = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '台北永康企業',
      amountText: '- NT$ 390',
      hasReconciledCheck: true,
      badges: [makeInvoiceBadge('AB-12345123')],
    });
    // 扣掉右側 ✓ 23px 後，放不下 57.4px 的「🧾 123」，故於完整 6 字店名下自動降為「🧾」
    expect(withCheck.row1Badges).toHaveLength(1);
    expect(withCheck.row1Badges[0].text).toBe('🧾');
    expect(withCheck.row3Badges).toHaveLength(0);
  });

  test('Coco（發票 + 連動待辦）→ 兩顆固定在第 1 行顯示 🧾 445 與 📋 待辦', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: 'Coco',
      amountText: '- NT$ 370',
      badges: [makeInvoiceBadge('HV-79049445'), makeMemoBadge()],
    });

    expect(result.row1Badges).toHaveLength(2);
    expect(result.row1Badges[0].text).toBe('🧾 445');
    expect(result.row1Badges[1].text).toBe('📋 待辦');
    expect(result.row3Badges).toHaveLength(0);
  });

  test('全家（2 字店名 + 雲端發票 + 憑證，✨ 已移往第 2 行）→ 完整保留店名且兩顆都含文字顯示', () => {
    const result = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '全家',
      amountText: '- NT$ 129',
      badges: [makeInvoiceBadge('EC-99112233', true), makeImageBadge()],
    });

    expect(result.row1Badges).toHaveLength(2);
    expect(result.row1Badges[0].text).toBe('☁️ 233');
    expect(result.row1Badges[1].text).toBe('📷 憑證');
    expect(result.row3Badges).toHaveLength(0);
  });

  test('超長店名（9 字全聯、12 字中油 + 多標籤 + 已核對）→ 允許超長店名縮短至保底約 4 字，穩留第 1 行維持 2 行', () => {
    const resCarrefour = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '全聯福利中心南港店',
      amountText: '- NT$ 1,280',
      badges: [makeInvoiceBadge('EF-55667788')],
    });
    expect(resCarrefour.row1Badges).toHaveLength(1);
    expect(resCarrefour.row1Badges[0].text).toBe('🧾 788');
    expect(resCarrefour.row3Badges).toHaveLength(0);

    const resOil = allocateTransactionCardBadges({
      contentWidth: CONTENT_WIDTH_390,
      fontScale: 1.25,
      titleText: '台灣中油直營加油站台北分站',
      amountText: '- NT$ 1,250',
      hasReconciledCheck: true,
      badges: [makeInvoiceBadge('CD-99887766'), makeImageBadge()],
    });
    expect(resOil.row1Badges).toHaveLength(2);
    expect(resOil.row1Badges.map((b) => b.text)).toContain('📷');
    expect(resOil.row3Badges).toHaveLength(0);
  });

  test('發票中獎與已兌領強制留在第 3 行醒目顯示，其餘標籤照常放第 1 行', () => {
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
      badges: [wonBadge, makeMemoBadge()],
    });

    expect(result.row1Badges).toHaveLength(1);
    expect(result.row1Badges[0].text).toBe('📋 待辦');
    expect(result.row3Badges).toHaveLength(1);
    expect(result.row3Badges[0].text).toBe('🎉 中獎 $1,000 (四獎)');
  });
});
