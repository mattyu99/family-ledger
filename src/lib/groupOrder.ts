/**
 * 家庭點餐開團與生活許願池 (Group Order & Wishlist) 工具庫
 * 支援多人追加式點餐、手搖飲/便當/宵夜規格解析、自動統計杯數與金額、免衝突登記
 */

import { parseMemoItemReplies, MemoItemReply } from './memo';

export interface GroupOrderItem {
  rawLine: string;
  lineIndex: number;
  memberName: string;
  itemName: string;
  specs: string;
  price: number;
  isDone: boolean;
  replies?: MemoItemReply[];
}

export type CollaborativeOrderMode = 'food' | 'grocery' | 'parcel' | 'chore' | 'vote';

export interface VoteOptionSummary {
  rawLine: string;
  lineIndex: number;
  title: string;
  voters: string[];
  voteCount: number;
  isDecided: boolean;
  percentage: number;
  replies?: MemoItemReply[];
}

export interface MemberEarningSummary {
  memberName: string;
  totalAmount: number;
  completedCount: number;
  totalCount: number;
  completedItems: string[];
}

export interface PendingRestockItem {
  memoId: string;
  memoTitle: string;
  lineIndex: number;
  rawText: string;
  memberName: string;
  itemName: string;
  specs: string;
  price: number;
}

export interface OrderDeadlineInfo {
  hasDeadline: boolean;
  rawText: string;
  targetDate: Date | null;
  isExpired: boolean;
  remainingMinutes: number;
  badgeText: string;
  badgeColorType: 'normal' | 'urgent' | 'expired';
}

export interface GroupOrderSummary {
  isGroupOrder: boolean;
  mode: CollaborativeOrderMode;
  storeName: string;
  totalCount: number;
  completedCount: number;
  totalAmount: number;
  hasAmount: boolean;
  items: GroupOrderItem[];
  memberEarnings: MemberEarningSummary[];
  voteOptions?: VoteOptionSummary[];
  totalVotes?: number;
  leadingOption?: VoteOptionSummary;
  deadlineInfo?: OrderDeadlineInfo;
}

export interface StoreFavoriteItem {
  itemName: string;
  specs: string;
  price: number;
  count: number;
  memberName?: string;
}

export interface StoreFamilyFavorites {
  memberFavorites: StoreFavoriteItem[];
  familyTopFavorites: StoreFavoriteItem[];
}

/**
 * 判斷協同模式：家務懸賞 (chore)、網購包裹 (parcel)、賣場採買 (grocery) 或 餐飲開團 (food)
 */
export function detectCollaborativeOrderMode(title?: string, content?: string): CollaborativeOrderMode {
  const t = (title || '').toLowerCase();
  const c = (content || '').toLowerCase();
  const text = `${t}\n${c}`;

  const voteKeywords = [
    '🗳️ 家庭投票', '🗳️ 投票', '【投票】', '[投票]', '【決策】', '[決策]',
    '家庭投票', '投票看板', '投票決策', '吃什麼投票', '去哪玩投票', '大家投票',
    '投票', '決策',
  ];
  if (voteKeywords.some(kw => text.includes(kw))) {
    return 'vote';
  }

  const choreKeywords = [
    '🧹 家庭家務', '🧹 家事懸賞', '🧹 家事', '🧹 大掃除', '🧹 打掃', '🧹 清潔',
    '【家事】', '【懸賞】', '【大掃除】', '【任務】', '【打掃】', '【清潔】', '【分工】',
    '[家事]', '[懸賞]', '[大掃除]', '[任務]', '[打掃]', '[清潔]', '[分工]',
    '家庭家務', '家事懸賞', '週末家事', '大掃除', '家事分工', '任務懸賞', '打掃清單', '清潔分工', '零用錢任務', '跑腿任務',
    '家庭分工', '分工清單', '家事', '大掃除', '打掃', '清潔', '懸賞',
  ];
  if (choreKeywords.some(kw => text.includes(kw))) {
    return 'chore';
  }

  const parcelKeywords = [
    '📦 網購湊單', '📦 包裹代領', '📦 網購', '📦 包裹', '📦 取貨', '📦 湊免運',
    '【網購】', '【湊單】', '【湊免運】', '【包裹】', '【取貨】', '【代領】',
    '[網購]', '[湊單]', '[湊免運]', '[包裹]', '[取貨]', '[代領]',
    '網購湊單', '湊免運', '包裹代領', '超商取貨', '待領包裹', '取貨清單',
    '領包裹', '取包裹', '拿包裹', '代領包裹', '超商代領', '超商取貨',
    '蝦皮', 'shopee', '酷澎', 'coupang', 'momo', 'pchome', '淘寶', '店到店',
  ];
  if (parcelKeywords.some(kw => text.includes(kw))) {
    return 'parcel';
  }

  const groceryKeywords = [
    '🛒 採買清單', '🛒 補貨清單', '🛒 採買', '🛒 補貨',
    '【採買】', '【補貨】', '[採買]', '[補貨]',
    '【我要買】', '[我要買]', '【+我要買】', '[+我要買]',
    '我要買', '+我要買', '＋我要買', '追加補貨', '採買補貨',
    '賣場：', '賣場:', '超市：', '超市:',
    '採買清單', '補貨清單', '賣場採買', '超市採買',
    '好市多', 'costco', '全聯', '家樂福', '大潤發', '愛買', '美廉社',
    '超市生活採買', '超市採買', '市場採買',
  ];
  if (groceryKeywords.some(kw => text.includes(kw))) {
    return 'grocery';
  }
  return 'food';
}

/**
 * 判斷一則生活記事是否為「點餐開團／採買補貨／網購包裹／家事分工看板」
 */
export function isGroupOrderMemo(title?: string, content?: string): boolean {
  const t = (title || '').trim().toLowerCase();
  const c = (content || '').trim().toLowerCase();
  const combined = `${t}\n${c}`;

  // 1. 嚴格防呆排除非開團/非採買之生活清單 (含日常常駐「家中缺貨隨手記」)
  if (isRestockPoolMemo(t, c)) {
    return false;
  }
  const nonOrderExcludes = [
    '回診', '慢箋', '慢籤', '就醫', '門診', '掛號', '看診', '健保',
    '出國', '行李', '露營', '拜拜', '祭祀', '打疫苗', '修繕',
    '生活記事與待辦', '待辦清單', '作業', '考試',
  ];
  if (nonOrderExcludes.some(ex => t.includes(ex) || c.includes(ex))) {
    return false;
  }

  // 2. 強烈明確標籤優先命中 (餐飲開團 + 賣場採買 + 網購湊單/包裹 + 家事懸賞)
  const strongKeywords = [
    '【點餐】', '【開團】', '【許願】', '【外帶】',
    '[點餐]', '[開團]', '[許願]',
    '🧋 點餐開團', '🧋 點餐', '🧋 開團',
    '點餐開團', '點餐許願',
    '🛒 採買清單', '🛒 補貨清單', '🛒 採買', '🛒 補貨',
    '【採買】', '【補貨】', '[採買]', '[補貨]',
    '【我要買】', '[我要買]', '【+我要買】', '[+我要買]',
    '我要買', '+我要買', '＋我要買', '追加補貨', '採買補貨',
    '賣場：', '賣場:', '超市：', '超市:', '超商：', '超商:', '店家：', '店家:', '平台：', '平台:',
    '📦 網購湊單', '📦 包裹代領', '📦 網購', '📦 包裹', '📦 取貨', '📦 湊免運',
    '【網購】', '【湊單】', '【湊免運】', '【包裹】', '【取貨】', '【代領】',
    '[網購]', '[湊單]', '[湊免運]', '[包裹]', '[取貨]', '[代領]',
    '網購湊單', '包裹代領', '湊免運',
    '🧹 家庭家務', '🧹 家事懸賞', '🧹 家事', '🧹 大掃除', '🧹 打掃', '🧹 清潔',
    '【家事】', '【懸賞】', '【大掃除】', '【任務】', '【打掃】', '【清潔】', '【分工】',
    '[家事]', '[懸賞]', '[大掃除]', '[任務]', '[打掃]', '[清潔]', '[分工]',
    '家庭家務', '家事懸賞', '週末家事', '大掃除', '家事分工', '任務懸賞', '打掃清單', '清潔分工', '零用錢任務', '跑腿任務',
    '🗳️ 家庭投票', '🗳️ 投票',
    '【投票】', '[投票]', '【決策】', '[決策]',
    '家庭投票', '投票看板', '投票決策',
  ];
  for (const kw of strongKeywords) {
    if (combined.includes(kw.toLowerCase())) return true;
  }

  // 3. 一般日常生活記事嚴格防呆：若標題只是一般備忘名詞且無上述明確開團標籤，絕不因內文待辦隨口提到超商/賣場而誤判
  const genericMemoTitles = [
    '生活記事', '生活備忘', '日常備忘', '日常記事', '個人備忘', '個人記事', '隨手記', '隨手筆記', '代辦提醒', '待辦事項', '待辦清單', '備忘錄',
  ];
  if (genericMemoTitles.some(gt => t.includes(gt))) {
    return false;
  }

  // 4. 標題語意關鍵字組合 (必須出現在標題中)
  const titleKeywords = [
    '點餐', '開團', '許願池', '手搖飲', '手搖杯', '買飲料',
    '飲料團', '便當團', '宵夜團', '下午茶團', '鹹酥雞團', '外帶便當',
    '訂飲料', '訂便當', '團購',
    '採買清單', '補貨清單', '超市採買', '賣場採買', '我要買', '+我要買', '＋我要買', '買菜', '補貨',
    '好市多', 'costco', '全聯', '家樂福', '大潤發', '愛買', '美廉社',
    '網購', '湊單', '湊免運', '包裹', '取貨', '代領', '店到店',
    '蝦皮', 'shopee', '酷澎', 'coupang', 'momo', 'pchome', '淘寶',
    '家務', '家事', '大掃除', '打掃', '清潔', '懸賞', '分工', '跑腿',
    '投票', '決策',
  ];

  if (titleKeywords.some(kw => t.includes(kw))) {
    return true;
  }

  // 5. 若無明確標題，僅當內文非待辦行之首行主題明确為賣場/電商，且含有待辦清單時才判定 (絕不在待辦子項目中泛搜)
  const firstLine = (c.split('\n')[0] || '').trim();
  const isFirstLineChecklist = /^[-*]?\s*\[([ xX✓])\]/.test(firstLine);
  if (!isFirstLineChecklist && firstLine) {
    const shoppingPlaces = [
      '好市多', 'costco', '全聯', '家樂福', '大潤發', '愛買', '美廉社',
      '酷澎', 'coupang', '蝦皮', 'shopee', 'momo', 'pchome', '淘寶',
      '7-11', '711', '全家取貨', '全家包裹',
    ];
    if (shoppingPlaces.some(place => firstLine.includes(place))) {
      const hasChecklist = /^[-*]?\s*\[([ xX✓])\]/m.test(c);
      if (hasChecklist) return true;
    }
  }

  return false;
}

