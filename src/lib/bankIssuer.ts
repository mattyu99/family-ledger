import { PaymentAccount } from '../types/database';

/**
 * 發卡銀行/機構詳細資訊介面
 */
export interface IssuerBankInfo {
  id: string; // 唯一英數識別碼，例如 'cathay'
  code?: string; // 銀行代碼 (3 碼)，例如 '013'
  name: string; // 標準機構完整名稱，例如 '國泰世華銀行'
  shortName: string; // 簡短中文名稱，例如 '國泰世華'
  aliases: string[]; // 常見關鍵字、別名與熱門卡別詞庫 (降冪匹配)
}

/**
 * 信用卡發卡機構歸戶群組介面
 */
export interface CreditCardIssuerGroup {
  key: string; // 唯一分組鍵：${userId}__${issuerId}__${billingCycleDate}
  issuer: IssuerBankInfo;
  userId?: string; // 所屬持卡人 ID
  billingCycleDate: number; // 歸戶結帳日 (每月 1~31 號)
  cards: PaymentAccount[]; // 此歸戶底下包含之所有信用卡清單
  isMultiCard: boolean; // 是否為同銀行多卡 (cards.length > 1)
  displayName: string; // 易讀標題，例如「國泰世華銀行 (2張卡)」
}

/**
 * 台灣主流發卡機構字典
 * 關鍵字長度愈長者排在愈前面，確保如「台北富邦」優先於「富邦」、「台灣企銀」優先於「台灣」
 */
