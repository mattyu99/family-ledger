import {
  deduplicateMembers,
  buildMemberAliasMap,
  isDemoMemberProfile,
  isRealAuthEmail,
} from '../ledgerUtils';
import { deduplicateCloudMembers, CloudLedgerMemberInfo } from '../cloudLedgerService';
import { Profile } from '../../types/database';

describe('Member Deduplication & Anti-Pollution Tests', () => {
  const ZHI_CREATOR_ID = '9a24be3d-5d15-41bf-b672-e8db6d43b651';
  const ZHI_FROG_DUP_ID = '9b017d89-b21f-4638-b076-5a7629e2dda5';
  const ZHI_UNLOCKED_DUP_ID = 'b9ca1112-a865-4b7c-9629-f29cf56053f6';

  const YING_MAIN_ID = '85e2568c-dfda-440c-ba8b-29a08596f36b';
  const YING_OLD_ID = 'a452c526-7572-482c-b6ea-b975c0c13ea5';
  const YING_DUP_ID = 'f7ac1e00-40b1-47bf-b8ac-787be1147c96';
  const YING_UNLOCKED_ID = '80312287-dae5-41f3-aac7-9fefc5f95796';

  const YANG_MAIN_ID = '1705b9ce-1485-4714-b6fd-42a5aa8baa68';
  const YANG_GOOGLE_SHADOW_ID = '7f99fb8a-05df-45b2-8fa6-e990be855a61';

  const DOU_MAIN_ID = '8a0505f0-cdd6-4948-9cec-1926805e2e1d';
  const DOU_GOOGLE_SHADOW_ID = '131d29af-2ded-407d-b30c-701b758fff1b';

  const elevenMembersSnapshot: Profile[] = [
    {
      id: YING_OLD_ID,
      display_name: '瑩媽',
      avatar_url: '🐰',
      auth_email: 'poonechin3683@gmail.com',
      is_locked: true,
      role: 'member',
    },
    {
      id: ZHI_CREATOR_ID,
      display_name: '智爸',
      avatar_url: '🐹',
      auth_email: 'mattyu09@gmail.com',
      is_locked: true,
      role: 'owner',
    },
    {
      id: YANG_MAIN_ID,
      display_name: '洋洋',
      avatar_url: '🦊',
      auth_email: 'youngyu09@gmail.com',
      is_locked: true,
      role: 'member',
    },
    {
      id: YING_MAIN_ID,
      display_name: '瑩媽',
      avatar_url: '🐰',
      auth_email: 'poonechin3683@gmail.com',
      is_locked: true,
      role: 'member',
    },
    {
      id: DOU_MAIN_ID,
      display_name: '豆豆',
      avatar_url: '🦕',
      auth_email: 'samyu3683@gmail.com',
      is_locked: true,
      role: 'member',
    },
    {
      id: YING_DUP_ID,
      display_name: '瑩媽',
      avatar_url: '🐰',
      auth_email: 'poonechin3683@gmail.com',
      is_locked: true,
      role: 'member',
    },
    {
      id: ZHI_FROG_DUP_ID,
      display_name: '爸',
      avatar_url: '🐸',
      auth_email: 'mattyu09@gmail.com',
      is_locked: true,
      role: 'owner',
    },
    {
      id: ZHI_UNLOCKED_DUP_ID,
      display_name: '智爸',
      avatar_url: '🐹',
      auth_email: 'mattyu09@gmail.com',
      is_locked: false,
      role: 'owner',
    },
    {
      id: YING_UNLOCKED_ID,
      display_name: '瑩媽',
      avatar_url: '🐰',
      auth_email: undefined,
      is_locked: false,
      role: 'member',
    },
    {
      id: YANG_GOOGLE_SHADOW_ID,
      display_name: '洋洋',
      custom_name: '洋洋',
      avatar_url: '🦊',
      custom_avatar: '🦊',
      is_locked: false,
      role: 'member',
    },
    {
      id: DOU_GOOGLE_SHADOW_ID,
      display_name: '豆豆',
      custom_name: '豆豆',
      avatar_url: '🦕',
      custom_avatar: '🦕',
      is_locked: false,
      role: 'member',
    },
  ];

  test('將測試記帳本 11 筆真實結構精準收斂為 4 位成員且智爸保留建立者主帳號', () => {
    const deduped = deduplicateMembers(elevenMembersSnapshot, ZHI_CREATOR_ID);

    expect(deduped).toHaveLength(4);
    expect(deduped.map(m => m.display_name)).toEqual(['智爸', '瑩媽', '洋洋', '豆豆']);

    const zhi = deduped.find(m => m.display_name === '智爸');
    expect(zhi?.id).toBe(ZHI_CREATOR_ID);
    expect(zhi?.avatar_url).toBe('🐹');
    expect(zhi?.role).toBe('owner');
  });

  test('同 Google auth_email 不同 Emoji 稱謂（🐹 智爸 vs 🐸 爸）必合併為 1 人', () => {
    const deduped = deduplicateMembers(
      [
        {
          id: ZHI_FROG_DUP_ID,
          display_name: '爸',
          avatar_url: '🐸',
          auth_email: 'mattyu09@gmail.com',
          is_locked: true,
          role: 'owner',
        },
        {
          id: ZHI_CREATOR_ID,
          display_name: '智爸',
          avatar_url: '🐹',
          auth_email: 'MATTYU09@gmail.com',
          is_locked: true,
          role: 'owner',
        },
      ],
      ZHI_CREATOR_ID
    );

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe(ZHI_CREATOR_ID);
    expect(deduped[0].display_name).toBe('智爸');
  });

  test('不同真實 Google auth_email 絕不誤併；無 auth_email 且僅有 @family.local 的不同成員絕不誤併', () => {
    const list: Profile[] = [
      {
        id: 'u-1',
        display_name: '智爸',
        avatar_url: '🐹',
        auth_email: 'mattyu09@gmail.com',
        is_locked: true,
        role: 'owner',
      },
      {
        id: 'u-2',
        display_name: '外公',
        avatar_url: '👴',
        auth_email: 'grandpa@gmail.com',
        is_locked: true,
        role: 'member',
      },
      {
        id: 'u-3',
        display_name: '大寶',
        avatar_url: '👦',
        email: 'kid1@family.local',
        role: 'member',
      },
      {
        id: 'u-4',
        display_name: '二寶',
        avatar_url: '👧',
        email: 'kid2@family.local',
        role: 'member',
      },
      {
        id: 'u-5',
        display_name: '小姑',
        avatar_url: '👩',
        email: 'shared@family.local',
        role: 'member',
      },
      {
        id: 'u-6',
        display_name: '表妹',
        avatar_url: '👧',
        email: 'shared@family.local',
        role: 'member',
      },
    ];

    const deduped = deduplicateMembers(list, 'u-1');
    expect(deduped).toHaveLength(6);
  });

  test('buildMemberAliasMap 可將被合併的 🐸 爸與舊瑩媽 ID 準確映射至主帳號', () => {
    const deduped = deduplicateMembers(elevenMembersSnapshot, ZHI_CREATOR_ID);
    const aliasMap = buildMemberAliasMap(deduped, elevenMembersSnapshot);

    const zhiMain = deduped.find(m => m.display_name === '智爸');
    const yingMain = deduped.find(m => m.display_name === '瑩媽');

    expect(aliasMap[ZHI_FROG_DUP_ID]?.id).toBe(zhiMain?.id);
    expect(aliasMap[ZHI_UNLOCKED_DUP_ID]?.id).toBe(zhiMain?.id);
    expect(aliasMap[YING_OLD_ID]?.id).toBe(yingMain?.id);
    expect(aliasMap[YING_DUP_ID]?.id).toBe(yingMain?.id);
    expect(aliasMap[YING_UNLOCKED_ID]?.id).toBe(yingMain?.id);
  });

  test('isDemoMemberProfile 精準識別示範稱謂與示範 UUID，不誤判真實成員稱謂', () => {
    expect(isDemoMemberProfile({ id: 'random-uuid', display_name: '智爸 (爸爸)' })).toBe(true);
    expect(isDemoMemberProfile({ id: 'random-uuid', display_name: '瑩媽 (媽媽)' })).toBe(true);
    expect(isDemoMemberProfile({ id: 'random-uuid', display_name: '洋洋 (哥哥)' })).toBe(true);
    expect(isDemoMemberProfile({ id: 'random-uuid', display_name: '豆豆 (妹妹)' })).toBe(true);
    expect(isDemoMemberProfile({ id: 'random-uuid', display_name: '爸爸 (我)' })).toBe(true);
    expect(isDemoMemberProfile({ id: 'ee200000-0000-4000-8000-000000000001', display_name: '任意名稱' })).toBe(true);
    expect(isDemoMemberProfile({ id: '20000000-0000-4000-8000-000000000001', display_name: '任意名稱' })).toBe(true);

    expect(isDemoMemberProfile({ id: ZHI_CREATOR_ID, display_name: '智爸' })).toBe(false);
    expect(isDemoMemberProfile({ id: ZHI_FROG_DUP_ID, display_name: '爸' })).toBe(false);
    expect(isDemoMemberProfile({ id: YING_MAIN_ID, display_name: '瑩媽' })).toBe(false);
  });

  test('isRealAuthEmail 正確排除空白、@family.local 與 anonymous 信箱', () => {
    expect(isRealAuthEmail('mattyu09@gmail.com')).toBe(true);
    expect(isRealAuthEmail('  MattYu09@gmail.com  ')).toBe(true);
    expect(isRealAuthEmail('dad@family.local')).toBe(false);
    expect(isRealAuthEmail('anonymous-123@example.com')).toBe(false);
    expect(isRealAuthEmail('')).toBe(false);
    expect(isRealAuthEmail(null)).toBe(false);
  });

  test('deduplicateCloudMembers 對同 Google 信箱不同 Emoji 稱謂正確整併為 1 人', () => {
    const rawCloudMembers: CloudLedgerMemberInfo[] = [
      {
        userId: ZHI_FROG_DUP_ID,
        displayName: '爸',
        avatarUrl: '🐸',
        role: 'owner',
        authEmail: 'mattyu09@gmail.com',
        isLocked: true,
      },
      {
        userId: ZHI_CREATOR_ID,
        displayName: '智爸',
        avatarUrl: '🐹',
        role: 'owner',
        authEmail: 'mattyu09@gmail.com',
        isLocked: true,
      },
      {
        userId: YING_MAIN_ID,
        displayName: '瑩媽',
        avatarUrl: '🐰',
        role: 'member',
        authEmail: 'poonechin3683@gmail.com',
        isLocked: true,
      },
    ];

    const dedupedCloud = deduplicateCloudMembers(rawCloudMembers, undefined, ZHI_CREATOR_ID);
    expect(dedupedCloud).toHaveLength(2);
    expect(dedupedCloud[0].userId).toBe(ZHI_CREATOR_ID);
    expect(dedupedCloud[0].displayName).toBe('智爸');
  });
});
