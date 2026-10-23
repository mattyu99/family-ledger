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
 * 統編全面校正為真實登記統編，名稱採用簡明單一識別品牌，供離線即時秒速比對
 */
export const COMMON_TAIWAN_SELLERS: Record<string, { name: string; defaultCategoryName: string }> = {
  // 生鮮量販與超市
  '16740494': { name: '全聯', defaultCategoryName: '生鮮超市' },
  '96972798': { name: '好市多', defaultCategoryName: '生鮮超市' },
  '22662550': { name: '家樂福', defaultCategoryName: '生鮮超市' },
  '54164937': { name: '美廉社', defaultCategoryName: '生鮮超市' },
  '97165560': { name: '大潤發', defaultCategoryName: '生鮮超市' },

  // 超商便利商店
  '22555003': { name: '7-ELEVEN', defaultCategoryName: '餐飲伙食' },
  '23060248': { name: '全家', defaultCategoryName: '餐飲伙食' },
  '23285582': { name: '萊爾富', defaultCategoryName: '餐飲伙食' },
  '22853565': { name: 'OK超商', defaultCategoryName: '餐飲伙食' },

  // 連鎖餐飲與速食
  '12411160': { name: '麥當勞', defaultCategoryName: '餐飲伙食' },
  '97161500': { name: '肯德基/必勝客', defaultCategoryName: '餐飲伙食' },
  '23928945': { name: '摩斯漢堡', defaultCategoryName: '餐飲伙食' },
  '16097091': { name: '星巴克', defaultCategoryName: '餐飲伙食' },
  '70472679': { name: '八方雲集', defaultCategoryName: '餐飲伙食' },
  '54857699': { name: '路易莎', defaultCategoryName: '餐飲伙食' },
  '84630426': { name: '王品', defaultCategoryName: '餐飲伙食' },
  '97286918': { name: '爭鮮', defaultCategoryName: '餐飲伙食' },
  '70843031': { name: '瓦城', defaultCategoryName: '餐飲伙食' },
  '22721208': { name: '鬍鬚張', defaultCategoryName: '餐飲伙食' },

  // 藥局美妝與日用
  '23224657': { name: '屈臣氏', defaultCategoryName: '醫療保健' },
  '89589328': { name: '康是美', defaultCategoryName: '醫療保健' },
  '97151664': { name: '寶雅', defaultCategoryName: '生鮮超市' },
  '12803476': { name: '大樹藥局', defaultCategoryName: '醫療保健' },
  '86649006': { name: '杏一醫療', defaultCategoryName: '醫療保健' },
  '16115725': { name: '丁丁藥局', defaultCategoryName: '醫療保健' },

  // 交通加油與通勤
  '03707901': { name: '台灣中油', defaultCategoryName: '交通出行' },
  '22958907': { name: '全國加油站', defaultCategoryName: '交通出行' },
  '16446274': { name: '台灣高鐵', defaultCategoryName: '交通出行' },
  '07524729': { name: '台鐵', defaultCategoryName: '交通出行' },
  '27767961': { name: '台灣大車隊', defaultCategoryName: '交通出行' },
  '70765909': { name: '悠遊卡', defaultCategoryName: '交通出行' },

  // 居家水電寬頻電信
  '03795904': { name: '台電', defaultCategoryName: '居家水電' },
  '52242444': { name: '台水', defaultCategoryName: '居家水電' },
  '03774909': { name: '北水處', defaultCategoryName: '居家水電' },
  '96979933': { name: '中華電信', defaultCategoryName: '居家水電' },
  '97176270': { name: '台灣大哥大', defaultCategoryName: '居家水電' },
  '97179430': { name: '遠傳電信', defaultCategoryName: '居家水電' },

  // 電商與外送
  '27365925': { name: 'momo購物', defaultCategoryName: '生鮮超市' },
  '16606102': { name: 'PChome', defaultCategoryName: '休閒娛樂' },
  '24941832': { name: '蝦皮購物', defaultCategoryName: '休閒娛樂' },
  '91002999': { name: '酷澎', defaultCategoryName: '生鮮超市' },

  // 百貨居家休閒
  '84309586': { name: 'IKEA', defaultCategoryName: '居家水電' },
  '89390488': { name: '特力屋', defaultCategoryName: '居家水電' },
  '97268593': { name: '小北百貨', defaultCategoryName: '居家水電' },
  '12811308': { name: '大創百貨', defaultCategoryName: '居家水電' },
  '80518858': { name: '無印良品', defaultCategoryName: '休閒娛樂' },
  '16086448': { name: '威秀影城', defaultCategoryName: '休閒娛樂' },
};

