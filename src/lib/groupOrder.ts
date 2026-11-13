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

export interface GroupOrderSummary {
  isGroupOrder: boolean;
  storeName: string;
  totalCount: number;
  completedCount: number;
  totalAmount: number;
  hasAmount: boolean;
  items: GroupOrderItem[];
}

/**
 * 判斷一則生活記事是否為「點餐開團／許願清單」
 */
export function isGroupOrderMemo(title?: string, content?: string): boolean {
  const t = (title || '').trim().toLowerCase();
  const c = (content || '').trim().toLowerCase();
  const combined = `${t}\n${c}`;

  // 1. 強烈明確標籤優先命中
  const strongKeywords = [
    '【點餐】', '【開團】', '【許願】', '【外帶】',
    '[點餐]', '[開團]', '[許願]',
    '🧋 點餐開團', '🧋 點餐', '🧋 開團',
    '點餐開團', '點餐許願',
  ];
  for (const kw of strongKeywords) {
    if (combined.includes(kw.toLowerCase())) return true;
  }

  // 2. 嚴格防呆排除非餐飲生活清單 (若命中醫藥、出國、清潔等且無明確開團標籤，絕不誤判)
  const nonOrderExcludes = [
    '回診', '慢箋', '慢籤', '就醫', '門診', '掛號', '看診', '健保',
    '出國', '行李', '露營', '大掃除', '拜拜', '祭祀', '打疫苗', '修繕',
    '生活記事與待辦', '待辦清單', '作業', '考試',
  ];
  if (nonOrderExcludes.some(ex => t.includes(ex) || c.includes(ex))) {
    return false;
  }

  // 3. 標題語意關鍵字組合 (必須出現在標題中，避免內文隨意聊到「點」或「開」造成誤判)
  const titleKeywords = [
    '點餐', '開團', '許願池', '手搖飲', '手搖杯', '買飲料',
    '飲料團', '便當團', '宵夜團', '下午茶團', '鹹酥雞團', '外帶便當',
    '訂飲料', '訂便當', '團購',
  ];

  return titleKeywords.some(kw => t.includes(kw));
}

/**
 * 從開團記事內容或標題中智慧推測店家名稱 (例如 "50嵐"、"麻古"、"老王牛肉麵")
 */
export function extractStoreNameFromMemo(title?: string, content?: string): string {
  const text = `${title || ''}\n${content || ''}`;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // 形式 1: 店家：50嵐 或 店名: 麻古茶坊
    const m1 = line.match(/(?:店家|店名|餐廳|飲料店)[：:\s]+([^\s,，。]+)/i);
    if (m1 && m1[1]) return m1[1].trim();

    // 形式 2: 【開團 50嵐】 或 【點餐】老王牛肉麵
    const m2 = line.match(/【(?:點餐|開團|許願)[：:\s]*([^】]+)】/);
    if (m2 && m2[1]) {
      const clean = m2[1].replace(/今天|大家|想喝|請填/g, '').trim();
      if (clean) return clean;
    }

    // 形式 3: 喝 50嵐 或 買 麻古
    const m3 = line.match(/(?:喝|買|吃)\s*([A-Za-z0-9\u4e00-\u9fa5]{2,10})/);
    if (m3 && m3[1]) return m3[1].trim();
  }

  return '點餐店家';
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

  lines.forEach((line, idx) => {
    const item = parseGroupOrderItemLine(line, idx);
    if (item && item.itemName) {
      // 排除非餐點的提示行 (如 "店家：50嵐" 或 "大家快填")
      if (item.itemName.includes('大家快填') || item.itemName.includes('點此填寫') || item.itemName.includes('可換店名')) {
        return;
      }
      items.push(item);
      if (item.price > 0) {
        totalAmount += item.price;
        hasAmount = true;
      }
    }
  });

  const totalCount = items.length;
  const completedCount = items.filter(i => i.isDone).length;

  return {
    isGroupOrder: isOrder,
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
  }
): string {
  const cleanMember = (item.memberName || '').trim();
  const cleanItem = (item.itemName || '').trim();
  const cleanSpecs = (item.specs || '').trim();
  const priceVal = typeof item.price === 'number' && item.price > 0 ? ` $${item.price}` : '';

  const memberPrefix = cleanMember ? `${cleanMember}：` : '';
  const specsPart = cleanSpecs ? `（${cleanSpecs}）` : '';
  const newLine = `- [ ] ${memberPrefix}${cleanItem}${specsPart}${priceVal}`;

  const trimmed = content.trim();
  if (!trimmed) {
    return newLine;
  }

  return `${trimmed}\n${newLine}`;
}