/**
 * 從開團/採買/網購/家事記事內容或標題中智慧推測店家/賣場/平台/任務名稱
 */
export function extractStoreNameFromMemo(title?: string, content?: string): string {
  const text = `${title || ''}\n${content || ''}`;
  const lowerText = text.toLowerCase();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 優先 1: 逐行掃描明確店家/賣場/平台/任務前綴 (最高精準度，如 店家：鮮堡漢堡, 超商：蝦皮/7-11)
  for (const line of lines) {
    const m1 = line.match(/(?:店家|店名|餐廳|飲料店|賣場|超市|平台|電商|超商|通路|任務|項目|主題)[：:\s]+([^（\(\n]+)/i);
    if (m1 && m1[1]) {
      const clean = m1[1].replace(/(?:可換店名|請填|大家).*$/, '').trim();
      if (clean) return clean;
    }
  }

  // 優先 2: 逐行掃描括弧標題 (形式 2，如 【點餐：50嵐】)
  for (const line of lines) {
    const m2 = line.match(/【(?:點餐|開團|許願|採買|補貨|網購|湊單|湊免運|包裹|取貨|代領|家事|家務|大掃除|懸賞|任務|分工|投票|決策)[：:\s]*([^】]+)】/);
    if (m2 && m2[1]) {
      const clean = m2[1].replace(/今天|大家|想喝|請填/g, '').trim();
      if (clean) return clean;
    }
  }

  // 優先 3: 全文快速識別知名連鎖店、賣場、電商平台與超商關鍵字
  if (text.includes('好市多') || lowerText.includes('costco')) return '好市多';
  if (text.includes('全聯')) return '全聯';
  if (text.includes('家樂福')) return '家樂福';
  if (text.includes('大潤發')) return '大潤發';
  if (text.includes('愛買')) return '愛買';
  if (text.includes('美廉社')) return '美廉社';
  if (text.includes('酷澎') || lowerText.includes('coupang')) return '酷澎';
  if (text.includes('蝦皮店到店')) return '蝦皮店到店';
  if (text.includes('蝦皮') || lowerText.includes('shopee')) return '蝦皮';
  if (lowerText.includes('momo')) return 'momo';
  if (lowerText.includes('pchome')) return 'PChome';
  if (text.includes('淘寶')) return '淘寶';
  if (text.includes('7-11') || text.includes('711') || text.includes('統一超商')) return '7-11';
  if (text.includes('全家取貨') || text.includes('全家包裹') || text.includes('全家店到店')) return '全家';
  if (text.includes('50嵐')) return '50嵐';
  if (text.includes('清心福全') || text.includes('清心')) return '清心';
  if (text.includes('麻古茶坊') || text.includes('麻古')) return '麻古';
  if (text.includes('可不可')) return '可不可';
  if (text.includes('迷客夏')) return '迷客夏';
  if (text.includes('得正')) return '得正';
  if (text.includes('五桐號')) return '五桐號';
  if (text.includes('麥當勞')) return '麥當勞';
  if (text.includes('肯德基')) return '肯德基';
  if (text.includes('摩斯')) return '摩斯漢堡';
  if (text.includes('八方雲集') || text.includes('八方')) return '八方雲集';
  if (text.includes('鼎泰豐')) return '鼎泰豐';

  // 優先 4: 做/幫/喝/買/吃/去 + 任務/店名 (形式 3，嚴格排除清單、項目等生活詞彙)
  const excludeWords = [
    '東西', '日常', '生活', '食材', '清單', '項目', '待辦',
    '便當', '飲料', '手搖', '餐點', '午餐', '晚餐', '早餐', '下午茶', '宵夜'
  ];
  for (const line of lines) {
    const m3 = line.match(/(?:做|幫|喝|買|吃|去)\s*([A-Za-z0-9\u4e00-\u9fa5]{2,10})/);
    if (m3 && m3[1]) {
      const candidate = m3[1].trim();
      if (!excludeWords.includes(candidate)) {
        return candidate;
      }
    }
  }

  const mode = detectCollaborativeOrderMode(title, content);
  if (mode === 'vote') return '家庭決策';
  if (mode === 'chore') return '家庭任務';
  if (mode === 'parcel') return '網購包裹';
  if (mode === 'grocery') return '採買賣場';
  return '點餐店家';
}

/**
 * 從 Markdown 待辦行中解析投票候選項目與投票人名單
 * 支援格式：
 * - [ ] 鼎泰豐（智爸、瑩媽、洋洋 +3）
 * - [x] 藏壽司（洋洋、翔翔 +2）
 * - [ ] 碳佐麻里（智爸 +1）
 * - [ ] 義大利麵
 */
export function parseVoteOptionLine(line: string, lineIndex: number = 0): VoteOptionSummary | null {
  const trimmed = line.trim();
  const checkMatch = trimmed.match(/^[-*]?\s*\[([ xX✓])\]\s*(.+)$/);
  if (!checkMatch) return null;

  const isDecided = checkMatch[1].toLowerCase() === 'x' || checkMatch[1] === '✓';
  const body = checkMatch[2].trim();

  // 排除提示說明行
  if (
    body.includes('大家直接在下方點') ||
    body.includes('投票說明') ||
    body.includes('備註') ||
    body.includes('點此填寫')
  ) {
    return null;
  }

  let cur = body;
  const allTokens: string[] = [];
  const allReplies: MemoItemReply[] = [];
  let explicitCount = 0;

  const isRightParen = (c: string) => c === ')' || c === '）';
  const isLeftParen = (c: string) => c === '(' || c === '（';

  // 智慧括號深度解析 + 歷史重複髒資料自癒 (支援巢狀括號、子項目留言回覆與人名累加)
  while (cur.length > 0) {
    const lastChar = cur.slice(-1);
    if (!isRightParen(lastChar)) break;

    let depth = 0;
    let openIdx = -1;
    for (let i = cur.length - 1; i >= 0; i--) {
      const char = cur[i];
      if (isRightParen(char)) {
        depth++;
      } else if (isLeftParen(char)) {
        depth--;
        if (depth === 0) {
          openIdx = i;
          break;
        }
      }
    }

    if (openIdx !== -1) {
      const inner = cur.slice(openIdx + 1, cur.length - 1).trim();

      // 1. 檢查是否為子項目留言回覆 (如 "智爸：怎麼沒有人選..." 或 "瑩媽: +1；洋洋: 想吃這個")
      const parsedReplies = parseMemoItemReplies(`方案（${inner}）`);
      if (parsedReplies.replies.length > 0) {
        allReplies.unshift(...parsedReplies.replies);
        cur = cur.slice(0, openIdx).trim();
        continue;
      }

      // 2. 檢查是否具有投票標籤特徵 (+N 或 N票 或 人名)
      if (/(?:\+|\b)\d+\s*(?:票)?/.test(inner) || inner.includes('票') || inner.includes('+')) {
        const countMatch = inner.match(/(?:\+)?(\d+)\s*(?:票)?$/) || inner.match(/(?:\+)?(\d+)\s*(?:票)?/);
        if (countMatch) {
          explicitCount = Math.max(explicitCount, parseInt(countMatch[1], 10) || 0);
        }
        const namePart = inner.replace(/(?:\+)?\d+\s*(?:票)?$/g, '').trim();
        const tokens = namePart.split(/[、,，]+/).map(s => s.trim()).filter(Boolean);
        allTokens.push(...tokens);
        cur = cur.slice(0, openIdx).trim();
        // 繼續檢查前面是否還有重複疊加的髒標籤，直到 title 純淨為止
        continue;
      }
    }
    break;
  }

  // 人名去重複
  const voters = Array.from(new Set(allTokens));
  const voteCount = Math.max(explicitCount, voters.length);

  return {
    rawLine: line,
    lineIndex,
    title: cur || body,
    voters,
    voteCount,
    isDecided,
    percentage: 0,
    replies: allReplies.length > 0 ? allReplies : undefined,
  };
}

/**
 * 解析單行點餐待辦項目
 * 支援格式：
 * - [ ] 瑩媽：波霸紅茶拿鐵（微糖微冰）$60
 * - [ ] 洋洋: 排骨便當 (加飯不要辣) 110元
 * - [x] 智爸 - 烏龍綠茶 $35
 * - - [ ] 豆豆：甜不辣 (小辣加蒜)
 */
export function parseGroupOrderItemLine(line: string, lineIndex: number = 0): GroupOrderItem | null {
  const trimmed = line.trim();
  // 必須符合 Markdown 待辦格式
  const checkMatch = trimmed.match(/^[-*]?\s*\[([ xX✓])\]\s*(.+)$/);
  if (!checkMatch) return null;

  const isDone = checkMatch[1].toLowerCase() === 'x' || checkMatch[1] === '✓';
  let body = checkMatch[2].trim();

  // 排除非點餐的引導與說明行 (例如舊記事中的 "- [ ] 店家：50嵐"、"- [ ] 大家直接在下方點...")
  if (
    /^(?:店家|店名|餐廳|飲料店|賣場|超市|平台|電商|超商|通路)[：:\s]/i.test(body) ||
    /^(?:大家|請大家|點此|菜單|說明|備註)[：:\s]*/i.test(body) ||
    body.includes('快速報單') ||
    body.includes('登記品項') ||
    body.includes('可換店名') ||
    body.includes('大家快填') ||
    body.includes('點此填寫') ||
    body.includes('我也要') ||
    body.includes('加湊') ||
    body.includes('代領') ||
    body.includes('末三碼！')
  ) {
    return null;
  }

  // 0. 優先剝離成員留言回覆 (例如 （智爸：賣完了）、（智爸：各一份嗎？），避免與客製規格 specs 或結尾金額混淆)
  const parsedReplies = parseMemoItemReplies(body);
  const replies = parsedReplies.replies;
  body = parsedReplies.cleanText;

  // 1. 提取結尾金額 (例如 $60, 60元, $ 110)
  let price = 0;
  const priceMatch = body.match(/[\$|\$]?\s*(\d+)\s*(?:元)?\s*$/);
  if (priceMatch) {
    price = parseInt(priceMatch[1], 10) || 0;
    body = body.slice(0, priceMatch.index).trim();
  }

  // 2. 提取規格 (括號內的內容，支援半形 () 與全形 （）)
  let specs = '';
  const specsMatch = body.match(/[\(（]([^\)）]+)[\)）]\s*$/);
  if (specsMatch) {
    specs = specsMatch[1].trim();
    body = body.slice(0, specsMatch.index).trim();
  }

  // 3. 提取成員稱謂與品項名稱 (例如 "瑩媽：波霸紅茶拿鐵" 或 "智爸 - 烏龍綠")
  let memberName = '';
  let itemName = body;

  const sepMatch = body.match(/^([^：:\-—]+)[：:\-—]\s*(.+)$/);
  if (sepMatch) {
    const candidateName = sepMatch[1].trim();
    // 避免將一般分類或序號誤認為人名
    if (candidateName.length <= 10 && !candidateName.includes('店家') && !candidateName.includes('備註')) {
      memberName = candidateName;
      itemName = sepMatch[2].trim();
    }
  }

  // 如果找不到成員，整段作為品項名稱
  if (!itemName) itemName = body;

  return {
    rawLine: line,
    lineIndex,
    memberName,
    itemName,
    specs,
    price,
    isDone,
    replies: replies.length > 0 ? replies : undefined,
  };
}