export interface OnlineMerchantInfo {
  name: string;
  defaultCategoryName?: string;
  industryName?: string;
  source: 'fia' | 'g0v' | 'local';
}

// 記憶體快取，避免同一 Session 內重複查詢已解析過的統編
const onlineMerchantCache = new Map<string, OnlineMerchantInfo>();

/**
 * 智慧清理營業人名稱：
 * 1. 簡短且高辨識度：知名企業取單一識別名稱（例如「7-ELEVEN」、「全家」、「麥當勞」），不重複中英文。
 * 2. 徹底去除後方分公司與營業所字樣（例如「台北市第八四一分公司」）。
 */
export const cleanBusinessName = (rawName: string, hqBan?: string): string => {
  if (!rawName) return '';
  const name = rawName.trim();

  // 1. 常見大型連鎖企業辨識（取簡短、單一、易識別品牌名，完全去掉分公司後綴）
  if (
    hqBan === '22555003' ||
    name.includes('統一超商') ||
    name.includes('7-ELEVEN') ||
    name.includes('7-11')
  ) {
    return '7-ELEVEN';
  }
  if (
    hqBan === '23060248' ||
    name.includes('全家便利') ||
    name.includes('全家超商')
  ) {
    return '全家';
  }
  if (
    hqBan === '16740494' ||
    name.includes('全聯實業') ||
    name.includes('全聯福利')
  ) {
    return '全聯';
  }
  if (
    hqBan === '22662550' ||
    name.includes('家福股份') ||
    name.includes('康達盛通') ||
    name.includes('家樂福')
  ) {
    return '家樂福';
  }
  if (hqBan === '12411160' || name.includes('和德昌') || name.includes('麥當勞')) {
    return '麥當勞';
  }
  if (hqBan === '23928945' || name.includes('安心食品') || name.includes('摩斯漢堡')) {
    return '摩斯漢堡';
  }
  if (
    hqBan === '97161500' ||
    name.includes('富利餐飲') ||
    name.includes('肯德基') ||
    name.includes('必勝客')
  ) {
    if (name.includes('肯德基')) return '肯德基';
    if (name.includes('必勝客')) return '必勝客';
    return '肯德基/必勝客';
  }
  if (hqBan === '16097091' || name.includes('悠旅生活') || name.includes('星巴克')) {
    return '星巴克';
  }
  if (hqBan === '89589328' || name.includes('統一生活') || name.includes('康是美')) {
    return '康是美';
  }
  if (hqBan === '23224657' || name.includes('屈臣氏')) {
    return '屈臣氏';
  }
  if (hqBan === '54164937' || name.includes('三商家購') || name.includes('美廉社')) {
    return '美廉社';
  }
  if (hqBan === '23285582' || name.includes('萊爾富')) {
    return '萊爾富';
  }
  if (
    hqBan === '22853565' ||
    name.includes('來來超商') ||
    name.includes('富達零售') ||
    name.includes('OK便利') ||
    name.includes('OK超商')
  ) {
    return 'OK超商';
  }
  if (hqBan === '97151664' || name.includes('寶雅')) {
    return '寶雅';
  }
  if (hqBan === '96972798' || name.includes('好市多')) {
    return '好市多';
  }
  if (hqBan === '97165560' || name.includes('大潤發')) {
    return '大潤發';
  }
  if (
    hqBan === '12803476' ||
    name.includes('大樹醫藥') ||
    name.includes('大樹藥局')
  ) {
    return '大樹藥局';
  }
  if (hqBan === '86649006' || name.includes('杏一')) {
    return '杏一醫療';
  }
  if (
    hqBan === '16115725' ||
    name.includes('諾貝兒') ||
    name.includes('丁丁藥局') ||
    name.includes('丁丁連鎖')
  ) {
    return '丁丁藥局';
  }
  if (hqBan === '03707901' || name.includes('台灣中油') || name.includes('中油')) {
    return '台灣中油';
  }
  if (hqBan === '22958907' || name.includes('全國加油站')) {
    return '全國加油站';
  }
  if (
    hqBan === '16446274' ||
    name.includes('台灣高速鐵路') ||
    name.includes('台灣高鐵')
  ) {
    return '台灣高鐵';
  }
  if (
    hqBan === '07524729' ||
    name.includes('臺灣鐵路') ||
    name.includes('台灣鐵路') ||
    name.includes('臺鐵') ||
    name.includes('台鐵')
  ) {
    return '台鐵';
  }
  if (hqBan === '27767961' || name.includes('台灣大車隊')) {
    return '台灣大車隊';
  }
  if (hqBan === '70765909' || name.includes('悠遊卡')) {
    return '悠遊卡';
  }
  if (hqBan === '03795904' || name.includes('台灣電力') || name.includes('台電')) {
    return '台電';
  }
  if (hqBan === '52242444' || name.includes('台灣自來水') || name.includes('台水')) {
    return '台水';
  }
  if (
    hqBan === '03774909' ||
    name.includes('臺北自來水') ||
    name.includes('台北自來水') ||
    name.includes('北水處')
  ) {
    return '北水處';
  }
  if (hqBan === '96979933' || name.includes('中華電信')) {
    return '中華電信';
  }
  if (hqBan === '97176270' || name.includes('台灣大哥大')) {
    return '台灣大哥大';
  }
  if (hqBan === '97179430' || name.includes('遠傳電信')) {
    return '遠傳電信';
  }
  if (hqBan === '27365925' || name.includes('富邦媒體') || name.includes('momo')) {
    return 'momo購物';
  }
  if (hqBan === '16606102' || name.includes('網路家庭') || name.includes('PChome')) {
    return 'PChome';
  }
  if (hqBan === '24941832' || name.includes('樂購蝦皮') || name.includes('蝦皮')) {
    return '蝦皮購物';
  }
  if (hqBan === '91002999' || name.includes('酷澎') || name.includes('Coupang')) {
    return '酷澎';
  }
  if (hqBan === '84309586' || name.includes('宜家家居') || name.includes('IKEA')) {
    return 'IKEA';
  }
  if (hqBan === '89390488' || name.includes('特力屋')) {
    return '特力屋';
  }
  if (hqBan === '97268593' || name.includes('小北百貨')) {
    return '小北百貨';
  }
  if (hqBan === '12811308' || name.includes('大創')) {
    return '大創百貨';
  }
  if (hqBan === '80518858' || name.includes('無印良品')) {
    return '無印良品';
  }
  if (hqBan === '16086448' || name.includes('威秀影城')) {
    return '威秀影城';
  }
  if (hqBan === '70472679' || name.includes('八方雲集')) {
    return '八方雲集';
  }
  if (hqBan === '54857699' || name.includes('路易莎')) {
    return '路易莎';
  }
  if (hqBan === '84630426' || name.includes('王品')) {
    return '王品';
  }
  if (hqBan === '97286918' || name.includes('爭鮮')) {
    return '爭鮮';
  }
  if (hqBan === '70843031' || name.includes('瓦城')) {
    return '瓦城';
  }
  if (hqBan === '22721208' || name.includes('鬍鬚張')) {
    return '鬍鬚張';
  }

  // 2. 一般商號與公司名稱清理：去除括號分公司、去除分公司/營業所/門市以及組織型態贅字
  let cleaned = name
    .replace(/\s*[\(（][^\)）]*(?:分公司|營業所|門市|分行|分處|營運處|辦事處)[^\)）]*[\)）]/g, '')
    .replace(/(?:股份有限公司|有限公司|合夥|獨資).*$/g, '')
    .replace(/(?:分公司|營業所|門市|分行|分部|分處|服務處).*$/g, '')
    .replace(/股份有限公司/g, '')
    .replace(/有限公司/g, '')
    .replace(/企業社$/g, '')
    .replace(/實業社$/g, '')
    .replace(/工作室$/g, '')
    .replace(/商行$/g, '')
    .trim();

  return cleaned.length >= 2 ? cleaned : name;
};

