import { Platform, Alert } from 'react-native';
import { Profile, Transaction, CustomPaymentMethod } from '../types/database';
import {
  decodeInvoiceTag,
  formatInvoiceNumber,
  getInvoicePeriodKey,
} from './invoice';
import { checkInvoiceWinning } from './lottery';
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

  let invoiceNumber = t.invoice_number;
  let periodKey = t.invoice_period;
  let randomCode = t.invoice_random_code;
  let invoiceStatus = t.invoice_status;
  let prizeAmount = t.invoice_prize_amount;
  let prizeName = t.invoice_prize_name;

  // 1. 若缺少 invoice_number，嘗試從 note 中解碼
  if (!invoiceNumber && t.note) {
    const decoded = decodeInvoiceTag(t.note);
    if (decoded?.invoiceNumber) {
      invoiceNumber = decoded.invoiceNumber;
      periodKey = periodKey || decoded.periodKey;
      randomCode = randomCode || decoded.randomCode;
      invoiceStatus = invoiceStatus || decoded.status;
      prizeAmount = prizeAmount !== undefined ? prizeAmount : decoded.prizeAmount;
      prizeName = prizeName || decoded.prizeName;
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
      invoice_number: invoiceNumber,
      invoice_period: periodKey,
      invoice_random_code: randomCode,
      invoice_status: invoiceStatus,
      invoice_prize_amount: prizeAmount,
      invoice_prize_name: prizeName,
    };
  }

  return t;
};

// 成員名冊去重函式：相同 display_name 或相同 Google 綁定信箱者視為同一位家庭成員（支援多台手機/電腦認領同一身分及 Google 帳號授權）
export const deduplicateMembers = (memberList: Profile[]): Profile[] => {
  const result: Profile[] = [];
  const seenNames = new Set<string>();
  const seenEmails = new Set<string>();

  // 排除殘留之訪客寶可夢與歷史幽靈成員，確保名冊永遠純淨
  const initialClean = memberList.filter(m =>
    m.id !== '9b017d89-b21f-4638-b076-5a7629e2dda5' &&
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

  // 步驟一：先將已綁定 Google 且加鎖之重要受保護成員放前，確保保留自訂家庭稱謂（如「智爸」優先於「Matt Yu」）
  const sortedList = [...cleanList].sort((a, b) => {
    // 1. 已加鎖保護者優先
    if (a.is_locked && !b.is_locked) return -1;
    if (!a.is_locked && b.is_locked) return 1;
    // 2. 具有自訂稱謂（非 Google 預設姓名、頭像不是圖片網址）者優先
    const aIsUrl = Boolean(a.avatar_url && (a.avatar_url.startsWith('http://') || a.avatar_url.startsWith('https://')));
    const bIsUrl = Boolean(b.avatar_url && (b.avatar_url.startsWith('http://') || b.avatar_url.startsWith('https://')));
    if (!aIsUrl && bIsUrl) return -1;
    if (aIsUrl && !bIsUrl) return 1;
    // 3. owner / admin 優先
    if ((a.role === 'owner' || a.role === 'admin') && b.role === 'member') return -1;
    if (a.role === 'member' && (b.role === 'owner' || b.role === 'admin')) return 1;
    return 0;
  });

  for (const m of sortedList) {
    const nameKey = (m.display_name || '').trim().toLowerCase();
    const emailKey = (m.auth_email || m.email || '').trim().toLowerCase();

    // 檢查是否已有名稱相同，或已綁定信箱相同且其中一方為 Google 影子帳號的既有成員
    let existing: Profile | undefined = undefined;

    if (nameKey && seenNames.has(nameKey)) {
      existing = result.find(em => (em.display_name || '').trim().toLowerCase() === nameKey);
    } else if (emailKey && seenEmails.has(emailKey)) {
      // 僅在其中一個是 Google 授權所產生的影子帳號（大頭貼為 HTTP 圖片網址，或稱謂為未加鎖的 Google 帳號姓名）時，才與既有自訂家庭稱謂合併！
      existing = result.find(em => {
        const emEmail = (em.auth_email || em.email || '').trim().toLowerCase();
        if (emEmail !== emailKey) return false;
        const mIsUrl = Boolean(m.avatar_url && (m.avatar_url.startsWith('http://') || m.avatar_url.startsWith('https://')));
        const emIsUrl = Boolean(em.avatar_url && (em.avatar_url.startsWith('http://') || em.avatar_url.startsWith('https://')));
        const isSameName = (em.display_name || '').trim().toLowerCase() === nameKey;
        return isSameName || mIsUrl || emIsUrl;
      });
    }

    if (!existing) {
      if (nameKey) seenNames.add(nameKey);
      if (emailKey) seenEmails.add(emailKey);
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
      if (existing.avatar_url && (existing.avatar_url.startsWith('http://') || existing.avatar_url.startsWith('https://')) && m.avatar_url && !m.avatar_url.startsWith('http')) {
        existing.avatar_url = m.avatar_url;
      }
    }
  }
  return result;
};

// 建立成員別名映射表：將多台裝置同名 UUID、示範資料常數 UUID 等均映射至去重後之主要 Profile
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

  // 2. 雲端所有關聯成員（包含不同裝置登入但同一暱稱者、以及 Google OAuth 幽靈帳號）
  for (const raw of loaded) {
    const rawName = (raw.display_name || '').trim().toLowerCase();
    const rawEmail = (raw.auth_email || raw.email || '').trim().toLowerCase();

    let canonical = deduped.find(
      m => (m.display_name || '').trim().toLowerCase() === rawName
    );
    if (!canonical && rawEmail) {
      canonical = deduped.find(
        m => {
          const mEmail = (m.auth_email || m.email || '').trim().toLowerCase();
          if (mEmail !== rawEmail) return false;
          const rawIsUrl = Boolean(raw.avatar_url && (raw.avatar_url.startsWith('http://') || raw.avatar_url.startsWith('https://')));
          const mIsUrl = Boolean(m.avatar_url && (m.avatar_url.startsWith('http://') || m.avatar_url.startsWith('https://')));
          return (m.display_name || '').trim().toLowerCase() === rawName || rawIsUrl || mIsUrl;
        }
      );
    }
    if (!canonical && ((raw.display_name || '').trim() === '家庭成員' || !(raw.display_name || '').trim()) && deduped.length > 0) {
      canonical = deduped[0];
    }
    map[raw.id] = canonical || raw;
  }

  // 3. 額外查詢之付款人 Profile
  if (extraProfiles) {
    for (const p of extraProfiles) {
      const pName = (p.display_name || '').trim().toLowerCase();
      const pEmail = (p.auth_email || p.email || '').trim().toLowerCase();
      let canonical = deduped.find(
        m => (m.display_name || '').trim().toLowerCase() === pName
      );
      if (!canonical && pEmail) {
        canonical = deduped.find(
          m => {
            const mEmail = (m.auth_email || m.email || '').trim().toLowerCase();
            if (mEmail !== pEmail) return false;
            const pIsUrl = Boolean(p.avatar_url && (p.avatar_url.startsWith('http://') || p.avatar_url.startsWith('https://')));
            const mIsUrl = Boolean(m.avatar_url && (m.avatar_url.startsWith('http://') || m.avatar_url.startsWith('https://')));
            return (m.display_name || '').trim().toLowerCase() === pName || pIsUrl || mIsUrl;
          }
        );
      }
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
  members: Profile[] = []
): boolean => {
  if (!userId || !currentUser) return false;
  if (userId === currentUser.id) return true;
  const member = members.find(m => m.id === userId);
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

