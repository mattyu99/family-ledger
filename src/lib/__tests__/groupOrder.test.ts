import {
  isGroupOrderMemo,
  extractStoreNameFromMemo,
  parseGroupOrderItemLine,
  computeGroupOrderSummary,
  appendGroupOrderItem,
} from '../groupOrder';

describe('groupOrder 工具庫單元測試', () => {
  describe('isGroupOrderMemo 辨識開團記事', () => {
    it('能精準辨識包含【點餐】或【開團】標籤的記事', () => {
      expect(isGroupOrderMemo('【開團】今天喝 50嵐！', '')).toBe(true);
      expect(isGroupOrderMemo('下午茶', '【點餐】老王牛肉麵')).toBe(true);
      expect(isGroupOrderMemo('週末放鬆', '🧋 點餐開團：大家想喝什麼')).toBe(true);
    });

    it('能辨識手搖飲、便當、宵夜等語意關鍵字', () => {
      expect(isGroupOrderMemo('手搖飲許願池', '')).toBe(true);
      expect(isGroupOrderMemo('今天吃便當', '外帶便當統計')).toBe(true);
      expect(isGroupOrderMemo('宵夜團', '鹹酥雞')).toBe(true);
    });

    it('一般普通記事不誤判為開團記事', () => {
      expect(isGroupOrderMemo('出國行李清單', '- [ ] 護照\n- [ ] 簽證')).toBe(false);
      expect(isGroupOrderMemo('就醫回診', '116/1/9早28號心臟科')).toBe(false);
    });
  });

  describe('extractStoreNameFromMemo 店家名稱提取', () => {
    it('能提取「店家：50嵐」格式', () => {
      expect(extractStoreNameFromMemo('手搖杯', '店家：50嵐\n大家快填')).toBe('50嵐');
      expect(extractStoreNameFromMemo('便當團', '店名: 麻古茶坊\n- [ ] 綠茶')).toBe('麻古茶坊');
    });

    it('能提取標題括號中的店名', () => {
      expect(extractStoreNameFromMemo('【開團 迷客夏】今天請客', '')).toBe('迷客夏');
    });

    it('找不到時回傳友善預設值', () => {
      expect(extractStoreNameFromMemo('點餐許願池', '隨意點')).toBe('點餐店家');
    });
  });

  describe('parseGroupOrderItemLine 單行待辦點餐解析', () => {
    it('能解析完整格式：成員、品項、規格與金額', () => {
      const line = '- [ ] 瑩媽：波霸紅茶拿鐵（微糖微冰）$60';
      const item = parseGroupOrderItemLine(line, 1);
      expect(item).not.toBeNull();
      expect(item?.memberName).toBe('瑩媽');
      expect(item?.itemName).toBe('波霸紅茶拿鐵');
      expect(item?.specs).toBe('微糖微冰');
      expect(item?.price).toBe(60);
      expect(item?.isDone).toBe(false);
    });

    it('支援半形括號與「元」結尾', () => {
      const line = '[ ] 洋洋: 排骨便當 (加飯不要辣) 110元';
      const item = parseGroupOrderItemLine(line, 2);
      expect(item).not.toBeNull();
      expect(item?.memberName).toBe('洋洋');
      expect(item?.itemName).toBe('排骨便當');
      expect(item?.specs).toBe('加飯不要辣');
      expect(item?.price).toBe(110);
      expect(item?.isDone).toBe(false);
    });

    it('支援已打勾狀態 [x] 或 [✓]', () => {
      const line = '- [x] 智爸 - 烏龍綠茶 $35';
      const item = parseGroupOrderItemLine(line, 3);
      expect(item).not.toBeNull();
      expect(item?.memberName).toBe('智爸');
      expect(item?.itemName).toBe('烏龍綠茶');
      expect(item?.price).toBe(35);
      expect(item?.isDone).toBe(true);
    });

    it('非 Markdown 待辦格式應回傳 null', () => {
      expect(parseGroupOrderItemLine('今天喝 50嵐！')).toBeNull();
      expect(parseGroupOrderItemLine('店家：50嵐')).toBeNull();
    });
  });

  describe('computeGroupOrderSummary 統計開團總結', () => {
    it('能正確累加總杯數與金額', () => {
      const content = `【開團】50嵐
店家：50嵐
- [ ] 瑩媽：波霸紅茶拿鐵（微糖微冰）$60
- [ ] 洋洋：四季春珍波椰（少冰無糖）$50
- [x] 智爸：烏龍綠茶（微冰無糖）$35
- [ ] 豆豆：原味奶茶 $50`;

      const summary = computeGroupOrderSummary(content, '【開團】50嵐');
      expect(summary.isGroupOrder).toBe(true);
      expect(summary.storeName).toBe('50嵐');
      expect(summary.totalCount).toBe(4);
      expect(summary.completedCount).toBe(1);
      expect(summary.totalAmount).toBe(195);
      expect(summary.hasAmount).toBe(true);
    });
  });

  describe('appendGroupOrderItem 追加新點單', () => {
    it('能正確格式化並追加到文章末尾', () => {
      const initial = '【開團】今天喝 50嵐！\n- [ ] 智爸：烏龍綠茶 $35';
      const updated = appendGroupOrderItem(initial, {
        memberName: '瑩媽',
        itemName: '波霸紅茶拿鐵',
        specs: '微糖微冰',
        price: 60,
      });

      expect(updated).toBe(
        '【開團】今天喝 50嵐！\n- [ ] 智爸：烏龍綠茶 $35\n- [ ] 瑩媽：波霸紅茶拿鐵（微糖微冰） $60'
      );
    });

    it('初始為空時直接回傳單行', () => {
      const updated = appendGroupOrderItem('', {
        memberName: '洋洋',
        itemName: '排骨便當',
      });
      expect(updated).toBe('- [ ] 洋洋：排骨便當');
    });
  });
});