/**
 * 解析開團或投票的截止時間資訊
 */
export function extractOrderDeadline(
  noteText: string = '',
  baseDateInput?: string | Date,
  nowInput?: Date
): OrderDeadlineInfo {
  const defaultRes: OrderDeadlineInfo = {
    hasDeadline: false,
    rawText: '',
    targetDate: null,
    isExpired: false,
    remainingMinutes: 0,
    badgeText: '',
    badgeColorType: 'normal',
  };

  if (!noteText) return defaultRes;

  const now = nowInput || new Date();
  let baseDate = new Date();
  if (baseDateInput) {
    const parsedBase = new Date(baseDateInput);
    if (!isNaN(parsedBase.getTime())) {
      baseDate = parsedBase;
    }
  }

  // 1. 優先檢查中繼標籤 [dl:YYYY-MM-DDTHH:mm:ss] 或 [dl:HH:mm]
  const tagMatch = noteText.match(/\[dl:([^\]]+)\]/i);
  let timeStr = '';
  let fullIsoDate: Date | null = null;

  if (tagMatch) {
    const val = tagMatch[1].trim();
    if (val.includes('T') || val.includes('-')) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        fullIsoDate = d;
        timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    } else {
      timeStr = val;
    }
  }

  // 2. 正則表達式掃描內文中的日常繁體中文語法
  // 例如：截止時間：11:30、截止：12:00、11:30 截止、12:00 前收單、下午 5:30 截止
  if (!timeStr) {
    const lines = noteText.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('- [') || line.trim().startsWith('* [')) continue;

      // 格式一：截止時間：11:30、截止：12:00、收單：18:00
      const m1 = line.match(/(?:截止(?:時間)?|收單(?:時間)?|結單(?:時間)?)\s*[:：]?\s*([0-2]?[0-9][:：][0-5][0-9]|(?:上午|下午|中午|晚上)?\s*[0-2]?[0-9]\s*(?:點|時)(?:\s*[0-5]?[0-9]\s*分?)?)/i);
      if (m1) {
        timeStr = m1[1].trim();
        break;
      }
      // 格式二：11:30 截止、12:00 前收單、下午 5:30 結單
      const m2 = line.match(/([0-2]?[0-9][:：][0-5][0-9]|(?:上午|下午|中午|晚上)?\s*[0-2]?[0-9]\s*(?:點|時)(?:\s*[0-5]?[0-9]\s*分?)?)\s*(?:截止|收單|結單|前(?:截止|收單)?)/i);
      if (m2) {
        timeStr = m2[1].trim();
        break;
      }
    }
  }

  if (!timeStr && !fullIsoDate) {
    return defaultRes;
  }

  let targetDate: Date;
  if (fullIsoDate) {
    targetDate = fullIsoDate;
  } else {
    let hours = 0;
    let minutes = 0;
    const colonMatch = timeStr.match(/^([0-2]?[0-9])[:：]([0-5][0-9])$/);
    if (colonMatch) {
      hours = parseInt(colonMatch[1], 10);
      minutes = parseInt(colonMatch[2], 10);
    } else {
      const zhMatch = timeStr.match(/(上午|下午|中午|晚上)?\s*([0-2]?[0-9])\s*(?:點|時)(?:\s*([0-5]?[0-9])\s*分?)?/);
      if (zhMatch) {
        const period = zhMatch[1] || '';
        hours = parseInt(zhMatch[2], 10);
        minutes = zhMatch[3] ? parseInt(zhMatch[3], 10) : 0;
        if ((period === '下午' || period === '晚上') && hours < 12) {
          hours += 12;
        }
      } else {
        return defaultRes;
      }
    }

    targetDate = new Date(baseDate.getTime());
    targetDate.setHours(hours, minutes, 0, 0);

    // 智慧跨日判斷：若 targetDate 比發起時間還早超過 4 小時，且 hours < 12，可能是下午（如下午 2 點寫成 2:30）
    if (targetDate.getTime() < baseDate.getTime() - 4 * 3600000 && hours < 12) {
      targetDate.setHours(hours + 12, minutes, 0, 0);
    }
  }

  const diffMs = targetDate.getTime() - now.getTime();
  const remainingMinutes = Math.floor(diffMs / 60000);
  const isExpired = diffMs <= 0;
  const formattedTime = `${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}`;

  let badgeText = '';
  let badgeColorType: 'normal' | 'urgent' | 'expired' = 'normal';

  if (isExpired) {
    badgeText = `🔒 已截止收單 (${formattedTime})`;
    badgeColorType = 'expired';
  } else if (remainingMinutes <= 10) {
    badgeText = `🔥 剩 ${remainingMinutes <= 0 ? 1 : remainingMinutes} 分鐘！即將截止`;
    badgeColorType = 'urgent';
  } else {
    const hoursPart = Math.floor(remainingMinutes / 60);
    const minsPart = remainingMinutes % 60;
    const remainStr = hoursPart > 0 ? `${hoursPart}小時${minsPart > 0 ? `${minsPart}分` : ''}` : `${minsPart}分`;
    badgeText = `⏰ ${formattedTime} 截止 (剩 ${remainStr})`;
    badgeColorType = 'normal';
  }

  return {
    hasDeadline: true,
    rawText: formattedTime,
    targetDate,
    isExpired,
    remainingMinutes: Math.max(0, remainingMinutes),
    badgeText,
    badgeColorType,
  };
}