/**
 * 依據經濟部/財政部行業名稱與營業人名稱推導最合適的支出分類
 */
export const inferCategoryFromIndustry = (
  industryNm?: string,
  businessNm?: string
): string | undefined => {
  const text = `${industryNm || ''} ${businessNm || ''}`;
  if (/超級市場|量販|好市多|全聯|家樂福|大潤發|生鮮|蔬果|肉品|水產/.test(text)) {
    return '生鮮超市';
  }
  if (
    /速食|餐館|餐廳|便當|咖啡|飲料|茶飲|早餐|小吃|麵包|烘焙|便利商店|超商|7-ELEVEN|全家|萊爾富|OK|麥當勞|肯德基|摩斯|漢堡|壽司|爭鮮|八方雲集|星巴克|路易莎/.test(
      text
    )
  ) {
    return '餐飲伙食';
  }
  if (
    /汽油|加油站|中油|台塑|鐵路|高鐵|臺鐵|捷運|計程車|大車隊|客運|運輸|停車場|悠遊卡|車票|公車/.test(
      text
    )
  ) {
    return '交通出行';
  }
  if (/西藥|藥局|藥品|醫療|診所|醫院|屈臣氏|康是美|大樹|杏一|丁丁|健保/.test(text)) {
    return '醫療保健';
  }
  if (
    /電力|自來水|用水|電信|通信|中華電信|台灣大哥大|遠傳|瓦斯|天然氣|網路費|水電/.test(
      text
    )
  ) {
    return '居家水電';
  }
  if (
    /電影|影城|KTV|娛樂|遊樂|運動|健身|書店|文教|觀光|旅宿|飯店|民宿/.test(text)
  ) {
    return '休閒娛樂';
  }
  return undefined;
};

