import { isAccountBelongingToMember } from '../payment';
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
});