/**
 * 延長開團或投票的截止時間（例如延長 15 分鐘、30 分鐘）
 */
export function extendOrderDeadline(
  noteText: string = '',
  addMinutes: number = 15,
  baseDate?: string | Date,
  nowOverride?: Date
): string {
  const now = nowOverride || new Date();
  const currentDeadline = extractOrderDeadline(noteText, baseDate, now);
  const baseTarget = (currentDeadline.hasDeadline && currentDeadline.targetDate && currentDeadline.targetDate.getTime() > now.getTime())
    ? new Date(currentDeadline.targetDate.getTime())
    : new Date(now.getTime());

  baseTarget.setMinutes(baseTarget.getMinutes() + addMinutes);
  const newH = String(baseTarget.getHours()).padStart(2, '0');
  const newM = String(baseTarget.getMinutes()).padStart(2, '0');
  const newDeadlineStr = `截止時間：${newH}:${newM}`;

  if (currentDeadline.hasDeadline) {
    const lines = noteText.split('\n');
    let replaced = false;
    const newLines = lines.map(line => {
      if (!replaced && !line.trim().startsWith('- [') && /(?:截止|收單|結單)/i.test(line)) {
        replaced = true;
        return line.replace(/(?:(?:截止(?:時間)?|收單(?:時間)?)\s*[:：]?\s*[0-2]?[0-9][:：][0-5][0-9]|(?:[0-2]?[0-9][:：][0-5][0-9])\s*(?:截止|收單|結單))/i, newDeadlineStr);
      }
      return line;
    });
    if (replaced) return newLines.join('\n');
  }

  return setOrderDeadlineInNote(noteText, `${newH}:${newM}`);
}

/**
 * 在記事內文中設定或更新截止時間字串 (例如 "12:00")
 * 若傳入空字串或調用 remove，則自動移除現有的截止時間行
 */
export function removeOrderDeadlineFromNote(noteText: string = ''): string {
  return noteText
    .split('\n')
    .filter(line => line.trim().startsWith('- [') || !/(?:截止|收單|結單)/i.test(line))
    .join('\n');
}

export function setOrderDeadlineInNote(noteText: string = '', timeStr: string): string {
  const cleanTime = timeStr.trim();
  if (!cleanTime) {
    return removeOrderDeadlineFromNote(noteText);
  }
  const deadlineLine = `截止時間：${cleanTime}`;

  const lines = noteText.split('\n');
  let replaced = false;
  const newLines = lines.map(line => {
    if (!replaced && !line.trim().startsWith('- [') && /(?:截止|收單|結單)/i.test(line)) {
      replaced = true;
      return deadlineLine;
    }
    return line;
  });

  if (replaced) return newLines.join('\n');

  if (lines.length > 0) {
    const firstLine = lines[0];
    if (firstLine.startsWith('[') && firstLine.includes(']')) {
      return [firstLine, deadlineLine, ...lines.slice(1)].join('\n');
    }
  }
  return [deadlineLine, noteText].join('\n');
}

/**
 * 完整計算開團記事的統計摘要
 */
export function computeGroupOrderSummary(
  content: string = '',
  title?: string,
  transactedAt?: string
): GroupOrderSummary {
  const isOrder = isGroupOrderMemo(title, content);
  const storeName = extractStoreNameFromMemo(title, content);

  const lines = content.split('\n');
  const items: GroupOrderItem[] = [];
  let totalAmount = 0;
  let hasAmount = false;
  let checklistItemIndex = 0;

  lines.forEach((line) => {
    const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim());
    const currentIndex = checklistItemIndex;
    if (isChecklist) {
      checklistItemIndex++;
    }

    const item = parseGroupOrderItemLine(line, currentIndex);
    if (item && item.itemName) {
      items.push(item);
      if (item.price > 0) {
        totalAmount += item.price;
        hasAmount = true;
      }
    }
  });

  const totalCount = items.length;
  const completedCount = items.filter(i => i.isDone).length;
  const mode = detectCollaborativeOrderMode(title, content);

  // 依成員統計各自完成之項數、金額與工作項目 (家事分工 / 零用錢懸賞模式專用)
  const memberEarningsMap = new Map<string, MemberEarningSummary>();
  items.forEach((item) => {
    if (item.memberName) {
      const key = item.memberName.trim();
      let record = memberEarningsMap.get(key);
      if (!record) {
        record = {
          memberName: key,
          totalAmount: 0,
          completedCount: 0,
          totalCount: 0,
          completedItems: [],
        };
        memberEarningsMap.set(key, record);
      }
      record.totalCount++;
      if (item.isDone) {
        record.completedCount++;
        record.completedItems.push(item.itemName);
        if (item.price > 0) {
          record.totalAmount += item.price;
        }
      }
    }
  });
  const memberEarnings = Array.from(memberEarningsMap.values());

  // 若為家事懸賞模式，金額代表實際已完成且有認領者之總發放零用錢獎勵
  if (mode === 'chore') {
    totalAmount = memberEarnings.reduce((acc, m) => acc + m.totalAmount, 0);
    hasAmount = totalAmount > 0;
  }

  // 依投票模式統計各候選項目與總票數
  const voteOptions: VoteOptionSummary[] = [];
  let totalVotes = 0;
  let leadingOption: VoteOptionSummary | undefined;

  if (mode === 'vote') {
    let voteItemIndex = 0;
    lines.forEach((line) => {
      const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim());
      const curIdx = voteItemIndex;
      if (isChecklist) {
        voteItemIndex++;
      }
      const opt = parseVoteOptionLine(line, curIdx);
      if (opt && opt.title) {
        voteOptions.push(opt);
        totalVotes += opt.voteCount;
      }
    });

    // 計算得票百分比
    voteOptions.forEach((opt) => {
      opt.percentage = totalVotes > 0 ? Math.round((opt.voteCount / totalVotes) * 100) : 0;
    });

    // 依票數降冪尋找當前領先項目
    if (voteOptions.length > 0) {
      const sorted = [...voteOptions].sort((a, b) => b.voteCount - a.voteCount);
      leadingOption = sorted[0];
    }
  }

  const deadlineInfo = extractOrderDeadline(content, transactedAt);

  return {
    isGroupOrder: isOrder,
    mode,
    storeName,
    totalCount: mode === 'vote' ? voteOptions.length : totalCount,
    completedCount: mode === 'vote' ? voteOptions.filter(o => o.isDecided).length : completedCount,
    totalAmount,
    hasAmount,
    items,
    memberEarnings,
    voteOptions: mode === 'vote' ? voteOptions : undefined,
    totalVotes: mode === 'vote' ? totalVotes : undefined,
    leadingOption: mode === 'vote' ? leadingOption : undefined,
    deadlineInfo: deadlineInfo.hasDeadline ? deadlineInfo : undefined,
  };
}

/**
 * 為指定候選項目投下一票或撤回投票 (支援多選累加與即時更新)
 */
export function toggleGroupOrderVote(
  content: string = '',
  targetLineIndex: number,
  voterName: string
): string {
  const pureVoter = (voterName || '').trim();
  if (!pureVoter) return content;

  // 投票人名儲存至共享筆記時，一律去除「(我)」，確保全家查看時語意清晰一致
  const cleanVoter = pureVoter.replace(/\s*[\(（]我[\)）]\s*$/, '').trim() || pureVoter;

  const lines = content.split('\n');
  let checklistItemIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim());
    if (isChecklist) {
      if (checklistItemIndex === targetLineIndex) {
        const option = parseVoteOptionLine(line, checklistItemIndex);
        if (option) {
          let updatedVoters = [...option.voters];
          const normClean = cleanVoter.toLowerCase();
          const voterIndex = updatedVoters.findIndex(v => {
            const normV = v.replace(/\s*[\(（]我[\)）]\s*$/, '').trim().toLowerCase();
            return normV === normClean;
          });

          if (voterIndex >= 0) {
            // 已投過，撤回此票
            updatedVoters.splice(voterIndex, 1);
          } else {
            // 尚未投，加入此票
            updatedVoters.push(cleanVoter);
          }

          // 對現有投票人也做一次清理，去除歷史資料中的「 (我)」
          updatedVoters = Array.from(
            new Set(
              updatedVoters
                .map(v => v.replace(/\s*[\(（]我[\)）]\s*$/, '').trim())
                .filter(Boolean)
            )
          );

          const checkMark = option.isDecided ? '[x]' : '[ ]';
          const votersPart = updatedVoters.length > 0 ? `（${updatedVoters.join('、')} +${updatedVoters.length}）` : '';
          const repliesPart = (option.replies && option.replies.length > 0)
            ? `（${option.replies.map(r => `${r.memberName}：${r.text}`).join('；')}）`
            : '';
          lines[i] = `- ${checkMark} ${option.title}${votersPart}${repliesPart}`;
        }
        break;
      }
      checklistItemIndex++;
    }
  }

  return lines.join('\n');
}

