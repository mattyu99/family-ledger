/**
 * 台灣統一發票與電子發票解析核心模組
 */

export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ParsedInvoiceData {
  invoiceNumber: string;       // 標準格式 "AB-12345678"
  rawInvoiceNumber: string;    // 原始10碼 "AB12345678"
  invoiceDate: string;         // 西元日期 "YYYY-MM-DD"
  periodKey: string;           // 所屬開獎期別 "YYYY-MM" (如 "2026-10")
  periodLabel: string;         // 易讀中文期別 (如 "115年 09-10月期")
  randomCode?: string;         // 4碼隨機碼
  totalAmount?: number;        // 含稅總額 (十進位)
  salesAmount?: number;        // 未稅銷售額 (十進位)
  buyerTaxId?: string;         // 買方統編 (8碼)
  sellerTaxId?: string;        // 賣方統編 (8碼)
  merchantName?: string;       // 自動辨識之店家名稱 (例如 "全聯福利中心", "好市多")
  defaultCategoryName?: string;// 建議之記帳分類 (例如 "生鮮超市", "餐飲伙食")
  items?: InvoiceItem[];       // 右方 QR Code 或商品品項明細
  itemsNote?: string;          // 品項明細排版文字 (例如 "全脂鮮奶 x1 $89、草莓土司 x1 $40")
  totalItemsCount?: number;    // 該張發票實際品目總筆數 (十進位)
  recordedItemsCount?: number; // 條碼記載品目筆數 (十進位)
  isRightQRCode?: boolean;     // 是否為右側溢位明細條碼
  isQRCode: boolean;           // 是否從 QR Code 解析
}

/**
 * 台灣常見連鎖通路統一編號對照庫 (自動帶入店家與對應分類)
 */
