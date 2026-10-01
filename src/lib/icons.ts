/**
 * 分類圖示對照表：將常見的英文圖示代碼無縫映射為 Emoji
 */
export const CATEGORY_ICON_MAP: Record<string, string> = {
  'restaurant': '🍲',
  'shopping-cart': '🛒',
  'home': '💡',
  'car': '🚗',
  'film': '🎬',
  'medkit': '💊',
  'child': '👶',
  'cash': '💰',
  'trending-up': '📈',
  'receipt': '📝',
  'wallet': '👛',
  'gift': '🎁',
  'book': '📚',
  'fitness': '🏃',
  'coffee': '☕',
};

/**
 * 取得乾淨的分類 Emoji 圖示（防範英文圖示名稱外露）
 */
export function getCategoryIcon(icon?: string): string {
  if (!icon) return '📝';
  const trimmed = icon.trim();
  const lower = trimmed.toLowerCase();
  if (CATEGORY_ICON_MAP[lower]) {
    return CATEGORY_ICON_MAP[lower];
  }
  return trimmed;
}
