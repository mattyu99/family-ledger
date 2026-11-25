import {
  accountTypeSupportsBalance,
  buildPaymentAccountPayloads,
  parseAccountBalanceInput,
  PaymentAccountFormValues,
} from '../paymentAccountForm';

const createBaseForm = (
  overrides: Partial<PaymentAccountFormValues> = {}
): PaymentAccountFormValues => ({
  type: 'bank',
  name: '測試帳戶',
  userId: 'member-1',
  lastFour: '',
  cardNumber: '',
  cycleDate: '15',
  dueDay: '',
  issuerBank: '',
  balance: '0',
  color: '#1E40AF',
  ...overrides,
});

describe('paymentAccountForm 卡片與帳戶表單組裝測試', () => {
  describe('parseAccountBalanceInput 餘額解析', () => {
    it('可正確解析純數字、含千分位逗號、空白與小數字串', () => {
      expect(parseAccountBalanceInput('50000')).toBe(50000);
      expect(parseAccountBalanceInput('50,000')).toBe(50000);
      expect(parseAccountBalanceInput(' 1,250,000.5 ')).toBe(1250000.5);
      expect(parseAccountBalanceInput('-1200')).toBe(-1200);
    });

    it('空字串、非法字串與 null/undefined 應安全回傳 0', () => {
      expect(parseAccountBalanceInput('')).toBe(0);
      expect(parseAccountBalanceInput('   ')).toBe(0);
      expect(parseAccountBalanceInput('abc')).toBe(0);
      expect(parseAccountBalanceInput(null)).toBe(0);
      expect(parseAccountBalanceInput(undefined)).toBe(0);
      expect(parseAccountBalanceInput(Number.NaN)).toBe(0);
    });

    it('直接傳入合法數字時應原樣保留', () => {
      expect(parseAccountBalanceInput(3500)).toBe(3500);
    });
  });

  describe('五種帳戶類型餘額保存矩陣（防止儲值卡以外餘額被歸零）', () => {
    it.each([
      { type: 'bank' as const, balanceInput: '50,000', expected: 50000 },
      { type: 'cash' as const, balanceInput: '3,200', expected: 3200 },
      { type: 'stored_value' as const, balanceInput: '850', expected: 850 },
    ])(
      '$type 類型於新增與編輯時皆須正確保留輸入餘額 ($expected)',
      ({ type, balanceInput, expected }) => {
        expect(accountTypeSupportsBalance(type)).toBe(true);
        const { updatePayload, createPayload } = buildPaymentAccountPayloads(
          createBaseForm({ type, balance: balanceInput }),
          3
        );
        expect(updatePayload.balance).toBe(expected);
        expect(createPayload.balance).toBe(expected);
      }
    );

    it.each([
      { type: 'credit_card' as const },
      { type: 'carrier' as const },
    ])(
      '$type 類型即使表單殘留非零餘額字串，儲存時仍應強制歸零',
      ({ type }) => {
        expect(accountTypeSupportsBalance(type)).toBe(false);
        const { updatePayload, createPayload } = buildPaymentAccountPayloads(
          createBaseForm({ type, balance: '99999' }),
          2
        );
        expect(updatePayload.balance).toBe(0);
        expect(createPayload.balance).toBe(0);
      }
    );
  });

  describe('各類型專屬欄位清理與轉換規則', () => {
    it('credit_card：應夾逼結帳日 (1~31)、驗證繳款日、設定發卡銀行與圖示', () => {
      const clampedLow = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'credit_card',
          name: ' 富邦 J 卡 ',
          issuerBank: ' 台北富邦 ',
          lastFour: ' 0649 ',
          cycleDate: '0',
          dueDay: '5',
        }),
        1
      );
      expect(clampedLow.validCycle).toBe(1);
      expect(clampedLow.validDueDay).toBe(5);
      expect(clampedLow.createPayload).toMatchObject({
        name: '富邦 J 卡',
        type: 'credit_card',
        issuer_bank: '台北富邦',
        last_four_digits: '0649',
        billing_cycle_date: 1,
        payment_due_day: 5,
        balance: 0,
        icon: '💳',
        sort_order: 1,
      });
      expect(clampedLow.updatePayload.issuer_bank).toBe('台北富邦');

      const clampedHighAndEmpty = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'credit_card',
          cycleDate: '45',
          dueDay: '32',
          issuerBank: '   ',
        }),
        2
      );
      expect(clampedHighAndEmpty.validCycle).toBe(31);
      expect(clampedHighAndEmpty.validDueDay).toBeNull();
      expect(clampedHighAndEmpty.createPayload.issuer_bank).toBeUndefined();
      expect(clampedHighAndEmpty.updatePayload.issuer_bank).toBeNull();

      const fallbackCycle = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'credit_card',
          cycleDate: 'abc',
          dueDay: '',
        }),
        3
      );
      expect(fallbackCycle.validCycle).toBe(15);
      expect(fallbackCycle.validDueDay).toBeNull();
    });

    it('stored_value：應濾除卡號非數字且上限 16 碼，並自動推導末四碼', () => {
      const withLongCard = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'stored_value',
          name: '悠遊卡',
          cardNumber: '0123-4567-8901-2345-9999',
          lastFour: '0000',
          balance: '1280',
        }),
        4
      );
      expect(withLongCard.createPayload).toMatchObject({
        card_number: '0123456789012345',
        last_four_digits: '2345',
        balance: 1280,
        icon: '🚌',
      });

      const withoutCardNumber = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'stored_value',
          cardNumber: '',
          lastFour: ' 8899 ',
          balance: '300',
        }),
        5
      );
      expect(withoutCardNumber.createPayload.card_number).toBeUndefined();
      expect(withoutCardNumber.createPayload.last_four_digits).toBe('8899');
    });

    it('bank：應保留餘額與末五碼，並清除信用卡週期欄位', () => {
      const result = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'bank',
          name: ' 街立存 ',
          lastFour: ' 12345 ',
          balance: '88,500',
          issuerBank: '台新',
        }),
        2
      );
      expect(result.createPayload).toMatchObject({
        name: '街立存',
        type: 'bank',
        last_four_digits: '12345',
        balance: 88500,
        billing_cycle_date: undefined,
        payment_due_day: undefined,
        issuer_bank: undefined,
        icon: '🏦',
      });
      expect(result.updatePayload.issuer_bank).toBeNull();
    });

    it('cash：應保留餘額並設定現金皮夾圖示', () => {
      const result = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'cash',
          name: '公用零用金',
          userId: null,
          balance: '4500',
        }),
        6
      );
      expect(result.createPayload).toMatchObject({
        name: '公用零用金',
        type: 'cash',
        user_id: null,
        balance: 4500,
        icon: '💵',
      });
      expect(result.updatePayload.user_id).toBeNull();
    });

    it('carrier：應保留原始代碼/Email、清空末四碼並依是否含 @ 切換圖示', () => {
      const emailCarrier = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'carrier',
          name: 'PSN 跨境電商',
          cardNumber: ' mattyu09@example.com ',
          lastFour: '1234',
          balance: '999',
        }),
        7
      );
      expect(emailCarrier.createPayload).toMatchObject({
        card_number: 'mattyu09@example.com',
        last_four_digits: undefined,
        balance: 0,
        icon: '📧',
      });

      const shopeeCarrier = buildPaymentAccountPayloads(
        createBaseForm({
          type: 'carrier',
          name: '【樂購蝦皮】載具',
          cardNumber: '16729177',
        }),
        8
      );
      expect(shopeeCarrier.createPayload.icon).toBe('🛍️');
      expect(shopeeCarrier.createPayload.card_number).toBe('16729177');
    });
  });
});