export const COMMON_TAIWAN_SELLERS: Record<string, { name: string; defaultCategoryName: string }> = {
  // 生鮮量販與超市
  '03795504': { name: '全聯福利中心', defaultCategoryName: '生鮮超市' },
  '28414434': { name: '全聯福利中心', defaultCategoryName: '生鮮超市' },
  '96972798': { name: '好市多 Costco', defaultCategoryName: '生鮮超市' },
  '04435889': { name: '家樂福 Carrefour', defaultCategoryName: '生鮮超市' },
  '22662257': { name: '家樂福便利購', defaultCategoryName: '生鮮超市' },
  '86383610': { name: '大潤發 RT-MART', defaultCategoryName: '生鮮超市' },
  '23525827': { name: '愛買 a.mart', defaultCategoryName: '生鮮超市' },
  '27546377': { name: '美廉社 Simple Mart', defaultCategoryName: '生鮮超市' },
  '84149963': { name: '楓康超市', defaultCategoryName: '生鮮超市' },
  '22555026': { name: 'Mia C\'bon', defaultCategoryName: '生鮮超市' },

  // 超商便利商店
  '22555003': { name: '7-ELEVEN 統一超商', defaultCategoryName: '餐飲伙食' },
  '23060248': { name: '全家便利商店 FamilyMart', defaultCategoryName: '餐飲伙食' },
  '23285582': { name: '萊爾富 Hi-Life', defaultCategoryName: '餐飲伙食' },
  '22555018': { name: 'OK便利商店', defaultCategoryName: '餐飲伙食' },

  // 連鎖餐飲與速食
  '16097091': { name: '麥當勞 McDonald\'s', defaultCategoryName: '餐飲伙食' },
  '22555024': { name: '肯德基 KFC', defaultCategoryName: '餐飲伙食' },
  '12404368': { name: '摩斯漢堡 MOS BURGER', defaultCategoryName: '餐飲伙食' },
  '16744883': { name: '爭鮮迴轉壽司', defaultCategoryName: '餐飲伙食' },
  '16097092': { name: '星巴克 Starbucks', defaultCategoryName: '餐飲伙食' },
  '70557451': { name: '八方雲集', defaultCategoryName: '餐飲伙食' },
  '28414436': { name: '路易莎咖啡 Louisa', defaultCategoryName: '餐飲伙食' },
  '22555025': { name: '必勝客 Pizza Hut', defaultCategoryName: '餐飲伙食' },
  '23820245': { name: '鬍鬚張魯肉飯', defaultCategoryName: '餐飲伙食' },
  '23525828': { name: '瓦城泰統集團', defaultCategoryName: '餐飲伙食' },
  '84149964': { name: '王品集團', defaultCategoryName: '餐飲伙食' },

  // 藥局美妝與日用
  '23285585': { name: '屈臣氏 Watsons', defaultCategoryName: '醫療保健' },
  '84149961': { name: '康是美 Cosmed', defaultCategoryName: '醫療保健' },
  '27934057': { name: 'POYA 寶雅生活館', defaultCategoryName: '生鮮超市' },
  '28746377': { name: '大樹藥局', defaultCategoryName: '醫療保健' },
  '84149965': { name: '杏一醫療器材', defaultCategoryName: '醫療保健' },
  '23525830': { name: '丁丁連鎖藥局', defaultCategoryName: '醫療保健' },

  // 交通加油與通勤
  '89396340': { name: '台灣中油 CPC', defaultCategoryName: '交通出行' },
  '70771218': { name: '台塑石油 Formosa', defaultCategoryName: '交通出行' },
  '23285583': { name: '全國加油站', defaultCategoryName: '交通出行' },
  '16446274': { name: '台灣高鐵 THSR', defaultCategoryName: '交通出行' },
  '03795906': { name: '台灣鐵路局', defaultCategoryName: '交通出行' },
  '70771219': { name: '悠遊卡公司', defaultCategoryName: '交通出行' },
  '27546378': { name: '嘟嘟房停車場', defaultCategoryName: '交通出行' },
  '80677597': { name: '台灣大車隊 55688', defaultCategoryName: '交通出行' },

  // 居家水電寬頻電信
  '03795904': { name: '台灣電力公司', defaultCategoryName: '居家水電' },
  '11454653': { name: '台灣自來水公司', defaultCategoryName: '居家水電' },
  '03795905': { name: '台北自來水事業處', defaultCategoryName: '居家水電' },
  '27376037': { name: '中華電信', defaultCategoryName: '居家水電' },
  '03750249': { name: '遠傳電信', defaultCategoryName: '居家水電' },
  '70771217': { name: '台灣大哥大', defaultCategoryName: '居家水電' },

  // 電商與外送
  '80677598': { name: '蝦皮購物 Shopee', defaultCategoryName: '休閒娛樂' },
  '28428581': { name: 'momo 購物網', defaultCategoryName: '生鮮超市' },
  '70845600': { name: 'PChome 線上購物', defaultCategoryName: '休閒娛樂' },
  '83569779': { name: '酷澎 Coupang', defaultCategoryName: '生鮮超市' },
  '70771221': { name: 'foodpanda 空腹熊貓', defaultCategoryName: '餐飲伙食' },
  '80677596': { name: 'Uber Eats 優食', defaultCategoryName: '餐飲伙食' },

  // 百貨居家休閒
  '84149962': { name: 'IKEA 宜家家居', defaultCategoryName: '居家水電' },
  '23525829': { name: '特力屋 B&Q', defaultCategoryName: '居家水電' },
  '28414435': { name: '小北百貨', defaultCategoryName: '居家水電' },
  '27546379': { name: '大創百貨 DAISO', defaultCategoryName: '居家水電' },
  '80677599': { name: '無印良品 MUJI', defaultCategoryName: '休閒娛樂' },
  '70771220': { name: '威秀影城 Vieshow', defaultCategoryName: '休閒娛樂' },
  '23525831': { name: '國賓影城', defaultCategoryName: '休閒娛樂' },
  '22555027': { name: '錢櫃 KTV', defaultCategoryName: '休閒娛樂' },
};

