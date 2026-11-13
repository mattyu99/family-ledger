import {
  isGroupOrderMemo,
  extractStoreNameFromMemo,
  parseGroupOrderItemLine,
  computeGroupOrderSummary,
  appendGroupOrderItem,
  isSameOrRelatedStore,
  extractStoreFamilyFavorites,
  detectCollaborativeOrderMode,
  createGroupOrderPushNotification,
  createGroupOrderAppendPushNotification,
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
      expect(isGroupOrderMemo('外帶便當團', '')).toBe(true);
      expect(isGroupOrderMemo('宵夜團', '')).toBe(true);
    });

    it('回診與一般待辦清單即使有多行待辦，也絕不誤判為開團', () => {
      expect(isGroupOrderMemo('出國行李清單', '- [ ] 護照\n- [ ] 簽證')).toBe(false);
      expect(isGroupOrderMemo('回診', '智116/1/9早28號心臟科\n[ ] 115/11/8第2次慢籤\n[ ] 115/12/6第3次慢籤')).toBe(false);
      expect(isGroupOrderMemo('生活記事', '生活記事與代辦提醒可以選全家或個人\n[✓] 帳本瀏覽畫面會閃爍\n[✓] 信用卡帳單通知應該個人就好')).toBe(false);
      expect(isGroupOrderMemo('大掃除', '[ ] 客廳\n[ ] 房間')).toBe(false);
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

    it('待辦中的店家名稱與引導說明行應自動過濾回傳 null，不計入點餐項目', () => {
      expect(parseGroupOrderItemLine('- [ ] 店家：50嵐、清心福泉')).toBeNull();
      expect(parseGroupOrderItemLine('- [ ] 店名：麻古茶坊')).toBeNull();
      expect(parseGroupOrderItemLine('- [ ] 大家直接在下方點【＋我也要 / 登記品項】快速報單！')).toBeNull();
      expect(parseGroupOrderItemLine('- [ ] 大家快填想喝什麼')).toBeNull();
    });
  });

  describe('computeGroupOrderSummary 統計開團總結', () => {
    it('能正確過濾提示引導行，僅計算真實點餐項目', () => {
      const userUploadedContent = `[🧋 點餐開團]
- [ ] 店家：50嵐、清心福泉
- [ ] 大家直接在下方點【＋我也要 / 登記品項】快速報單！
- [ ] 智爸：冬瓜檸檬（半糖、去冰、加椰果）$45`;

      const summary = computeGroupOrderSummary(userUploadedContent, '點餐開團');
      expect(summary.isGroupOrder).toBe(true);
      expect(summary.storeName).toBe('50嵐、清心福泉');
      expect(summary.totalCount).toBe(1);
      expect(summary.completedCount).toBe(0);
      expect(summary.totalAmount).toBe(45);
      expect(summary.hasAmount).toBe(true);
      expect(summary.items[0].memberName).toBe('智爸');
      expect(summary.items[0].itemName).toBe('冬瓜檸檬');
      expect(summary.items[0].specs).toBe('半糖、去冰、加椰果');
      expect(summary.items[0].price).toBe(45);
      // 確保打勾索引對應到記事中的第 2 個待辦 (智爸是第 3 行，index 2)
      expect(summary.items[0].lineIndex).toBe(2);
    });

    it('能正確累加多筆點餐總杯數與金額', () => {
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

    it('回診與一般待辦清單即使有多行待辦，也絕不誤判為開團', () => {
      const clinicContent = `智116/1/9早28號心臟科
[ ] 115/11/8第2次慢籤
[ ] 115/12/6第3次慢籤`;
      const clinicSummary = computeGroupOrderSummary(clinicContent, '回診');
      expect(clinicSummary.isGroupOrder).toBe(false);

      const todoContent = `生活記事與待辦提醒可以選全家或個人
[✓] 帳本瀏覽畫面會閃爍
[✓] 信用卡帳單通知應該個人就好
[✓] 被忘掉的被刪除還會回來
[✓] 轉零用錢跟轉帳的功能重複
[✓] 記事連動只能跟支出`;
      const todoSummary = computeGroupOrderSummary(todoContent, '生活記事');
      expect(todoSummary.isGroupOrder).toBe(false);
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

  describe('isSameOrRelatedStore 店名智慧比對', () => {
    it('完全相同或包含關係應判定為相符', () => {
      expect(isSameOrRelatedStore('50嵐', '50嵐')).toBe(true);
      expect(isSameOrRelatedStore('50嵐', '50嵐、清心福泉')).toBe(true);
      expect(isSameOrRelatedStore('50嵐、清心福泉', '50嵐')).toBe(true);
    });

    it('不相關的店名應回傳 false', () => {
      expect(isSameOrRelatedStore('50嵐', '麻古茶坊')).toBe(false);
      expect(isSameOrRelatedStore('點餐店家', '50嵐')).toBe(false);
    });
  });

  describe('extractStoreFamilyFavorites 全家同步招牌與私房推薦萃取', () => {
    const mockTransactions = [
      {
        id: 'tx-1',
        category: { name: '生活記事' },
        note: `[🧋 點餐開團]
店家：50嵐、清心福泉
大家直接點右上方【＋我也要】快速報單！
- [ ] 智爸：冬瓜檸檬（半糖、去冰、加椰果）$45
- [ ] 瑩媽：波霸紅茶拿鐵（微糖微冰）$60
- [ ] 洋洋：四季春珍波椰（少冰無糖）$50`,
      },
      {
        id: 'tx-2',
        category: { name: '生活記事' },
        note: `【開團】今天喝 50嵐！
- [x] 智爸：冬瓜檸檬（半糖、去冰、加椰果）$45
- [ ] 瑩媽：四季春青茶（無糖常溫）$35
- [ ] 豆豆：冬瓜檸檬（微糖微冰）$45`,
      },
    ];

    it('能精準萃取指定成員 (智爸) 的專屬私房招牌與完整規格金額', () => {
      const favs = extractStoreFamilyFavorites('50嵐', mockTransactions, '智爸');
      expect(favs.memberFavorites.length).toBeGreaterThan(0);
      const topMem = favs.memberFavorites[0];
      expect(topMem.itemName).toBe('冬瓜檸檬');
      expect(topMem.price).toBe(45);
      expect(topMem.specs).toBe('半糖、去冰、加椰果');
      expect(topMem.count).toBe(2);
    });

    it('切換成員為瑩媽時，專屬招牌能動態切換為瑩媽常點品項', () => {
      const favs = extractStoreFamilyFavorites('50嵐', mockTransactions, '瑩媽');
      const itemNames = favs.memberFavorites.map(m => m.itemName);
      expect(itemNames).toContain('波霸紅茶拿鐵');
      expect(itemNames).toContain('四季春青茶');
    });

    it('全家熱銷排行應按累計被點次數排序，且排除已在成員推薦中的品項', () => {
      const favs = extractStoreFamilyFavorites('50嵐', mockTransactions, '智爸');
      // 冬瓜檸檬全家點了 3 次，但因智爸專屬已有，全家排行會呈現其他熱門品項
      const famNames = favs.familyTopFavorites.map(f => f.itemName);
      expect(famNames).toContain('波霸紅茶拿鐵');
      expect(famNames).toContain('四季春珍波椰');
    });
  });

  describe('賣場推車採買模式 (Grocery Shopping Mode) 測試', () => {
    it('detectCollaborativeOrderMode 能精準區分點餐與採買模式', () => {
      expect(detectCollaborativeOrderMode('【點餐】50嵐', '')).toBe('food');
      expect(detectCollaborativeOrderMode('下午茶開團', '')).toBe('food');
      expect(detectCollaborativeOrderMode('好市多採買', '')).toBe('grocery');
      expect(detectCollaborativeOrderMode('超市生活採買', '[🛒 採買清單]')).toBe('grocery');
      expect(detectCollaborativeOrderMode('生活備忘', '全聯補貨清單')).toBe('grocery');
    });

    it('採買清單能被 isGroupOrderMemo 命中，並自動推測賣場名稱', () => {
      expect(isGroupOrderMemo('好市多採買', '')).toBe(true);
      expect(isGroupOrderMemo('超市採買', '[🛒 採買清單] 全聯\n- [ ] 鮮奶')).toBe(true);
      expect(extractStoreNameFromMemo('好市多採買', '')).toBe('好市多');
      expect(extractStoreNameFromMemo('生活備忘', '賣場：家樂福\n- [ ] 衛生紙')).toBe('家樂福');
    });

    it('computeGroupOrderSummary 正確計算採買清單模式與項目統計', () => {
      const groceryNote = `[🛒 採買清單]
賣場：好市多
大家直接點【＋我要買】追加補貨！
- [ ] 瑩媽：科克蘭三層衛生紙（1串）$389
- [x] 洋洋：義美全脂鮮奶（2瓶組）$249
- [ ] 智爸：特選無骨牛小排 $1200`;

      const summary = computeGroupOrderSummary(groceryNote, '好市多採買');
      expect(summary.isGroupOrder).toBe(true);
      expect(summary.mode).toBe('grocery');
      expect(summary.storeName).toBe('好市多');
      expect(summary.totalCount).toBe(3);
      expect(summary.completedCount).toBe(1);
      expect(summary.totalAmount).toBe(1838);
      expect(summary.hasAmount).toBe(true);
    });

    it('appendGroupOrderItem 支援 isDone: true 現場隨手加直接標記為已放推車', () => {
      const initial = '[🛒 採買清單]\n- [ ] 瑩媽：鮮奶';
      const updated = appendGroupOrderItem(initial, {
        memberName: '智爸',
        itemName: '特價牛排',
        price: 500,
        isDone: true,
      });

      expect(updated).toBe('[🛒 採買清單]\n- [ ] 瑩媽：鮮奶\n- [x] 智爸：特價牛排 $500');
    });

    it('好市多與全聯新開團無歷史時，自動提供知名賣場專屬內建熱銷推薦備援', () => {
      const costcoFavs = extractStoreFamilyFavorites('好市多', []);
      expect(costcoFavs.familyTopFavorites.length).toBeGreaterThan(0);
      const itemNames = costcoFavs.familyTopFavorites.map(f => f.itemName);
      expect(itemNames).toContain('科克蘭三層抽取衛生紙');
      expect(itemNames).toContain('美國特選無骨牛小排');
    });

    describe('方案 B：開團與採買之家庭原生即時推播文案生成', () => {
      it('發起開團時正確生成賣場採買與餐飲點餐推播內容', () => {
        const groceryPush = createGroupOrderPushNotification({
          mode: 'grocery',
          storeName: '好市多',
          senderName: '智爸',
        });
        expect(groceryPush.title).toBe('🛒 好市多 開團採買囉！');
        expect(groceryPush.body).toContain('智爸 發起了補貨清單');

        const foodPush = createGroupOrderPushNotification({
          mode: 'food',
          storeName: '50嵐',
          senderName: '瑩媽',
        });
        expect(foodPush.title).toBe('🧋 50嵐 下午茶開團啦！');
        expect(foodPush.body).toContain('瑩媽 發起了點餐許願池');
      });

      it('家人報單追加時精準生成通知發起人的推播內容', () => {
        const groceryAppend = createGroupOrderAppendPushNotification({
          mode: 'grocery',
          storeName: '好市多',
          senderName: '洋洋',
          item: {
            itemName: '義美全脂鮮奶',
            specs: '2瓶組',
            price: 249,
          },
        });
        expect(groceryAppend.title).toBe('🛒 好市多 收到追加補貨！');
        expect(groceryAppend.body).toBe('洋洋 追加了：義美全脂鮮奶（2瓶組） $249');

        const foodAppend = createGroupOrderAppendPushNotification({
          mode: 'food',
          storeName: '50嵐',
          senderName: '豆豆',
          item: {
            itemName: '波霸紅茶拿鐵',
            specs: '微糖微冰',
            price: 60,
          },
        });
        expect(foodAppend.title).toBe('🧋 50嵐 收到新點單！');
        expect(foodAppend.body).toBe('豆豆 登記了：波霸紅茶拿鐵（微糖微冰） $60');
      });
    });
  });
});