/**
 * 拍板定案投票結果：將勝出選項標記為已決定 [x]，其他取消 [ ]
 */
export function finalizeGroupOrderVote(
  content: string = '',
  winningLineIndex: number
): string {
  const lines = content.split('\n');
  let checklistItemIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim());
    if (isChecklist) {
      const option = parseVoteOptionLine(line, checklistItemIndex);
      if (option) {
        const isWinner = checklistItemIndex === winningLineIndex;
        const checkMark = isWinner ? '[x]' : '[ ]';
        const votersPart = option.voters.length > 0 ? `（${option.voters.join('、')} +${option.voters.length}）` : '';
        const repliesPart = (option.replies && option.replies.length > 0)
          ? `（${option.replies.map(r => `${r.memberName}：${r.text}`).join('；')}）`
          : '';
        lines[i] = `- ${checkMark} ${option.title}${votersPart}${repliesPart}`;
      }
      checklistItemIndex++;
    }
  }

  return lines.join('\n');
}

/**
 * 修改指定投票候選方案之名稱 (保留既有投票人與留言)
 */
export function updateGroupOrderVoteOption(
  content: string = '',
  targetLineIndex: number,
  newTitle: string
): string {
  const cleanTitle = (newTitle || '').trim();
  if (!cleanTitle) return content;

  const lines = content.split('\n');
  let checklistItemIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim());
    if (isChecklist) {
      if (checklistItemIndex === targetLineIndex) {
        const option = parseVoteOptionLine(line, checklistItemIndex);
        if (option) {
          const checkMark = option.isDecided ? '[x]' : '[ ]';
          const votersPart = option.voters.length > 0 ? `（${option.voters.join('、')} +${option.voters.length}）` : '';
          const repliesPart = (option.replies && option.replies.length > 0)
            ? `（${option.replies.map(r => `${r.memberName}：${r.text}`).join('；')}）`
            : '';
          lines[i] = `- ${checkMark} ${cleanTitle}${votersPart}${repliesPart}`;
        }
        break;
      }
      checklistItemIndex++;
    }
  }

  return lines.join('\n');
}

/**
 * 將勝出的投票結果一鍵轉換為點餐開團記事內容（若有傳入原投票記事，自動保留得票共識紀錄）
 */
export function convertVoteToFoodOrder(storeName: string, originalVoteNote?: string): string {
  const cleanStore = storeName.replace(/^(?:🍲|🍣|🥩|🍕|🍔|🍟|🍱|☕|🥤|🧋|🍜|\s)+/u, '').trim() || '聚餐店家';
  let consensusLine = '';
  if (originalVoteNote) {
    const lines = originalVoteNote.split('\n');
    const options: VoteOptionSummary[] = [];
    let idx = 0;
    for (const line of lines) {
      if (/^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim())) {
        const opt = parseVoteOptionLine(line, idx++);
        if (opt && opt.title) options.push(opt);
      }
    }
    const matched = options.find((o) => {
      const cleanOptTitle = o.title.replace(/^(?:🍲|🍣|🥩|🍕|🍔|🍟|🍱|☕|🥤|🧋|🍜|\s)+/u, '').trim();
      return cleanOptTitle === cleanStore || o.title.includes(cleanStore) || cleanStore.includes(cleanOptTitle);
    }) || [...options].sort((a, b) => b.voteCount - a.voteCount)[0];

    if (matched && matched.voters.length > 0) {
      consensusLine = `\n🎉 全家共識：${cleanStore}（${matched.voters.join('、')} 贊成）`;
    }
  }
  return `[🧋 點餐開團] 店家：${cleanStore}${consensusLine}
- [ ] 大家直接在下方點「＋我也要 / 登記品項」快速報單！`;
}

/**
 * 更新指定待辦項目的認領成員 (支援一鍵認領、動態換人或取消認領)
 */
export function updateGroupOrderItemMember(
  content: string = '',
  targetLineIndex: number,
  newMemberName?: string
): string {
  const lines = content.split('\n');
  let checklistItemIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim());
    if (isChecklist) {
      if (checklistItemIndex === targetLineIndex) {
        const item = parseGroupOrderItemLine(line, checklistItemIndex);
        if (item) {
          const cleanMember = (newMemberName || '').trim();
          const memberPrefix = cleanMember ? `${cleanMember}：` : '';
          const specsPart = item.specs ? `（${item.specs}）` : '';
          const pricePart = item.price > 0 ? ` $${item.price}` : '';
          const repliesPart = item.replies && item.replies.length > 0
            ? `（${item.replies.map(r => `${r.memberName}：${r.text}`).join('；')}）`
            : '';
          const checkMark = item.isDone ? '[x]' : '[ ]';
          lines[i] = `- ${checkMark} ${memberPrefix}${item.itemName}${specsPart}${pricePart}${repliesPart}`;
        }
        break;
      }
      checklistItemIndex++;
    }
  }

  return lines.join('\n');
}

/**
 * 更新指定點餐待辦項目的品項名稱、規格、金額或點餐成員
 */
export function updateGroupOrderItem(
  content: string = '',
  targetLineIndex: number,
  updated: {
    memberName?: string;
    itemName: string;
    specs?: string;
    price?: number;
    isDone?: boolean;
  }
): string {
  const lines = content.split('\n');
  let checklistItemIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim());
    if (isChecklist) {
      if (checklistItemIndex === targetLineIndex) {
        const item = parseGroupOrderItemLine(line, checklistItemIndex);
        const cleanMember = (updated.memberName !== undefined ? updated.memberName : (item?.memberName || '')).trim();
        const cleanItem = (updated.itemName || item?.itemName || '').trim();
        const cleanSpecs = (updated.specs !== undefined ? updated.specs : (item?.specs || '')).trim();
        const price = updated.price !== undefined ? updated.price : (item?.price || 0);
        const isDone = updated.isDone !== undefined ? updated.isDone : (item?.isDone || false);

        const memberPrefix = cleanMember ? `${cleanMember}：` : '';
        const specsPart = cleanSpecs ? `（${cleanSpecs}）` : '';
        const pricePart = typeof price === 'number' && price > 0 ? ` $${price}` : '';
        const repliesPart = item?.replies && item.replies.length > 0
          ? `（${item.replies.map(r => `${r.memberName}：${r.text}`).join('；')}）`
          : '';
        const checkMark = isDone ? '[x]' : '[ ]';
        lines[i] = `- ${checkMark} ${memberPrefix}${cleanItem}${specsPart}${pricePart}${repliesPart}`;
        break;
      }
      checklistItemIndex++;
    }
  }

  return lines.join('\n');
}

/**
 * 刪除指定點餐待辦項目
 */
export function deleteGroupOrderItem(
  content: string = '',
  targetLineIndex: number
): string {
  const lines = content.split('\n');
  let checklistItemIndex = 0;
  const newLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(line.trim());
    if (isChecklist) {
      if (checklistItemIndex === targetLineIndex) {
        checklistItemIndex++;
        continue;
      }
      checklistItemIndex++;
    }
    newLines.push(line);
  }

  return newLines.join('\n');
}

/**
 * 追加一筆新的點餐品項到現有記事末尾
 */
export function appendGroupOrderItem(
  content: string = '',
  item: {
    memberName: string;
    itemName: string;
    specs?: string;
    price?: number;
    isDone?: boolean;
  }
): string {
  const cleanMember = (item.memberName || '').trim();
  const cleanItem = (item.itemName || '').trim();
  const cleanSpecs = (item.specs || '').trim();
  const priceVal = typeof item.price === 'number' && item.price > 0 ? ` $${item.price}` : '';

  const memberPrefix = cleanMember ? `${cleanMember}：` : '';
  const specsPart = cleanSpecs ? `（${cleanSpecs}）` : '';
  const checkMark = item.isDone ? '[x]' : '[ ]';
  const newLine = `- ${checkMark} ${memberPrefix}${cleanItem}${specsPart}${priceVal}`;

  const trimmed = content.trim();
  if (!trimmed) {
    return newLine;
  }

  return `${trimmed}\n${newLine}`;
}

/**
 * 智慧比對兩個店名是否相符 (支援多店名如 "50嵐、清心福泉" 或模糊包含)
 */
