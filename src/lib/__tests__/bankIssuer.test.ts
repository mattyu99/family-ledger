import {
  detectIssuerBank,
  getCardIssuerGroupKey,
  groupCreditCardsByIssuer,
  findIssuerGroupForCard,
  getSiblingCardIdsInGroup,
  TAIWAN_BANK_ISSUERS,
} from '../bankIssuer';
import { PaymentAccount } from '../../types/database';

describe('💳 信用卡發卡機構歸戶辨識演算法 (bankIssuer.test.ts)', () => {
  describe('1. detectIssuerBank 自然語言提取與顯式指定', () => {
    it('能精確辨識台灣主流信用卡名稱', () => {
      expect(detectIssuerBank('國泰世華 CUBE 卡')?.id).toBe('cathay');
      expect(detectIssuerBank('國泰KOKO卡')?.id).toBe('cathay');
      expect(detectIssuerBank('台北富邦 Costco 聯名卡')?.id).toBe('fubon');
      expect(detectIssuerBank('富邦 momo 卡')?.id).toBe('fubon');
      expect(detectIssuerBank('富邦 J 卡')?.id).toBe('fubon');
      expect(detectIssuerBank('中國信託 Line Pay 卡')?.id).toBe('ctbc');
      expect(detectIssuerBank('中信英雄聯盟卡')?.id).toBe('ctbc');
      expect(detectIssuerBank('台新 @GoGo 黑狗卡')?.id).toBe('taishin');
      expect(detectIssuerBank('台新玫瑰 Giving 卡')?.id).toBe('taishin');
      expect(detectIssuerBank('玉山 Ubear 卡')?.id).toBe('esun');
      expect(detectIssuerBank('玉山熊本熊日圓雙幣卡')?.id).toBe('esun');
      expect(detectIssuerBank('永豐 DAWHO 大戶現金回饋卡')?.id).toBe('sinopac');
      expect(detectIssuerBank('聯邦賴點卡')?.id).toBe('ubot');
      expect(detectIssuerBank('星展 eco 永續卡')?.id).toBe('dbs');
      expect(detectIssuerBank('兆豐 BT21 信用卡')?.id).toBe('megabank');
      expect(detectIssuerBank('第一銀行 iLEO 信用卡')?.id).toBe('first');
    });

    it('顯式指定 issuer_bank 具有最高優先權', () => {
      // 卡名只寫了「我的神卡」，但手動設定了「國泰世華」
      const bank = detectIssuerBank('我的主力消費卡', '國泰世華');
      expect(bank?.id).toBe('cathay');
      expect(bank?.shortName).toBe('國泰世華');

      // 顯式指定銀行代碼 012
      const fubon = detectIssuerBank('黑卡', '012');
      expect(fubon?.id).toBe('fubon');
    });

    it('自訂非字典內的發卡機構能正確回傳 custom 物件', () => {
      const customBank = detectIssuerBank('瑞士銀行私人卡', 'UBS 瑞士銀行');
      expect(customBank?.id).toBe('custom_ubs');
      expect(customBank?.name).toBe('UBS 瑞士銀行');
    });

    it('無法辨識的卡名或空字串回傳 null', () => {
      expect(detectIssuerBank('神秘小卡片')).toBeNull();
      expect(detectIssuerBank('')).toBeNull();
      expect(detectIssuerBank(undefined)).toBeNull();
    });
  });

  describe('2. getCardIssuerGroupKey 歸戶鍵安全性與分組規則', () => {
    const cardBase: PaymentAccount = {
      id: 'card-1',
      ledger_id: 'ledger-test',
      name: '國泰 CUBE 卡',
      type: 'credit_card',
      user_id: 'user-dad',
      billing_cycle_date: 15,
      balance: 0,
      sort_order: 1,
      created_at: new Date().toISOString(),
    };

    it('同持卡人 + 同銀行 + 同結帳日 ➔ 歸戶鍵完全相同', () => {
      const cardA = { ...cardBase, id: 'card-cube', name: '國泰世華 CUBE 卡' };
      const cardB = { ...cardBase, id: 'card-shopee', name: '國泰 蝦皮聯名卡' };

      const keyA = getCardIssuerGroupKey(cardA);
      const keyB = getCardIssuerGroupKey(cardB);

      expect(keyA).toBe(keyB);
      expect(keyA).toBe('user-dad__cathay__15');
    });

    it('不同持卡人 ➔ 嚴格分為不同群組（絕不跨人混淆）', () => {
      const dadCard = { ...cardBase, id: 'card-dad', user_id: 'user-dad', name: '國泰 CUBE 卡' };
      const momCard = { ...cardBase, id: 'card-mom', user_id: 'user-mom', name: '國泰 CUBE 卡' };

      expect(getCardIssuerGroupKey(dadCard)).not.toBe(getCardIssuerGroupKey(momCard));
    });

    it('同持卡人但不同結帳日 ➔ 依帳單週期獨立處理', () => {
      const cardCycle15 = { ...cardBase, id: 'card-15', billing_cycle_date: 15 };
      const cardCycle25 = { ...cardBase, id: 'card-25', billing_cycle_date: 25 };

      expect(getCardIssuerGroupKey(cardCycle15)).not.toBe(getCardIssuerGroupKey(cardCycle25));
    });
  });

  describe('3. groupCreditCardsByIssuer 與姊妹卡片查詢', () => {
    const testAccounts: PaymentAccount[] = [
      // 智爸的 2 張國泰卡 (同結帳日 15)
      {
        id: 'cathay-1',
        ledger_id: 'led-1',
        name: '國泰 CUBE 卡',
        type: 'credit_card',
        user_id: 'dad',
        billing_cycle_date: 15,
        balance: 0,
        sort_order: 1,
        created_at: '',
      },
      {
        id: 'cathay-2',
        ledger_id: 'led-1',
        name: '國泰世華 蝦皮卡',
        type: 'credit_card',
        user_id: 'dad',
        billing_cycle_date: 15,
        balance: 0,
        sort_order: 2,
        created_at: '',
      },
      // 智爸的 1 張富邦卡 (結帳日 20)
      {
        id: 'fubon-1',
        ledger_id: 'led-1',
        name: '富邦 Costco 聯名卡',
        type: 'credit_card',
        user_id: 'dad',
        billing_cycle_date: 20,
        balance: 0,
        sort_order: 3,
        created_at: '',
      },
      // 瑩媽的國泰卡 (持卡人 mom，結帳日 15)
      {
        id: 'cathay-mom',
        ledger_id: 'led-1',
        name: '國泰 CUBE 卡',
        type: 'credit_card',
        user_id: 'mom',
        billing_cycle_date: 15,
        balance: 0,
        sort_order: 4,
        created_at: '',
      },
      // 儲值卡（悠遊卡），應被自動過濾，不參與信用卡歸戶
      {
        id: 'easycard-1',
        ledger_id: 'led-1',
        name: '悠遊卡',
        type: 'stored_value',
        user_id: 'dad',
        balance: 500,
        sort_order: 5,
        created_at: '',
      },
    ];

    it('groupCreditCardsByIssuer 能準確將多卡分組並排除儲值卡', () => {
      const groups = groupCreditCardsByIssuer(testAccounts);

      // 應分為 3 個群組：智爸國泰 (2卡)、智爸富邦 (1卡)、瑩媽國泰 (1卡)
      expect(groups.length).toBe(3);

      const dadCathay = groups.find(g => g.key === 'dad__cathay__15');
      expect(dadCathay).toBeDefined();
      expect(dadCathay?.isMultiCard).toBe(true);
      expect(dadCathay?.cards.length).toBe(2);
      expect(dadCathay?.displayName).toBe('國泰世華 (2張卡)');

      const dadFubon = groups.find(g => g.key === 'dad__fubon__20');
      expect(dadFubon).toBeDefined();
      expect(dadFubon?.isMultiCard).toBe(false);
      expect(dadFubon?.cards.length).toBe(1);

      const momCathay = groups.find(g => g.key === 'mom__cathay__15');
      expect(momCathay).toBeDefined();
      expect(momCathay?.isMultiCard).toBe(false);
      expect(momCathay?.cards.length).toBe(1);
    });

    it('findIssuerGroupForCard 與 getSiblingCardIdsInGroup 能精確查獲同銀行卡片清單', () => {
      const group = findIssuerGroupForCard('cathay-1', testAccounts);
      expect(group).toBeDefined();
      expect(group?.issuer.shortName).toBe('國泰世華');
      expect(group?.isMultiCard).toBe(true);
      expect(group?.cards.map(c => c.id)).toEqual(['cathay-1', 'cathay-2']);

      const siblings = getSiblingCardIdsInGroup('cathay-1', testAccounts);
      expect(siblings).toEqual(['cathay-1', 'cathay-2']);

      const singleGroup = findIssuerGroupForCard('fubon-1', testAccounts);
      expect(singleGroup?.isMultiCard).toBe(false);

      const singleSiblings = getSiblingCardIdsInGroup('fubon-1', testAccounts);
      expect(singleSiblings).toEqual(['fubon-1']);

      const notFoundGroup = findIssuerGroupForCard('non-exist', testAccounts);
      expect(notFoundGroup).toBeNull();

      const notFoundSiblings = getSiblingCardIdsInGroup('non-exist', testAccounts);
      expect(notFoundSiblings).toEqual(['non-exist']);
    });
  });
});