export const TAIWAN_BANK_ISSUERS: IssuerBankInfo[] = [
  {
    id: 'cathay',
    code: '013',
    name: '國泰世華商業銀行',
    shortName: '國泰世華',
    aliases: ['國泰世華', '國泰', 'cathay', 'cube', 'koko', '013'],
  },
  {
    id: 'fubon',
    code: '012',
    name: '台北富邦商業銀行',
    shortName: '台北富邦',
    aliases: ['台北富邦', '富邦', 'fubon', 'costco', 'momo', 'j卡', '012'],
  },
  {
    id: 'ctbc',
    code: '822',
    name: '中國信託商業銀行',
    shortName: '中國信託',
    aliases: ['中國信託', '中信', 'ctbc', 'line pay', '英雄聯盟', '822'],
  },
  {
    id: 'taishin',
    code: '812',
    name: '台新國際商業銀行',
    shortName: '台新銀行',
    aliases: ['台新銀行', '台新', 'taishin', 'richart', 'gogo', '黑狗', 'flygo', '飛狗', '玫瑰', '812'],
  },
  {
    id: 'esun',
    code: '808',
    name: '玉山商業銀行',
    shortName: '玉山銀行',
    aliases: ['玉山銀行', '玉山', 'esun', 'e.sun', 'ubear', '熊本熊', 'pi 拍錢包', 'pi拍錢包', '808'],
  },
  {
    id: 'ubot',
    code: '803',
    name: '聯邦商業銀行',
    shortName: '聯邦銀行',
    aliases: ['聯邦商業銀行', '聯邦銀行', '聯邦', 'ubot', '賴點', '吉鶴', '幸福卡', '微風', '803'],
  },
  {
    id: 'sinopac',
    code: '807',
    name: '永豐商業銀行',
    shortName: '永豐銀行',
    aliases: ['永豐商業銀行', '永豐銀行', '永豐', 'sinopac', 'dawho', '大戶', 'sport', '幣倍', '807'],
  },
  {
    id: 'dbs',
    code: '810',
    name: '星展商業銀行',
    shortName: '星展銀行',
    aliases: ['星展商業銀行', '星展銀行', '星展', 'dbs', 'eco', '飛行卡', '饗樂', '810'],
  },
  {
    id: 'megabank',
    code: '017',
    name: '兆豐國際商業銀行',
    shortName: '兆豐銀行',
    aliases: ['兆豐國際商業銀行', '兆豐銀行', '兆豐', 'megabank', '利多', 'bt21', '017'],
  },
  {
    id: 'first',
    code: '007',
    name: '第一商業銀行',
    shortName: '第一銀行',
    aliases: ['第一商業銀行', '第一銀行', '一銀', 'ileo', '007'],
  },
  {
    id: 'hncb',
    code: '008',
    name: '華南商業銀行',
    shortName: '華南銀行',
    aliases: ['華南商業銀行', '華南銀行', '華南', 'hncb', 'sny', '008'],
  },
  {
    id: 'tcb',
    code: '006',
    name: '合作金庫商業銀行',
    shortName: '合作金庫',
    aliases: ['合作金庫商業銀行', '合作金庫', '合庫', 'tcb', '006'],
  },
  {
    id: 'chb',
    code: '009',
    name: '彰化商業銀行',
    shortName: '彰化銀行',
    aliases: ['彰化商業銀行', '彰化銀行', '彰銀', 'chb', 'my樂', '009'],
  },
  {
    id: 'landbank',
    code: '005',
    name: '臺灣土地銀行',
    shortName: '土地銀行',
    aliases: ['臺灣土地銀行', '台灣土地銀行', '土地銀行', '土銀', 'landbank', '005'],
  },
  {
    id: 'bot',
    code: '004',
    name: '臺灣銀行',
    shortName: '臺灣銀行',
    aliases: ['臺灣銀行', '台灣銀行', '臺銀', '台銀', 'bot', '004'],
  },
  {
    id: 'scsb',
    code: '011',
    name: '上海商業儲蓄銀行',
    shortName: '上海商銀',
    aliases: ['上海商業儲蓄銀行', '上海商銀', '上海銀行', 'scsb', '小小兵', '011'],
  },
  {
    id: 'feib',
    code: '805',
    name: '遠東國際商業銀行',
    shortName: '遠東商銀',
    aliases: ['遠東國際商業銀行', '遠東商銀', '遠東銀行', '遠東', 'feib', '樂家', '805'],
  },
  {
    id: 'yuanta',
    code: '806',
    name: '元大商業銀行',
    shortName: '元大銀行',
    aliases: ['元大商業銀行', '元大銀行', '元大', 'yuanta', '鑽金', '806'],
  },
  {
    id: 'hsbc',
    code: '081',
    name: '滙豐（台灣）商業銀行',
    shortName: '滙豐銀行',
    aliases: ['滙豐商業銀行', '滙豐銀行', '匯豐商業銀行', '匯豐銀行', '匯豐', '滙豐', 'hsbc', '旅人', '081'],
  },
  {
    id: 'scb',
    code: '052',
    name: '渣打國際商業銀行',
    shortName: '渣打銀行',
    aliases: ['渣打國際商業銀行', '渣打銀行', '渣打', 'standard chartered', 'scb', '052'],
  },
  {
    id: 'skbank',
    code: '103',
    name: '臺灣新光商業銀行',
    shortName: '新光銀行',
    aliases: ['臺灣新光商業銀行', '台灣新光商業銀行', '新光商業銀行', '新光銀行', '新光', 'skbank', '寰宇', '103'],
  },
  {
    id: 'rakuten',
    code: '951',
    name: '台灣樂天信用卡',
    shortName: '樂天信用卡',
    aliases: ['台灣樂天信用卡', '樂天信用卡', '樂天', 'rakuten', '桃猿', '951'],
  },
  {
    id: 'kgi',
    code: '809',
    name: '凱基商業銀行',
    shortName: '凱基銀行',
    aliases: ['凱基商業銀行', '凱基銀行', '凱基', 'kgi', '魔fun', '魔buy', '809'],
  },
  {
    id: 'entie',
    code: '816',
    name: '安泰商業銀行',
    shortName: '安泰銀行',
    aliases: ['安泰商業銀行', '安泰銀行', '安泰', 'entie', '816'],
  },
  {
    id: 'tbb',
    code: '050',
    name: '臺灣中小企業銀行',
    shortName: '臺灣企銀',
    aliases: ['臺灣中小企業銀行', '台灣中小企業銀行', '臺灣企銀', '台灣企銀', '台企銀', 'tbb', '050'],
  },
  {
    id: 'sunnybank',
    code: '108',
    name: '陽信商業銀行',
    shortName: '陽信銀行',
    aliases: ['陽信商業銀行', '陽信銀行', '陽信', 'sunnybank', '曜晶', '108'],
  },
  {
    id: 'tcbbank',
    code: '053',
    name: '台中商業銀行',
    shortName: '台中銀行',
    aliases: ['台中商業銀行', '台中銀行', '台中銀', '053'],
  },
  {
    id: 'bok',
    code: '016',
    name: '高雄銀行',
    shortName: '高雄銀行',
    aliases: ['高雄銀行', '高銀', '016'],
  },
  {
    id: 'amex',
    name: '美國運通',
    shortName: '美國運通',
    aliases: ['美國運通', '美運', 'amex', 'american express'],
  },
];

/**
 * 簡易 Slugify 工具，產生標準英數鍵值
 */