/**
 * 透過財政部稅籍登記 Open API 即時線上查詢 8 碼賣方統一編號所屬店家
 * 具備快速超時、回退備用端點、快取記憶與智慧名稱美化機制
 */
export const fetchMerchantOnlineByTaxId = async (
  taxId: string | undefined,
  timeoutMs = 2500
): Promise<OnlineMerchantInfo | null> => {
  if (!taxId) return null;
  const cleanId = taxId.trim();
  if (!/^\d{8}$/.test(cleanId) || cleanId === '00000000') return null;

  // 1. 優先查記憶體快取
  if (onlineMerchantCache.has(cleanId)) {
    return onlineMerchantCache.get(cleanId)!;
  }

  // 2. 查本機靜態連鎖通訊庫
  if (COMMON_TAIWAN_SELLERS[cleanId]) {
    const item = COMMON_TAIWAN_SELLERS[cleanId];
    const res: OnlineMerchantInfo = {
      name: item.name,
      defaultCategoryName: item.defaultCategoryName,
      source: 'local',
    };
    onlineMerchantCache.set(cleanId, res);
    return res;
  }

  // 3. 查詢財政部官方稅籍登記 Open API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const fiaUrl = `https://eip.fia.gov.tw/OAI/api/businessRegistration/${cleanId}`;
    const response = await fetch(fiaUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      if (data && data.businessNm) {
        const cleanedName = cleanBusinessName(data.businessNm, data.headquartersBan);
        const inferredCategory = inferCategoryFromIndustry(data.industryNm, data.businessNm);
        const result: OnlineMerchantInfo = {
          name: cleanedName,
          defaultCategoryName: inferredCategory,
          industryName: data.industryNm,
          source: 'fia',
        };
        onlineMerchantCache.set(cleanId, result);
        return result;
      }
    }
  } catch {
    // 網路逾時或中斷，平滑降級至備用端點
  }

  // 4. 備用端點：g0v 台灣公司資料 API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const g0vUrl = `https://company.g0v.ronny.tw/api/show/${cleanId}`;
    const response = await fetch(g0vUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (response.ok) {
      const json = await response.json();
      const rawName =
        json.data?.['公司名稱'] ||
        json.data?.['商業名稱'] ||
        json.data?.['分公司名稱'] ||
        json.data?.['財政部']?.['營業人名稱'];

      if (rawName && typeof rawName === 'string') {
        const cleanedName = cleanBusinessName(rawName);
        const inferredCategory = inferCategoryFromIndustry(undefined, rawName);
        const result: OnlineMerchantInfo = {
          name: cleanedName,
          defaultCategoryName: inferredCategory,
          source: 'g0v',
        };
        onlineMerchantCache.set(cleanId, result);
        return result;
      }
    }
  } catch {
    // 兩大端點皆無法連線時容錯退出
  }

  return null;
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
    return { name: cleanBusinessName(customMapping[clean]) };
  }
  if (onlineMerchantCache.has(clean)) {
    const cached = onlineMerchantCache.get(clean)!;
    return { name: cleanBusinessName(cached.name), defaultCategoryName: cached.defaultCategoryName };
  }
  if (COMMON_TAIWAN_SELLERS[clean]) {
    return COMMON_TAIWAN_SELLERS[clean];
  }
  return null;
};

