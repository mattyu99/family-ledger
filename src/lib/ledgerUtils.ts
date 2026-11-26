import { Platform, Alert } from 'react-native';
import { Profile, Transaction, CustomPaymentMethod } from '../types/database';
import {
  decodeInvoiceTag,
  formatInvoiceNumber,
  getInvoicePeriodKey,
} from './invoice';
import { checkInvoiceWinning } from './lottery';
import { decodeMemoMerchantTag, stripMemoInternalTag } from './memo';
import {
  DEMO_USER_DAD,
  DEMO_USER_MOM,
  DEMO_USER_KID,
} from '../constants/ledgerDefaults';

export const safeAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

/**
 * 發票屬性解析與實時對獎裝飾函式：自動補齊發票號碼、期別與最新中獎狀態
 */
export const hydrateTransactionWithInvoice = (t: any): Transaction => {
  if (!t) return t;

  let note = t.note;
  if (t.type === 'memo' || /^[\[［【]\s*(?:memo|remind:)/i.test(note || '')) {
    note = stripMemoInternalTag(note);
  }

  let isPinned = t.is_pinned;
  if (isPinned === undefined && t.merchant) {
    const decodedMemo = decodeMemoMerchantTag(t.merchant);
    if (decodedMemo.isPinned) {
      isPinned = true;
    }
  }

  let invoiceNumber = t.invoice_number;
  let periodKey = t.invoice_period;
  let randomCode = t.invoice_random_code;
  let invoiceStatus = t.invoice_status;
  let prizeAmount = t.invoice_prize_amount;
  let prizeName = t.invoice_prize_name;
  let invoiceSyncStatus = t.invoice_sync_status;
  let cloudSyncedAt = t.cloud_synced_at;
  let cloudCarrierName = t.cloud_carrier_name;

  // 1. 嘗試從 note 中解碼發票標籤（含雲端同步狀態、時間與來源載具）
  if (t.note) {
    const decoded = decodeInvoiceTag(t.note);
    if (decoded) {
      if (!invoiceNumber && decoded.invoiceNumber) {
        invoiceNumber = decoded.invoiceNumber;
        periodKey = periodKey || decoded.periodKey;
        randomCode = randomCode || decoded.randomCode;
        invoiceStatus = invoiceStatus || decoded.status;
        prizeAmount = prizeAmount !== undefined ? prizeAmount : decoded.prizeAmount;
        prizeName = prizeName || decoded.prizeName;
      }
      if (!invoiceSyncStatus && decoded.syncStatus) {
        invoiceSyncStatus = decoded.syncStatus;
      }
      if (!cloudSyncedAt && decoded.syncedAt) {
        cloudSyncedAt = decoded.syncedAt;
      }
      if (!cloudCarrierName && decoded.carrierName) {
        cloudCarrierName = decoded.carrierName;
      }
    }
  }

  // 2. 若有發票號碼，確保期別計算與實時開獎比對
  if (invoiceNumber) {
    invoiceNumber = formatInvoiceNumber(invoiceNumber);

    // 發票開獎期別嚴格由消費發生日期 (transacted_at) 唯一決定，
    // 自動即時校正先前因日期格式解析瑕疵而誤存於 note 標籤中的歷史期別
    if (t.transacted_at) {
      periodKey = getInvoicePeriodKey(t.transacted_at).periodKey;
    } else if (!periodKey) {
      periodKey = getInvoicePeriodKey(new Date()).periodKey;
    }

    // 若尚未領獎，自動比對官方開獎號碼庫
    if (periodKey && invoiceStatus !== 'claimed') {
      const check = checkInvoiceWinning(invoiceNumber, periodKey);
      if (check.isDrawn) {
        if (check.isWon) {
          invoiceStatus = 'won';
          prizeAmount = check.prizeAmount;
          prizeName = check.prizeName;
        } else {
          invoiceStatus = 'missed';
          prizeAmount = 0;
          prizeName = undefined;
        }
      } else {
        invoiceStatus = 'pending';
        prizeAmount = 0;
        prizeName = undefined;
      }
    }

    return {
      ...t,
      note,
      is_pinned: isPinned !== undefined ? Boolean(isPinned) : t.is_pinned,
      invoice_number: invoiceNumber,
      invoice_period: periodKey,
      invoice_random_code: randomCode,
      invoice_status: invoiceStatus,
      invoice_prize_amount: prizeAmount,
      invoice_prize_name: prizeName,
      ...(invoiceSyncStatus ? { invoice_sync_status: invoiceSyncStatus } : {}),
      ...(cloudSyncedAt ? { cloud_synced_at: cloudSyncedAt } : {}),
      ...(cloudCarrierName ? { cloud_carrier_name: cloudCarrierName } : {}),
    };
  }

  return {
    ...t,
    note,
    is_pinned: isPinned !== undefined ? Boolean(isPinned) : t.is_pinned,
    ...(invoiceSyncStatus ? { invoice_sync_status: invoiceSyncStatus } : {}),
    ...(cloudSyncedAt ? { cloud_synced_at: cloudSyncedAt } : {}),
    ...(cloudCarrierName ? { cloud_carrier_name: cloudCarrierName } : {}),
  };
};

export const DEMO_POLLUTED_MEMBER_NAMES = [
  '智爸 (爸爸)',
  '瑩媽 (媽媽)',
  '洋洋 (哥哥)',
  '豆豆 (妹妹)',
  '爸爸 (我)',
] as const;

/**
 * 判斷信箱是否為真實經過驗證的電子信箱（排除空白、@family.local 與 anonymous 匿名佔位字串）
 */
export const isRealAuthEmail = (email?: string | null): boolean => {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) return false;
  if (clean.endsWith('@family.local')) return false;
  if (clean.includes('anonymous')) return false;
  return true;
};

