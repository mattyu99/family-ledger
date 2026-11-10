import { extractWidgetSnapshot } from '../widgetSync';
import { getLocalDateYmd } from '../memo';
import { Transaction, Ledger } from '../../types';

describe('Android 桌面小工具快照萃取與待辦隱私分流測試 (widgetSync.ts)', () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  const futureYmd = getLocalDateYmd(futureDate);

  const mockLedger: Ledger = {
    id: 'ledger-main-id',
    name: '幸福家庭記帳本',
    currency: 'TWD',
    created_by: 'user-dad',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  const mockMembers = [
    { id: 'user-dad', display_name: '智爸', is_admin: true },
    { id: 'user-mom', display_name: '智媽', is_admin: false },
    { id: 'user-kid', display_name: '小寶', is_admin: false },
  ];

  const mockTransactions: Transaction[] = [
    {
      id: 'tx-family-1',
      ledger_id: 'ledger-main-id',
      type: 'memo',
      amount: 0,
      creator_id: 'user-dad',
      paid_by: 'user-dad',
      reminder_target: 'family', // 全家待辦
      reminder_date: futureYmd,
      note: '[🛒 採買清單]\n- [ ] 全脂鮮奶\n- [ ] 雞蛋一盒',
      category_id: 'cat-1',
      transacted_at: '2026-11-01T10:00:00.000Z',
      created_at: '2026-11-01T10:00:00.000Z',
      is_settled: false,
    },
    {
      id: 'tx-mom-personal',
      ledger_id: 'ledger-main-id',
      type: 'memo',
      amount: 0,
      creator_id: 'user-mom',
      paid_by: 'user-mom', // 媽媽專屬個人待辦
      reminder_target: 'personal',
      reminder_date: '2026-11-08',
      note: '[🏥 醫療健康] 媽媽牙醫回診檢查',
      category_id: 'cat-2',
      transacted_at: '2026-11-01T11:00:00.000Z',
      created_at: '2026-11-01T11:00:00.000Z',
      is_settled: false,
    },
    {
      id: 'tx-dad-personal',
      ledger_id: 'ledger-main-id',
      type: 'memo',
      amount: 0,
      creator_id: 'user-dad',
      paid_by: 'user-dad', // 爸爸專屬個人待辦
      reminder_target: 'personal',
      reminder_date: futureYmd,
      note: '[🚗 車輛保養] 汽車定期檢驗',
      category_id: 'cat-3',
      transacted_at: '2026-11-01T12:00:00.000Z',
      created_at: '2026-11-01T12:00:00.000Z',
      is_settled: false,
    },
    {
      id: 'tx-settled-memo',
      ledger_id: 'ledger-main-id',
      type: 'memo',
      amount: 0,
      creator_id: 'user-dad',
      paid_by: 'user-dad',
      reminder_target: 'family',
      note: '已經辦妥的待辦',
      category_id: 'cat-1',
      transacted_at: '2026-11-01T09:00:00.000Z',
      created_at: '2026-11-01T09:00:00.000Z',
      is_settled: true, // 已辦妥
    },
  ];

  it('爸爸登入時，桌面小工具只呈現全家待辦與爸爸個人待辦，媽媽專屬待辦應嚴格隱藏', () => {
    const snapshot = extractWidgetSnapshot(mockLedger, mockTransactions, mockMembers, 'user-dad');
    const titles = snapshot.pendingMemos.map(m => m.title);

    expect(titles.some(t => t.includes('採買清單'))).toBe(true);
    expect(titles.some(t => t.includes('車輛保養'))).toBe(true);
    expect(titles.some(t => t.includes('醫療健康'))).toBe(false); // 媽媽的隱私待辦被排除
  });

  it('媽媽登入時，桌面小工具只呈現全家待辦與媽媽個人待辦，爸爸專屬待辦應嚴格隱藏', () => {
    const snapshot = extractWidgetSnapshot(mockLedger, mockTransactions, mockMembers, 'user-mom');
    const titles = snapshot.pendingMemos.map(m => m.title);

    expect(titles.some(t => t.includes('採買清單'))).toBe(true);
    expect(titles.some(t => t.includes('醫療健康'))).toBe(true);
    expect(titles.some(t => t.includes('車輛保養'))).toBe(false); // 爸爸的隱私待辦被排除
  });

  it('已辦妥 (is_settled = true) 的待辦事項絕不出現在桌面小工具中', () => {
    const snapshot = extractWidgetSnapshot(mockLedger, mockTransactions, mockMembers, 'user-dad');
    const allTitles = snapshot.pendingMemos.map(m => m.title);
    expect(allTitles.some(t => t.includes('已經辦妥的待辦'))).toBe(false);
  });

  it('全家待辦之 badgeText 應為純淨日期標籤，不附加記錄者人名', () => {
    const snapshot = extractWidgetSnapshot(mockLedger, mockTransactions, mockMembers, 'user-dad');
    const familyItem = snapshot.pendingMemos.find(m => m.title.includes('採買清單'));
    expect(familyItem).toBeDefined();
    expect(familyItem?.badgeText).toBe(futureYmd.slice(5));
    expect(familyItem?.badgeText).not.toContain('智爸');
    expect(familyItem?.assigneeName).toBeUndefined();
  });

  it('個人專屬待辦之 badgeText 應附帶成員人名 (例如 11-15 · 智爸)', () => {
    const snapshot = extractWidgetSnapshot(mockLedger, mockTransactions, mockMembers, 'user-dad');
    const personalItem = snapshot.pendingMemos.find(m => m.title.includes('車輛保養'));
    expect(personalItem).toBeDefined();
    expect(personalItem?.badgeText).toBe(`${futureYmd.slice(5)} · 智爸`);
    expect(personalItem?.assigneeName).toBe('智爸');
  });

  it('桌面小工具內文應自動清除 Markdown 核取方塊前綴 (- [ ])', () => {
    const snapshot = extractWidgetSnapshot(mockLedger, mockTransactions, mockMembers, 'user-dad');
    const familyItem = snapshot.pendingMemos.find(m => m.title.includes('採買清單'));
    expect(familyItem?.content).not.toContain('- [ ]');
    expect(familyItem?.content).toContain('全脂鮮奶');
  });

  it('桌面小工具快照最多可支援並萃取前 4 筆待辦事項', () => {
    const fourMemos: Transaction[] = [
      { id: '1', ledger_id: 'l1', type: 'memo', amount: 0, creator_id: 'u1', paid_by: 'u1', reminder_target: 'family', reminder_date: '2026-11-01', note: '待辦1', category_id: 'c', transacted_at: '2026-11-01', created_at: '2026-11-01', is_settled: false },
      { id: '2', ledger_id: 'l1', type: 'memo', amount: 0, creator_id: 'u1', paid_by: 'u1', reminder_target: 'family', reminder_date: '2026-11-02', note: '待辦2', category_id: 'c', transacted_at: '2026-11-01', created_at: '2026-11-01', is_settled: false },
      { id: '3', ledger_id: 'l1', type: 'memo', amount: 0, creator_id: 'u1', paid_by: 'u1', reminder_target: 'family', reminder_date: '2026-11-03', note: '待辦3', category_id: 'c', transacted_at: '2026-11-01', created_at: '2026-11-01', is_settled: false },
      { id: '4', ledger_id: 'l1', type: 'memo', amount: 0, creator_id: 'u1', paid_by: 'u1', reminder_target: 'family', reminder_date: '2026-11-04', note: '待辦4', category_id: 'c', transacted_at: '2026-11-01', created_at: '2026-11-01', is_settled: false },
      { id: '5', ledger_id: 'l1', type: 'memo', amount: 0, creator_id: 'u1', paid_by: 'u1', reminder_target: 'family', reminder_date: '2026-11-05', note: '待辦5', category_id: 'c', transacted_at: '2026-11-01', created_at: '2026-11-01', is_settled: false },
    ];
    const snapshot = extractWidgetSnapshot(mockLedger, fourMemos, mockMembers, 'u1');
    expect(snapshot.pendingMemos.length).toBe(4);
    expect(snapshot.pendingMemos.map(m => m.rawTitle)).toEqual(['待辦1', '待辦2', '待辦3', '待辦4']);
  });

  it('桌面小工具帳本名稱應自動剔除括號後綴 (如 SWEETHOME)，避免擠壓小工具標題列', () => {
    const demoLedger: Ledger = {
      id: 'ee100000-0000-4000-8000-000000000001',
      name: '💖 甜心示範家庭 (SWEETHOME)',
      currency: 'TWD',
      created_by: 'u1',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const snapshot = extractWidgetSnapshot(demoLedger, mockTransactions, mockMembers, 'user-dad');
    expect(snapshot.ledgerName).toBe('💖 甜心示範家庭');
  });

  it('桌面小工具置頂優先排序：置頂事項排在最前面，且標題自動附帶 📌 標記', () => {
    const memosWithPin: Transaction[] = [
      {
        id: 'memo-normal',
        ledger_id: 'l1',
        type: 'memo',
        amount: 0,
        creator_id: 'u1',
        paid_by: 'u1',
        reminder_target: 'family',
        reminder_date: '2026-11-01',
        note: '普通待辦事項',
        category_id: 'c',
        transacted_at: '2026-11-01',
        created_at: '2026-11-01',
        is_settled: false,
        is_pinned: false,
      },
      {
        id: 'memo-pinned',
        ledger_id: 'l1',
        type: 'memo',
        amount: 0,
        creator_id: 'u1',
        paid_by: 'u1',
        reminder_target: 'family',
        reminder_date: '2026-11-15', // 日期較晚，但有置頂
        note: '重要家庭置頂事項',
        category_id: 'c',
        transacted_at: '2026-11-01',
        created_at: '2026-11-01',
        is_settled: false,
        is_pinned: true,
      },
    ];

    const snapshot = extractWidgetSnapshot(mockLedger, memosWithPin, mockMembers, 'u1');
    expect(snapshot.pendingMemos.length).toBe(2);
    // 第一筆應為置頂項目
    expect(snapshot.pendingMemos[0].id).toBe('memo-pinned');
    expect(snapshot.pendingMemos[0].title).toContain('📌 重要家庭置頂事項');
    // 第二筆為普通項目
    expect(snapshot.pendingMemos[1].id).toBe('memo-normal');
    expect(snapshot.pendingMemos[1].title).not.toContain('📌');
  });
});