/**
 * 依據 8 碼賣方統一編號查詢店家名稱與預設分類
 */
export const lookupMerchantByTaxId = (
  taxId: string | undefined,
  customMapping?: Record<string, string>
): { name: string; defaultCategoryName?: string } | null => {
  if (!taxId) return null;
  const clean = taxId.trim();
  if (customMapping && customMapping[clean]) {
    return { name: customMapping[clean] };
  }
  if (COMMON_TAIWAN_SELLERS[clean]) {
    return COMMON_TAIWAN_SELLERS[clean];
  }
  return null;
};

/**
 * 從冒號分隔的 token 陣列中解析商品品項明細
 * 財政部規範每品項為 3 欄位：[品名, 數量, 單價]
 * 部分 POS 機或廠商延伸格式容錯支援 4 欄位：[品名, 數量, 單價, 總額]
 */
export const parseInvoiceItemsFromTokens = (tokens: string[]): InvoiceItem[] => {
  const items: InvoiceItem[] = [];
  let i = 0;
  while (i < tokens.length) {
    const rawName = tokens[i]?.trim();
    // 忽略空字串或純星號 (營業人自用區標記 ********** 或填充碼)
    if (!rawName || /^\*+$/.test(rawName)) {
      i++;
      continue;
    }
    // 檢查次一 token 是否為數量 (有效數字)
    const nextToken = tokens[i + 1]?.trim();
    const qty = parseFloat(nextToken);
    if (isNaN(qty) || qty <= 0) {
      i++;
      continue;
    }
    // 檢查次次一 token 是否為單價 (數字)
    const priceToken = tokens[i + 2]?.trim();
    const unitPrice = parseFloat(priceToken);
    if (isNaN(unitPrice) || unitPrice < 0) {
      i += 2;
      continue;
    }

    // 檢查是否有第 4 個 token 為商品小計金額 (部分非標準 POS 機)
    const fourthToken = tokens[i + 3]?.trim();
    const maybeTotal = parseFloat(fourthToken);
    let amount = qty * unitPrice;
    if (!isNaN(maybeTotal) && (maybeTotal === amount || maybeTotal === Math.round(amount))) {
      amount = maybeTotal;
      items.push({ name: rawName, quantity: qty, unitPrice, amount });
      i += 4;
    } else {
      items.push({ name: rawName, quantity: qty, unitPrice, amount });
      i += 3;
    }
  }
  return items;
};

export interface LeftQRCodeTailParseResult {
  items: InvoiceItem[];
  recordedItemsCount?: number;
  totalItemsCount?: number;
}

/**
 * 解析電子發票左側 QR Code 尾端 (77 碼固定表頭之後) 攜帶之商品品項清單與筆數資訊
 * 財政部標準延伸表頭：:營業人自用區(10碼):二維條碼記載完整品目筆數:該張發票交易品目總筆數:中文編碼參數:品名1:數量1:單價1...
 */
export const parseTaiwanInvoiceLeftQRCodeItems = (qrText: string): LeftQRCodeTailParseResult => {
  if (!qrText || qrText.length <= 77) return { items: [] };
  const tail = qrText.slice(77);
  const rawTokens = tail.split(':').map(t => t.trim());
  const tokens = rawTokens[0] === '' ? rawTokens.slice(1) : rawTokens;

  let recordedItemsCount: number | undefined = undefined;
  let totalItemsCount: number | undefined = undefined;

  // 檢查是否符合標準延伸表頭：[營業人自用區(10碼或純星號), 品目筆數, 總品目筆數, 中文編碼參數, 品名1...]
  if (tokens.length >= 7 && (/^\*+$/.test(tokens[0]) || tokens[0].length === 10) && !isNaN(parseFloat(tokens[1]))) {
    recordedItemsCount = parseInt(tokens[1], 10);
    totalItemsCount = parseInt(tokens[2], 10);
    const items = parseInvoiceItemsFromTokens(tokens.slice(4));
    return { items, recordedItemsCount, totalItemsCount };
  }
  return { items: parseInvoiceItemsFromTokens(tokens) };
};

