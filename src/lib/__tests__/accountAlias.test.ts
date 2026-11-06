import { isAccountBelongingToMember, filterAccountsForUser } from '../payment';
import { isAccountBoundToUser } from '../ledgerUtils';
import { PaymentAccount, Profile } from '../../types/database';

describe('Account Member Alias Resolution Tests', () => {
  const OLD_YING_ID = 'a452c526-7572-482c-b6ea-b975c0c13ea5';
  const GOOGLE_YING_ID = 'f7ac1e00-40b1-47bf-b8ac-787be1147c96';

  const yingProfileGoogle: Profile = {
    id: GOOGLE_YING_ID,
    display_name: '瑩媽',
    email: 'poonechin3683@gmail.com',
    auth_email: 'poonechin3683@gmail.com',
    role: 'member',
    avatar_url: '🐰',
  };

  const zhiProfile: Profile = {
    id: '9a24be3d-5d15-41bf-b672-e8db6d43b651',
    display_name: '智爸',
    role: 'owner',
    avatar_url: '🐹',
  };

  const dedupedMembers: Profile[] = [zhiProfile, yingProfileGoogle];

  const yingCreditCard: PaymentAccount = {
    id: 'card-1',
    ledger_id: 'ledger-test',
    name: '玉山U熊卡',
    type: 'credit_card',
    user_id: OLD_YING_ID,
    balance: 0,
    sort_order: 1,
    created_at: '2026-10-10T12:30:00Z',
  };

  const getMemberById = (id?: string): Profile | undefined => {
    if (!id) return undefined;
    if (id === GOOGLE_YING_ID || id === OLD_YING_ID) {
      return yingProfileGoogle;
    }
    return dedupedMembers.find(m => m.id === id);
  };

  test('isAccountBelongingToMember successfully matches card to Google Ying profile using getMemberById alias resolver', () => {
    const isBelonging = isAccountBelongingToMember(
      yingCreditCard,
      GOOGLE_YING_ID,
      yingProfileGoogle,
      zhiProfile,
      dedupedMembers,
      getMemberById
    );
    expect(isBelonging).toBe(true);
  });

  test('isAccountBelongingToMember returns false for another member', () => {
    const isBelonging = isAccountBelongingToMember(
      yingCreditCard,
      zhiProfile.id,
      zhiProfile,
      yingProfileGoogle,
      dedupedMembers,
      getMemberById
    );
    expect(isBelonging).toBe(false);
  });

  test('isAccountBoundToUser recognizes old user_id as belonging to current Google Ying user', () => {
    const isBound = isAccountBoundToUser(
      OLD_YING_ID,
      yingProfileGoogle,
      dedupedMembers,
      getMemberById
    );
    expect(isBound).toBe(true);
  });

  test('isAccountBoundToUser rejects non-matching user', () => {
    const isBound = isAccountBoundToUser(
      OLD_YING_ID,
      zhiProfile,
      dedupedMembers,
      getMemberById
    );
    expect(isBound).toBe(false);
  });

  describe('filterAccountsForUser Resilience & Payer Resolution Tests', () => {
    const publicCreditCard: PaymentAccount = {
      id: 'card-public',
      ledger_id: 'ledger-test',
      name: '通用公用卡',
      type: 'credit_card',
      user_id: undefined,
      balance: 0,
      sort_order: 2,
      created_at: '2026-10-10T12:30:00Z',
    };

    const zhiCreditCard: PaymentAccount = {
      id: 'card-zhi',
      ledger_id: 'ledger-test',
      name: '智爸永豐卡',
      type: 'credit_card',
      user_id: zhiProfile.id,
      balance: 0,
      sort_order: 3,
      created_at: '2026-10-10T12:30:00Z',
    };

    const accounts = [yingCreditCard, publicCreditCard, zhiCreditCard];

    test('filters by targetPayerId when targetPayerId is specified', () => {
      const res = filterAccountsForUser(accounts, {
        type: 'credit_card',
        currentUser: yingProfileGoogle,
        targetPayerId: zhiProfile.id,
        getMemberById,
      });
      const ids = res.map(a => a.id);
      expect(ids).toContain('card-zhi');
      expect(ids).toContain('card-public');
    });

    test('always includes unassigned public cards for daily expense recording', () => {
      const res = filterAccountsForUser(accounts, {
        type: 'credit_card',
        currentUser: yingProfileGoogle,
        getMemberById,
      });
      const ids = res.map(a => a.id);
      expect(ids).toContain('card-public');
      expect(ids).toContain('card-1');
    });

    test('falls back to public or available cards if current user has 0 personal cards', () => {
      const visitorUser: Profile = {
        id: 'new-visitor-id',
        display_name: '新成員',
        role: 'member',
      };
      const res = filterAccountsForUser(accounts, {
        type: 'credit_card',
        currentUser: visitorUser,
        getMemberById,
      });
      // Should fallback to at least public cards or existing cards so selection never blocks
      expect(res.length).toBeGreaterThan(0);
      expect(res.some(a => a.id === 'card-public')).toBe(true);
    });
  });
});