export function isSameOrRelatedStore(storeA?: string, storeB?: string): boolean {
  if (!storeA || !storeB) return false;
  const a = storeA.trim().toLowerCase();
  const b = storeB.trim().toLowerCase();
  if (a === '點餐店家' || b === '點餐店家') return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  // 支援以逗號、頓號、斜線分隔的多店名，例如 "50嵐、清心福泉" 與 "50嵐"
  const tokensA = a.split(/[,，、\/\s]+/).filter(Boolean);
  const tokensB = b.split(/[,，、\/\s]+/).filter(Boolean);
  for (const tA of tokensA) {
    if (tA.length >= 2 && tokensB.some(tB => tB.includes(tA) || tA.includes(tB))) {
      return true;
    }
  }
  return false;
}

/**
 * 從全家歷史生活記事中，萃取指定店家的「成員專屬私房招牌」與「全家熱銷排行」
 */
export function extractStoreFamilyFavorites(
  targetStore: string,
  transactions: any[] = [],
  selectedMemberName?: string
): StoreFamilyFavorites {
  if (!targetStore || targetStore === '點餐店家' || targetStore === '採買賣場' || targetStore === '網購包裹') {
    return { memberFavorites: [], familyTopFavorites: [] };
  }

  // 1. 篩選包含開團內容且店名相關的記事
  const matchingOrders: { note: string; title: string }[] = [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  for (const tx of safeTransactions) {
    const note = tx.note || '';
    if (!note) continue;
    // 粗篩是否含開團、採買或網購包裹可能
    if (
      !note.includes('點餐') &&
      !note.includes('開團') &&
      !note.includes('許願') &&
      !note.includes('飲料') &&
      !note.includes('便當') &&
      !note.includes('外帶') &&
      !note.includes('採買') &&
      !note.includes('補貨') &&
      !note.includes('超市') &&
      !note.includes('賣場') &&
      !note.includes('網購') &&
      !note.includes('湊單') &&
      !note.includes('湊免運') &&
      !note.includes('包裹') &&
      !note.includes('取貨') &&
      !note.includes('蝦皮') &&
      !note.includes('酷澎') &&
      !note.toLowerCase().includes('momo')
    ) {
      continue;
    }
    const store = extractStoreNameFromMemo(tx.category?.name, note);
    if (isSameOrRelatedStore(targetStore, store)) {
      matchingOrders.push({ note, title: tx.category?.name || '生活記事' });
    }
  }

  // 2. 走訪每筆開團記事的所有合法點餐項目
  // 成員專屬 key: `${memberName}___${itemName}`
  const memberItemMap: Map<string, { itemName: string; specs: string; price: number; count: number; memberName: string }> = new Map();
  // 全家熱門 key: `${itemName}`
  const familyItemMap: Map<string, { itemName: string; specs: string; price: number; count: number }> = new Map();

  for (const order of matchingOrders) {
    const summary = computeGroupOrderSummary(order.note, order.title);
    for (const item of summary.items) {
      if (!item.itemName) continue;

      // 累計全家熱門
      const famKey = item.itemName.trim().toLowerCase();
      const existingFam = familyItemMap.get(famKey);
      if (existingFam) {
        existingFam.count++;
        // 偏好保留有填寫規格或金額的資訊
        if (!existingFam.specs && item.specs) existingFam.specs = item.specs;
        if (existingFam.price === 0 && item.price > 0) existingFam.price = item.price;
      } else {
        familyItemMap.set(famKey, {
          itemName: item.itemName.trim(),
          specs: item.specs || '',
          price: item.price || 0,
          count: 1,
        });
      }

      // 若有指定成員且匹配
      const cleanMember = (item.memberName || '').trim();
      if (cleanMember) {
        const memKey = `${cleanMember}___${famKey}`;
        const existingMem = memberItemMap.get(memKey);
        if (existingMem) {
          existingMem.count++;
          if (!existingMem.specs && item.specs) existingMem.specs = item.specs;
          if (existingMem.price === 0 && item.price > 0) existingMem.price = item.price;
        } else {
          memberItemMap.set(memKey, {
            itemName: item.itemName.trim(),
            specs: item.specs || '',
            price: item.price || 0,
            count: 1,
            memberName: cleanMember,
          });
        }
      }
    }
  }

  // 3. 排序與產出結果
  // 當前選取成員的專屬招牌
  let memberFavorites: StoreFavoriteItem[] = [];
  if (selectedMemberName && selectedMemberName.trim()) {
    const targetMem = selectedMemberName.trim().toLowerCase();
    memberFavorites = Array.from(memberItemMap.values())
      .filter(m => m.memberName.toLowerCase() === targetMem)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  // 全家整體排行 (排除已出現在成員專屬第一順位且品項名相同的，避免視覺重複)
  const memberItemNameSet = new Set(memberFavorites.map(m => m.itemName.toLowerCase()));
  const familyTopFavorites: StoreFavoriteItem[] = Array.from(familyItemMap.values())
    .sort((a, b) => b.count - a.count)
    .filter(f => !memberItemNameSet.has(f.itemName.toLowerCase()))
    .slice(0, 6);

  // 4. 若全家歷史紀錄尚為空，提供知名賣場專屬內建熱門品項備援
  if (familyTopFavorites.length === 0 && memberFavorites.length === 0) {
    const sLower = targetStore.toLowerCase();
    if (sLower.includes('好市多') || sLower.includes('costco')) {
      familyTopFavorites.push(
        { itemName: '科克蘭三層抽取衛生紙', specs: '1串24包', price: 389, count: 1 },
        { itemName: '美國特選無骨牛小排', specs: '燒烤/火鍋片', price: 1200, count: 1 },
        { itemName: '義美全脂鮮奶', specs: '2瓶組', price: 249, count: 1 },
        { itemName: '綜合貝果麵包', specs: '2袋12入', price: 259, count: 1 },
        { itemName: '科克蘭洗衣膠囊', specs: '152顆', price: 659, count: 1 },
        { itemName: '美式烤全雞', specs: '現烤', price: 189, count: 1 }
      );
    } else if (sLower.includes('全聯')) {
      familyTopFavorites.push(
        { itemName: '全脂鮮奶', specs: '大瓶家庭號', price: 165, count: 1 },
        { itemName: '洗選新鮮雞蛋', specs: '1盒10顆', price: 65, count: 1 },
        { itemName: '洗碗精補充包', specs: '天然除油', price: 89, count: 1 },
        { itemName: '抽取式衛生紙', specs: '1串', price: 149, count: 1 },
        { itemName: '特級初榨橄欖油', specs: '1瓶', price: 289, count: 1 }
      );
    } else if (
      sLower.includes('酷澎') ||
      sLower.includes('coupang') ||
      sLower.includes('momo') ||
      sLower.includes('蝦皮')
    ) {
      familyTopFavorites.push(
        { itemName: '嬰兒純水濕紙巾', specs: '箱購湊免運', price: 399, count: 1 },
        { itemName: '抽取式衛生紙箱購', specs: '1箱', price: 699, count: 1 },
        { itemName: '天然洗衣膠囊補充包', specs: '大容量', price: 450, count: 1 },
        { itemName: '無糖氣泡水', specs: '1箱24瓶', price: 360, count: 1 },
        { itemName: '超商待領包裹', specs: '末三碼000、已付款免付', price: 0, count: 1 }
      );
    }
  }

  return {
    memberFavorites,
    familyTopFavorites,
  };
}

/**
 * 產生發起開團/採買/網購包裹時發送給全體家人的原生推播通知內容
 */
export function createGroupOrderPushNotification(params: {
  mode: CollaborativeOrderMode;
  storeName?: string;
  senderName?: string;
}): { title: string; body: string } {
  const { mode, storeName, senderName } = params;
  const sender = (senderName || '家人').trim();

  if (mode === 'vote') {
    const cleanStore = storeName && storeName !== '家庭決策' ? storeName : '家庭投票';
    return {
      title: `🗳️ ${cleanStore} 發起投票囉！`,
      body: `${sender} 發起了投票決策，大家快來投出你的一票！`,
    };
  }

  if (mode === 'chore') {
    const cleanStore = storeName && storeName !== '家庭任務' ? storeName : '家事分工';
    return {
      title: `🧹 ${cleanStore} 任務懸賞發起囉！`,
      body: `${sender} 發起了家務分工與獎勵清單，大家快來認領賺零用錢！`,
    };
  }

  if (mode === 'parcel') {
    const cleanStore = storeName && storeName !== '網購包裹' ? storeName : '網購湊單／包裹';
    return {
      title: `📦 ${cleanStore} 湊單／包裹通知！`,
      body: `${sender} 發起了網購湊免運或待領包裹看板，快來加湊或順路幫忙領！`,
    };
  }

  if (mode === 'grocery') {
    const cleanStore = storeName && storeName !== '採買賣場' ? storeName : '賣場採買';
    return {
      title: `🛒 ${cleanStore} 開團採買囉！`,
      body: `${sender} 發起了補貨清單，快來看看家裡缺什麼，點此快速追加！`,
    };
  }

  const cleanStore = storeName && storeName !== '點餐店家' ? storeName : '點餐開團';
  return {
    title: `🧋 ${cleanStore} 下午茶開團啦！`,
    body: `${sender} 發起了點餐許願池，想吃想喝快進來登記～`,
  };
}

/**
 * 產生家人追加點單/補貨/網購包裹時精準通知發起人的原生推播通知內容
 */
export function createGroupOrderAppendPushNotification(params: {
  mode: CollaborativeOrderMode;
  storeName?: string;
  senderName?: string;
  item: {
    itemName: string;
    specs?: string;
    price?: number;
  };
}): { title: string; body: string } {
  const { mode, storeName, senderName, item } = params;
  const sender = (senderName || '家人').trim();
  const specText = item.specs && item.specs.trim() ? `（${item.specs.trim()}）` : '';
  const priceText = item.price && item.price > 0 ? ` $${item.price}` : '';

  if (mode === 'vote') {
    const cleanStore = storeName && storeName !== '家庭決策' ? storeName : '投票看板';
    return {
      title: `🗳️ ${cleanStore} 收到新提案！`,
      body: `${sender} 新增了候選方案：${item.itemName}${specText}，快來瞧瞧！`,
    };
  }

  if (mode === 'chore') {
    const cleanStore = storeName && storeName !== '家庭任務' ? storeName : '家事分工';
    return {
      title: `🧹 ${cleanStore} 收到任務認領！`,
      body: `${sender} 認領了：${item.itemName}${specText}${priceText}`,
    };
  }

  if (mode === 'parcel') {
    const cleanStore = storeName && storeName !== '網購包裹' ? storeName : '網購包裹';
    return {
      title: `📦 ${cleanStore} 收到新登記！`,
      body: `${sender} 登記了：${item.itemName}${specText}${priceText}`,
    };
  }

  if (mode === 'grocery') {
    const cleanStore = storeName && storeName !== '採買賣場' ? storeName : '推車採買';
    return {
      title: `🛒 ${cleanStore} 收到追加補貨！`,
      body: `${sender} 追加了：${item.itemName}${specText}${priceText}`,
    };
  }

  const cleanStore = storeName && storeName !== '點餐店家' ? storeName : '開團點單';
  return {
    title: `🧋 ${cleanStore} 收到新點單！`,
    body: `${sender} 登記了：${item.itemName}${specText}${priceText}`,
  };
}

/**
 * 產生家人修改或取消點單/補貨項目時精準通知發起人的原生推播通知內容
 */
export function createGroupOrderUpdatePushNotification(params: {
  mode: CollaborativeOrderMode;
  storeName?: string;
  senderName?: string;
  action: 'update' | 'delete';
  item: {
    itemName: string;
    specs?: string;
    price?: number;
  };
}): { title: string; body: string } {
  const { mode, storeName, senderName, action, item } = params;
  const sender = (senderName || '家人').trim();
  const specText = item.specs && item.specs.trim() ? `（${item.specs.trim()}）` : '';
  const priceText = item.price && item.price > 0 ? ` $${item.price}` : '';
  const isDelete = action === 'delete';

  if (mode === 'grocery') {
    const cleanStore = storeName && storeName !== '採買賣場' ? storeName : '推車採買';
    return {
      title: isDelete ? `🛒 ${cleanStore} 採買項目已移除` : `🛒 ${cleanStore} 採買項目已更正`,
      body: isDelete
        ? `${sender} 移除了採買項目：${item.itemName}${specText}`
        : `${sender} 將採買項目更正為：${item.itemName}${specText}${priceText}`,
    };
  }

  if (mode === 'parcel') {
    const cleanStore = storeName && storeName !== '網購包裹' ? storeName : '網購包裹';
    return {
      title: isDelete ? `📦 ${cleanStore} 登記已取消` : `📦 ${cleanStore} 登記已更正`,
      body: isDelete
        ? `${sender} 取消了登記：${item.itemName}${specText}`
        : `${sender} 將登記更正為：${item.itemName}${specText}${priceText}`,
    };
  }

  const cleanStore = storeName && storeName !== '點餐店家' ? storeName : '開團點單';
  return {
    title: isDelete ? `🧋 ${cleanStore} 點單已取消` : `🧋 ${cleanStore} 點單更正通知`,
    body: isDelete
      ? `${sender} 取消了點單：${item.itemName}${specText}`
      : `${sender} 將點單更正為：${item.itemName}${specText}${priceText}`,
  };
}

/**
 * 判斷一則生活記事是否為「🏠 家中缺貨／待補貨隨手記」
 * 注意：僅檢查標題、分類名稱、開頭前綴標籤或第一行主題，嚴禁全內文泛搜，避免一般記事（如問題反映、工作待辦）因內文提及而誤判
 */
export function isRestockPoolMemo(title?: string, content?: string): boolean {
  const t = (title || '').trim().toLowerCase();
  const c = (content || '').trim();
  if (!t && !c) return false;

  const restockKeywords = [
    '🏠 家中缺貨',
    '家中缺貨',
    '缺貨隨手記',
    '缺貨清單',
    '缺貨登記',
    '缺貨池',
    '待補貨',
    '缺貨待補',
    '【缺貨】',
    '[缺貨]',
    '【待補】',
    '[待補]',
  ];

  // 1. 若標題 / 分類名稱已直接命中缺貨關鍵字
  if (restockKeywords.some(kw => t.includes(kw.toLowerCase()))) {
    return true;
  }

  // 2. 檢查內文的第一行或開頭標籤
  const firstLine = c.split('\n')[0]?.trim() || '';
  if (!firstLine) return false;

  // 2.1 檢查開頭標籤，如 [🏠 家中缺貨]、[待補貨]、[缺貨] 等
  const tagMatch = firstLine.match(/^[\[［【]([^\[\]［］【】]{1,20})[\]］】]/);
  if (tagMatch) {
    const tagContent = tagMatch[1].trim().toLowerCase();
    if (restockKeywords.some(kw => tagContent.includes(kw.toLowerCase().replace(/[\[\]［］【】]/g, '')))) {
      return true;
    }
  }

  // 2.2 若第一行本身就是待辦項目（如 - [ ] ...），則它不是整篇主題標題，不可作為全篇主題判定
  if (/^[-*]?\s*\[[ xX✓]\]/.test(firstLine)) {
    return false;
  }

  // 2.3 檢查第一行純文字主題是否以缺貨關鍵字開頭
  const cleanFirstLine = firstLine.replace(/^[\[［【][^\[\]［］【】]{1,20}[\]］】]\s*/, '').toLowerCase();
  if (
    restockKeywords.some(kw => {
      const cleanKw = kw.toLowerCase().replace(/[\[\]［］【】]/g, '');
      return cleanFirstLine.startsWith(cleanKw);
    })
  ) {
    return true;
  }

  return false;
}

/**
 * 從交易與生活記事列表中，萃取所有尚未辦妥的「🏠 家中缺貨」待買項目
 */
export function extractPendingRestockItems(transactions: any[] = []): PendingRestockItem[] {
  const safeTx = Array.isArray(transactions) ? transactions : [];
  const results: PendingRestockItem[] = [];
  const seenKeys = new Set<string>();

  for (const tx of safeTx) {
    if (!tx || tx.type !== 'memo' || tx.is_settled) continue;
    const rawNote = String(tx.note || '').trim();
    if (!rawNote) continue;

    // 簡易剝除開頭標籤以檢查標題
    const tagMatch = rawNote.match(/^[\[［【]([^\[\]［］【】\n]{1,16})[\]］】]/);
    const memoTitle = tagMatch ? tagMatch[1].trim() : (tx.category?.name || '');
    if (!isRestockPoolMemo(memoTitle, rawNote)) continue;

    const lines = rawNote.split('\n');
    let hasChecklist = false;
    let checklistIdx = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      const isChecklist = /^[-*]?\s*\[([ xX✓])\]\s*(.+)$/.test(trimmed);
      if (isChecklist) {
        hasChecklist = true;
        const currentIdx = checklistIdx++;
        const parsed = parseGroupOrderItemLine(trimmed, currentIdx);
        if (parsed && !parsed.isDone && parsed.itemName) {
          const dedupKey = parsed.itemName.toLowerCase();
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            results.push({
              memoId: tx.id,
              memoTitle: memoTitle || '家中缺貨',
              lineIndex: currentIdx,
              rawText: trimmed.replace(/^[-*]?\s*\[[ xX✓]\]\s*/, '').trim(),
              memberName: parsed.memberName,
              itemName: parsed.itemName,
              specs: parsed.specs,
              price: parsed.price,
            });
          }
        }
      }
    }

    // 若該筆缺貨記事未使用待辦方框，而是直接打字（如 "[🏠 家中缺貨] 兒童牙膏快沒了"）
    if (!hasChecklist) {
      const cleanBody = rawNote
        .replace(/^[\[［【][^\[\]［］【】\n]{1,16}[\]］】]\s*/, '')
        .trim();
      const textLines = cleanBody.split('\n').map(l => l.trim()).filter(Boolean);
      for (const tl of textLines) {
        const fakeLine = `- [ ] ${tl}`;
        const parsed = parseGroupOrderItemLine(fakeLine, -1);
        if (parsed && parsed.itemName) {
          const dedupKey = parsed.itemName.toLowerCase();
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            results.push({
              memoId: tx.id,
              memoTitle: memoTitle || '家中缺貨',
              lineIndex: -1,
              rawText: tl,
              memberName: parsed.memberName,
              itemName: parsed.itemName,
              specs: parsed.specs,
              price: parsed.price,
            });
          }
        }
      }
    }
  }

  return results;
}

