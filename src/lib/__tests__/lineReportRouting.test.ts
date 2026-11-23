import {
  LINE_BOT_BASIC_ID,
  buildLineBindDeepLink,
  parseBindCommandCode,
  isExcludedDemoLedger,
  isQuietDayReport,
  filterCreditCardsForRecipient,
  filterMemosForRecipient,
  wrapFlexBubblesToPayload,
} from '../lineNotifications';

describe('LINE 個人自主訂閱與家庭群組雙軌日報工具函式', () => {
  it('buildLineBindDeepLink 應正確組合預填綁定碼連結且保留 @ 符號', () => {
    const url = buildLineBindDeepLink('bind-ab1234');
    expect(url).toBe(`https://line.me/R/oaMessage/${LINE_BOT_BASIC_ID}/?BIND-AB1234`);
    expect(url).toContain('/@436nzvzs/?BIND-AB1234');
    expect(url).not.toContain('%40');
  });

  it('parseBindCommandCode 應正確解析個人 BIND- 與群組 GRP- 綁定碼（含大小寫與群組標註）', () => {
    expect(parseBindCommandCode('BIND-7K9P2M')).toEqual({
      targetType: 'user',
      code: 'BIND-7K9P2M',
    });
    expect(parseBindCommandCode('  bind-ab12cd  ')).toEqual({
      targetType: 'user',
      code: 'BIND-AB12CD',
    });
    expect(parseBindCommandCode('@436nzvzs grp-9x8y7z')).toEqual({
      targetType: 'group',
      code: 'GRP-9X8Y7Z',
    });
    expect(parseBindCommandCode('今天花了多少錢')).toBeNull();
  });

  it('isExcludedDemoLedger 應嚴格排除 SWEETHOME 與示範帳本，並放行真實家庭帳本', () => {
    expect(
      isExcludedDemoLedger({ id: 'ee100000-0000-4000-8000-000000000001', name: '甜心家庭' })
    ).toBe(true);
    expect(
      isExcludedDemoLedger({ id: 'demo-ledger-id', name: 'Test' })
    ).toBe(true);
    expect(
      isExcludedDemoLedger({ id: '11111111-1111-4111-8111-111111111111', name: 'My SWEETHOME Copy' })
    ).toBe(true);
    expect(
      isExcludedDemoLedger({ id: '22222222-2222-4222-8222-222222222222', name: '幸福小窩共同帳本' })
    ).toBe(false);
  });

  it('filterCreditCardsForRecipient 在個人與群組模式應嚴格遵循隱私規則', () => {
    const profileMap = new Map([
      ['u-dad', { display_name: '爸比' }],
      ['u-mom', { display_name: '媽咪' }],
    ]);
    const cards = [
      { id: 'c1', name: '爸爸玉山卡', user_id: 'u-dad' },
      { id: 'c2', name: '媽媽國泰卡', user_id: 'u-mom' },
      { id: 'c3', name: '全家Costco公用卡', user_id: null },
    ];

    // 個人模式（爸比）：只看自己的卡 ＋ 全家公用卡
    const dadCards = filterCreditCardsForRecipient(cards, {
      mode: 'user',
      recipientUserIds: ['u-dad'],
      recipientNames: ['爸比'],
      includeCreditCards: true,
      profileMap,
    });
    expect(dadCards.map(c => c.id)).toEqual(['c1', 'c3']);

    // 個人關閉信用卡提醒
    expect(
      filterCreditCardsForRecipient(cards, {
        mode: 'user',
        recipientUserIds: ['u-dad'],
        includeCreditCards: false,
      })
    ).toEqual([]);

    // 群組預設關閉信用卡播報
    expect(
      filterCreditCardsForRecipient(cards, {
        mode: 'group',
        includeCreditCards: false,
      })
    ).toEqual([]);

    // 群組開啟時，僅播報無個人持卡人標記之全家公用卡，不外洩個人私卡
    const groupCards = filterCreditCardsForRecipient(cards, {
      mode: 'group',
      includeCreditCards: true,
    });
    expect(groupCards.map(c => c.id)).toEqual(['c3']);
  });

  it('filterMemosForRecipient 在群組模式應強制排除個人私密備忘，在個人模式僅保留本人與全家待辦', () => {
    const profileMap = new Map([
      ['u-dad', { display_name: '爸比' }],
      ['u-mom', { display_name: '媽咪' }],
    ]);
    const memos = [
      { id: 'm1', reminder_target: 'family', paid_by: 'u-dad', creator_id: 'u-dad' },
      { id: 'm2', reminder_target: 'personal', paid_by: 'u-dad', creator_id: 'u-dad' },
      { id: 'm3', reminder_target: 'personal', paid_by: 'u-mom', creator_id: 'u-mom' },
      { id: 'm4', reminder_target: null, paid_by: null, creator_id: 'u-mom' },
    ];

    // 群組模式：強制只留 m1 與 m4（非 personal）
    const groupMemos = filterMemosForRecipient(memos, { mode: 'group', includeMemos: true });
    expect(groupMemos.map(m => m.id)).toEqual(['m1', 'm4']);

    // 爸比個人模式：留全家 (m1, m4) ＋ 自己的 (m2)，排除媽咪私密備忘 (m3)
    const dadMemos = filterMemosForRecipient(memos, {
      mode: 'user',
      recipientUserIds: ['u-dad'],
      recipientNames: ['爸比'],
      includeMemos: true,
      profileMap,
    });
    expect(dadMemos.map(m => m.id)).toEqual(['m1', 'm2', 'm4']);
  });

  it('isQuietDayReport 應於零交易且零提醒時判定為安靜日', () => {
    expect(isQuietDayReport({ todayCount: 0, billingAlertsCount: 0, memoAlertsCount: 0 })).toBe(true);
    expect(isQuietDayReport({ todayCount: 1, billingAlertsCount: 0, memoAlertsCount: 0 })).toBe(false);
    expect(isQuietDayReport({ todayCount: 0, billingAlertsCount: 1, memoAlertsCount: 0 })).toBe(false);
    expect(isQuietDayReport({ todayCount: 0, billingAlertsCount: 0, memoAlertsCount: 2 })).toBe(false);
  });

  it('wrapFlexBubblesToPayload 單張應輸出 bubble、多張應包裝為 carousel 並遵守 12 張與 400 字上限', () => {
    const b1 = { type: 'bubble', body: { type: 'box' } };
    const single = wrapFlexBubblesToPayload([b1], '單本測試');
    expect(single.contents.type).toBe('bubble');

    const many = Array.from({ length: 15 }, (_, idx) => ({ type: 'bubble', id: idx }));
    const longAlt = '測試標題'.repeat(120);
    const multi = wrapFlexBubblesToPayload(many, longAlt);
    expect(multi.contents.type).toBe('carousel');
    expect(multi.contents.contents).toHaveLength(12);
    expect(multi.altText.length).toBeLessThanOrEqual(390);
  });
});
