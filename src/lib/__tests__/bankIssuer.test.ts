import {
  detectIssuerBank,
  getCardIssuerGroupKey,
  groupCreditCardsByIssuer,
  findIssuerGroupForCard,
  getSiblingCardIdsInGroup,
  findSameIssuerBillingPeerCards,
  mergeCloudPaymentAccountsWithLocal,
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
      expect(detectIssuerBank('街口豬富卡')?.id).toBe('taishin');
      expect(detectIssuerBank('街口聯名卡')?.id).toBe('taishin');
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

    it('未填寫發卡機構的「街口豬富卡」能與同持卡人同結帳日之台新卡自動歸為同一群組', () => {
      const taishinCards: PaymentAccount[] = [
        {
          id: 'taishin-jkopay',
          ledger_id: 'led-1',
          name: '街口豬富卡',
          type: 'credit_card',
          user_id: 'dad',
          billing_cycle_date: 12,
          balance: 0,
          sort_order: 1,
          created_at: '',
        },
        {
          id: 'taishin-gogo',
          ledger_id: 'led-1',
          name: '台新 @GoGo 黑狗卡',
          type: 'credit_card',
          user_id: 'dad',
          billing_cycle_date: 12,
          balance: 0,
          sort_order: 2,
          created_at: '',
        },
      ];

      const groups = groupCreditCardsByIssuer(taishinCards);
      expect(groups.length).toBe(1);
      expect(groups[0].key).toBe('dad__taishin__12');
      expect(groups[0].issuer.shortName).toBe('台新銀行');
      expect(groups[0].isMultiCard).toBe(true);
      expect(groups[0].cards.length).toBe(2);
      expect(groups[0].cards.map(c => c.id)).toEqual(['taishin-jkopay', 'taishin-gogo']);
    });
  });

  describe('4. Unicard 自動辨識、自訂非字典機構不碰撞與雲端本機發卡機構合併保護', () => {
    it('能自動辨識 unicard 為玉山銀行，且手動指定自訂銀行具最高優先權與獨立識別碼', () => {
      const autoDetected = detectIssuerBank('unicard');
      expect(autoDetected?.id).toBe('esun');
      expect(autoDetected?.shortName).toBe('玉山銀行');

      const customBankA = detectIssuerBank('unicard', '用山銀行');
      expect(customBankA?.shortName).toBe('用山銀行');
      expect(customBankA?.name).toBe('用山銀行');

      const customBankB = detectIssuerBank('星辰聯名卡', '星辰銀行');
      expect(customBankB?.shortName).toBe('星辰銀行');
      expect(customBankA?.id).not.toBe(customBankB?.id);
    });

    it('mergeCloudPaymentAccountsWithLocal 能在雲端尚未支援 issuer_bank 欄位時保留本機設定，並在雲端已支援時尊重雲端結果', () => {
      const localAccounts: PaymentAccount[] = [
        {
          id: 'card-unicard',
          ledger_id: 'led-1',
          name: 'unicard',
          type: 'credit_card',
          issuer_bank: '用山銀行',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 1,
          created_at: '',
        },
        {
          id: 'card-edited',
          ledger_id: 'led-1',
          name: '無名卡',
          type: 'credit_card',
          issuer_bank: '舊銀行',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 2,
          created_at: '',
        },
        {
          id: 'card-cleared',
          ledger_id: 'led-1',
          name: '通用卡',
          type: 'credit_card',
          issuer_bank: '曾經設定的銀行',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 3,
          created_at: '',
        },
      ];

      // 模擬：
      // 1. card-unicard 來自舊版 DB，物件完全不含 issuer_bank 鍵 ➔ 應保留本機「用山銀行」
      // 2. card-edited 來自已升級 DB，帶有新值「台新銀行」 ➔ 應採用雲端「台新銀行」
      // 3. card-cleared 來自已升級 DB，明確為 null ➔ 應尊重雲端清除結果 null
      // 4. card-new-cloud 為他機新增卡片 ➔ 正常保留
      const cloudAccounts: PaymentAccount[] = [
        {
          id: 'card-unicard',
          ledger_id: 'led-1',
          name: 'unicard',
          type: 'credit_card',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 1,
          created_at: '',
        },
        {
          id: 'card-edited',
          ledger_id: 'led-1',
          name: '無名卡',
          type: 'credit_card',
          issuer_bank: '台新銀行',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 2,
          created_at: '',
        },
        {
          id: 'card-cleared',
          ledger_id: 'led-1',
          name: '通用卡',
          type: 'credit_card',
          issuer_bank: null,
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 3,
          created_at: '',
        },
        {
          id: 'card-new-cloud',
          ledger_id: 'led-1',
          name: '新卡片',
          type: 'credit_card',
          issuer_bank: '國泰世華',
          billing_cycle_date: 20,
          balance: 0,
          sort_order: 4,
          created_at: '',
        },
      ];

      const merged = mergeCloudPaymentAccountsWithLocal(cloudAccounts, localAccounts);
      expect(merged.find(a => a.id === 'card-unicard')?.issuer_bank).toBe('用山銀行');
      expect(merged.find(a => a.id === 'card-edited')?.issuer_bank).toBe('台新銀行');
      expect(merged.find(a => a.id === 'card-cleared')?.issuer_bank).toBeNull();
      expect(merged.find(a => a.id === 'card-new-cloud')?.issuer_bank).toBe('國泰世華');
    });

    it('mergeCloudPaymentAccountsWithLocal 應同樣保護本機 payment_due_day 不被尚未升級的雲端回傳覆蓋', () => {
      const localAccounts: PaymentAccount[] = [
        {
          id: 'card-esun',
          ledger_id: 'led-1',
          name: '玉山 Ubear',
          type: 'credit_card',
          billing_cycle_date: 15,
          payment_due_day: 2,
          balance: 0,
          sort_order: 1,
          created_at: '',
        },
        {
          id: 'card-fubon',
          ledger_id: 'led-1',
          name: '富邦 J 卡',
          type: 'credit_card',
          billing_cycle_date: 20,
          payment_due_day: 7,
          balance: 0,
          sort_order: 2,
          created_at: '',
        },
      ];
      const cloudAccounts: PaymentAccount[] = [
        {
          id: 'card-esun',
          ledger_id: 'led-1',
          name: '玉山 Ubear',
          type: 'credit_card',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 1,
          created_at: '',
        },
        {
          id: 'card-fubon',
          ledger_id: 'led-1',
          name: '富邦 J 卡',
          type: 'credit_card',
          billing_cycle_date: 20,
          payment_due_day: 9,
          balance: 0,
          sort_order: 2,
          created_at: '',
        },
      ];
      const merged = mergeCloudPaymentAccountsWithLocal(cloudAccounts, localAccounts);
      expect(merged.find(a => a.id === 'card-esun')?.payment_due_day).toBe(2);
      expect(merged.find(a => a.id === 'card-fubon')?.payment_due_day).toBe(9);
    });

    it('findSameIssuerBillingPeerCards 能找出同持卡人同發卡銀行之其他信用卡供共用帳單週期，並排除不同持卡人與其他銀行', () => {
      const accounts: PaymentAccount[] = [
        {
          id: 'esun-1',
          ledger_id: 'led-1',
          name: '玉山 Unicard',
          type: 'credit_card',
          user_id: 'dad',
          issuer_bank: '玉山銀行',
          billing_cycle_date: 17,
          payment_due_day: 3,
          balance: 0,
          sort_order: 1,
          created_at: '',
        },
        {
          id: 'esun-2',
          ledger_id: 'led-1',
          name: '玉山 Ubear',
          type: 'credit_card',
          user_id: 'dad-alias',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 2,
          created_at: '',
        },
        {
          id: 'esun-mom',
          ledger_id: 'led-1',
          name: '玉山熊本熊卡',
          type: 'credit_card',
          user_id: 'mom',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 3,
          created_at: '',
        },
        {
          id: 'cathay-dad',
          ledger_id: 'led-1',
          name: '國泰 CUBE',
          type: 'credit_card',
          user_id: 'dad',
          billing_cycle_date: 15,
          balance: 0,
          sort_order: 4,
          created_at: '',
        },
      ];
      const getMemberById = (id?: string) => {
        if (id === 'dad' || id === 'dad-alias') return { id: id, display_name: '智爸' };
        if (id === 'mom') return { id: 'mom', display_name: '瑩媽' };
        return undefined;
      };

      const peers = findSameIssuerBillingPeerCards({
        accounts,
        cardName: '玉山 Pi 拍錢包卡',
        issuerBank: '玉山銀行',
        userId: 'dad',
        ledgerId: 'led-1',
        getMemberById,
      });

      expect(peers.map(p => p.id)).toEqual(['esun-1', 'esun-2']);

      const peersExcludingOne = findSameIssuerBillingPeerCards({
        accounts,
        cardName: '玉山 Unicard',
        issuerBank: '玉山銀行',
        userId: 'dad',
        excludeCardId: 'esun-1',
        ledgerId: 'led-1',
        getMemberById,
      });
      expect(peersExcludingOne.map(p => p.id)).toEqual(['esun-2']);
    });
  });
});