const toSimpleSlug = (str: string): string => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * 智慧辨識卡片之發卡銀行機構
 * @param cardName 卡片名稱（如 "國泰 CUBE 卡"、"富邦 Costco 卡"）
 * @param explicitIssuer 使用者手動設定之發卡機構名稱或代碼（選填，若有則優先採用）
 * @returns 命中之發卡機構資訊，若未命中則返回 null
 */
export const detectIssuerBank = (cardName?: string, explicitIssuer?: string): IssuerBankInfo | null => {
  // 1. 若有顯式指定發卡機構，優先以顯式值比對
  if (explicitIssuer && explicitIssuer.trim()) {
    const raw = explicitIssuer.trim();
    const lower = raw.toLowerCase();

    const matched = TAIWAN_BANK_ISSUERS.find(b =>
      b.id === lower ||
      b.code === raw ||
      b.name === raw ||
      b.shortName === raw ||
      b.aliases.some(a => a.toLowerCase() === lower)
    );

    if (matched) return matched;

    // 自訂非內建銀行
    return {
      id: `custom_${toSimpleSlug(raw) || 'bank'}`,
      name: raw,
      shortName: raw,
      aliases: [lower],
    };
  }

  // 2. 從卡片名稱進行自然語言提取
  if (!cardName || !cardName.trim()) return null;
  const lowerCardName = cardName.trim().toLowerCase();

  // 遍歷主流發卡銀行
  for (const bank of TAIWAN_BANK_ISSUERS) {
    for (const alias of bank.aliases) {
      if (lowerCardName.includes(alias.toLowerCase())) {
        return bank;
      }
    }
  }

  return null;
};

/**
 * 取得信用卡之唯一歸戶分組鍵 (Grouping Key)
 * 公式：`${持卡人 ID}__${發卡機構 ID}__${結帳日}`
 * 核心安全防護：
 * 1. 持卡人不同 -> 鍵值不同 -> 絕不跨人混淆
 * 2. 結帳日不同 -> 鍵值不同 -> 依帳單週期獨立處理
 */
export const getCardIssuerGroupKey = (card: PaymentAccount): string => {
  const issuer = detectIssuerBank(card.name, card.issuer_bank);
  const issuerKey = issuer ? issuer.id : `single_${card.id}`;
  const userKey = card.user_id && card.user_id.trim() ? card.user_id.trim() : 'unassigned';
  const cycleDay = card.billing_cycle_date || 15;
  return `${userKey}__${issuerKey}__${cycleDay}`;
};

/**
 * 將給定的支付帳戶清單依發卡機構歸戶分組
 * @param cards 支付帳戶清單（自動過濾出 credit_card 類型）
 * @returns 歸戶群組清單
 */
export const groupCreditCardsByIssuer = (cards: PaymentAccount[]): CreditCardIssuerGroup[] => {
  const creditCards = cards.filter(c => c.type === 'credit_card');
  const groupMap = new Map<string, CreditCardIssuerGroup>();

  creditCards.forEach(card => {
    const key = getCardIssuerGroupKey(card);
    const existing = groupMap.get(key);
    const issuer = detectIssuerBank(card.name, card.issuer_bank) || {
      id: `single_${card.id}`,
      name: card.name,
      shortName: card.name,
      aliases: [],
    };
    const cycleDay = card.billing_cycle_date || 15;

    if (existing) {
      existing.cards.push(card);
      existing.isMultiCard = true;
      existing.displayName = `${existing.issuer.shortName} (${existing.cards.length}張卡)`;
    } else {
      groupMap.set(key, {
        key,
        issuer,
        userId: card.user_id,
        billingCycleDate: cycleDay,
        cards: [card],
        isMultiCard: false,
        displayName: `${issuer.shortName} (1張卡)`,
      });
    }
  });

  return Array.from(groupMap.values());
};

/**
 * 查詢特定卡片所屬的發卡機構歸戶群組
 */
export const findIssuerGroupForCard = (
  cardId: string,
  cards: PaymentAccount[]
): CreditCardIssuerGroup | null => {
  const groups = groupCreditCardsByIssuer(cards);
  return groups.find(g => g.cards.some(c => c.id === cardId)) || null;
};

/**
 * 取得與指定卡片同屬一個歸戶群組之所有卡片 ID 清單（包含自己）
 * 用於多卡聯合帳單鏡射查詢與合併對帳
 */
export const getSiblingCardIdsInGroup = (
  cardId: string,
  cards: PaymentAccount[]
): string[] => {
  const group = findIssuerGroupForCard(cardId, cards);
  if (!group) return [cardId];
  return group.cards.map(c => c.id);
};