/**
 * 將全形英數字與全形符號轉為標準半形，提升易讀性 (例如：ＴＰ３７ -> TP37, ５００ｍｌ -> 500ml)
 */
export const toHalfWidth = (str: string): string => {
  return str
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
};

/**
 * 智慧清理商品品名：
 * 1. 轉為標準半形字元（解決超商常見全形英文與數字問題，如 ＴＰ３７ -> TP37）。
 * 2. 去除超商 POS 機在品名前方加入的溫層/分類前置代碼（如「1白酒清炒鮮蛤義大」->「白酒清炒鮮蛤義大」）。
 * 3. 去除常見序號前綴（如「1.」、「(1)」、「01」等）。
 * 4. 嚴密保護真實品名（如「1號餐」、「2入裝」、「3杯雞」、「3M膠帶」、「77乳加」、「100%柳橙汁」等絕不誤刪）。
 */
export const cleanInvoiceItemName = (rawName: string): string => {
  if (!rawName) return '';
  let name = toHalfWidth(rawName.trim());

  // 去除頭尾特殊裝飾符號（如 * #）
  name = name.replace(/^[\*\#\s]+/, '').replace(/[\*\#\s]+$/, '');

  // 1. 去除括號序號前綴，例如 (1)商品、[01]商品、【1】商品
  name = name.replace(/^[（\(【\[]\d{1,2}[）\)】\]]\s*/, '');

  // 2. 去除序號點或符號前綴，例如 1.商品、01.商品、1-商品、1、商品、1:商品
  name = name.replace(/^\d{1,2}[\.\-、:\s]+(?=[\u4e00-\u9fa5])/, '');

  // 3. 去除二位數以 0 開頭的序號代碼，例如 01商品 -> 商品
  name = name.replace(/^0\d(?=[\u4e00-\u9fa5])/, '');

  // 4. 超商鮮食/商品常見之單一前置分類碼（全家、7-11 常在微波或鮮食前置 1，如 1白酒清炒鮮蛤義大）
  // 排除單位、量詞、號次、餐點等真實品名
  const preservedUnits = '[號号入份組件個串顆袋盒罐碗杯條包支本張台臺雙瓶粒隻桶箱把束塊打度次色味]';
  const prefixRegex = new RegExp(`^[0-9](?=[\\u4e00-\\u9fa5])(?!${preservedUnits})`);
  name = name.replace(prefixRegex, '');

  return name.trim();
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
    // 忽略空字串、純星號 (營業人自用區標記 ********** 或填充碼) 或純單碼 0 標記
    if (!rawName || /^\*+$/.test(rawName) || rawName === '0') {
      i++;
      continue;
    }
    const cleanName = cleanInvoiceItemName(rawName);
    if (!cleanName || /^\*+$/.test(cleanName) || cleanName === '0') {
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
    let amount = Math.round(qty * unitPrice);
    if (!isNaN(maybeTotal) && (maybeTotal === amount || maybeTotal === Math.round(amount))) {
      amount = maybeTotal;
      items.push({ name: cleanName, quantity: qty, unitPrice, amount });
      i += 4;
    } else {
      items.push({ name: cleanName, quantity: qty, unitPrice, amount });
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
 * 財政部標準延伸表頭：:營業人自用區(0~10碼):二維條碼記載完整品目筆數:該張發票交易品目總筆數:中文編碼參數:品名1:數量1:單價1...
 */
export const parseTaiwanInvoiceLeftQRCodeItems = (qrText: string): LeftQRCodeTailParseResult => {
  if (!qrText || qrText.length <= 77) return { items: [] };
  const tail = qrText.slice(77);
  const rawTokens = tail.split(':').map(t => t.trim());
  const tokens = rawTokens[0] === '' ? rawTokens.slice(1) : rawTokens;

  let recordedItemsCount: number | undefined = undefined;
  let totalItemsCount: number | undefined = undefined;

  // 檢查是否符合財政部標準延伸表頭：
  // 欄位 0：營業人自用區 (長度 0~10 碼，常見值如 "**********"、"0"、空字串或自訂代碼)
  // 欄位 1：二維條碼記載完整品目筆數 (整數 >= 0)
  // 欄位 2：該張發票交易品目總筆數 (整數 >= 0)
  // 欄位 3：中文編碼參數 (整數，如 1=Big5, 2=UTF-8, 0=Base64)
  // 欄位 4~：商品品項明細 (品名:數量:單價...)
  const isStandardHeader =
    tokens.length >= 4 &&
    tokens[0].length <= 10 &&
    /^\d+$/.test(tokens[1]) &&
    /^\d+$/.test(tokens[2]) &&
    /^\d+$/.test(tokens[3]);

  if (isStandardHeader) {
    recordedItemsCount = parseInt(tokens[1], 10);
    totalItemsCount = parseInt(tokens[2], 10);
    const items = parseInvoiceItemsFromTokens(tokens.slice(4));
    return { items, recordedItemsCount, totalItemsCount };
  }

  // 寬鬆容錯：相容其他廠商延伸表頭（前欄長度 <= 10 且第 1, 2 欄為有效整數）
  if (
    tokens.length >= 4 &&
    tokens[0].length <= 10 &&
    !isNaN(parseInt(tokens[1], 10)) &&
    !isNaN(parseInt(tokens[2], 10))
  ) {
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
  let raw = qrText.replace(/^\uFEFF/, '').trim();
  if (raw.startsWith('**')) {
    raw = raw.slice(2);
  } else if (raw.includes(':**')) {
    raw = raw.split(':**')[1];
  } else {
    const idx = raw.indexOf('**');
    if (idx !== -1) raw = raw.slice(idx + 2);
  }
  if (raw.startsWith(':')) {
    raw = raw.slice(1);
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

  const leftItems = (base.items || []).map(it => ({
    ...it,
    name: cleanInvoiceItemName(it.name),
  }));
  const rightItems = (other.items || []).map(it => ({
    ...it,
    name: cleanInvoiceItemName(it.name),
  }));
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
    .map(it => ({
      ...it,
      name: cleanInvoiceItemName(it.name),
    }))
    .filter(it => it.name && !/^\*+$/.test(it.name) && it.name !== '0')
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
  let year: number;
  let month: number;

  if (typeof dateInput === 'string') {
    // 優先以正規表達式直接擷取 YYYY 与 MM，免疫於任何時區偏差與 ISO 8601 "T/Z" 格式異常
    const match = dateInput.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
    } else {
      const d = new Date(dateInput);
      const valid = !isNaN(d.getTime());
      year = valid ? d.getFullYear() : new Date().getFullYear();
      month = valid ? d.getMonth() + 1 : new Date().getMonth() + 1;
    }
  } else if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    year = dateInput.getFullYear();
    month = dateInput.getMonth() + 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

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
  const raw = qrText.replace(/^\uFEFF/, '').trim();

  // 若使用者掃描了右方 QR Code (開頭包含 **，且非左碼發票開頭)
  const isRightCode =
    !/^[A-Za-z]{2}\d{8}/.test(raw) &&
    (raw.startsWith('**') || raw.startsWith(':**') || raw.includes('**'));

  if (isRightCode) {
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
        if (raw.includes('**')) {
          // 同一字串同時含有左右雙條碼 (相簿截圖或剪貼簿完整內容)
          const splitIdx = raw.indexOf('**');
          const leftPart = raw.slice(0, splitIdx);
          const rightPart = raw.slice(splitIdx);
          const leftTailRes = parseTaiwanInvoiceLeftQRCodeItems(leftPart);
          const rightItems = parseTaiwanInvoiceRightQRCode(rightPart);
          const combined = [...leftTailRes.items, ...rightItems];
          if (combined.length > 0) {
            items = combined;
            itemsNote = formatInvoiceItemsToNote(items);
          }
          recordedItemsCount = leftTailRes.recordedItemsCount;
          totalItemsCount = leftTailRes.totalItemsCount;
        } else {
          const leftTailRes = parseTaiwanInvoiceLeftQRCodeItems(raw);
          if (leftTailRes.items.length > 0) {
            items = leftTailRes.items;
            itemsNote = formatInvoiceItemsToNote(items);
          }
          recordedItemsCount = leftTailRes.recordedItemsCount;
          totalItemsCount = leftTailRes.totalItemsCount;
        }
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

