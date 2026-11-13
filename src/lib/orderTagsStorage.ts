/**
 * 自學習動態點餐規格標籤與店家招牌記憶儲存庫
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ORDER_TAGS_STORAGE_KEY = '@family_ledger_order_custom_tags';
export const STORE_FAVORITES_STORAGE_KEY = '@family_ledger_order_store_favorites';

// 預設三大生活情境標籤庫
export const DEFAULT_ORDER_PRESET_TAGS = {
  drinks: [
    '無糖', '微糖', '半糖', '少糖', '去冰', '微冰', '少冰', '常溫', '溫熱', '加珍珠', '加椰果'
  ],
  snacks: [
    '不辣', '微辣', '小辣', '中辣', '大辣', '加蒜', '不要蒜', '加九層塔', '胡椒多', '梅粉'
  ],
  meals: [
    '加飯', '飯少', '不要飯', '不要香菜', '不要蔥', '醬另外放', '菜多', '全熟蛋', '半熟蛋'
  ],
  groceries: [
    '1瓶', '2瓶', '1盒', '2盒', '1袋', '大包裝', '家庭號', '特價才買', '低脂', '全脂', '有機', '無糖'
  ],
  parcels: [
    '已付款免付', '貨到付款', '7-11取貨', '全家取貨', '蝦皮店到店', '管理室代收', '湊免運', '急件先領', '冷凍包裹', '1箱', '2件'
  ],
  chores: [
    '客廳', '廚房', '臥室', '浴室', '陽台', '急件', '週末前完成', '加碼獎勵', '每天一次', '已完成驗收'
  ],
};

/**
 * 取得所有合併後的自學習規格標籤 (內建預設 + 使用者歷史輸入)
 */
export async function getMergedOrderTags(mode: 'food' | 'grocery' | 'parcel' | 'chore' = 'food'): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(ORDER_TAGS_STORAGE_KEY);
    const customTags: string[] = raw ? JSON.parse(raw) : [];

    const pool = mode === 'chore'
      ? [...DEFAULT_ORDER_PRESET_TAGS.chores]
      : mode === 'parcel'
      ? [...DEFAULT_ORDER_PRESET_TAGS.parcels]
      : mode === 'grocery'
        ? [...DEFAULT_ORDER_PRESET_TAGS.groceries]
        : [
            ...DEFAULT_ORDER_PRESET_TAGS.drinks,
            ...DEFAULT_ORDER_PRESET_TAGS.snacks,
            ...DEFAULT_ORDER_PRESET_TAGS.meals,
          ];

    const seen = new Set<string>();
    const result: string[] = [];

    // 先加入常用自訂標籤 (排在前面)
    for (const tag of customTags) {
      const clean = (tag || '').trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    }

    // 再加入預設標籤
    for (const tag of pool) {
      if (!seen.has(tag)) {
        seen.add(tag);
        result.push(tag);
      }
    }

    return result;
  } catch {
    return mode === 'chore'
      ? [...DEFAULT_ORDER_PRESET_TAGS.chores]
      : mode === 'parcel'
      ? [...DEFAULT_ORDER_PRESET_TAGS.parcels]
      : mode === 'grocery'
        ? [...DEFAULT_ORDER_PRESET_TAGS.groceries]
        : [
            ...DEFAULT_ORDER_PRESET_TAGS.drinks,
            ...DEFAULT_ORDER_PRESET_TAGS.snacks,
            ...DEFAULT_ORDER_PRESET_TAGS.meals,
          ];
  }
}

/**
 * 記憶一筆新的客製規格標籤
 */
export async function recordCustomOrderTag(tag: string): Promise<void> {
  const clean = (tag || '').trim();
  if (!clean || clean.length > 15) return;

  try {
    const raw = await AsyncStorage.getItem(ORDER_TAGS_STORAGE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];

    // 若尚未存在則加在最前端
    const index = list.indexOf(clean);
    if (index > -1) {
      list.splice(index, 1);
    }
    list.unshift(clean);

    // 最多保留 30 個常用標籤
    await AsyncStorage.setItem(ORDER_TAGS_STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    // 忽略儲存錯誤
  }
}

/**
 * 取得指定店家的家庭常點招牌品項清單
 */
export async function getStoreFavoriteItems(storeName: string): Promise<string[]> {
  if (!storeName || storeName === '點餐店家') return [];

  try {
    const raw = await AsyncStorage.getItem(STORE_FAVORITES_STORAGE_KEY);
    const storeMap: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    return storeMap[storeName] || [];
  } catch {
    return [];
  }
}

/**
 * 記錄一筆指定店家的常點品項 (例如 "50嵐" ➔ "波霸紅茶拿鐵")
 */
export async function recordStoreFavoriteItem(storeName: string, itemText: string): Promise<void> {
  const cleanStore = (storeName || '').trim();
  const cleanItem = (itemText || '').trim();
  if (!cleanStore || cleanStore === '點餐店家' || !cleanItem) return;

  try {
    const raw = await AsyncStorage.getItem(STORE_FAVORITES_STORAGE_KEY);
    const storeMap: Record<string, string[]> = raw ? JSON.parse(raw) : {};

    const list = storeMap[cleanStore] || [];
    const index = list.indexOf(cleanItem);
    if (index > -1) {
      list.splice(index, 1);
    }
    list.unshift(cleanItem);

    // 每一家店最多保留 10 樣常點招牌
    storeMap[cleanStore] = list.slice(0, 10);
    await AsyncStorage.setItem(STORE_FAVORITES_STORAGE_KEY, JSON.stringify(storeMap));
  } catch {
    // 忽略儲存錯誤
  }
}