/**
 * 解析電子發票右側 QR Code 所攜帶之商品品項清單
 * 規範格式：**品名:數量:單價:品名:數量:單價...
 */
export const parseTaiwanInvoiceRightQRCode = (qrText: string): InvoiceItem[] => {
  if (!qrText || typeof qrText !== 'string') return [];
  let raw = qrText.trim();
  if (raw.startsWith('**')) {
    raw = raw.slice(2);
  } else if (raw.includes(':**')) {
    raw = raw.split(':**')[1];
  } else {
    const idx = raw.indexOf('**');
    if (idx !== -1) raw = raw.slice(idx + 2);
  }
  const rawTokens = raw.split(':').map(t => t.trim());
  return parseInvoiceItemsFromTokens(rawTokens);
};

/**
 * 合併左側發票核心資料與右側溢位品項資料
 */
export const mergeParsedInvoiceData = (
  left: ParsedInvoiceData,
  right: ParsedInvoiceData
): ParsedInvoiceData => {
  const base = left.invoiceNumber ? left : right;
  const other = left.invoiceNumber ? right : left;

  const leftItems = base.items || [];
  const rightItems = other.items || [];
  const combinedItems: InvoiceItem[] = [...leftItems, ...rightItems];

  const itemsNote = formatInvoiceItemsToNote(combinedItems);
  return {
    ...base,
    items: combinedItems,
    itemsNote,
  };
};

/**
 * 將發票品項明細格式化為排版整潔的備註文字
 */
export const formatInvoiceItemsToNote = (items: InvoiceItem[]): string => {
  if (!items || items.length === 0) return '';
  return items
    .filter(it => it.name && !/^\*+$/.test(it.name.trim()))
    .map(it => `${it.name}${it.quantity > 1 ? ` x${it.quantity}` : ''} $${it.amount}`)
    .join('、');
};

/**
 * 檢查字串是否為合法的台灣發票號碼格式 (2碼英文字軌 + 8碼數字，允許含或不含連字號)
 */
export const isValidInvoiceNumber = (invoiceNumber: string): boolean => {
  if (!invoiceNumber) return false;
  const cleaned = invoiceNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z]{2}\d{8}$/.test(cleaned);
};

/**
 * 格式化發票號碼為標準 "AB-12345678" 形式
 */
