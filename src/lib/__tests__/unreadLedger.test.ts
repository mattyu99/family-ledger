import { encodeMemoMerchantTag } from '../memo';
import {
  resolveLatestVisitedIso,
  collectOwnIdentityIdsForLedger,
  isCrossLedgerNotifyableTx,
  countUnreadCandidateTxs,
  UnreadCandidateTx,
} from '../unreadLedger';

describe('unreadLedger 跨帳本未讀紅點判定邏輯', () => {
  describe('resolveLatestVisitedIso', () => {
    it('無既有時間或較舊時，應推進至 nowMs', () => {
      const nowMs = new Date('2026-11-27T10:00:00.000Z').getTime();
      expect(resolveLatestVisitedIso(null, undefined, nowMs)).toBe('2026-11-27T10:00:00.000Z');
      expect(resolveLatestVisitedIso('2026-11-27T09:00:00.000Z', undefined, nowMs)).toBe(
        '2026-11-27T10:00:00.000Z'
      );
    });

    it('既有時間比 nowMs 晚時，應維持既有較晚時間絕不倒退', () => {
      const nowMs = new Date('2026-11-27T10:00:00.000Z').getTime();
      expect(resolveLatestVisitedIso('2026-11-27T10:05:00.000Z', undefined, nowMs)).toBe(
        '2026-11-27T10:05:00.000Z'
      );
    });

    it('雲端交易 created_at 比本機時鐘快數秒時，應取最大值避免切換後立刻誤判未讀', () => {
      const nowMs = new Date('2026-11-27T10:00:00.000Z').getTime();
      const result = resolveLatestVisitedIso(
        '2026-11-27T09:59:00.000Z',
        ['2026-11-27T09:58:00.000Z', '2026-11-27T10:00:04.500Z', 'invalid-date'],
        nowMs
      );
      expect(result).toBe('2026-11-27T10:00:04.500Z');
    });
  });

  describe('collectOwnIdentityIdsForLedger', () => {
    it('能收集 authId、currentUserId、目標帳本快取成員 ID 與同 Google 信箱成員 ID', () => {
      const ids = collectOwnIdentityIdsForLedger({
        authId: 'auth-uid-1',
        currentUserId: 'cur-ledger-user-1',
        cachedLedgerUser: { id: 'other-ledger-user-1', auth_email: 'User@Example.com' },
        cachedLedgerMembers: [
          { id: 'member-match-auth', auth_email: '  user@example.com ' },
          { id: 'member-match-email', email: 'USER@EXAMPLE.COM' },
          { id: 'member-other', auth_email: 'spouse@example.com' },
        ],
        googleEmail: 'User@Example.com',
      });

      expect(ids.has('auth-uid-1')).toBe(true);
      expect(ids.has('cur-ledger-user-1')).toBe(true);
      expect(ids.has('other-ledger-user-1')).toBe(true);
      expect(ids.has('member-match-auth')).toBe(true);
      expect(ids.has('member-match-email')).toBe(true);
      expect(ids.has('member-other')).toBe(false);
    });

    it('應排除 @family.local 佔位信箱，避免誤配同類佔位帳號', () => {
      const ids = collectOwnIdentityIdsForLedger({
        authId: 'auth-uid-1',
        cachedLedgerMembers: [
          { id: 'member-local', auth_email: 'dad@family.local' },
          { id: 'member-local-2', email: 'dad@family.local' },
        ],
        googleEmail: 'dad@family.local',
      });

      expect(ids.has('auth-uid-1')).toBe(true);
      expect(ids.has('member-local')).toBe(false);
      expect(ids.has('member-local-2')).toBe(false);
    });
  });

  describe('isCrossLedgerNotifyableTx', () => {
    const ownIds = new Set(['auth-1', 'other-member-1']);

    it('自己以目標帳本專屬成員 UUID 建立或付款的交易應排除', () => {
      expect(
        isCrossLedgerNotifyableTx(
          { type: 'expense', amount: 150, creator_id: 'other-member-1', paid_by: 'spouse' },
          ownIds
        )
      ).toBe(false);

      expect(
        isCrossLedgerNotifyableTx(
          { type: 'expense', amount: 150, creator_id: 'spouse', paid_by: 'auth-1' },
          ownIds
        )
      ).toBe(false);
    });

    it('他人的支出、收入與有金額轉帳應觸發提醒', () => {
      expect(
        isCrossLedgerNotifyableTx(
          { type: 'expense', amount: 120, creator_id: 'spouse', paid_by: 'spouse' },
          ownIds
        )
      ).toBe(true);
      expect(
        isCrossLedgerNotifyableTx(
          { type: 'income', amount: 5000, creator_id: 'spouse', paid_by: 'spouse' },
          ownIds
        )
      ).toBe(true);
      expect(
        isCrossLedgerNotifyableTx(
          { type: 'transfer', amount: 1000, creator_id: 'spouse', paid_by: 'spouse' },
          ownIds
        )
      ).toBe(true);
    });

    it('他人的個人私密記事（無論獨立欄位或 merchant 編碼）絕對不觸發紅點', () => {
      expect(
        isCrossLedgerNotifyableTx(
          {
            type: 'memo',
            amount: 0,
            creator_id: 'spouse',
            is_pinned: true,
            reminder_date: '2026-12-01',
            reminder_target: 'personal',
            note: '[私密備忘] 驚喜禮物',
          },
          ownIds
        )
      ).toBe(false);

      const encodedPersonalMerchant = encodeMemoMerchantTag({
        reminderDate: '2026-12-01',
        reminderTarget: 'personal',
        isPinned: true,
      });
      expect(
        isCrossLedgerNotifyableTx(
          {
            type: 'transfer',
            amount: 0,
            creator_id: 'spouse',
            merchant: encodedPersonalMerchant,
            note: '[秘密] 買蛋糕',
          },
          ownIds
        )
      ).toBe(false);
    });

    it('他人的一般無置頂無提醒生活記事保持安靜不觸發紅點', () => {
      expect(
        isCrossLedgerNotifyableTx(
          {
            type: 'memo',
            amount: 0,
            creator_id: 'spouse',
            note: '[生活記事] 買了醬油回來放冰箱',
          },
          ownIds
        )
      ).toBe(false);
    });

    it('他人的重要全家記事（置頂、設提醒、或開團看板，含 transfer+0 元相容格式）應觸發紅點', () => {
      expect(
        isCrossLedgerNotifyableTx(
          {
            type: 'memo',
            amount: 0,
            creator_id: 'spouse',
            is_pinned: true,
            note: '[生活記事] 記得關瓦斯',
          },
          ownIds
        )
      ).toBe(true);

      expect(
        isCrossLedgerNotifyableTx(
          {
            type: 'memo',
            amount: 0,
            creator_id: 'spouse',
            reminder_date: '2026-12-05',
            note: '[生活記事] 繳管理費',
          },
          ownIds
        )
      ).toBe(true);

      expect(
        isCrossLedgerNotifyableTx(
          {
            type: 'transfer',
            amount: 0,
            creator_id: 'spouse',
            note: '[🧋 點餐開團] 今天喝五十嵐！\n- [ ] 珍珠奶茶',
          },
          ownIds
        )
      ).toBe(true);
    });
  });

  describe('countUnreadCandidateTxs', () => {
    const ownIds = new Set(['me-1', 'me-2']);
    const lastVisited = '2026-06-01T00:00:00.000Z';

    it('無最後造訪時間或時間格式無效時應回傳 0', () => {
      const txs: UnreadCandidateTx[] = [
        { type: 'expense', amount: 100, creator_id: 'spouse', created_at: '2026-11-27T00:00:00.000Z' },
      ];
      expect(countUnreadCandidateTxs(txs, null, ownIds)).toBe(0);
      expect(countUnreadCandidateTxs(txs, 'not-a-date', ownIds)).toBe(0);
    });

    it('應精準篩選並統計真正他人未讀筆數，且不設時間過期上限', () => {
      const txs: UnreadCandidateTx[] = [
        // 舊交易 (早於 lastVisited) -> 不計
        { id: 'old', type: 'expense', amount: 50, creator_id: 'spouse', created_at: '2026-05-31T23:59:59.000Z' },
        // 剛好等於 lastVisited -> 不計
        { id: 'eq', type: 'expense', amount: 50, creator_id: 'spouse', created_at: '2026-06-01T00:00:00.000Z' },
        // 自己記的帳 -> 不計
        { id: 'mine', type: 'expense', amount: 300, creator_id: 'me-2', created_at: '2026-11-20T00:00:00.000Z' },
        // 他人的個人私密記事 -> 不計
        {
          id: 'private-memo',
          type: 'memo',
          amount: 0,
          creator_id: 'spouse',
          reminder_target: 'personal',
          is_pinned: true,
          created_at: '2026-11-21T00:00:00.000Z',
        },
        // 他人的一般無提醒無置頂生活記事 -> 不計
        {
          id: 'plain-memo',
          type: 'memo',
          amount: 0,
          creator_id: 'spouse',
          note: '[生活記事] 隨手記一下',
          created_at: '2026-11-22T00:00:00.000Z',
        },
        // 數個月前但晚於 lastVisited 的他人真實新記帳（驗證不設時效上限）-> 計入
        {
          id: 'valid-1',
          type: 'expense',
          amount: 220,
          creator_id: 'spouse',
          created_at: '2026-06-05T12:00:00.000Z',
        },
        // 他人的置頂全家記事 -> 計入
        {
          id: 'valid-2',
          type: 'memo',
          amount: 0,
          creator_id: 'spouse',
          is_pinned: true,
          note: '[生活記事] 社區停水公告',
          created_at: '2026-11-25T08:00:00.000Z',
        },
      ];

      expect(countUnreadCandidateTxs(txs, lastVisited, ownIds)).toBe(2);
    });
  });
});
