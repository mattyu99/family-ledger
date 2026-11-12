import { formatPaymentLabel } from '../payment';
import { PaymentAccount, CustomPaymentMethod } from '../../types/database';

describe('formatPaymentLabel 支付膠囊標籤精簡測試', () => {
  it('純信用卡情境：直接顯示卡片名稱，不再附加後四碼', () => {
    const cardAccount: PaymentAccount = {
      id: 'acc-card-1',
      ledger_id: 'ledger-1',
      name: '中信熊大卡',
      type: 'credit_card',
      balance: 0,
      last_four_digits: '5286',
      color: '#3B82F6',
      icon: '💳',
      sort_order: 1,
      created_at: new Date().toISOString(),
    };

    const label1 = formatPaymentLabel('credit_card', cardAccount);
    expect(label1.text).toBe('中信熊大卡');
    expect(label1.icon).toBe('💳');

    const label2 = formatPaymentLabel(undefined, cardAccount);
    expect(label2.text).toBe('中信熊大卡');
  });

  it('純信用卡但若無名稱時保底顯示後四碼', () => {
    const unnamedCard: PaymentAccount = {
      id: 'acc-card-2',
      ledger_id: 'ledger-1',
      name: '',
      type: 'credit_card',
      balance: 0,
      last_four_digits: '5286',
      sort_order: 1,
      created_at: new Date().toISOString(),
    };

    const label = formatPaymentLabel('credit_card', unnamedCard);
    expect(label.text).toBe('*5286');
  });

  it('行動支付/電子支付綁定信用卡：顯示「支付名稱·後四碼」', () => {
    const cardAccount: PaymentAccount = {
      id: 'acc-card-1',
      ledger_id: 'ledger-1',
      name: '富邦J卡',
      type: 'credit_card',
      balance: 0,
      last_four_digits: '7909',
      color: '#3B82F6',
      icon: '💳',
      sort_order: 1,
      created_at: new Date().toISOString(),
    };

    const customMethods: CustomPaymentMethod[] = [
      {
        id: 'line_pay',
        name: 'LINE Pay',
        icon: '🟢',
        color: '#06C755',
        supports_credit_card: true,
        is_enabled: true,
        sort_order: 1,
      },
    ];

    const label = formatPaymentLabel('line_pay', cardAccount, customMethods);
    expect(label.text).toBe('LINE Pay·7909');
    expect(label.icon).toBe('🟢');
  });

  it('儲值卡/悠遊卡：顯示卡片原名', () => {
    const easyCard: PaymentAccount = {
      id: 'acc-stored-1',
      ledger_id: 'ledger-1',
      name: '富邦J悠遊卡',
      type: 'stored_value',
      balance: 100,
      icon: '🚌',
      color: '#0284C7',
      sort_order: 1,
      created_at: new Date().toISOString(),
    };

    const label = formatPaymentLabel(undefined, easyCard);
    expect(label.text).toBe('富邦J悠遊卡');
    expect(label.icon).toBe('🚌');
  });
});