export const formatInvoiceNumber = (raw: string): string => {
  if (!raw) return '';
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length <= 10) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
  }
  return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 10)}`;
};

/**
 * 根據日期取得統一發票雙月期別代碼 (例如：2026-09-15 屬於 2026-10 期)
 */
export const getInvoicePeriodKey = (dateInput: Date | string): { periodKey: string; periodLabel: string } => {
  const date = typeof dateInput === 'string' ? new Date(dateInput.replace(/-/g, '/')) : dateInput;
  const year = isNaN(date.getFullYear()) ? new Date().getFullYear() : date.getFullYear();
  const month = isNaN(date.getMonth()) ? new Date().getMonth() + 1 : date.getMonth() + 1;
  const rocYear = year - 1911;

  // 雙月期別歸類：1~2月歸 02, 3~4月歸 04, 5~6月歸 06, 7~8月歸 08, 9~10月歸 10, 11~12月歸 12
  const periodEndMonth = Math.ceil(month / 2) * 2;
  const periodStartMonth = periodEndMonth - 1;

  const mm = String(periodEndMonth).padStart(2, '0');
  const periodKey = `${year}-${mm}`;
  const periodLabel = `${rocYear}年 ${String(periodStartMonth).padStart(2, '0')}-${mm}月期`;

  return { periodKey, periodLabel };
};

/**
 * 解析台灣電子發票左側 QR Code 規範字串 (長度至少 77 碼)
 *
 * 欄位結構 (長度固定)：
 * [0:10]  : 發票號碼 10 碼 (例如 AB12345678)
 * [10:17] : 開立日期 7 碼民國年月日 (例如 1151023 代表民國115年10月23日)
 * [17:21] : 隨機碼 4 碼 (例如 8888)
 * [21:29] : 銷售額 8 碼十六進位
 * [29:37] : 總額 8 碼十六進位
 * [37:45] : 買方統編 8 碼 (無統編為 00000000)
 * [45:53] : 賣方統編 8 碼
 * [53:77] : 加密驗證資訊 24 碼
 */
export const parseTaiwanInvoiceQRCode = (
  qrText: string,
  customTaxIdMapping?: Record<string, string>
): ParsedInvoiceData | null => {
  if (!qrText || typeof qrText !== 'string') return null;
  const raw = qrText.trim();

  // 若使用者掃描了右方 QR Code (開頭為 **)
  if (raw.startsWith('**')) {
    const items = parseTaiwanInvoiceRightQRCode(raw);
    const itemsNote = formatInvoiceItemsToNote(items);
    const sumAmount = items.reduce((acc, it) => acc + (it.amount || 0), 0);
    return {
      invoiceNumber: '',
      rawInvoiceNumber: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      periodKey: getInvoicePeriodKey(new Date()).periodKey,
      periodLabel: getInvoicePeriodKey(new Date()).periodLabel,
      totalAmount: sumAmount > 0 ? sumAmount : undefined,
      items,
      itemsNote,
      isRightQRCode: true,
      isQRCode: true,
    };
  }

  // 若文字開頭符合 2 碼英文 + 8 碼數字且長度 >= 77 (標準左側 QR Code)
  if (raw.length >= 77 && /^[A-Za-z]{2}\d{8}/.test(raw)) {
    try {
      const rawNum = raw.slice(0, 10).toUpperCase();
      const rocDateStr = raw.slice(10, 17); // e.g. "1151023"
      const randomCode = raw.slice(17, 21);
      const salesHex = raw.slice(21, 29);
      const totalHex = raw.slice(29, 37);
      const buyerTaxId = raw.slice(37, 45);
      const sellerTaxId = raw.slice(45, 53);

      // 解析民國日期為西元 YYYY-MM-DD
      const rocYear = parseInt(rocDateStr.slice(0, 3), 10);
      const mStr = rocDateStr.slice(3, 5);
      const dStr = rocDateStr.slice(5, 7);
      const year = rocYear + 1911;
      const invoiceDate = `${year}-${mStr}-${dStr}`;

      // 解析金額 (16進位轉10進位)
      const salesAmount = parseInt(salesHex, 16);
      const totalAmount = parseInt(totalHex, 16);

      const { periodKey, periodLabel } = getInvoicePeriodKey(invoiceDate);

      // 依據賣方統編自動辨識店家與預設記帳分類
      const cleanSellerTaxId = sellerTaxId === '00000000' ? undefined : sellerTaxId;
      const matchedSeller = lookupMerchantByTaxId(cleanSellerTaxId, customTaxIdMapping);

      // 檢查 QR Code 尾端是否同時包含商品品項明細 (左側 QR Code 尾端延伸或右側 QR Code)
      let items: InvoiceItem[] | undefined = undefined;
      let itemsNote: string | undefined = undefined;
      let recordedItemsCount: number | undefined = undefined;
      let totalItemsCount: number | undefined = undefined;

      if (raw.length > 77) {
        const leftTailRes = parseTaiwanInvoiceLeftQRCodeItems(raw);
        if (leftTailRes.items.length > 0) {
          items = leftTailRes.items;
          itemsNote = formatInvoiceItemsToNote(items);
        }
        recordedItemsCount = leftTailRes.recordedItemsCount;
        totalItemsCount = leftTailRes.totalItemsCount;
      }
      if ((!items || items.length === 0) && (raw.includes(':**') || raw.includes('**'))) {
        items = parseTaiwanInvoiceRightQRCode(raw);
        if (items.length > 0) {
          itemsNote = formatInvoiceItemsToNote(items);
        }
      }

      return {
        invoiceNumber: formatInvoiceNumber(rawNum),
        rawInvoiceNumber: rawNum,
        invoiceDate,
        periodKey,
        periodLabel,
        randomCode,
        salesAmount: isNaN(salesAmount) ? undefined : salesAmount,
        totalAmount: isNaN(totalAmount) ? undefined : totalAmount,
        buyerTaxId: buyerTaxId === '00000000' ? undefined : buyerTaxId,
        sellerTaxId: cleanSellerTaxId,
        merchantName: matchedSeller?.name,
        defaultCategoryName: matchedSeller?.defaultCategoryName,
        items,
        itemsNote,
        recordedItemsCount,
        totalItemsCount,
        isQRCode: true,
      };
    } catch {
      // 容錯降級處理
    }
  }

  // 若非標準 QR Code 串，但使用者輸入或掃到單純的發票號碼 (如 "AB-12345678" 或 "AB12345678")
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (/^[A-Z]{2}\d{8}$/.test(cleaned)) {
    const today = new Date();
    const { periodKey, periodLabel } = getInvoicePeriodKey(today);
    return {
      invoiceNumber: formatInvoiceNumber(cleaned),
      rawInvoiceNumber: cleaned,
      invoiceDate: today.toISOString().split('T')[0],
      periodKey,
      periodLabel,
      isQRCode: false,
    };
  }

  return null;
};

/**
 * 發票標籤編碼，嵌入至 note 中供跨平台及雲端永久同步
 */
export const encodeInvoiceTag = (data: {
  invoiceNumber: string;
  periodKey?: string;
  randomCode?: string;
  status?: string;
  prizeAmount?: number;
  prizeName?: string;
}): string => {
  const num = formatInvoiceNumber(data.invoiceNumber);
  const period = data.periodKey || '';
  const code = data.randomCode || '';
  const status = data.status || 'pending';
  const amount = data.prizeAmount !== undefined ? String(data.prizeAmount) : '0';
  const name = data.prizeName || '';
  return `[🧾 ${num}|${period}|${code}|${status}|${amount}|${name}]`;
};

/**
 * 從 note 中解碼發票標籤
 */
export const decodeInvoiceTag = (note: string | undefined): {
  invoiceNumber?: string;
  periodKey?: string;
  randomCode?: string;
  status?: 'pending' | 'won' | 'missed' | 'claimed';
  prizeAmount?: number;
  prizeName?: string;
} | null => {
  if (!note) return null;
  const match = note.match(/\[🧾\s*([A-Za-z0-9\-]+)(?:\|([^\|\]]*))?(?:\|([^\|\]]*))?(?:\|([^\|\]]*))?(?:\|([^\|\]]*))?(?:\|([^\|\]]*))?\]/);
  if (!match) return null;

  const rawNum = match[1]?.trim();
  if (!isValidInvoiceNumber(rawNum)) return null;

  const periodKey = match[2]?.trim() || undefined;
  const randomCode = match[3]?.trim() || undefined;
  const rawStatus = match[4]?.trim() as any;
  const status = (rawStatus === 'won' || rawStatus === 'missed' || rawStatus === 'claimed') ? rawStatus : 'pending';
  const prizeAmount = match[5] ? parseInt(match[5].trim(), 10) : 0;
  const prizeName = match[6]?.trim() || undefined;

  return {
    invoiceNumber: formatInvoiceNumber(rawNum),
    periodKey,
    randomCode,
    status,
    prizeAmount: isNaN(prizeAmount) ? 0 : prizeAmount,
    prizeName,
  };
};

/**
 * 剔除 note 中的發票標籤，取得乾淨的使用者備註文字
 */
export const stripInvoiceTag = (note: string | undefined): string => {
  if (!note) return '';
  return note.replace(/\[🧾\s*[^\]]+\]/g, '').trim();
};

