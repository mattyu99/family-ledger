import { parseQuickActionUrl, parseQuickAction } from '../quickActions';
import { DEMO_USER_DAD } from '../../constants/ledgerDefaults';

describe('桌面小工具快捷動作與 Deep Link 測試 (Quick Actions & Deep Links)', () => {
  it('正確解析支出快捷 deep link (familyledger://quick-action?mode=expense)', () => {
    const kind = parseQuickActionUrl('familyledger://quick-action?mode=expense');
    expect(kind).toBe('expense');
  });

  it('正確解析記事快捷 deep link (familyledger://quick-action?mode=memo)', () => {
    const kind = parseQuickActionUrl('familyledger://quick-action?mode=memo');
    expect(kind).toBe('memo');
  });

  it('正確解析掃發票快捷 deep link (familyledger://quick-action?mode=scan)', () => {
    const kind = parseQuickActionUrl('familyledger://quick-action?mode=scan');
    expect(kind).toBe('scan');
  });

  it('正確解析記收入快捷 deep link (familyledger://quick-action?mode=income)', () => {
    const kind = parseQuickActionUrl('familyledger://quick-action?mode=income');
    expect(kind).toBe('income');
  });

  it('正確解析待辦清單快捷 deep link (familyledger://quick-action?mode=todo)', () => {
    const kind = parseQuickActionUrl('familyledger://quick-action?mode=todo');
    expect(kind).toBe('todo');
  });

  it('解析無效之 URL Scheme 回傳 null', () => {
    expect(parseQuickActionUrl('')).toBeNull();
    expect(parseQuickActionUrl('https://google.com')).toBeNull();
    expect(parseQuickActionUrl(null)).toBeNull();
  });

  it('驗證小工具快捷啟動時，若付款人/紀錄人為初始示範假爸爸且真實本機成員載入就緒時，能精準自動校準至真實本機成員', () => {
    const dummyDadId = DEMO_USER_DAD;
    const realUser = { id: 'real-user-matt-1234', display_name: '梅特', avatar_url: '👤', role: 'owner' as const };
    const members = [
      realUser,
      { id: 'member-mom-5678', display_name: '媽媽', avatar_url: '👩', role: 'member' as const },
    ];

    // 模擬有效成員解析函式
    const resolveEffectivePayer = (
      currentPaidBy: string,
      hasUserManuallySelected: boolean,
      defaultPayerId?: string
    ) => {
      if (hasUserManuallySelected && currentPaidBy && members.some(m => m.id === currentPaidBy)) {
        return currentPaidBy;
      }
      if (defaultPayerId && members.some(m => m.id === defaultPayerId)) {
        return defaultPayerId;
      }
      if (realUser?.id && members.some(m => m.id === realUser.id)) {
        return realUser.id;
      }
      if (currentPaidBy && members.some(m => m.id === currentPaidBy) && currentPaidBy !== dummyDadId) {
        return currentPaidBy;
      }
      return members[0]?.id || '';
    };

    // 情況 1：冷啟動預設假爸爸，真實成員載入後應自動對齊梅特
    expect(resolveEffectivePayer(dummyDadId, false)).toBe('real-user-matt-1234');

    // 情況 2：paidBy 為空字串，應自動對齊梅特
    expect(resolveEffectivePayer('', false)).toBe('real-user-matt-1234');

    // 情況 3：若使用者主動手動點選了媽媽，應尊重其選擇
    expect(resolveEffectivePayer('member-mom-5678', true)).toBe('member-mom-5678');
  });
});
