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
  Ledger,
  Profile,
  Category,
  PaymentAccount,
  RecurringRule,
  CustomPaymentMethod,
} from '../../types';

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
    const opLog: Array<{ table: string; op: string; payload?: any; options?: any }> = [];
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
});