/**
 * 將家中缺貨項目一鍵匯入至當前的採買／湊單記事內容中（自動略過已存在的同名品項）
 */
export function mergeRestockItemsIntoNote(
  currentNote: string = '',
  restockItems: PendingRestockItem[] = []
): { updatedNote: string; addedCount: number; affectedMemoIds: string[] } {
  let note = currentNote;
  let addedCount = 0;
  const affectedMemoIdSet = new Set<string>();
  const lowerNote = note.toLowerCase();

  for (const item of restockItems) {
    if (!item.itemName) continue;
    if (lowerNote.includes(item.itemName.toLowerCase())) {
      continue;
    }
    note = appendGroupOrderItem(note, {
      memberName: item.memberName,
      itemName: item.itemName,
      specs: item.specs || '缺貨匯入',
      price: item.price > 0 ? item.price : undefined,
      isDone: false,
    });
    addedCount++;
    if (item.memoId) {
      affectedMemoIdSet.add(item.memoId);
    }
  }

  return {
    updatedNote: note,
    addedCount,
    affectedMemoIds: Array.from(affectedMemoIdSet),
  };
}

export interface RestockMemoUpdatePlan {
  memoId: string;
  updatedNote: string;
  shouldSettle: boolean;
  completionNote?: string;
}

/**
 * 當缺貨品項被選定並匯入採買清單時，精準更新來源缺貨隨手記：
 * 1. 將被選中的品項在原筆記中標記為已完成 [x]
 * 2. 檢查該筆記是否還有其他未完成待辦：
 *    - 若所有項目皆已完成，將 shouldSettle 設為 true（自動結案歸檔）
 *    - 若尚有其他品項未買（如好市多品項留給下次），則保持 shouldSettle: false，更新筆記保留未買項目
 */
