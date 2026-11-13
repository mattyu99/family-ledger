/**
 * 家庭點餐開團與生活許願池 (Group Order & Wishlist) 工具庫
 * 支援多人追加式點餐、手搖飲/便當/宵夜規格解析、自動統計杯數與金額、免衝突登記
 */

export interface GroupOrderItem {
  rawLine: string;
  lineIndex: number;
  memberName: string;
  itemName: string;
  specs: string;
  price: number;
  isDone: boolean;
}

export type CollaborativeOrderMode = 'food' | 'grocery';

export interface GroupOrderSummary {
  isGroupOrder: boolean;
  mode: CollaborativeOrderMode;
  storeName: string;
  totalCount: number;
  completedCount: number;
  totalAmount: number;
  hasAmount: boolean;
  items: GroupOrderItem[];
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
 * 判斷協同模式：餐飲開團 (food) 或 賣場採買 (grocery)
 */
export function detectCollaborativeOrderMode(title?: string, content?: string): CollaborativeOrderMode {
  const t = (title || '').toLowerCase();
  const c = (content || '').toLowerCase();
  const text = `${t}\n${c}`;

  const groceryKeywords = [
    '🛒 採買清單', '🛒 補貨清單', '🛒 採買', '🛒 補貨',
    '【採買】', '【補貨】', '[採買]', '[補貨]',
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
 * 判斷一則生活記事是否為「點餐開團／採買補貨清單」
 */
export function isGroupOrderMemo(title?: string, content?: string): boolean {
  const t = (title || '').trim().toLowerCase();
  const c = (content || '').trim().toLowerCase();
  const combined = `${t}\n${c}`;

  // 1. 強烈明確標籤優先命中 (餐飲開團 + 賣場採買)
  const strongKeywords = [
    '【點餐】', '【開團】', '【許願】', '【外帶】',
    '[點餐]', '[開團]', '[許願]',
    '🧋 點餐開團', '🧋 點餐', '🧋 開團',
    '點餐開團', '點餐許願',
    '🛒 採買清單', '🛒 補貨清單', '🛒 採買', '🛒 補貨',
    '【採買】', '【補貨】', '[採買]', '[補貨]',
  ];
  for (const kw of strongKeywords) {
    if (combined.includes(kw.toLowerCase())) return true;
  }

  // 2. 嚴格防呆排除非餐飲/非採買之生活清單 (若命中醫藥、出國、清潔等且無明確標籤，絕不誤判)
  const nonOrderExcludes = [
    '回診', '慢箋', '慢籤', '就醫', '門診', '掛號', '看診', '健保',
    '出國', '行李', '露營', '大掃除', '拜拜', '祭祀', '打疫苗', '修繕',
    '生活記事與待辦', '待辦清單', '作業', '考試',
  ];
  if (nonOrderExcludes.some(ex => t.includes(ex) || c.includes(ex))) {
    return false;
  }

  // 3. 標題語意關鍵字組合 (必須出現在標題中)
  const titleKeywords = [
    '點餐', '開團', '許願池', '手搖飲', '手搖杯', '買飲料',
    '飲料團', '便當團', '宵夜團', '下午茶團', '鹹酥雞團', '外帶便當',
    '訂飲料', '訂便當', '團購',
    '採買清單', '補貨清單', '超市採買', '賣場採買',
    '好市多', 'costco', '全聯', '家樂福', '大潤發', '愛買', '美廉社',
  ];

  return titleKeywords.some(kw => t.includes(kw));
}

/**
 * 從開團/採買記事內容或標題中智慧推測店家/賣場名稱
 */
export function extractStoreNameFromMemo(title?: string, content?: string): string {
  const text = `${title || ''}\n${content || ''}`;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 優先 1: 全文快速識別知名賣場與連鎖關鍵字
  if (text.includes('好市多') || text.toLowerCase().includes('costco')) return '好市多';
  if (text.includes('全聯')) return '全聯';
  if (text.includes('家樂福')) return '家樂福';
  if (text.includes('大潤發')) return '大潤發';
  if (text.includes('愛買')) return '愛買';
  if (text.includes('美廉社')) return '美廉社';

  // 優先 2: 逐行掃描明確店家/賣場前綴 (形式 1)
  for (const line of lines) {
    const m1 = line.match(/(?:店家|店名|餐廳|飲料店|賣場|超市)[：:\s]+([^（\(\n]+)/i);
    if (m1 && m1[1]) {
      const clean = m1[1].replace(/[可換店名|請填|大家].*$/, '').trim();
      if (clean) return clean;
    }
  }

  // 優先 3: 逐行掃描括弧標題 (形式 2)
  for (const line of lines) {
    const m2 = line.match(/【(?:點餐|開團|許願|採買|補貨)[：:\s]*([^】]+)】/);
    if (m2 && m2[1]) {
      const clean = m2[1].replace(/今天|大家|想喝|請填/g, '').trim();
      if (clean) return clean;
    }
  }

  // 優先 4: 喝/買/吃/去 + 店名 (形式 3，嚴格排除清單、項目等生活詞彙)
  const excludeWords = [
    '東西', '日常', '生活', '食材', '清單', '項目', '待辦',
    '便當', '飲料', '手搖', '餐點', '午餐', '晚餐', '早餐', '下午茶', '宵夜'
  ];
  for (const line of lines) {
    const m3 = line.match(/(?:喝|買|吃|去)\s*([A-Za-z0-9\u4e00-\u9fa5]{2,10})/);
    if (m3 && m3[1]) {
      const candidate = m3[1].trim();
      if (!excludeWords.includes(candidate)) {
        return candidate;
      }
    }
  }

  const isGrocery = detectCollaborativeOrderMode(title, content) === 'grocery';
  return isGrocery ? '採買賣場' : '點餐店家';
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
    /^(?:店家|店名|餐廳|飲料店)[：:\s]/i.test(body) ||
    /^(?:大家|請大家|點此|菜單|說明|備註)[：:\s]*/i.test(body) ||
    body.includes('快速報單') ||
    body.includes('登記品項') ||
    body.includes('可換店名') ||
    body.includes('大家快填') ||
    body.includes('點此填寫') ||
    body.includes('我也要')
  ) {
    return null;
  }

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
  };
}

/**
 * 完整計算開團記事的統計摘要
 */
export function computeGroupOrderSummary(content: string = '', title?: string): GroupOrderSummary {
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

  return {
    isGroupOrder: isOrder,
    mode,
    storeName,
    totalCount,
    completedCount,
    totalAmount,
    hasAmount,
    items,
  };
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
  if (!targetStore || targetStore === '點餐店家' || targetStore === '採買賣場') {
    return { memberFavorites: [], familyTopFavorites: [] };
  }

  // 1. 篩選包含開團內容且店名相關的記事
  const matchingOrders: { note: string; title: string }[] = [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  for (const tx of safeTransactions) {
    const note = tx.note || '';
    if (!note) continue;
    // 粗篩是否含開團或採買可能
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
      !note.includes('賣場')
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
    }
  }

  return {
    memberFavorites,
    familyTopFavorites,
  };
}
