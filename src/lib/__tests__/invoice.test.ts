import {
  isValidInvoiceNumber,
  formatInvoiceNumber,
  getInvoicePeriodKey,
  lookupMerchantByTaxId,
  encodeInvoiceTag,
  decodeInvoiceTag,
  stripInvoiceTag,
  cleanInvoiceItemName,
  parseTaiwanInvoiceLeftQRCodeItems,
  parseTaiwanInvoiceRightQRCode,
  mergeParsedInvoiceData,
  ParsedInvoiceData,
} from '../invoice';

describe('台灣統一發票與條碼解析核心模組測試 (invoice.ts)', () => {
  describe('發票號碼驗證與格式化', () => {
    it('合法 2 碼英文字軌 + 8 碼數字判定為 true', () => {
      expect(isValidInvoiceNumber('AB-12345678')).toBe(true);
      expect(isValidInvoiceNumber('ab12345678')).toBe(true);
      expect(isValidInvoiceNumber('XY-00000001')).toBe(true);
    });

    it('非法格式（少於 8 碼、含特殊符號、純數字）應判定為 false', () => {
      expect(isValidInvoiceNumber('12345678')).toBe(false);
      expect(isValidInvoiceNumber('A-12345678')).toBe(false);
      expect(isValidInvoiceNumber('ABC-1234567')).toBe(false);
      expect(isValidInvoiceNumber('AB-1234567')).toBe(false);
      expect(isValidInvoiceNumber('')).toBe(false);
    });

    it('自動格式化為標準 "AB-12345678"', () => {
      expect(formatInvoiceNumber('ab12345678')).toBe('AB-12345678');
      expect(formatInvoiceNumber('AB-12345678')).toBe('AB-12345678');
      expect(formatInvoiceNumber('xy-99887766123')).toBe('XY-99887766'); // 超過長度截斷
    });
  });

  describe('開獎雙月期別推算 (getInvoicePeriodKey)', () => {
    it('單數月份 (例如 9 月) 應歸屬於該期雙數月 (2026-10 期)', () => {
      const res = getInvoicePeriodKey('2026-09-15');
      expect(res.periodKey).toBe('2026-10');
      expect(res.periodLabel).toBe('115年 09-10月期');
    });

    it('雙數月份 (例如 10 月) 亦歸屬於 2026-10 期', () => {
      const res = getInvoicePeriodKey('2026-10-31');
      expect(res.periodKey).toBe('2026-10');
      expect(res.periodLabel).toBe('115年 09-10月期');
    });

    it('年末 11~12 月應正確換算民國年與期別', () => {
      const res = getInvoicePeriodKey('2026-12-01');
      expect(res.periodKey).toBe('2026-12');
      expect(res.periodLabel).toBe('115年 11-12月期');
    });

    it('年初 1~2 月應正確歸為 01-02月期', () => {
      const res = getInvoicePeriodKey('2027-01-05');
      expect(res.periodKey).toBe('2027-02');
      expect(res.periodLabel).toBe('116年 01-02月期');
    });
  });

  describe('常見連鎖通路統編即時對照庫 (lookupMerchantByTaxId)', () => {
    it('全聯福利中心統編 16740494 應精準對應生鮮超市', () => {
      const seller = lookupMerchantByTaxId('16740494');
      expect(seller).toBeDefined();
      expect(seller?.name).toBe('全聯');
      expect(seller?.defaultCategoryName).toBe('生鮮超市');
    });

    it('7-ELEVEN 統編 22555003 應對應餐飲伙食', () => {
      const seller = lookupMerchantByTaxId('22555003');
      expect(seller).toBeDefined();
      expect(seller?.name).toBe('7-ELEVEN');
      expect(seller?.defaultCategoryName).toBe('餐飲伙食');
    });

    it('台灣高鐵統編 16446274 應對應交通出行', () => {
      const seller = lookupMerchantByTaxId('16446274');
      expect(seller).toBeDefined();
      expect(seller?.name).toBe('台灣高鐵');
      expect(seller?.defaultCategoryName).toBe('交通出行');
    });

    it('未知統編應安全回傳 null', () => {
      expect(lookupMerchantByTaxId('99999999')).toBeNull();
    });
  });

  describe('備註發票標籤編解碼 (encodeInvoiceTag, decodeInvoiceTag, stripInvoiceTag)', () => {
    it('編碼後應符合結構化格式', () => {
      const tag = encodeInvoiceTag({
        invoiceNumber: 'ab12345678',
        periodKey: '2026-10',
        randomCode: '1234',
        status: 'won',
        prizeAmount: 200,
        prizeName: '六獎',
      });
      expect(tag).toBe('[🧾 AB-12345678|2026-10|1234|won|200|六獎]');
    });

    it('解碼應能完整還原各項發票欄位', () => {
      const note = '在全聯買鮮奶與土司 [🧾 AB-12345678|2026-10|1234|won|200|六獎] 記得對帳';
      const decoded = decodeInvoiceTag(note);
      expect(decoded).not.toBeNull();
      expect(decoded?.invoiceNumber).toBe('AB-12345678');
      expect(decoded?.periodKey).toBe('2026-10');
      expect(decoded?.randomCode).toBe('1234');
      expect(decoded?.status).toBe('won');
      expect(decoded?.prizeAmount).toBe(200);
      expect(decoded?.prizeName).toBe('六獎');
    });

    it('stripInvoiceTag 應純淨移除發票標籤，保留使用者文字', () => {
      const note = '在全聯買鮮奶 [🧾 AB-12345678|2026-10|1234|won|200|六獎] 記得對帳';
      expect(stripInvoiceTag(note)).toBe('在全聯買鮮奶  記得對帳');
    });
  });

  describe('商品品項名稱清洗 (cleanInvoiceItemName)', () => {
    it('自動將全形英數轉為半形', () => {
      expect(cleanInvoiceItemName('ＴＰ３７便當')).toBe('TP37便當');
    });

    it('去除序號前綴 (如 1.、(1)、01 等)', () => {
      expect(cleanInvoiceItemName('(1)全脂鮮乳')).toBe('全脂鮮乳');
      expect(cleanInvoiceItemName('1.高麗菜')).toBe('高麗菜');
      expect(cleanInvoiceItemName('01奇異果')).toBe('奇異果');
    });

    it('超商微波食品前置分類代碼清除', () => {
      expect(cleanInvoiceItemName('1白酒清炒義大利麵')).toBe('白酒清炒義大利麵');
    });

    it('保留品名真實數字與量詞，絕不誤刪 (如 1號餐、3杯雞、100%果汁)', () => {
      expect(cleanInvoiceItemName('1號餐')).toBe('1號餐');
      expect(cleanInvoiceItemName('3杯雞便當')).toBe('3杯雞便當');
      expect(cleanInvoiceItemName('2入裝毛巾')).toBe('2入裝毛巾');
      expect(cleanInvoiceItemName('77乳加巧克力')).toBe('77乳加巧克力');
    });

    it('自動閉合未封口括號', () => {
      expect(cleanInvoiceItemName('綜合維他命組(100')).toBe('綜合維他命組(100)');
    });
  });

  describe('QR Code 品項解析與溢位合併', () => {
    it('左側 QR Code 品項解析 (parseTaiwanInvoiceLeftQRCodeItems)', () => {
      // 財政部標準電子發票左條碼需有 77 碼固定表頭，尾端接 :記載筆數:總筆數:編碼:品名:數量:單價
      const dummyHeader = 'A'.repeat(77);
      const leftTail = `${dummyHeader}:2:2:0:全脂鮮奶:1:89:白吐司:2:40`;
      const res = parseTaiwanInvoiceLeftQRCodeItems(leftTail);
      expect(res.items.length).toBe(2);
      expect(res.items[0]).toEqual({ name: '全脂鮮奶', quantity: 1, unitPrice: 89, amount: 89 });
      expect(res.items[1]).toEqual({ name: '白吐司', quantity: 2, unitPrice: 40, amount: 80 });
    });

    it('右側 QR Code 溢位品項解析 (parseTaiwanInvoiceRightQRCode)', () => {
      const rightQr = '**草莓果醬:1:65:抽取式衛生紙:3:120';
      const items = parseTaiwanInvoiceRightQRCode(rightQr);
      expect(items.length).toBe(2);
      expect(items[0].name).toBe('草莓果醬');
      expect(items[0].amount).toBe(65);
      expect(items[1].name).toBe('抽取式衛生紙');
      expect(items[1].amount).toBe(360);
    });

    it('左右雙條碼合併 (mergeParsedInvoiceData)', () => {
      const leftData: ParsedInvoiceData = {
        invoiceNumber: 'AB-12345678',
        rawInvoiceNumber: 'AB12345678',
        invoiceDate: '2026-10-20',
        periodKey: '2026-10',
        periodLabel: '115年 09-10月期',
        isQRCode: true,
        items: [{ name: '鮮奶', quantity: 1, unitPrice: 90, amount: 90 }],
      };

      const rightData: ParsedInvoiceData = {
        invoiceNumber: '',
        rawInvoiceNumber: '',
        invoiceDate: '',
        periodKey: '',
        periodLabel: '',
        isQRCode: true,
        isRightQRCode: true,
        items: [{ name: '麥片', quantity: 1, unitPrice: 150, amount: 150 }],
      };

      const merged = mergeParsedInvoiceData(leftData, rightData);
      expect(merged.invoiceNumber).toBe('AB-12345678');
      expect(merged.items?.length).toBe(2);
      expect(merged.itemsNote).toBe('鮮奶 $90、麥片 $150');
    });
  });
});