export function applyRestockImportToSourceMemos(
  importedItems: PendingRestockItem[],
  allTransactions: any[]
): RestockMemoUpdatePlan[] {
  if (!Array.isArray(importedItems) || importedItems.length === 0) return [];

  // 依 memoId 分組已匯入的項目
  const importedByMemoId = new Map<string, PendingRestockItem[]>();
  for (const item of importedItems) {
    if (!item.memoId) continue;
    const list = importedByMemoId.get(item.memoId) || [];
    list.push(item);
    importedByMemoId.set(item.memoId, list);
  }

  const plans: RestockMemoUpdatePlan[] = [];

  importedByMemoId.forEach((items, memoId) => {
    const tx = allTransactions.find(t => t.id === memoId);
    if (!tx || !tx.note) return;

    const rawNote = String(tx.note);
    const lines = rawNote.split('\n');
    const importedItemNames = new Set(items.map(i => i.itemName.toLowerCase()));

    let hasChecklist = false;
    let anyIncompleteRemaining = false;

    const newLines = lines.map(line => {
      const match = line.match(/^([-*]?\s*)\[([ xX✓])\](\s*.+)$/);
      if (match) {
        hasChecklist = true;
        const prefix = match[1];
        const status = match[2];
        const rest = match[3];

        const isDone = ['x', 'X', '✓'].includes(status);
        const parsed = parseGroupOrderItemLine(line, 0);
        const nameKey = (parsed?.itemName || '').toLowerCase();

        if (importedItemNames.has(nameKey)) {
          // 將被匯入的項目標記為已完成 [x]
          return `${prefix}[x]${rest}`;
        } else if (!isDone) {
          anyIncompleteRemaining = true;
        }
        return line;
      }

      return line;
    });

    const updatedNote = newLines.join('\n');
    // 若原本有 checklist 且全部項目都已經完成，則標記結案；若還有未完成品項則不結案
    const shouldSettle = hasChecklist ? !anyIncompleteRemaining : true;

    plans.push({
      memoId,
      updatedNote,
      shouldSettle,
      completionNote: shouldSettle ? '缺貨品項已全數匯入採買清單' : undefined,
    });
  });

  return plans;
}

/**
 * 判斷單一點餐/採買/包裹項目是否因缺貨、賣完或取消而未實際購入
 */
export function isGroupOrderItemSoldOut(item: GroupOrderItem): boolean {
  if (item.isDone) return false;
  const soldOutPattern = /(?:賣完|售完|缺貨|沒貨|沒買到|買不到|停售|已售罄|取消)/;
  if (item.specs && soldOutPattern.test(item.specs)) {
    return true;
  }
  if (item.replies && item.replies.some(r => soldOutPattern.test(r.text))) {
    return true;
  }
  return false;
}

/**
 * 計算結算轉記帳時的實際有效品項、數量與總金額：
 * 1. 若使用者已於看板勾選部分買到的項目 (completedCount > 0)，則以「已打勾 [x]」的實際買到項目為準。
 * 2. 若使用者完全未逐一打勾 (completedCount === 0) 直接點結算，則自動剔除留言或規格標註「賣完/缺貨/取消」之項目。
 */
export function getGroupOrderSettlementStats(summary: GroupOrderSummary): {
  effectiveItems: GroupOrderItem[];
  effectiveCount: number;
  effectiveAmount: number;
  hasEffectiveAmount: boolean;
} {
  const checkedItems = summary.items.filter(it => it.isDone);
  const nonSoldOutItems = summary.items.filter(it => !isGroupOrderItemSoldOut(it));

  let effectiveItems: GroupOrderItem[];
  if (checkedItems.length > 0) {
    effectiveItems = checkedItems;
  } else if (nonSoldOutItems.length > 0) {
    effectiveItems = nonSoldOutItems;
  } else {
    effectiveItems = summary.items;
  }

  const effectiveAmount = effectiveItems.reduce((sum, it) => sum + (it.price > 0 ? it.price : 0), 0);
  return {
    effectiveItems,
    effectiveCount: effectiveItems.length,
    effectiveAmount,
    hasEffectiveAmount: effectiveAmount > 0,
  };
}

/**
 * 根據開團或生活待辦統計摘要，產生親切自然的記帳結算備註文字
 * 徹底告別包含 Markdown 待辦語法或中繼代碼的原始碼亂碼
 */
export function generateGroupOrderSettlementNote(
  summary: GroupOrderSummary,
  memoTitle?: string
): string {
  // 1. 若為投票模式
  if (summary.mode === 'vote') {
    const winning = summary.leadingOption?.title;
    return winning ? `家庭決策拍板 · ${winning}` : '家庭民主投票決策';
  }

  // 2. 若為家事零用錢懸賞模式
  if (summary.mode === 'chore') {
    const doneCount = summary.items.filter(it => it.isDone).length;
    return `家事任務獎勵 (共完成 ${doneCount || summary.totalCount} 項)`;
  }

  // 3. 若為點餐開團、賣場採買或網購湊單 (必須確實為開團或擁有品項)
  if (summary.isGroupOrder || summary.items.length > 0) {
    const rawStore = summary.storeName;
    const isGenericStore = !rawStore || ['點餐店家', '採買賣場', '網購包裹', '家庭任務', '家庭決策'].includes(rawStore);
    const storePrefix = isGenericStore ? '' : `${rawStore} · `;

    const { effectiveItems, effectiveCount } = getGroupOrderSettlementStats(summary);

    // 萃取實際結算之品項名稱 (過濾空值並去重)
    const validItems = effectiveItems.map(it => it.itemName.trim()).filter(Boolean);
    const uniqueItemNames = Array.from(new Set(validItems));

    let itemsSnippet = '';
    if (uniqueItemNames.length > 0) {
      if (uniqueItemNames.length <= 3) {
        itemsSnippet = uniqueItemNames.join('、');
      } else {
        itemsSnippet = `${uniqueItemNames.slice(0, 2).join('、')}等`;
      }
    }

    const unit = summary.mode === 'food' ? '份' : (summary.mode === 'parcel' ? '件' : '項');
    const countSuffix = effectiveCount > 0 ? ` (共${effectiveCount}${unit})` : '';

    if (itemsSnippet) {
      return `${storePrefix}${itemsSnippet}${countSuffix}`;
    }

    if (!isGenericStore) {
      return `${rawStore}${summary.mode === 'food' ? '點餐開團' : (summary.mode === 'grocery' ? '賣場採買' : '網購湊單')}${countSuffix}`;
    }

    return `點餐開團${countSuffix}`;
  }

  // 4. 一般生活記事：取純淨標題，絕不夾帶原始全文
  const cleanTitle = (memoTitle || '').trim();
  if (cleanTitle && cleanTitle !== '生活記事' && cleanTitle !== '生活待辦') {
    return `[辦妥] ${cleanTitle}`;
  }
  return '[辦妥] 生活待辦';
}