/**
 * 判斷成員 Profile 是否屬於官方示範帳本的預設成員或示範污染稱謂
 */
export const isDemoMemberProfile = (
  member?: { id?: string | null; display_name?: string | null } | null
): boolean => {
  if (!member) return false;
  const id = (member.id || '').trim().toLowerCase();
  if (id.startsWith('ee200000-0000-4000-8000') || id.startsWith('20000000-0000-4000-8000')) {
    return true;
  }
  const name = (member.display_name || '').trim();
  return (DEMO_POLLUTED_MEMBER_NAMES as readonly string[]).includes(name);
};

const isHttpAvatarUrl = (avatarUrl?: string | null): boolean =>
  Boolean(avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')));

// 成員名冊去重函式：相同 display_name 或相同已驗證 Google 信箱者視為同一位家庭成員（支援多台手機/電腦認領同一身分及 Google 帳號授權）
export const deduplicateMembers = (memberList: Profile[], creatorId?: string): Profile[] => {
  const result: Profile[] = [];
  const seenNames = new Set<string>();
  const seenAuthEmails = new Set<string>();
  const seenFallbackEmails = new Set<string>();

  // 排除殘留之訪客寶可夢與歷史幽靈成員，確保名冊永遠純淨
  const initialClean = memberList.filter(m =>
    m.id !== 'e6a2d1ec-3b2a-495f-b24e-71c2647d9a86' &&
    (m.display_name || '').trim() !== '寶可夢'
  );

  // 若帳本名冊中已存在具名成員（如智爸、瑩媽），嚴密過濾排除未填寫暱稱之預設「家庭成員」假人
  const hasRealMembers = initialClean.some(m => {
    const name = (m.display_name || '').trim();
    return name !== '' && name !== '家庭成員';
  });

  const cleanList = hasRealMembers
    ? initialClean.filter(m => (m.display_name || '').trim() !== '家庭成員' && (m.display_name || '').trim() !== '')
    : initialClean;

  // 步驟一：先將帳本創建者、已綁定 Google 且加鎖之重要受保護成員放前，確保保留自訂家庭稱謂（如「智爸」優先於「Matt Yu」或「爸」）
  const sortedList = [...cleanList].sort((a, b) => {
    // 0. 帳本建立者最優先
    if (creatorId) {
      const aCreator = a.id === creatorId;
      const bCreator = b.id === creatorId;
      if (aCreator && !bCreator) return -1;
      if (!aCreator && bCreator) return 1;
    }
    // 1. 已加鎖保護者優先
    if (a.is_locked && !b.is_locked) return -1;
    if (!a.is_locked && b.is_locked) return 1;
    // 2. 具有自訂稱謂（非 Google 預設姓名、頭像不是圖片網址）者優先
    const aIsUrl = isHttpAvatarUrl(a.avatar_url);
    const bIsUrl = isHttpAvatarUrl(b.avatar_url);
    if (!aIsUrl && bIsUrl) return -1;
    if (aIsUrl && !bIsUrl) return 1;
    // 3. 具有帳本專屬 custom_name 者優先
    const aHasCustom = Boolean(a.custom_name && a.custom_name.trim());
    const bHasCustom = Boolean(b.custom_name && b.custom_name.trim());
    if (aHasCustom && !bHasCustom) return -1;
    if (!aHasCustom && bHasCustom) return 1;
    // 4. owner / admin 優先
    if ((a.role === 'owner' || a.role === 'admin') && b.role === 'member') return -1;
    if (a.role === 'member' && (b.role === 'owner' || b.role === 'admin')) return 1;
    return 0;
  });

  for (const m of sortedList) {
    const nameKey = (m.display_name || '').trim().toLowerCase();
    const authEmailKey = isRealAuthEmail(m.auth_email) ? m.auth_email!.trim().toLowerCase() : '';
    const fallbackEmailKey = !authEmailKey ? (m.email || '').trim().toLowerCase() : '';

    let existing: Profile | undefined = undefined;

    // 1. 同一帳本內只要綁定相同的已驗證 Google 信箱，一律整併為同一成員（即使 Emoji 頭像與暱稱不同）
    if (authEmailKey && seenAuthEmails.has(authEmailKey)) {
      existing = result.find(
        em => isRealAuthEmail(em.auth_email) && em.auth_email!.trim().toLowerCase() === authEmailKey
      );
    } else if (nameKey && seenNames.has(nameKey)) {
      existing = result.find(em => {
        if ((em.display_name || '').trim().toLowerCase() !== nameKey) return false;
        // 若兩者各自綁定了不同的真實 Google 信箱，視為不同真人不強行合併
        const emAuth = isRealAuthEmail(em.auth_email) ? em.auth_email!.trim().toLowerCase() : '';
        if (authEmailKey && emAuth && authEmailKey !== emAuth) return false;
        return true;
      });
    } else if (fallbackEmailKey && seenFallbackEmails.has(fallbackEmailKey)) {
      // 非 auth_email 的一般 email 維持保守條件（同名或其中一方為 Google HTTP 圖片頭像影子）才合併，避免假信箱誤併
      existing = result.find(em => {
        const emEmail = (em.auth_email || em.email || '').trim().toLowerCase();
        if (emEmail !== fallbackEmailKey) return false;
        const mIsUrl = isHttpAvatarUrl(m.avatar_url);
        const emIsUrl = isHttpAvatarUrl(em.avatar_url);
        const isSameName = (em.display_name || '').trim().toLowerCase() === nameKey;
        return isSameName || mIsUrl || emIsUrl;
      });
    }

    if (!existing) {
      if (nameKey) seenNames.add(nameKey);
      if (authEmailKey) seenAuthEmails.add(authEmailKey);
      if (fallbackEmailKey) seenFallbackEmails.add(fallbackEmailKey);
      result.push({ ...m });
    } else {
      // 合併屬性：保留較高的權限與已綁定資訊
      if (m.role === 'owner') existing.role = 'owner';
      else if (m.role === 'admin' && existing.role !== 'owner') existing.role = 'admin';
      if (m.auth_email && !existing.auth_email) existing.auth_email = m.auth_email;
      if (m.auth_provider && !existing.auth_provider) existing.auth_provider = m.auth_provider;
      if (m.is_locked) existing.is_locked = true;
      if (m.claim_code && !existing.claim_code) existing.claim_code = m.claim_code;
      if (m.claim_code_expires_at && !existing.claim_code_expires_at) existing.claim_code_expires_at = m.claim_code_expires_at;
      // 保留正常 Emoji 大頭貼（若 existing 的是 URL 而 m 是 Emoji，換回 Emoji）
      if (isHttpAvatarUrl(existing.avatar_url) && m.avatar_url && !isHttpAvatarUrl(m.avatar_url)) {
        existing.avatar_url = m.avatar_url;
      }
    }
  }
  return result;
};

const findCanonicalMemberForProfile = (
  target: Profile,
  deduped: Profile[],
  allowDefaultMemberFallback: boolean
): Profile | undefined => {
  const byId = deduped.find(m => m.id === target.id);
  if (byId) return byId;

  const targetName = (target.display_name || '').trim().toLowerCase();
  const targetAuthEmail = isRealAuthEmail(target.auth_email) ? target.auth_email!.trim().toLowerCase() : '';
  const targetFallbackEmail = (target.auth_email || target.email || '').trim().toLowerCase();

  // 1. 優先比對已驗證的 Google 信箱，確保跨裝置不同稱謂分身準確對齊主帳號
  if (targetAuthEmail) {
    const byAuthEmail = deduped.find(
      m => isRealAuthEmail(m.auth_email) && m.auth_email!.trim().toLowerCase() === targetAuthEmail
    );
    if (byAuthEmail) return byAuthEmail;
  }

  // 2. 名稱完全相同
  let canonical = deduped.find(m => {
    if ((m.display_name || '').trim().toLowerCase() !== targetName) return false;
    const mAuth = isRealAuthEmail(m.auth_email) ? m.auth_email!.trim().toLowerCase() : '';
    if (targetAuthEmail && mAuth && targetAuthEmail !== mAuth) return false;
    return true;
  });

  // 3. 名稱前綴模糊匹配
  if (!canonical && targetName) {
    canonical = deduped.find(m => {
      const dName = (m.display_name || '').trim().toLowerCase();
      if (!dName) return false;
      const mAuth = isRealAuthEmail(m.auth_email) ? m.auth_email!.trim().toLowerCase() : '';
      if (targetAuthEmail && mAuth && targetAuthEmail !== mAuth) return false;
      return (targetName.length >= 1 && dName.startsWith(targetName)) ||
             (dName.length >= 1 && targetName.startsWith(dName));
    });
  }

  // 4. 一般信箱保守比對
  if (!canonical && targetFallbackEmail) {
    canonical = deduped.find(m => {
      const mEmail = (m.auth_email || m.email || '').trim().toLowerCase();
      if (mEmail !== targetFallbackEmail) return false;
      const tIsUrl = isHttpAvatarUrl(target.avatar_url);
      const mIsUrl = isHttpAvatarUrl(m.avatar_url);
      return (m.display_name || '').trim().toLowerCase() === targetName || tIsUrl || mIsUrl;
    });
  }

  // 5. 空白或預設「家庭成員」回退
  if (allowDefaultMemberFallback && !canonical && ((target.display_name || '').trim() === '家庭成員' || !(target.display_name || '').trim()) && deduped.length > 0) {
    canonical = deduped[0];
  }

  return canonical;
};

// 建立成員別名映射表：將多台裝置同名 UUID、同信箱分身、示範資料常數 UUID 等均映射至去重後之主要 Profile
export const buildMemberAliasMap = (
  deduped: Profile[],
  loaded: Profile[],
  extraProfiles?: Profile[]
): Record<string, Profile> => {
  const map: Record<string, Profile> = {};

  // 1. 主要成員自身映射
  for (const m of deduped) {
    map[m.id] = m;
  }

  // 2. 雲端所有關聯成員（包含不同裝置登入但同一暱稱者、同信箱分身、以及 Google OAuth 幽靈帳號）
  for (const raw of loaded) {
    const canonical = findCanonicalMemberForProfile(raw, deduped, true);
    map[raw.id] = canonical || raw;
  }

  // 3. 額外查詢之付款人 Profile
  if (extraProfiles) {
    for (const p of extraProfiles) {
      const canonical = findCanonicalMemberForProfile(p, deduped, false);
      map[p.id] = canonical || p;
    }
  }

  // 4. 歷史與示範帳目常數回退
  if (deduped.length > 0) {
    const dad = deduped.find(m => m.display_name.includes('爸') || m.role === 'owner') || deduped[0];
    const mom = deduped.find(m => m.display_name.includes('媽')) || deduped[1] || dad;
    const kid = deduped.find(m => m.display_name.includes('寶') || m.display_name.includes('孩')) || deduped[2] || dad;
    map[DEMO_USER_DAD] = dad;
    map[DEMO_USER_MOM] = mom;
    map[DEMO_USER_KID] = kid;
  }

  return map;
};

// 合併常用付款方式：定義（雲端與系統預設）共享，啟用開關（is_enabled）與排序（sort_order）由各裝置本機獨立維持
export const mergePaymentMethods = (
  definitions: CustomPaymentMethod[],
  localPreferences?: CustomPaymentMethod[] | null
): CustomPaymentMethod[] => {
  if (!localPreferences || localPreferences.length === 0) {
    return definitions.map((m, idx) => ({
      ...m,
      is_enabled: m.id === 'cash' ? true : (m.is_enabled ?? true),
      sort_order: idx + 1,
    }));
  }

  const localMap = new Map<string, { is_enabled: boolean; sort_order: number }>();
  localPreferences.forEach((m, idx) => {
    const isEnabled = m.id === 'cash' ? true : m.is_enabled !== false;
    const sortOrder = m.sort_order ?? (idx + 1);
    localMap.set(m.id, { is_enabled: isEnabled, sort_order: sortOrder });
    if (m.name) {
      localMap.set(m.name, { is_enabled: isEnabled, sort_order: sortOrder });
    }
  });

  const merged: CustomPaymentMethod[] = [];
  definitions.forEach((def, idx) => {
    const localPref = localMap.get(def.id) || localMap.get(def.name);
    if (localPref) {
      merged.push({
        ...def,
        is_enabled: def.id === 'cash' ? true : localPref.is_enabled,
        sort_order: localPref.sort_order,
      });
    } else {
      merged.push({
        ...def,
        is_enabled: true,
        sort_order: 900 + idx,
      });
    }
  });

  merged.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
  return merged.map((m, idx) => ({ ...m, sort_order: idx + 1 }));
};

// 判斷某個成員 ID 是否歸屬於當前使用者本人 (支援 ID 直接比對、名稱別名比對與名冊連動)
export const isAccountBoundToUser = (
  userId?: string | null,
  currentUser?: Profile | null,
  members: Profile[] = [],
  getMemberById?: (id?: string) => Profile | undefined
): boolean => {
  if (!userId || !currentUser) return false;
  if (userId === currentUser.id) return true;
  const member = getMemberById ? getMemberById(userId) : members.find(m => m.id === userId);
  if (member) {
    if (member.id === currentUser.id) return true;
    if (
      member.display_name &&
      currentUser.display_name &&
      member.display_name.trim().toLowerCase() === currentUser.display_name.trim().toLowerCase()
    ) {
      return true;
    }
  }
  return false;
};

