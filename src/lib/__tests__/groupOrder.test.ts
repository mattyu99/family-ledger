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
  isRestockPoolMemo,
  extractPendingRestockItems,
  mergeRestockItemsIntoNote,
  updateGroupOrderItemMember,
  updateGroupOrderItem,
  deleteGroupOrderItem,
  parseVoteOptionLine,
  toggleGroupOrderVote,
  finalizeGroupOrderVote,
  convertVoteToFoodOrder,
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
      expect(isGroupOrderMemo('繳費備忘', '[ ] 繳水費\n[ ] 繳電費')).toBe(false);
    });

    it('能精準辨識家事大掃除與任務懸賞等協同分工記事', () => {
      expect(isGroupOrderMemo('🧹 週末大掃除分工', '- [ ] 客廳吸地 $50\n- [ ] 倒垃圾 $30')).toBe(true);
      expect(isGroupOrderMemo('家事懸賞榜', '- [ ] 洋洋：洗碗 $60')).toBe(true);
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

  describe('網購湊免運與家庭包裹代領模式 (parcel mode) 測試', () => {
    it('detectCollaborativeOrderMode 能精準辨識網購平台與包裹取貨為 parcel 模式', () => {
      expect(detectCollaborativeOrderMode('📦 網購湊單', '酷澎還差 200 免運')).toBe('parcel');
      expect(detectCollaborativeOrderMode('蝦皮湊免運', '')).toBe('parcel');
      expect(detectCollaborativeOrderMode('超商取貨', '7-11 有一件包裹待領')).toBe('parcel');
      expect(detectCollaborativeOrderMode('momo 補貨團', '')).toBe('parcel');
    });

    it('isGroupOrderMemo 與 extractStoreNameFromMemo 正確識別電商與超商名稱', () => {
      expect(isGroupOrderMemo('酷澎湊免運', '- [ ] 瑩媽：濕紙巾 $399')).toBe(true);
      expect(isGroupOrderMemo('待領包裹看板', '[📦 網購湊單]\n平台：蝦皮店到店')).toBe(true);
      expect(extractStoreNameFromMemo('酷澎湊單', '')).toBe('酷澎');
      expect(extractStoreNameFromMemo('待領包裹', '超商：蝦皮店到店')).toBe('蝦皮店到店');
      expect(extractStoreNameFromMemo('超商包裹', '7-11 取貨末三碼 456')).toBe('7-11');
      expect(extractStoreNameFromMemo('momo 團', '')).toBe('momo');
    });

    it('parcel 模式的推播通知文案正確生成', () => {
      const launchPush = createGroupOrderPushNotification({
        mode: 'parcel',
        storeName: '酷澎',
        senderName: '瑩媽',
      });
      expect(launchPush.title).toBe('📦 酷澎 湊單／包裹通知！');
      expect(launchPush.body).toContain('瑩媽 發起了網購湊免運或待領包裹看板');

      const appendPush = createGroupOrderAppendPushNotification({
        mode: 'parcel',
        storeName: '全家',
        senderName: '智爸',
        item: {
          itemName: '貓砂包裹',
          specs: '末三碼123、貨到付款',
          price: 450,
        },
      });
      expect(appendPush.title).toBe('📦 全家 收到新登記！');
      expect(appendPush.body).toBe('智爸 登記了：貓砂包裹（末三碼123、貨到付款） $450');
    });
  });

  describe('家中缺貨隨手記與一鍵匯入採買閉環測試', () => {
    it('isRestockPoolMemo 精準識別缺貨隨手記，且 isGroupOrderMemo 不會將純缺貨池誤當開團廣播', () => {
      expect(isRestockPoolMemo('🏠 家中缺貨', '- [ ] 兒童牙膏')).toBe(true);
      expect(isRestockPoolMemo('生活備忘', '[🏠 家中缺貨] 衛生紙快用完了')).toBe(true);
      expect(isGroupOrderMemo('🏠 家中缺貨', '- [ ] 兒童牙膏')).toBe(false);
    });

    it('extractPendingRestockItems 能同時萃取待辦清單與純文字缺貨項目，並過濾已打勾或已辦妥記事', () => {
      const mockTxs = [
        {
          id: 'memo-restock-1',
          type: 'memo',
          is_settled: false,
          note: `[🏠 家中缺貨]
- [ ] 洋洋：兒童牙膏（草莓口味）
- [x] 智爸：已經買到的洗髮精`,
        },
        {
          id: 'memo-restock-2',
          type: 'memo',
          is_settled: false,
          note: `[🏠 家中缺貨] 濾水壺濾芯 $699`,
        },
        {
          id: 'memo-restock-settled',
          type: 'memo',
          is_settled: true,
          note: `[🏠 家中缺貨]
- [ ] 已匯入結案的衛生紙`,
        },
        {
          id: 'memo-normal',
          type: 'memo',
          is_settled: false,
          note: `[📌 待辦清單] 繳水電費`,
        },
      ];

      const items = extractPendingRestockItems(mockTxs);
      expect(items.length).toBe(2);
      expect(items[0]).toMatchObject({
        memoId: 'memo-restock-1',
        memberName: '洋洋',
        itemName: '兒童牙膏',
        specs: '草莓口味',
      });
      expect(items[1]).toMatchObject({
        memoId: 'memo-restock-2',
        itemName: '濾水壺濾芯',
        price: 699,
      });
    });

    it('mergeRestockItemsIntoNote 能將缺貨項目匯入採買記事並自動略過重複品項', () => {
      const pending = [
        {
          memoId: 'm1',
          memoTitle: '家中缺貨',
          lineIndex: 0,
          rawText: '洋洋：兒童牙膏',
          memberName: '洋洋',
          itemName: '兒童牙膏',
          specs: '草莓口味',
          price: 0,
        },
        {
          memoId: 'm2',
          memoTitle: '家中缺貨',
          lineIndex: 0,
          rawText: '鮮奶',
          memberName: '',
          itemName: '鮮奶',
          specs: '',
          price: 165,
        },
      ];

      const currentNote = `[🛒 採買清單]\n賣場：全聯\n- [ ] 瑩媽：鮮奶`;
      const merged = mergeRestockItemsIntoNote(currentNote, pending);

      expect(merged.addedCount).toBe(1);
      expect(merged.affectedMemoIds).toEqual(['m1']);
      expect(merged.updatedNote).toContain('- [ ] 洋洋：兒童牙膏（草莓口味）');
      expect(merged.updatedNote).not.toContain('鮮奶（缺貨匯入）');
    });
  });

  describe('家事零用錢懸賞與通用任務分工引擎測試', () => {
    it('detectCollaborativeOrderMode 能精準識別家事與任務分工模式', () => {
      expect(detectCollaborativeOrderMode('🧹 家事懸賞榜', '')).toBe('chore');
      expect(detectCollaborativeOrderMode('週末大掃除', '- [ ] 客廳吸地')).toBe('chore');
      expect(detectCollaborativeOrderMode('家庭分工清單', '- [ ] 倒垃圾')).toBe('chore');
      expect(detectCollaborativeOrderMode('房間大掃除清潔', '')).toBe('chore');
    });

    it('computeGroupOrderSummary 能針對已完成的家事項目精準計算各認領成員的零用錢總額', () => {
      const note = `[🧹 家事懸賞]
- [x] 洋洋：吸地擦窗戶 $100
- [x] 洋洋：倒垃圾 $20
- [x] 翔翔：洗碗盤 $50
- [ ] 翔翔：整理玩具（未完成） $40
- [x] 澆花（未認領但已做完） $30
- [ ] 擦沙發（未認領未做完） $50`;

      const summary = computeGroupOrderSummary(note, 'chore');
      expect(summary.totalCount).toBe(6);
      expect(summary.completedCount).toBe(4);
      expect(summary.totalAmount).toBe(170); // 100 + 20 + 50 (只有洋洋與翔翔已完成且有認領者，未認領或未完成不計入發放金額)
      expect(summary.memberEarnings.length).toBe(2);

      const yang = summary.memberEarnings.find(e => e.memberName === '洋洋');
      expect(yang).toBeDefined();
      expect(yang?.completedCount).toBe(2);
      expect(yang?.totalAmount).toBe(120);
      expect(yang?.completedItems).toEqual(['吸地擦窗戶', '倒垃圾']);

      const hsiang = summary.memberEarnings.find(e => e.memberName === '翔翔');
      expect(hsiang).toBeDefined();
      expect(hsiang?.completedCount).toBe(1);
      expect(hsiang?.totalAmount).toBe(50);
      expect(hsiang?.completedItems).toEqual(['洗碗盤']);
    });

    it('updateGroupOrderItemMember 支援認領、更換認領人與取消認領', () => {
      const initialNote = `[🧹 家事懸賞]
- [ ] 倒垃圾 $30
- [x] 洋洋：吸客廳 $80
- [ ] 翔翔：擦餐桌 $50`;

      // 1. 認領未指派的項目 (checklist index 0 是 "- [ ] 倒垃圾 $30")
      const claimedNote = updateGroupOrderItemMember(initialNote, 0, '洋洋');
      expect(claimedNote).toContain('- [ ] 洋洋：倒垃圾 $30');

      // 2. 更換負責人 (checklist index 1, 洋洋換成智爸，並保留已完成打勾)
      const reassignedNote = updateGroupOrderItemMember(claimedNote, 1, '智爸');
      expect(reassignedNote).toContain('- [x] 智爸：吸客廳 $80');
      expect(reassignedNote).not.toContain('洋洋：吸客廳');

      // 3. 取消認領退回大家搶 (checklist index 2, 翔翔取消認領)
      const unclaimedNote = updateGroupOrderItemMember(reassignedNote, 2, '');
      expect(unclaimedNote).toContain('- [ ] 擦餐桌 $50');
      expect(unclaimedNote).not.toContain('翔翔：擦餐桌');
    });

    it('updateGroupOrderItem 能精準修改品名、規格、金額並保留狀態', () => {
      const initialNote = `[ 🧋 點餐開團]
- [ ] 智爸：豆花
- [ ] 瑩媽：蛋 $36`;

      // 瑩媽將「蛋 $36」修改為「茶葉蛋（2顆）$40」 (checklist index 1)
      const updatedNote = updateGroupOrderItem(initialNote, 1, {
        memberName: '瑩媽',
        itemName: '茶葉蛋',
        specs: '2顆',
        price: 40,
      });

      expect(updatedNote).toContain('- [ ] 智爸：豆花');
      expect(updatedNote).toContain('- [ ] 瑩媽：茶葉蛋（2顆） $40');
      expect(updatedNote).not.toContain('蛋 $36');

      // 測試已打勾項目修改後維持 [x] 打勾狀態
      const checkedNote = `[ 🧋 點餐開團]
- [x] 洋洋：波霸紅茶 $35`;
      const modifiedChecked = updateGroupOrderItem(checkedNote, 0, {
        itemName: '波霸奶茶',
        specs: '微糖微冰',
        price: 55,
      });
      expect(modifiedChecked).toContain('- [x] 洋洋：波霸奶茶（微糖微冰） $55');
    });

    it('deleteGroupOrderItem 能精準刪除指定點餐待辦項目', () => {
      const initialNote = `[ 🧋 點餐開團]
- [ ] 智爸：豆花
- [ ] 瑩媽：蛋 $36
- [ ] 豆豆：布丁 $25`;

      // 刪除瑩媽的項目 (checklist index 1)
      const deletedNote = deleteGroupOrderItem(initialNote, 1);
      expect(deletedNote).toContain('- [ ] 智爸：豆花');
      expect(deletedNote).toContain('- [ ] 豆豆：布丁 $25');
      expect(deletedNote).not.toContain('瑩媽：蛋 $36');
    });
  });

  describe('家庭民主投票與決策看板引擎測試 (Vote Mode)', () => {
    it('detectCollaborativeOrderMode 能精準識別家庭投票與決策模式', () => {
      expect(detectCollaborativeOrderMode('🗳️ 家庭投票', '')).toBe('vote');
      expect(detectCollaborativeOrderMode('週末聚餐吃什麼投票', '')).toBe('vote');
      expect(detectCollaborativeOrderMode('連假去哪玩投票決策', '')).toBe('vote');
      expect(detectCollaborativeOrderMode('空氣清淨機挑選【投票】', '')).toBe('vote');
    });

    it('parseVoteOptionLine 能解析投票候選方案、得票人名與票數', () => {
      const opt1 = parseVoteOptionLine('- [ ] 鼎泰豐（智爸、瑩媽、洋洋 +3）', 0);
      expect(opt1).not.toBeNull();
      expect(opt1?.title).toBe('鼎泰豐');
      expect(opt1?.voters).toEqual(['智爸', '瑩媽', '洋洋']);
      expect(opt1?.voteCount).toBe(3);
      expect(opt1?.isDecided).toBe(false);

      const opt2 = parseVoteOptionLine('- [x] 藏壽司（洋洋、翔翔 +2）', 1);
      expect(opt2).not.toBeNull();
      expect(opt2?.title).toBe('藏壽司');
      expect(opt2?.voters).toEqual(['洋洋', '翔翔']);
      expect(opt2?.voteCount).toBe(2);
      expect(opt2?.isDecided).toBe(true);

      const opt3 = parseVoteOptionLine('- [ ] 碳佐麻里', 2);
      expect(opt3).not.toBeNull();
      expect(opt3?.title).toBe('碳佐麻里');
      expect(opt3?.voters).toEqual([]);
      expect(opt3?.voteCount).toBe(0);
    });

    it('computeGroupOrderSummary 正確計算投票總票數、百分比與領先方案', () => {
      const note = `[🗳️ 週末聚餐投票] 吃哪家好？
- [ ] 鼎泰豐（智爸、瑩媽、洋洋 +3）
- [ ] 藏壽司（洋洋、翔翔 +2）
- [ ] 碳佐麻里（智爸 +1）
- [ ] 義大利麵`;

      const summary = computeGroupOrderSummary(note, '🗳️ 週末聚餐投票');
      expect(summary.mode).toBe('vote');
      expect(summary.totalCount).toBe(4);
      expect(summary.totalVotes).toBe(6); // 3 + 2 + 1 + 0 = 6
      expect(summary.voteOptions?.length).toBe(4);

      // 領先方案是鼎泰豐 (3票 · 50%)
      expect(summary.leadingOption?.title).toBe('鼎泰豐');
      expect(summary.leadingOption?.voteCount).toBe(3);
      expect(summary.leadingOption?.percentage).toBe(50);

      // 第二名藏壽司 (2票 · 33%)
      const sushi = summary.voteOptions?.find(o => o.title === '藏壽司');
      expect(sushi?.voteCount).toBe(2);
      expect(sushi?.percentage).toBe(33);
    });

    it('toggleGroupOrderVote 支援投下一票 (+1) 與撤回投票 (-1)', () => {
      const initial = `[🗳️ 週末聚餐投票]
- [ ] 鼎泰豐（智爸 +1）
- [ ] 藏壽司`;

      // 1. 瑩媽在鼎泰豐投下一票 -> 智爸、瑩媽 +2
      const step1 = toggleGroupOrderVote(initial, 0, '瑩媽');
      expect(step1).toContain('- [ ] 鼎泰豐（智爸、瑩媽 +2）');

      // 2. 智爸撤回在鼎泰豐的投票 -> 瑩媽 +1
      const step2 = toggleGroupOrderVote(step1, 0, '智爸');
      expect(step2).toContain('- [ ] 鼎泰豐（瑩媽 +1）');

      // 3. 洋洋在未有人投的藏壽司投下一票 -> 洋洋 +1
      const step3 = toggleGroupOrderVote(step2, 1, '洋洋');
      expect(step3).toContain('- [ ] 藏壽司（洋洋 +1）');

      // 4. 洋洋撤回在藏壽司的投票 -> 恢復純文字無括弧
      const step4 = toggleGroupOrderVote(step3, 1, '洋洋');
      expect(step4).toContain('- [ ] 藏壽司');
      expect(step4).not.toContain('藏壽司（');
    });

    it('finalizeGroupOrderVote 拍板定案最高票選項', () => {
      const note = `[🗳️ 週末聚餐投票]
- [ ] 鼎泰豐（智爸、瑩媽 +2）
- [ ] 藏壽司（洋洋 +1）`;

      const finalized = finalizeGroupOrderVote(note, 0);
      expect(finalized).toContain('- [x] 鼎泰豐（智爸、瑩媽 +2）');
      expect(finalized).toContain('- [ ] 藏壽司（洋洋 +1）');
    });

    it('convertVoteToFoodOrder 能將勝出的餐廳無縫轉為點餐開團記事', () => {
      const foodOrder = convertVoteToFoodOrder('🍲 鼎泰豐小籠包');
      expect(foodOrder).toContain('[🧋 點餐開團] 店家：鼎泰豐小籠包');
      expect(foodOrder).toContain('店家：鼎泰豐小籠包');
      expect(foodOrder).toContain('快速報單');
    });
  });
});
