import { decodeMemoMerchantTag, parseMemoNote } from './memo';
import { isGroupOrderMemo } from './groupOrder';

export interface UnreadCandidateTx {
  id?: string;
  type?: string | null;
  amount?: number | string | null;
  created_at?: string | null;
  transacted_at?: string | null;
  creator_id?: string | null;
  paid_by?: string | null;
  merchant?: string | null;
  note?: string | null;
  is_pinned?: boolean | null;
  reminder_date?: string | null;
  reminder_target?: string | null;
}

/**
 * 計算單一帳本最新的最後造訪時間 ISO 字串。
 * 確保造訪時間只會前進不倒退，並能涵蓋雲端交易較本機時鐘超前數秒的時間差。
 */
export function resolveLatestVisitedIso(
  existingIso?: string | null,
  candidateTimestamps?: Array<string | null | undefined>,
  nowMs: number = Date.now()
): string {
  let maxMs = Number.isFinite(nowMs) ? nowMs : Date.now();

  if (existingIso) {
    const parsedExisting = new Date(existingIso).getTime();
    if (Number.isFinite(parsedExisting) && parsedExisting > maxMs) {
      maxMs = parsedExisting;
    }
  }

  if (Array.isArray(candidateTimestamps)) {
    for (const ts of candidateTimestamps) {
      if (!ts) continue;
      const parsed = new Date(ts).getTime();
      if (Number.isFinite(parsed) && parsed > maxMs) {
        maxMs = parsed;
      }
    }
  }

  return new Date(maxMs).toISOString();
}

/**
 * 收集使用者在指定帳本下所有代表「本人」的身分 ID，
 * 避免跨帳本因成員 UUID 不同而將自己的記帳誤判為未讀紅點。
 */
export function collectOwnIdentityIdsForLedger(params: {
  authId?: string | null;
  currentUserId?: string | null;
  cachedLedgerUser?: { id?: string | null; auth_email?: string | null } | null;
  cachedLedgerMembers?: Array<{ id?: string | null; auth_email?: string | null; email?: string | null }> | null;
  googleEmail?: string | null;
}): Set<string> {
  const ownIds = new Set<string>();

  const addIfNonEmpty = (id?: string | null) => {
    if (typeof id === 'string') {
      const trimmed = id.trim();
      if (trimmed) ownIds.add(trimmed);
    }
  };

  addIfNonEmpty(params.authId);
  addIfNonEmpty(params.currentUserId);
  addIfNonEmpty(params.cachedLedgerUser?.id);

  const normalizedGoogleEmail =
    typeof params.googleEmail === 'string' ? params.googleEmail.trim().toLowerCase() : '';
  const hasValidGoogleEmail =
    Boolean(normalizedGoogleEmail) && !normalizedGoogleEmail.endsWith('@family.local');

  if (hasValidGoogleEmail && Array.isArray(params.cachedLedgerMembers)) {
    for (const member of params.cachedLedgerMembers) {
      if (!member) continue;
      const memberAuthEmail =
        typeof member.auth_email === 'string' ? member.auth_email.trim().toLowerCase() : '';
      const memberEmail =
        typeof member.email === 'string' ? member.email.trim().toLowerCase() : '';
      if (memberAuthEmail === normalizedGoogleEmail || memberEmail === normalizedGoogleEmail) {
        addIfNonEmpty(member.id);
      }
    }
  }

  return ownIds;
}

/**
 * 判斷一筆跨帳本交易是否應該觸發「新記帳」紅點或通知泡泡：
 * - 排除自己建立或付款的交易
 * - 排除其他成員的個人私密記事 (reminder_target === 'personal')
 * - 生活記事僅針對開團/投票看板、置頂或有提醒日期的重要記事觸發
 */
export function isCrossLedgerNotifyableTx(
  tx: UnreadCandidateTx,
  ownIds: Set<string>
): boolean {
  if (!tx) return false;
  if ((tx.creator_id && ownIds.has(tx.creator_id)) || (tx.paid_by && ownIds.has(tx.paid_by))) {
    return false;
  }

  const decodedMemo = decodeMemoMerchantTag(tx.merchant || undefined);
  const isMemo =
    tx.type === 'memo' ||
    decodedMemo.isMemo ||
    (tx.type === 'transfer' && Number(tx.amount ?? 0) === 0);

  if (isMemo) {
    const memoData = parseMemoNote(tx.note || undefined);
    const effectiveTarget = tx.reminder_target || decodedMemo.reminderTarget || 'family';
    if (effectiveTarget === 'personal') {
      return false;
    }

    return Boolean(
      isGroupOrderMemo(memoData.title, tx.note || undefined) ||
      tx.is_pinned ||
      decodedMemo.isPinned ||
      tx.reminder_date ||
      decodedMemo.reminderDate
    );
  }

  return true;
}

/**
 * 統計指定最後造訪時間之後，真正屬於其他成員的跨帳本未讀筆數（不設時間過期上限）。
 */
export function countUnreadCandidateTxs(
  txs: UnreadCandidateTx[],
  lastVisitedIso: string | null | undefined,
  ownIds: Set<string>
): number {
  if (!lastVisitedIso || !Array.isArray(txs) || txs.length === 0) return 0;

  const lastVisitedMs = new Date(lastVisitedIso).getTime();
  if (!Number.isFinite(lastVisitedMs)) return 0;

  let count = 0;
  for (const tx of txs) {
    if (!tx) continue;
    const txTime = tx.created_at || tx.transacted_at;
    if (!txTime) continue;
    const txMs = new Date(txTime).getTime();
    if (!Number.isFinite(txMs) || txMs <= lastVisitedMs) continue;
    if (isCrossLedgerNotifyableTx(tx, ownIds)) {
      count += 1;
    }
  }

  return count;
}
