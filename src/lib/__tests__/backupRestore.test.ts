import AsyncStorage from '@react-native-async-storage/async-storage';
import { encodeMemoMerchantTag, decodeMemoMerchantTag } from '../memo';
import { extractWidgetSnapshot } from '../widgetSync';
import { hydrateTransactionWithInvoice } from '../ledgerUtils';
import {
  SYSTEM_PAYMENT_METHOD_IDS,
  resolveRestoredPaymentMethodId,
  ensureInvoiceTagInNote,
  buildCloudTransactionUpsertRow,
  buildBackupPayload,
  executeLedgerRestore,
} from '../../hooks/useLedgerBackup';
import { STORAGE_KEYS } from '../../constants/ledgerDefaults';
import {
  Transaction,
  TransactionSplit,
  Ledger,
  Profile,
  Category,
  PaymentAccount,
  RecurringRule,
  CustomPaymentMethod,
  LedgerBudget,
  CarrierRule,
} from '../../types';

declare const require: (id: string) => any;
declare const __dirname: string;

describe('帳本備份與還原資料完整性測試 (Backup & Restore Integrity)', () => {
  const mockLedger: Ledger = {
    id: '11111111-1111-4111-8111-111111111111',
    name: '幸福家庭記帳本',
    currency: 'TWD',
    created_by: '22222222-2222-4222-8222-222222222221',
    created_at: '2026-01-01T00:00:00.000Z',
    admin_pin: '9527',
    is_read_only: false,
    allow_new_members: true,
  };

  const mockMembers: Profile[] = [
    {
      id: '22222222-2222-4222-8222-222222222221',
      display_name: '智爸',
      avatar_url: '👨',
      role: 'owner',
      email: 'dad@example.com',
      auth_email: 'dad.real@gmail.com',
      auth_provider: 'google',
      is_locked: true,
      custom_name: '把拔',
      custom_avatar: '🧔',
      mof_barcode: '/DAD+123',
      mof_sync_enabled: true,
      mof_last_synced_at: '2026-11-26T12:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      display_name: '智媽',
      avatar_url: '👩',
      role: 'member',
      custom_name: '馬麻',
      custom_avatar: '👩‍🦰',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('生活備忘在匯出與還原時，提醒日期、對象、曆法與週期應 100% 完整保留', () => {
    const originalMemo: Transaction = {
      id: 'tx-memo-1',
      ledger_id: mockLedger.id,
      creator_id: mockMembers[0].id,
      paid_by: mockMembers[0].id,
      category_id: 'cat-memo',
      amount: 0,
      type: 'memo',
      note: '[🏥 醫療健康] 116/1/29 洋長庚心臟內科定期回診',
      transacted_at: '2026-11-08T10:00:00.000Z',
      created_at: '2026-11-08T10:00:00.000Z',
      is_settled: false,
      reminder_date: '2027-01-29',
      reminder_calendar: 'solar',
      reminder_repeat: 'once',
      reminder_target: 'personal',
      completion_note: '記得帶抽血檢驗單',
    };

    const memoMerchantTag = originalMemo.merchant || encodeMemoMerchantTag({
      reminderDate: originalMemo.reminder_date,
      reminderCalendar: originalMemo.reminder_calendar,
      reminderRepeat: originalMemo.reminder_repeat,
      completedBy: originalMemo.completed_by,
      completedAt: originalMemo.completed_at,
    });

    const exportedJson = JSON.stringify({
      transactions: [{
        ...originalMemo,
        merchant: memoMerchantTag,
      }],
    });

    const parsedBackup = JSON.parse(exportedJson);
    const restoredRawTx = parsedBackup.transactions[0];

    const decodedMemo = decodeMemoMerchantTag(restoredRawTx.merchant);
    const restoredReminderDate = restoredRawTx.reminder_date || decodedMemo.reminderDate;
    const restoredReminderCal = restoredRawTx.reminder_calendar || decodedMemo.reminderCalendar;
    const restoredReminderRep = restoredRawTx.reminder_repeat || decodedMemo.reminderRepeat;
    const restoredReminderTarget = restoredRawTx.reminder_target || 'family';
    const restoredCompletionNote = restoredRawTx.completion_note;

    expect(restoredReminderDate).toBe('2027-01-29');
    expect(restoredReminderCal).toBe('solar');
    expect(restoredReminderRep).toBe('once');
    expect(restoredReminderTarget).toBe('personal');
    expect(restoredCompletionNote).toBe('記得帶抽血檢驗單');

    const restoredTx: Transaction = {
      ...restoredRawTx,
      reminder_date: restoredReminderDate,
      reminder_calendar: restoredReminderCal,
      reminder_repeat: restoredReminderRep,
      reminder_target: restoredReminderTarget,
    };

    const snapshot = extractWidgetSnapshot(mockLedger, [restoredTx], mockMembers, mockMembers[0].id);
    expect(snapshot.pendingMemos.length).toBe(1);
    expect(snapshot.pendingMemos[0].badgeText).toContain('01-29 · 智爸');
    expect(snapshot.pendingMemos[0].badgeText).not.toBe('日常');
  });

  it('備忘 merchant 標籤具備雙向容錯，即使 reminder_date 遺失也能由 merchant 標籤安全還原', () => {
    const legacyRawTx: Partial<Transaction> = {
      id: 'tx-legacy-1',
      type: 'memo',
      amount: 0,
      note: '長庚回診',
      merchant: 'remind:2027-01-29|cal:solar|rep:once',
    };

    const decoded = decodeMemoMerchantTag(legacyRawTx.merchant);
    const restoredReminder = legacyRawTx.reminder_date || decoded.reminderDate;

    expect(restoredReminder).toBe('2027-01-29');
    expect(decoded.reminderCalendar).toBe('solar');
    expect(decoded.reminderRepeat).toBe('once');
  });

  it('生活記事之長按置頂標記 (is_pinned) 在匯出與還原時應 100% 完整保留', () => {
    const pinnedMemo: Transaction = {
      id: 'tx-pinned-1',
      ledger_id: mockLedger.id,
      creator_id: mockMembers[0].id,
      paid_by: mockMembers[0].id,
      category_id: 'cat-memo',
      amount: 0,
      type: 'memo',
      note: '重要慢箋用藥清單',
      transacted_at: '2026-11-16T10:00:00.000Z',
      created_at: '2026-11-16T10:00:00.000Z',
      is_settled: false,
      is_pinned: true,
    };

    const memoMerchantTag = encodeMemoMerchantTag({
      isPinned: pinnedMemo.is_pinned,
    });

    const exportedJson = JSON.stringify({
      transactions: [{
        ...pinnedMemo,
        merchant: memoMerchantTag,
      }],
    });

    const parsedBackup = JSON.parse(exportedJson);
    const restoredRawTx = parsedBackup.transactions[0];
    const decodedMemo = decodeMemoMerchantTag(restoredRawTx.merchant);
    const restoredIsPinned = Boolean(restoredRawTx.is_pinned ?? decodedMemo.isPinned);

    expect(restoredIsPinned).toBe(true);
    expect(decodedMemo.isPinned).toBe(true);
  });

  it('生活記事之接力提醒開關 (reminder_relay) 與單則覆寫 (undefined / 0 / -1) 及信用卡繳款截止日 (payment_due_day) 在匯出與還原時應 100% 完整保留', () => {
    const relayMemo: Transaction = {
      id: 'tx-relay-1',
      ledger_id: mockLedger.id,
      creator_id: mockMembers[0].id,
      paid_by: mockMembers[0].id,
      category_id: 'cat-memo',
      amount: 0,
      type: 'memo',
      note: '[💊 慢箋接力] 阿公回診 116/1/9\n- [ ] 115/11/8 第2次慢箋',
      transacted_at: '2026-10-17T10:00:00.000Z',
      created_at: '2026-10-17T10:00:00.000Z',
      is_settled: false,
      reminder_date: '2026-11-08',
      reminder_calendar: 'solar',
      reminder_repeat: 'once',
      reminder_target: 'family',
      reminder_relay: true,
      reminder_relay_offset: -1,
    };

    const relayFollowDefaultMemo: Transaction = {
      ...relayMemo,
      id: 'tx-relay-default',
      reminder_relay_offset: undefined,
    };

    const relaySameDayMemo: Transaction = {
      ...relayMemo,
      id: 'tx-relay-sameday',
      reminder_relay_offset: 0,
    };

    const memoMerchantTag = encodeMemoMerchantTag({
      reminderDate: relayMemo.reminder_date,
      reminderCalendar: relayMemo.reminder_calendar,
      reminderRepeat: relayMemo.reminder_repeat,
      reminderTarget: relayMemo.reminder_target,
      isRelay: relayMemo.reminder_relay,
      relayOffsetDays: relayMemo.reminder_relay_offset,
    });
    const defaultTag = encodeMemoMerchantTag({
      reminderDate: relayFollowDefaultMemo.reminder_date,
      reminderTarget: 'family',
      isRelay: true,
      relayOffsetDays: relayFollowDefaultMemo.reminder_relay_offset,
    });
    const sameDayTag = encodeMemoMerchantTag({
      reminderDate: relaySameDayMemo.reminder_date,
      reminderTarget: 'family',
      isRelay: true,
      relayOffsetDays: relaySameDayMemo.reminder_relay_offset,
    });

    const exportedJson = JSON.stringify({
      payment_accounts: [
        {
          id: 'card-1',
          name: '玉山 Ubear',
          type: 'credit_card',
          billing_cycle_date: 15,
          payment_due_day: 2,
          balance: 0,
          sort_order: 1,
        },
      ],
      transactions: [
        { ...relayMemo, merchant: memoMerchantTag },
        { ...relayFollowDefaultMemo, merchant: defaultTag },
        { ...relaySameDayMemo, merchant: sameDayTag },
      ],
    });

    const parsedBackup = JSON.parse(exportedJson);
    const [restoredMinusOne, restoredDefault, restoredSameDay] = parsedBackup.transactions;

    expect(parsedBackup.payment_accounts[0].payment_due_day).toBe(2);

    expect(decodeMemoMerchantTag(restoredMinusOne.merchant).relayOffsetDays).toBe(-1);
    expect(decodeMemoMerchantTag(restoredDefault.merchant).relayOffsetDays).toBeUndefined();
    expect(decodeMemoMerchantTag(restoredSameDay.merchant).relayOffsetDays).toBe(0);
    expect(restoredMinusOne.reminder_relay_offset).toBe(-1);
    expect(restoredDefault.reminder_relay_offset).toBeUndefined();
    expect(restoredSameDay.reminder_relay_offset).toBe(0);
  });

  it('統一發票延伸明細與品項細項在匯出與還原時應 100% 完整保留', () => {
    const invoiceTx: Transaction = {
      id: 'tx-invoice-1',
      ledger_id: mockLedger.id,
      creator_id: mockMembers[0].id,
      paid_by: mockMembers[0].id,
      category_id: 'cat-food',
      amount: 155,
      type: 'expense',
      note: '全家便利商店',
      transacted_at: '2026-11-16T12:00:00.000Z',
      created_at: '2026-11-16T12:00:00.000Z',
      is_settled: false,
      invoice_number: 'AB-12345678',
      invoice_period: '2026-10',
      invoice_random_code: '8899',
      invoice_status: 'won',
      invoice_prize_amount: 200,
      invoice_prize_name: '六獎',
      invoice_sync_status: 'matched_cloud',
      invoice_items: [
        { name: '茶葉蛋', quantity: 2, unit_price: 14, amount: 28 },
        { name: '鮮乳 936ml', quantity: 1, unit_price: 98, amount: 98 },
        { name: '御飯糰', quantity: 1, unit_price: 29, amount: 29 },
      ],
      splits: [
        { id: 'sp-1', transaction_id: 'tx-invoice-1', user_id: mockMembers[0].id, split_amount: 100, is_settled: false },
        { id: 'sp-2', transaction_id: 'tx-invoice-1', user_id: mockMembers[1].id, split_amount: 55, is_settled: false },
      ],
    };

    const exportedJson = JSON.stringify({
      transactions: [invoiceTx],
    });

    const parsedBackup = JSON.parse(exportedJson);
    const restoredTx: Transaction = parsedBackup.transactions[0];

    expect(restoredTx.invoice_number).toBe('AB-12345678');
    expect(restoredTx.invoice_period).toBe('2026-10');
    expect(restoredTx.invoice_random_code).toBe('8899');
    expect(restoredTx.invoice_status).toBe('won');
    expect(restoredTx.invoice_prize_amount).toBe(200);
    expect(restoredTx.invoice_prize_name).toBe('六獎');
    expect(restoredTx.invoice_items?.length).toBe(3);
    expect(restoredTx.invoice_items?.[0].name).toBe('茶葉蛋');
    expect(restoredTx.splits?.length).toBe(2);
    expect(restoredTx.splits?.[1].split_amount).toBe(55);
  });

  it('decodeMemoMerchantTag 應完整保留 biweekly（每兩週重複）', () => {
    const tag = encodeMemoMerchantTag({
      reminderDate: '2026-11-05',
      reminderCalendar: 'solar',
      reminderRepeat: 'biweekly',
      reminderTarget: 'family',
    });
    expect(tag).toContain('rep:biweekly');

    const decoded = decodeMemoMerchantTag(tag);
    expect(decoded.reminderRepeat).toBe('biweekly');
    expect(decoded.reminderDate).toBe('2026-11-05');
  });

  it('resolveRestoredPaymentMethodId 應永久保留系統預設付款方式與 custom_ 代碼，跨帳本僅重配發自訂 UUID', () => {
    for (const sysId of Array.from(SYSTEM_PAYMENT_METHOD_IDS)) {
      expect(resolveRestoredPaymentMethodId({ id: sysId, is_system: true }, false)).toBe(sysId);
      expect(resolveRestoredPaymentMethodId({ id: sysId, is_system: true }, true)).toBe(sysId);
    }

    expect(resolveRestoredPaymentMethodId({ id: 'custom_1728399999999' }, true)).toBe('custom_1728399999999');

    const customUuid = '88888888-8888-4888-8888-888888888888';
    expect(resolveRestoredPaymentMethodId({ id: customUuid }, false)).toBe(customUuid);
    const crossId = resolveRestoredPaymentMethodId({ id: customUuid }, true);
    expect(crossId).not.toBe(customUuid);
    expect(crossId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('ensureInvoiceTagInNote 應將雲端發票同步狀態、時間與載具升級寫入 9 欄標籤且不重複附加，並可由 hydrateTransactionWithInvoice 還原', () => {
    const rawTx: Partial<Transaction> = {
      type: 'expense',
      note: '茶葉蛋 $28',
      transacted_at: '2026-11-26T10:00:00.000Z',
      invoice_number: 'AB-12345678',
      invoice_period: '2026-12',
      invoice_random_code: '4321',
      invoice_status: 'pending',
      invoice_sync_status: 'cloud_imported',
      cloud_synced_at: '2026-11-26T17:30:00.000Z',
      cloud_carrier_name: '智市民卡',
    };

    const taggedNote = ensureInvoiceTagInNote(rawTx);
    expect(taggedNote).toContain('[🧾 AB-12345678|');
    expect(taggedNote).toContain('cloud_imported');
    expect(taggedNote).toContain('2026-11-26T17:30:00.000Z');
    expect(taggedNote).toContain('智市民卡');

    // 冪等檢查：重跑一次不應出現兩個標籤
    const idempotentNote = ensureInvoiceTagInNote({ ...rawTx, note: taggedNote });
    expect((idempotentNote.match(/\[🧾/g) || []).length).toBe(1);

    // 模擬從雲端讀取（無獨立發票欄位），僅靠 note 即可完整水合還原
    const hydrated = hydrateTransactionWithInvoice({
      id: 'tx-cloud-read',
      ledger_id: mockLedger.id,
      creator_id: mockMembers[0].id,
      paid_by: mockMembers[0].id,
      category_id: 'cat-1',
      amount: 28,
      type: 'expense',
      transacted_at: '2026-11-26T10:00:00.000Z',
      note: taggedNote,
      is_settled: false,
      created_at: '2026-11-26T10:00:00.000Z',
    });

    expect(hydrated.invoice_number).toBe('AB-12345678');
    expect(hydrated.invoice_sync_status).toBe('cloud_imported');
    expect(hydrated.cloud_synced_at).toBe('2026-11-26T17:30:00.000Z');
    expect(hydrated.cloud_carrier_name).toBe('智市民卡');
  });

  it('buildCloudTransactionUpsertRow 應保留雲端真實存在的 6 個待辦欄位，並排除不存在於資料庫表的欄位', () => {
    const tx: Transaction = {
      id: '44444444-4444-4444-8444-444444444441',
      ledger_id: mockLedger.id,
      creator_id: mockMembers[0].id,
      category_id: '33333333-3333-4333-8333-333333333331',
      amount: 0,
      type: 'memo',
      paid_by: mockMembers[0].id,
      transacted_at: '2026-11-26T10:00:00.000Z',
      merchant: 'remind:2026-12-01|cal:lunar|rep:biweekly|pin:1',
      note: '待辦內容',
      is_settled: true,
      created_at: '2026-11-26T10:00:00.000Z',
      updated_at: '2026-11-26T11:00:00.000Z',
      reminder_date: '2026-12-01',
      reminder_calendar: 'lunar',
      reminder_repeat: 'biweekly',
      reminder_target: 'personal',
      reminder_relay: true,
      reminder_relay_offset: -1,
      is_pinned: true,
      completed_by: mockMembers[1].id,
      completed_at: '2026-11-26T11:00:00.000Z',
      completion_note: '已辦妥繳費',
      linked_transaction_id: '44444444-4444-4444-8444-444444444442',
      invoice_number: 'AB-12345678',
      invoice_period: '2026-12',
      invoice_random_code: '9988',
      invoice_status: 'pending',
      invoice_prize_amount: 0,
      invoice_prize_name: undefined,
      invoice_sync_status: 'matched_cloud',
      cloud_synced_at: '2026-11-26T11:05:00.000Z',
      invoice_items: [{ name: '水費', quantity: 1, unit_price: 500, amount: 500 }],
      cloud_carrier_name: '手機條碼',
    };

    const row = buildCloudTransactionUpsertRow(tx, {
      fallbackCreatorId: mockMembers[0].id,
      hasMerchantColumn: true,
      hasPaymentColumns: true,
    });

    // 雲端真實存在的 6 個待辦延伸欄位應全部保留
    expect(row.reminder_date).toBe('2026-12-01');
    expect(row.reminder_target).toBe('personal');
    expect(row.completed_by).toBe(mockMembers[1].id);
    expect(row.completed_at).toBe('2026-11-26T11:00:00.000Z');
    expect(row.completion_note).toBe('已辦妥繳費');
    expect(row.linked_transaction_id).toBe('44444444-4444-4444-8444-444444444442');

    // 不存在於 public.transactions 資料表的欄位不可出現
    const forbiddenFields = [
      'reminder_calendar',
      'reminder_repeat',
      'reminder_relay',
      'reminder_relay_offset',
      'is_pinned',
      'invoice_number',
      'invoice_period',
      'invoice_random_code',
      'invoice_status',
      'invoice_prize_amount',
      'invoice_prize_name',
      'invoice_sync_status',
      'cloud_synced_at',
      'invoice_items',
      'cloud_carrier_name',
    ];
    for (const f of forbiddenFields) {
      expect(Object.prototype.hasOwnProperty.call(row, f)).toBe(false);
    }
  });

  it('buildBackupPayload 應排除 admin_pin、invite_code 與成員 email/auth_email/is_locked，並完整輸出所有非機密新增欄位', () => {
    const categories: Category[] = [
      { id: '33333333-3333-4333-8333-333333333331', name: '居家水電', icon: '💡', color: '#3B82F6', type: 'expense', sort_order: 1 },
    ];
    const accounts: PaymentAccount[] = [
      {
        id: '55555555-5555-4555-8555-555555555551',
        ledger_id: mockLedger.id,
        name: '國泰 CUBE',
        type: 'credit_card',
        user_id: mockMembers[0].id,
        last_four_digits: '8829',
        issuer_bank: '國泰世華銀行',
        billing_cycle_date: 15,
        payment_due_day: 3,
        balance: 0,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ];
    const rules: RecurringRule[] = [
      {
        id: '66666666-6666-4666-8666-666666666661',
        ledger_id: mockLedger.id,
        name: '管理費',
        amount_type: 'fixed',
        default_amount: 3000,
        category_id: categories[0].id,
        paid_by: mockMembers[0].id,
        payment_method: 'transfer',
        frequency: 'quarterly',
        due_day: 5,
        is_active: true,
        is_installment: true,
        total_installments: 12,
        current_installment: 2,
        installment_start_period: '2026-10',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z',
      },
    ];
    const methods: CustomPaymentMethod[] = [
      { id: 'cash', name: '現金', icon: '💵', color: '#10B981', type: 'cash', supports_credit_card: false, is_enabled: true, is_system: true, sort_order: 1 },
    ];

    const payload = buildBackupPayload({
      currentLedger: mockLedger,
      members: mockMembers,
      categories,
      paymentAccounts: accounts,
      transactions: [],
      recurringRules: rules,
      paymentMethods: methods,
      statements: [],
      recurringStatements: [],
      budget: null,
      carrierRules: [],
    });

    // 安全排除檢查
    expect((payload.ledger as any).admin_pin).toBeUndefined();
    expect((payload.ledger as any).invite_code).toBeUndefined();
    expect((payload.members[0] as any).email).toBeUndefined();
    expect((payload.members[0] as any).auth_email).toBeUndefined();
    expect((payload.members[0] as any).is_locked).toBeUndefined();

    // 完整新增欄位檢查
    expect(payload.members[0].custom_name).toBe('把拔');
    expect(payload.members[0].custom_avatar).toBe('🧔');
    expect(payload.members[0].mof_barcode).toBe('/DAD+123');
    expect(payload.payment_accounts[0].issuer_bank).toBe('國泰世華銀行');
    expect(payload.payment_accounts[0].payment_due_day).toBe(3);
    expect(payload.recurring_rules[0].frequency).toBe('quarterly');
    expect(payload.recurring_rules[0].installment_start_period).toBe('2026-10');
  });

  it('executeLedgerRestore 應不覆寫 admin_pin 與既有成員信箱、正確帶上 onConflict、並於跨帳本還原時重映射規則與附件 ID', async () => {
    const opLog: { table: string; op: string; payload?: any; options?: any }[] = [];
    const existingProfileId = mockMembers[0].id;

    const createTableMock = (tableName: string) => {
      const builder: any = {
        select: jest.fn(() => builder),
        in: jest.fn(() => Promise.resolve({ data: [{ id: existingProfileId }], error: null })),
        eq: jest.fn((col: string, val: any) => {
          opLog.push({ table: tableName, op: 'eq', payload: { col, val } });
          return Promise.resolve({ data: [], error: null });
        }),
        upsert: jest.fn((data: any, opts?: any) => {
          opLog.push({ table: tableName, op: 'upsert', payload: data, options: opts });
          return Promise.resolve({ data: [], error: null });
        }),
        update: jest.fn((data: any) => {
          opLog.push({ table: tableName, op: 'update', payload: data });
          return builder;
        }),
        delete: jest.fn(() => {
          opLog.push({ table: tableName, op: 'delete' });
          return builder;
        }),
      };
      return builder;
    };

    const mockSupabase = {
      from: jest.fn((table: string) => createTableMock(table)),
      rpc: jest.fn((fnName: string, args: any) => {
        opLog.push({ table: `rpc:${fnName}`, op: 'rpc', payload: args });
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    };

    const targetLedger: Ledger = {
      ...mockLedger,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      admin_pin: '1357',
      allow_new_members: true,
    };

    const sourceRuleId = '66666666-6666-4666-8666-666666666661';
    const sourceAccountId = '55555555-5555-4555-8555-555555555551';
    const sourceCategoryId = '33333333-3333-4333-8333-333333333331';

    const backupObj = {
      app: '甜心記帳本',
      version: '1.0.18.50',
      exported_at: '2026-11-27T00:00:00.000Z',
      ledger: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', // 跨帳本還原
        name: '原家庭帳本',
        currency: 'TWD',
        admin_pin: '0000', // 即使備份含舊版 PIN 也不應覆寫目標帳本
        allow_new_members: false, // 跨帳本不應鎖住目標帳本門禁
        is_read_only: true,
      },
      members: [
        {
          id: existingProfileId,
          display_name: '智爸',
          avatar_url: '👨',
          role: 'owner',
          custom_name: '把拔',
          custom_avatar: '🧔',
        },
      ],
      categories: [
        { id: sourceCategoryId, name: '居家水電', icon: '💡', color: '#3B82F6', type: 'expense', sort_order: 1 },
      ],
      payment_accounts: [
        {
          id: sourceAccountId,
          name: '爸爸悠遊卡',
          type: 'stored_value',
          user_id: existingProfileId,
          card_number: '1234567890',
          balance: 500,
          sort_order: 1,
        },
      ],
      recurring_rules: [
        {
          id: sourceRuleId,
          name: '社區管理費',
          amount_type: 'fixed',
          default_amount: 2500,
          category_id: sourceCategoryId,
          paid_by: existingProfileId,
          payment_method: 'cash',
          frequency: 'quarterly',
          due_day: 10,
          is_active: true,
        },
      ],
      recurring_statement_attachments: [
        {
          path: 'ledger/rec_1.pdf',
          fileName: 'rec_1.pdf',
          ruleId: sourceRuleId,
          targetId: sourceRuleId,
          cycleKey: '2026-11',
          originalName: '管理費帳單.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          createdAt: '2026-11-01T00:00:00.000Z',
          publicUrl: 'https://example.com/rec_1.pdf',
        },
      ],
      payment_methods: [
        { id: 'cash', name: '現金', icon: '💵', color: '#10B981', type: 'cash', supports_credit_card: false, is_enabled: true, is_system: true, sort_order: 1 },
        { id: 'line_pay', name: 'LINE Pay', icon: '🟢', color: '#06C755', type: 'e_wallet', supports_credit_card: true, is_enabled: true, is_system: true, sort_order: 2 },
      ],
      transactions: [
        {
          id: '44444444-4444-4444-8444-444444444499',
          creator_id: existingProfileId,
          category_id: sourceCategoryId,
          amount: 2500,
          type: 'expense',
          paid_by: existingProfileId,
          payment_method: 'line_pay',
          transacted_at: '2026-11-10T09:00:00.000Z',
          created_at: '2026-11-10T09:00:00.000Z',
          note: '第四季管理費',
          is_settled: true,
          completion_note: '主委已蓋章收訖',
          linked_transaction_id: `rec_${sourceRuleId}`,
          invoice_number: 'CD-87654321',
          invoice_sync_status: 'cloud_imported',
          cloud_synced_at: '2026-11-10T10:00:00.000Z',
          cloud_carrier_name: '手機條碼',
        },
      ],
    };

    let latestLedger = targetLedger;
    let latestRules: RecurringRule[] = [];
    let latestMethods: CustomPaymentMethod[] = [];
    let latestTxs: Transaction[] = [];

    const cachedStatementsRef = { current: [] as any[] };
    const cachedRecurringStatementsRef = { current: [] as any[] };
    const cachedBudgetRef = { current: null as any };
    const cachedCarrierRulesRef = { current: [] as any[] };

    const result = await executeLedgerRestore({
      jsonStr: JSON.stringify(backupObj),
      options: { mode: 'overwrite' },
      currentLedger: targetLedger,
      setCurrentLedger: (updater: any) => {
        latestLedger = typeof updater === 'function' ? updater(latestLedger) : updater;
      },
      currentUser: mockMembers[0],
      memberAliasMap: {},
      deletedTxIdsRef: { current: new Set<string>() },
      hasMerchantColumnRef: { current: true },
      hasPaymentColumnsRef: { current: true },
      setLedgers: jest.fn(),
      members: [mockMembers[0]],
      setMembers: jest.fn(),
      setMemberAliasMap: jest.fn(),
      categories: [],
      setCategories: jest.fn(),
      paymentAccounts: [],
      setPaymentAccounts: jest.fn(),
      savePaymentAccountsToStorage: jest.fn().mockResolvedValue(undefined),
      transactions: [],
      setTransactions: (txs: any) => {
        latestTxs = typeof txs === 'function' ? txs(latestTxs) : txs;
      },
      saveTransactionsToStorage: jest.fn().mockResolvedValue(undefined),
      recurringRules: [],
      setRecurringRules: (rules: any) => {
        latestRules = typeof rules === 'function' ? rules(latestRules) : rules;
      },
      saveRecurringRulesToStorage: jest.fn().mockResolvedValue(undefined),
      paymentMethods: [],
      setPaymentMethods: (ms: any) => {
        latestMethods = typeof ms === 'function' ? ms(latestMethods) : ms;
      },
      savePaymentMethodsToStorage: jest.fn().mockResolvedValue(undefined),
      effectiveIsOwner: true,
      isConfigured: true,
      supabase: mockSupabase,
      cachedStatementsRef,
      cachedRecurringStatementsRef,
      cachedBudgetRef,
      cachedCarrierRulesRef,
    });

    expect(result.success).toBe(true);

    // 1. 不覆寫目標帳本的 admin_pin 與跨帳本門禁開關
    expect(latestLedger.admin_pin).toBe('1357');
    expect(latestLedger.allow_new_members).toBe(true);
    expect(latestLedger.is_read_only).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      expect.stringContaining(STORAGE_KEYS.ADMIN_PIN),
      expect.anything()
    );

    // 2. profiles 不應覆寫既有成員 email；ledger_members 需帶 onConflict: 'ledger_id,user_id'
    const profileUpsert = opLog.find(x => x.table === 'profiles' && x.op === 'upsert');
    expect(profileUpsert).toBeUndefined();
    const ledgerMemberUpsert = opLog.find(x => x.table === 'ledger_members' && x.op === 'upsert');
    expect(ledgerMemberUpsert?.options).toEqual({ onConflict: 'ledger_id,user_id' });

    // 3. 系統預設 payment_methods 保留原非 UUID 代碼並帶 onConflict: 'ledger_id,id'
    expect(latestMethods.map(m => m.id)).toEqual(['cash', 'line_pay']);
    const pmUpsert = opLog.find(x => x.table === 'payment_methods' && x.op === 'upsert');
    expect(pmUpsert?.options).toEqual({ onConflict: 'ledger_id,id' });

    // 4. 非信用卡帳戶 billing_cycle_date 應為 null，不可強填 1
    const accRpc = opLog.find(x => x.table === 'rpc:secure_add_payment_account');
    expect(accRpc?.payload?.p_account?.billing_cycle_date).toBeNull();

    // 5. 跨帳本週期規則與固定帳單附件與 rec_ 連動 ID 應一致重映射為新 UUID
    expect(latestRules.length).toBe(1);
    const newRuleId = latestRules[0].id;
    expect(newRuleId).not.toBe(sourceRuleId);
    expect(cachedRecurringStatementsRef.current[0].ruleId).toBe(newRuleId);
    expect(cachedRecurringStatementsRef.current[0].targetId).toBe(newRuleId);
    expect(latestTxs[0].linked_transaction_id).toBe(`rec_${newRuleId}`);
    expect(latestTxs[0].payment_method).toBe('line_pay');
    expect(latestTxs[0].note).toContain('cloud_imported');

    // 6. transactions 雲端 upsert 應保留 completion_note 且覆蓋模式先刪 transactions 再清 deleted_transactions
    const txUpsert = opLog.find(x => x.table === 'transactions' && x.op === 'upsert');
    expect(txUpsert?.payload?.[0]?.completion_note).toBe('主委已蓋章收訖');
    expect(txUpsert?.payload?.[0]?.reminder_calendar).toBeUndefined();

    const delTxIdx = opLog.findIndex(x => x.table === 'transactions' && x.op === 'delete');
    const delTombIdx = opLog.findIndex(x => x.table === 'deleted_transactions' && x.op === 'delete');
    expect(delTxIdx).toBeGreaterThan(-1);
    expect(delTombIdx).toBeGreaterThan(delTxIdx);
  });

  it('executeLedgerRestore 同帳本 merge 模式應回補既有卡片新欄位並同步安全設定，且不覆寫 admin_pin', async () => {
    const opLog: { table: string; op: string; payload?: any; options?: any }[] = [];
    const sameLedgerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const existingCardId = '55555555-5555-4555-8555-555555555551';
    const ownerId = mockMembers[0].id;

    const createTableMock = (tableName: string) => {
      const builder: any = {
        select: jest.fn(() => builder),
        in: jest.fn(() => Promise.resolve({ data: [{ id: ownerId }], error: null })),
        eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
        upsert: jest.fn((data: any, opts?: any) => {
          opLog.push({ table: tableName, op: 'upsert', payload: data, options: opts });
          return Promise.resolve({ data: [], error: null });
        }),
        update: jest.fn((data: any) => {
          opLog.push({ table: tableName, op: 'update', payload: data });
          return builder;
        }),
        delete: jest.fn(() => builder),
      };
      return builder;
    };

    const mockSupabase = {
      from: jest.fn((table: string) => createTableMock(table)),
      rpc: jest.fn((fnName: string, args: any) => {
        opLog.push({ table: `rpc:${fnName}`, op: 'rpc', payload: args });
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    };

    let latestLedger: Ledger = {
      ...mockLedger,
      id: sameLedgerId,
      admin_pin: '7788',
      allow_new_members: true,
      is_read_only: false,
    };
    let latestAccounts: PaymentAccount[] = [
      {
        id: existingCardId,
        ledger_id: sameLedgerId,
        name: '國泰 CUBE',
        type: 'credit_card',
        user_id: ownerId,
        last_four_digits: '8829',
        billing_cycle_date: 15,
        balance: 0,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        // 刻意缺少 issuer_bank, payment_due_day, card_number
      },
    ];

    const backupObj = {
      app: '甜心記帳本',
      version: '1.0.18.51',
      exported_at: '2026-11-27T00:00:00.000Z',
      ledger: {
        id: sameLedgerId,
        name: '幸福家庭記帳本',
        currency: 'TWD',
        admin_pin: '0000',
        is_read_only: true,
        allow_new_members: false,
      },
      payment_accounts: [
        {
          id: existingCardId,
          name: '國泰 CUBE',
          type: 'credit_card',
          user_id: ownerId,
          last_four_digits: '8829',
          card_number: '4147000000008829',
          issuer_bank: '國泰世華銀行',
          billing_cycle_date: 15,
          payment_due_day: 3,
          balance: 0,
          sort_order: 1,
        },
      ],
      transactions: [],
    };

    const res = await executeLedgerRestore({
      jsonStr: JSON.stringify(backupObj),
      options: { mode: 'merge' },
      currentLedger: latestLedger,
      setCurrentLedger: (updater: any) => {
        latestLedger = typeof updater === 'function' ? updater(latestLedger) : updater;
      },
      currentUser: mockMembers[0],
      memberAliasMap: {},
      deletedTxIdsRef: { current: new Set<string>() },
      hasMerchantColumnRef: { current: true },
      hasPaymentColumnsRef: { current: true },
      setLedgers: jest.fn(),
      members: [mockMembers[0]],
      setMembers: jest.fn(),
      setMemberAliasMap: jest.fn(),
      categories: [],
      setCategories: jest.fn(),
      paymentAccounts: latestAccounts,
      setPaymentAccounts: (accs: any) => {
        latestAccounts = typeof accs === 'function' ? accs(latestAccounts) : accs;
      },
      savePaymentAccountsToStorage: jest.fn().mockResolvedValue(undefined),
      transactions: [],
      setTransactions: jest.fn(),
      saveTransactionsToStorage: jest.fn().mockResolvedValue(undefined),
      recurringRules: [],
      setRecurringRules: jest.fn(),
      saveRecurringRulesToStorage: jest.fn().mockResolvedValue(undefined),
      paymentMethods: [],
      setPaymentMethods: jest.fn(),
      savePaymentMethodsToStorage: jest.fn().mockResolvedValue(undefined),
      effectiveIsOwner: true,
      isConfigured: true,
      supabase: mockSupabase,
      cachedStatementsRef: { current: [] },
      cachedRecurringStatementsRef: { current: [] },
      cachedBudgetRef: { current: null },
      cachedCarrierRulesRef: { current: [] },
    });

    expect(res.success).toBe(true);
    expect(latestAccounts).toHaveLength(1);
    expect(latestAccounts[0].id).toBe(existingCardId);
    expect(latestAccounts[0].issuer_bank).toBe('國泰世華銀行');
    expect(latestAccounts[0].payment_due_day).toBe(3);
    expect(latestAccounts[0].card_number).toBe('4147000000008829');

    // 同帳本還原應同步 is_read_only 與 allow_new_members 至雲端 RPC，但絕不改動 admin_pin
    expect(latestLedger.admin_pin).toBe('7788');
    expect(latestLedger.is_read_only).toBe(true);
    expect(latestLedger.allow_new_members).toBe(false);
    const ledgerRpc = opLog.find(x => x.table === 'rpc:secure_update_ledger');
    expect(ledgerRpc?.payload?.p_payload).toEqual({
      is_read_only: true,
      allow_new_members: false,
    });
  });

  it('executeLedgerRestore 當 transactions 雲端 upsert 因 RLS 失敗時應降級至 secure_batch_add_transactions 且保留 6 個待辦欄位', async () => {
    const rpcCalls: { fnName: string; args: any }[] = [];
    const ownerId = mockMembers[0].id;

    const createTableMock = (tableName: string) => {
      const builder: any = {
        select: jest.fn(() => builder),
        in: jest.fn(() => Promise.resolve({ data: [{ id: ownerId }], error: null })),
        eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
        upsert: jest.fn(() => {
          if (tableName === 'transactions') {
            return Promise.resolve({
              data: null,
              error: { code: '42501', message: 'new row violates row-level security policy' },
            });
          }
          return Promise.resolve({ data: [], error: null });
        }),
        delete: jest.fn(() => builder),
      };
      return builder;
    };

    const mockSupabase = {
      from: jest.fn((table: string) => createTableMock(table)),
      rpc: jest.fn((fnName: string, args: any) => {
        rpcCalls.push({ fnName, args });
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    };

    const targetLedger: Ledger = {
      ...mockLedger,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };

    const backupObj = {
      app: '甜心記帳本',
      version: '1.0.18.51',
      exported_at: '2026-11-27T00:00:00.000Z',
      ledger: { id: targetLedger.id, name: '幸福家庭記帳本', currency: 'TWD' },
      transactions: [
        {
          id: '44444444-4444-4444-8444-444444444401',
          creator_id: ownerId,
          category_id: '33333333-3333-4333-8333-333333333331',
          amount: 0,
          type: 'memo',
          paid_by: ownerId,
          transacted_at: '2026-11-26T10:00:00.000Z',
          created_at: '2026-11-26T10:00:00.000Z',
          note: '繳水電費',
          is_settled: true,
          reminder_date: '2026-11-28',
          reminder_target: 'personal',
          completed_by: ownerId,
          completed_at: '2026-11-26T12:00:00.000Z',
          completion_note: '已完成線上繳費',
          linked_transaction_id: '44444444-4444-4444-8444-444444444402',
        },
      ],
    };

    const res = await executeLedgerRestore({
      jsonStr: JSON.stringify(backupObj),
      options: { mode: 'merge' },
      currentLedger: targetLedger,
      setCurrentLedger: jest.fn(),
      currentUser: mockMembers[0],
      memberAliasMap: {},
      deletedTxIdsRef: { current: new Set<string>() },
      hasMerchantColumnRef: { current: true },
      hasPaymentColumnsRef: { current: true },
      setLedgers: jest.fn(),
      members: [mockMembers[0]],
      setMembers: jest.fn(),
      setMemberAliasMap: jest.fn(),
      categories: [
        { id: '33333333-3333-4333-8333-333333333331', name: '居家水電', icon: '💡', color: '#3B82F6', type: 'expense', sort_order: 1 },
      ],
      setCategories: jest.fn(),
      paymentAccounts: [],
      setPaymentAccounts: jest.fn(),
      savePaymentAccountsToStorage: jest.fn().mockResolvedValue(undefined),
      transactions: [],
      setTransactions: jest.fn(),
      saveTransactionsToStorage: jest.fn().mockResolvedValue(undefined),
      recurringRules: [],
      setRecurringRules: jest.fn(),
      saveRecurringRulesToStorage: jest.fn().mockResolvedValue(undefined),
      paymentMethods: [],
      setPaymentMethods: jest.fn(),
      savePaymentMethodsToStorage: jest.fn().mockResolvedValue(undefined),
      effectiveIsOwner: true,
      isConfigured: true,
      supabase: mockSupabase,
      cachedStatementsRef: { current: [] },
      cachedRecurringStatementsRef: { current: [] },
      cachedBudgetRef: { current: null },
      cachedCarrierRulesRef: { current: [] },
    });

    expect(res.success).toBe(true);
    const batchRpc = rpcCalls.find(c => c.fnName === 'secure_batch_add_transactions');
    expect(batchRpc).toBeDefined();
    const row = batchRpc?.args?.p_transactions?.[0];
    expect(row.reminder_date).toBe('2026-11-28');
    expect(row.reminder_target).toBe('personal');
    expect(row.completed_by).toBe(ownerId);
    expect(row.completed_at).toBe('2026-11-26T12:00:00.000Z');
    expect(row.completion_note).toBe('已完成線上繳費');
    expect(row.linked_transaction_id).toBe('44444444-4444-4444-8444-444444444402');
  });
});

// ==============================================================================
// 雙重防漏守門測試：TypeScript 編譯期清點 + SQL Schema 自動解析比對
// 日後在 src/types/database.ts 或 supabase_schema.sql 增刪任何資料表或欄位時，
// 尚未決定備份與還原策略前，tsc 或 jest 會立即報錯攔截。
// ==============================================================================

type FieldPolicy = 'backup' | 'excluded_sensitive' | 'excluded_meta' | 'runtime_only';

const LEDGER_TYPE_POLICY: Record<keyof Ledger, FieldPolicy> = {
  id: 'backup',
  name: 'backup',
  description: 'backup',
  currency: 'backup',
  is_read_only: 'backup',
  allow_new_members: 'backup',
  admin_pin: 'excluded_sensitive',
  created_by: 'excluded_meta',
  created_at: 'excluded_meta',
  updated_at: 'excluded_meta',
  userRole: 'runtime_only',
  userDisplayName: 'runtime_only',
  userAvatar: 'runtime_only',
};

const PROFILE_TYPE_POLICY: Record<keyof Profile, FieldPolicy> = {
  id: 'backup',
  display_name: 'backup',
  avatar_url: 'backup',
  custom_name: 'backup',
  custom_avatar: 'backup',
  role: 'backup',
  mof_barcode: 'backup',
  mof_sync_enabled: 'backup',
  mof_last_synced_at: 'backup',
  email: 'excluded_sensitive',
  auth_email: 'excluded_sensitive',
  auth_provider: 'excluded_sensitive',
  is_locked: 'excluded_sensitive',
  claim_code: 'excluded_sensitive',
  claim_code_expires_at: 'excluded_sensitive',
};

const CATEGORY_TYPE_POLICY: Record<keyof Category, FieldPolicy> = {
  id: 'backup',
  name: 'backup',
  icon: 'backup',
  color: 'backup',
  type: 'backup',
  sort_order: 'backup',
  ledger_id: 'excluded_meta',
};

const PAYMENT_ACCOUNT_TYPE_POLICY: Record<keyof PaymentAccount, FieldPolicy> = {
  id: 'backup',
  name: 'backup',
  type: 'backup',
  user_id: 'backup',
  last_four_digits: 'backup',
  card_number: 'backup',
  billing_cycle_date: 'backup',
  payment_due_day: 'backup',
  issuer_bank: 'backup',
  balance: 'backup',
  color: 'backup',
  icon: 'backup',
  sort_order: 'backup',
  ledger_id: 'excluded_meta',
  created_at: 'excluded_meta',
  updated_at: 'excluded_meta',
};

const TRANSACTION_TYPE_POLICY: Record<keyof Transaction, FieldPolicy> = {
  id: 'backup',
  creator_id: 'backup',
  category_id: 'backup',
  amount: 'backup',
  type: 'backup',
  paid_by: 'backup',
  transacted_at: 'backup',
  merchant: 'backup',
  payment_method: 'backup',
  account_id: 'backup',
  is_reconciled: 'backup',
  note: 'backup',
  reminder_date: 'backup',
  reminder_calendar: 'backup',
  reminder_repeat: 'backup',
  reminder_target: 'backup',
  reminder_relay: 'backup',
  reminder_relay_offset: 'backup',
  is_pinned: 'backup',
  completed_by: 'backup',
  completed_at: 'backup',
  completion_note: 'backup',
  linked_transaction_id: 'backup',
  invoice_number: 'backup',
  invoice_period: 'backup',
  invoice_random_code: 'backup',
  invoice_status: 'backup',
  invoice_prize_amount: 'backup',
  invoice_prize_name: 'backup',
  invoice_sync_status: 'backup',
  cloud_synced_at: 'backup',
  invoice_items: 'backup',
  cloud_carrier_name: 'backup',
  image_url: 'backup',
  is_settled: 'backup',
  created_at: 'backup',
  updated_at: 'backup',
  splits: 'backup',
  ledger_id: 'excluded_meta',
  category: 'runtime_only',
  payer_profile: 'runtime_only',
  payment_account: 'runtime_only',
};

const TRANSACTION_SPLIT_TYPE_POLICY: Record<keyof TransactionSplit, FieldPolicy> = {
  id: 'backup',
  transaction_id: 'backup',
  user_id: 'backup',
  split_amount: 'backup',
  is_settled: 'backup',
  settled_at: 'backup',
  user_name: 'runtime_only',
};

const RECURRING_RULE_TYPE_POLICY: Record<keyof RecurringRule, FieldPolicy> = {
  id: 'backup',
  name: 'backup',
  amount_type: 'backup',
  default_amount: 'backup',
  category_id: 'backup',
  merchant: 'backup',
  paid_by: 'backup',
  payment_method: 'backup',
  account_id: 'backup',
  frequency: 'backup',
  due_day: 'backup',
  bimonthly_start_month: 'backup',
  is_active: 'backup',
  last_recorded_period: 'backup',
  note: 'backup',
  is_installment: 'backup',
  total_installments: 'backup',
  current_installment: 'backup',
  installment_start_period: 'backup',
  created_at: 'backup',
  ledger_id: 'excluded_meta',
  updated_at: 'excluded_meta',
};

const PAYMENT_METHOD_TYPE_POLICY: Record<keyof CustomPaymentMethod, FieldPolicy> = {
  id: 'backup',
  name: 'backup',
  icon: 'backup',
  color: 'backup',
  type: 'backup',
  supports_credit_card: 'backup',
  is_enabled: 'backup',
  is_system: 'backup',
  sort_order: 'backup',
  ledger_id: 'excluded_meta',
  created_at: 'excluded_meta',
};

const BUDGET_TYPE_POLICY: Record<keyof LedgerBudget, FieldPolicy> = {
  ledger_id: 'backup',
  is_enabled: 'backup',
  monthly_total: 'backup',
  alert_threshold: 'backup',
  category_budgets: 'backup',
  member_budgets: 'backup',
  updated_at: 'backup',
  id: 'excluded_meta',
};

const CARRIER_RULE_TYPE_POLICY: Record<keyof CarrierRule, FieldPolicy> = {
  id: 'backup',
  ledger_id: 'backup',
  carrier_no: 'backup',
  carrier_name: 'backup',
  user_id: 'backup',
  account_id: 'backup',
  created_at: 'backup',
  updated_at: 'backup',
};

const EXCLUDED_SYSTEM_TABLES = new Set([
  'schema_migrations',
  'auth_session_links',
  'ledger_invites',
  'deleted_transactions',
  'member_devices',
  'demo_tryouts',
  'line_user_bindings',
  'line_ledger_subscriptions',
  'line_group_bindings',
  'line_bind_tokens',
]);

const SQL_TABLE_COLUMN_POLICIES: Record<string, Record<string, FieldPolicy>> = {
  ledgers: {
    id: 'backup',
    name: 'backup',
    description: 'backup',
    currency: 'backup',
    created_by: 'excluded_meta',
    created_at: 'excluded_meta',
    updated_at: 'excluded_meta',
    admin_pin: 'excluded_sensitive',
    is_read_only: 'backup',
    allow_new_members: 'backup',
  },
  profiles: {
    id: 'backup',
    email: 'excluded_sensitive',
    display_name: 'backup',
    avatar_url: 'backup',
    created_at: 'excluded_meta',
    updated_at: 'excluded_meta',
    auth_email: 'excluded_sensitive',
    auth_provider: 'excluded_sensitive',
    is_locked: 'excluded_sensitive',
    claim_code: 'excluded_sensitive',
    claim_code_expires_at: 'excluded_sensitive',
  },
  ledger_members: {
    id: 'excluded_meta',
    ledger_id: 'excluded_meta',
    user_id: 'backup',
    role: 'backup',
    joined_at: 'excluded_meta',
    custom_name: 'backup',
    custom_avatar: 'backup',
  },
  categories: {
    id: 'backup',
    ledger_id: 'excluded_meta',
    name: 'backup',
    icon: 'backup',
    color: 'backup',
    type: 'backup',
    sort_order: 'backup',
    created_at: 'excluded_meta',
  },
  transactions: {
    id: 'backup',
    ledger_id: 'excluded_meta',
    creator_id: 'backup',
    category_id: 'backup',
    amount: 'backup',
    type: 'backup',
    paid_by: 'backup',
    merchant: 'backup',
    transacted_at: 'backup',
    note: 'backup',
    image_url: 'backup',
    is_settled: 'backup',
    created_at: 'backup',
    updated_at: 'backup',
    payment_method: 'backup',
    account_id: 'backup',
    is_reconciled: 'backup',
    completed_by: 'backup',
    completed_at: 'backup',
    reminder_date: 'backup',
    completion_note: 'backup',
    linked_transaction_id: 'backup',
    reminder_target: 'backup',
  },
  payment_accounts: {
    id: 'backup',
    ledger_id: 'excluded_meta',
    name: 'backup',
    type: 'backup',
    user_id: 'backup',
    last_four_digits: 'backup',
    card_number: 'backup',
    issuer_bank: 'backup',
    billing_cycle_date: 'backup',
    payment_due_day: 'backup',
    balance: 'backup',
    color: 'backup',
    icon: 'backup',
    sort_order: 'backup',
    created_at: 'excluded_meta',
    updated_at: 'excluded_meta',
  },
  transaction_splits: {
    id: 'backup',
    transaction_id: 'backup',
    user_id: 'backup',
    split_amount: 'backup',
    is_settled: 'backup',
    settled_at: 'backup',
  },
  recurring_rules: {
    id: 'backup',
    ledger_id: 'excluded_meta',
    name: 'backup',
    amount_type: 'backup',
    default_amount: 'backup',
    category_id: 'backup',
    merchant: 'backup',
    paid_by: 'backup',
    payment_method: 'backup',
    account_id: 'backup',
    frequency: 'backup',
    due_day: 'backup',
    bimonthly_start_month: 'backup',
    is_active: 'backup',
    last_recorded_period: 'backup',
    is_installment: 'backup',
    total_installments: 'backup',
    current_installment: 'backup',
    installment_start_period: 'backup',
    note: 'backup',
    created_at: 'backup',
    updated_at: 'excluded_meta',
  },
  payment_methods: {
    id: 'backup',
    ledger_id: 'excluded_meta',
    name: 'backup',
    icon: 'backup',
    color: 'backup',
    type: 'backup',
    supports_credit_card: 'backup',
    is_system: 'backup',
    sort_order: 'backup',
    created_at: 'excluded_meta',
    updated_at: 'excluded_meta',
  },
  ledger_budgets: {
    id: 'excluded_meta',
    ledger_id: 'backup',
    is_enabled: 'backup',
    monthly_total: 'backup',
    alert_threshold: 'backup',
    category_budgets: 'backup',
    member_budgets: 'backup',
    updated_at: 'backup',
  },
};

function parseSqlSchemaTables(sqlPath: string): Record<string, Set<string>> {
  const fs = require('fs');
  const sql: string = fs.readFileSync(sqlPath, 'utf8');
  const tables: Record<string, Set<string>> = {};

  const createTableRe = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.(\w+)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null;
  while ((match = createTableRe.exec(sql)) !== null) {
    const tableName = match[1];
    tables[tableName] = tables[tableName] || new Set<string>();
    for (const rawLine of match[2].split('\n')) {
      const line = rawLine.replace(/--.*$/, '').trim();
      if (!line || /^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|\))/i.test(line)) continue;
      const colMatch = line.match(/^"?([a-z_][a-z0-9_]*)"?\s+[A-Z]/i);
      if (colMatch) {
        tables[tableName].add(colMatch[1]);
      }
    }
  }

  const alterTableRe = /ALTER\s+TABLE\s+public\.(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"?([a-z_][a-z0-9_]*)"?/gi;
  while ((match = alterTableRe.exec(sql)) !== null) {
    const tableName = match[1];
    tables[tableName] = tables[tableName] || new Set<string>();
    tables[tableName].add(match[2]);
  }

  return tables;
}

describe('資料庫與型別欄位變動自動防漏守門 (Schema & Type Drift Guard)', () => {
  const path = require('path');
  const schemaPath: string = path.resolve(__dirname, '../../../supabase_schema.sql');
  const schemaTables = parseSqlSchemaTables(schemaPath);

  it('supabase_schema.sql 的所有資料表應完整歸類為「納管備份表」或「系統排除表」', () => {
    const actualTables = Object.keys(schemaTables).sort();
    const expectedTables = Array.from(
      new Set([...EXCLUDED_SYSTEM_TABLES, ...Object.keys(SQL_TABLE_COLUMN_POLICIES)])
    ).sort();

    expect(actualTables).toEqual(expectedTables);
  });

  it('各納管資料表的 SQL 欄位與清冊必須 100% 雙向一致（無漏列或殘留已移除欄位）', () => {
    for (const [tableName, policyMap] of Object.entries(SQL_TABLE_COLUMN_POLICIES)) {
      const actualCols = Array.from(schemaTables[tableName] || []).sort();
      const expectedCols = Object.keys(policyMap).sort();
      expect({ table: tableName, cols: actualCols }).toEqual({
        table: tableName,
        cols: expectedCols,
      });
    }
  });

  it('全欄位填滿時 buildBackupPayload 應涵蓋所有 backup 欄位且絕不輸出任何 excluded_sensitive 欄位', () => {
    const ledgerId = '11111111-1111-4111-8111-111111111111';
    const userA = '22222222-2222-4222-8222-222222222221';
    const userB = '22222222-2222-4222-8222-222222222222';
    const catId = '33333333-3333-4333-8333-333333333331';
    const accId = '55555555-5555-4555-8555-555555555551';
    const ruleId = '66666666-6666-4666-8666-666666666661';

    const fullLedger: Ledger = {
      id: ledgerId,
      name: '全欄位帳本',
      description: '完整欄位描述',
      currency: 'TWD',
      created_by: userA,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-11-27T00:00:00.000Z',
      admin_pin: '9999',
      is_read_only: false,
      allow_new_members: true,
      userRole: 'owner',
      userDisplayName: '智爸',
      userAvatar: '👨',
    };

    const fullMember: Profile = {
      id: userA,
      email: 'secret@example.com',
      display_name: '智爸',
      avatar_url: '👨',
      custom_name: '把拔',
      custom_avatar: '🧔',
      role: 'owner',
      auth_email: 'dad.google@gmail.com',
      auth_provider: 'google',
      is_locked: true,
      claim_code: 'CLM-1234',
      claim_code_expires_at: '2026-12-31T00:00:00.000Z',
      mof_barcode: '/DAD+888',
      mof_sync_enabled: true,
      mof_last_synced_at: '2026-11-27T00:00:00.000Z',
    };

    const fullCategory: Category = {
      id: catId,
      ledger_id: ledgerId,
      name: '餐飲伙食',
      icon: '🍲',
      color: '#EF4444',
      type: 'expense',
      sort_order: 1,
    };

    const fullAccount: PaymentAccount = {
      id: accId,
      ledger_id: ledgerId,
      name: '國泰 CUBE',
      type: 'credit_card',
      user_id: userA,
      last_four_digits: '8829',
      card_number: '4147000000008829',
      billing_cycle_date: 15,
      payment_due_day: 3,
      issuer_bank: '國泰世華銀行',
      balance: 0,
      color: '#10B981',
      icon: '💳',
      sort_order: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-11-27T00:00:00.000Z',
    };

    const fullSplit: TransactionSplit = {
      id: '77777777-7777-4777-8777-777777777771',
      transaction_id: '44444444-4444-4444-8444-444444444401',
      user_id: userB,
      split_amount: 100,
      is_settled: true,
      settled_at: '2026-11-27T01:00:00.000Z',
      user_name: '智媽',
    };

    const fullExpenseTx: Transaction = {
      id: '44444444-4444-4444-8444-444444444401',
      ledger_id: ledgerId,
      creator_id: userA,
      category_id: catId,
      amount: 250,
      type: 'expense',
      paid_by: userA,
      transacted_at: '2026-11-27T00:00:00.000Z',
      merchant: '全聯',
      payment_method: 'credit_card',
      account_id: accId,
      is_reconciled: true,
      note: '買菜',
      image_url: 'https://example.com/receipt.jpg',
      is_settled: true,
      created_at: '2026-11-27T00:00:00.000Z',
      updated_at: '2026-11-27T01:00:00.000Z',
      invoice_number: 'AB-12345678',
      invoice_period: '2026-12',
      invoice_random_code: '8888',
      invoice_status: 'won',
      invoice_prize_amount: 200,
      invoice_prize_name: '六獎',
      invoice_sync_status: 'matched_cloud',
      cloud_synced_at: '2026-11-27T02:00:00.000Z',
      invoice_items: [{ name: '鮮乳', quantity: 1, unit_price: 98, amount: 98 }],
      cloud_carrier_name: '手機條碼',
      splits: [fullSplit],
      linked_transaction_id: '44444444-4444-4444-8444-444444444402',
    };

    const fullMemoTx: Transaction = {
      id: '44444444-4444-4444-8444-444444444402',
      ledger_id: ledgerId,
      creator_id: userA,
      category_id: catId,
      amount: 0,
      type: 'memo',
      paid_by: userA,
      transacted_at: '2026-11-27T00:00:00.000Z',
      merchant: '',
      payment_method: 'cash',
      note: '回診備忘',
      reminder_date: '2026-12-05',
      reminder_calendar: 'lunar',
      reminder_repeat: 'biweekly',
      reminder_target: 'personal',
      reminder_relay: true,
      reminder_relay_offset: -1,
      is_pinned: true,
      completed_by: userA,
      completed_at: '2026-11-27T03:00:00.000Z',
      completion_note: '已領藥',
      linked_transaction_id: '44444444-4444-4444-8444-444444444401',
      is_settled: true,
      created_at: '2026-11-27T00:00:00.000Z',
      updated_at: '2026-11-27T03:00:00.000Z',
    };

    const fullRule: RecurringRule = {
      id: ruleId,
      ledger_id: ledgerId,
      name: '季繳管理費',
      amount_type: 'fixed',
      default_amount: 3000,
      category_id: catId,
      merchant: '管委會',
      paid_by: userA,
      payment_method: 'transfer',
      account_id: accId,
      frequency: 'quarterly',
      due_day: 5,
      bimonthly_start_month: 1,
      is_active: true,
      last_recorded_period: '2026-10',
      note: '含車位清潔費',
      is_installment: true,
      total_installments: 12,
      current_installment: 2,
      installment_start_period: '2026-10',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-11-27T00:00:00.000Z',
    };

    const fullMethod: CustomPaymentMethod = {
      id: 'cash',
      ledger_id: ledgerId,
      name: '現金',
      icon: '💵',
      color: '#10B981',
      type: 'cash',
      supports_credit_card: false,
      is_enabled: true,
      is_system: true,
      sort_order: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const fullBudget: LedgerBudget = {
      id: '88888888-8888-4888-8888-888888888881',
      ledger_id: ledgerId,
      is_enabled: true,
      monthly_total: 50000,
      alert_threshold: 80,
      category_budgets: { [catId]: 15000 },
      member_budgets: { [userA]: 20000 },
      updated_at: '2026-11-27T00:00:00.000Z',
    };

    const fullCarrierRule: CarrierRule = {
      id: '99999999-9999-4999-8999-999999999991',
      ledger_id: ledgerId,
      carrier_no: '16729177',
      carrier_name: '蝦皮載具',
      user_id: userA,
      account_id: accId,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-27T00:00:00.000Z',
    };

    const backup = buildBackupPayload({
      currentLedger: fullLedger,
      members: [fullMember],
      categories: [fullCategory],
      paymentAccounts: [fullAccount],
      transactions: [fullExpenseTx, fullMemoTx],
      recurringRules: [fullRule],
      paymentMethods: [fullMethod],
      statements: [],
      recurringStatements: [],
      budget: fullBudget,
      carrierRules: [fullCarrierRule],
    });

    const assertEntityPolicies = (obj: Record<string, any> | undefined, policyMap: Record<string, FieldPolicy>, entityName: string) => {
      expect(obj).toBeDefined();
      for (const [field, policy] of Object.entries(policyMap)) {
        if (policy === 'backup') {
          expect({ entity: entityName, field, present: obj?.[field] !== undefined }).toEqual({
            entity: entityName,
            field,
            present: true,
          });
        } else if (policy === 'excluded_sensitive') {
          expect({ entity: entityName, field, leaked: Object.prototype.hasOwnProperty.call(obj || {}, field) }).toEqual({
            entity: entityName,
            field,
            leaked: false,
          });
        }
      }
    };

    assertEntityPolicies(backup.ledger as any, LEDGER_TYPE_POLICY, 'Ledger');
    assertEntityPolicies(backup.members[0] as any, PROFILE_TYPE_POLICY, 'Profile');
    assertEntityPolicies(backup.categories[0] as any, CATEGORY_TYPE_POLICY, 'Category');
    assertEntityPolicies(backup.payment_accounts[0] as any, PAYMENT_ACCOUNT_TYPE_POLICY, 'PaymentAccount');
    assertEntityPolicies(backup.transactions[0].splits?.[0] as any, TRANSACTION_SPLIT_TYPE_POLICY, 'TransactionSplit');
    assertEntityPolicies(backup.recurring_rules[0] as any, RECURRING_RULE_TYPE_POLICY, 'RecurringRule');
    assertEntityPolicies(backup.payment_methods[0] as any, PAYMENT_METHOD_TYPE_POLICY, 'CustomPaymentMethod');
    assertEntityPolicies(backup.budget as any, BUDGET_TYPE_POLICY, 'LedgerBudget');
    assertEntityPolicies(backup.carrier_rules?.[0] as any, CARRIER_RULE_TYPE_POLICY, 'CarrierRule');

    // Transaction 結合支出與記事兩筆涵蓋全欄位
    for (const [field, policy] of Object.entries(TRANSACTION_TYPE_POLICY)) {
      if (policy === 'backup') {
        const presentInEither = backup.transactions.some((tx: any) => tx[field] !== undefined);
        expect({ entity: 'Transaction', field, presentInEither }).toEqual({
          entity: 'Transaction',
          field,
          presentInEither: true,
        });
      }
    }

    // buildCloudTransactionUpsertRow 產出的所有欄位都必須存在於 SQL transactions 資料表中
    const txSchemaCols = schemaTables.transactions;
    for (const tx of [fullExpenseTx, fullMemoTx]) {
      const cloudRow = buildCloudTransactionUpsertRow(tx, {
        fallbackCreatorId: userA,
        hasMerchantColumn: true,
        hasPaymentColumns: true,
      });
      for (const key of Object.keys(cloudRow)) {
        expect({ cloudKey: key, existsInSql: txSchemaCols.has(key) }).toEqual({
          cloudKey: key,
          existsInSql: true,
        });
      }
    }
  });
});
