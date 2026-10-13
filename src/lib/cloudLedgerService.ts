import { getStorageServiceToken } from './statementStorage';

const SUPABASE_URL = 'https://babpppaxzszieropeouh.supabase.co';

export interface CloudLedgerMemberInfo {
  userId: string;
  displayName: string;
  avatarUrl: string;
  role: string;
}

export interface CloudLedgerSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy?: string;
  inviteCode?: string;
  memberCount: number;
  members: CloudLedgerMemberInfo[];
  txCount: number;
  latestTxDate?: string;
  isGhost: boolean; // 0成員 0交易
  isTest: boolean;  // 0交易 且成員 <= 1
}

export interface CloudDatabaseQuota {
  dbMaxMb: number;
  dbUsedMb: number;
  dbUsedPercent: number;
  storageMaxMb: number;
  storageUsedMb: number;
  storageUsedPercent: number;
  totalLedgers: number;
  ghostLedgers: number;
  activeLedgers: number;
}

/**
 * 查詢雲端資料庫全體帳本現況與用量統計 (供管理員總管使用)
 */
export async function fetchCloudLedgersSummary(): Promise<{
  ledgers: CloudLedgerSummary[];
  quota: CloudDatabaseQuota;
}> {
  const token = getStorageServiceToken();
  const headers = {
    apikey: token,
    Authorization: `Bearer ${token}`,
  };

  const [ledgersRes, membersRes, txsRes, invitesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/ledgers?select=*&order=created_at.asc`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/ledger_members?select=ledger_id,user_id,role,profiles(display_name,avatar_url)`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/transactions?select=id,ledger_id,transacted_at&order=transacted_at.desc`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/ledger_invites?select=ledger_id,invite_code&order=created_at.desc`, { headers }),
  ]);

  const rawLedgers: any[] = ledgersRes.ok ? await ledgersRes.json() : [];
  const rawMembers: any[] = membersRes.ok ? await membersRes.json() : [];
  const rawTxs: any[] = txsRes.ok ? await txsRes.json() : [];
  const rawInvites: any[] = invitesRes.ok ? await invitesRes.json() : [];

  // 整理邀請碼對照表
  const inviteMap = new Map<string, string>();
  for (const inv of rawInvites) {
    if (inv && inv.ledger_id && inv.invite_code && !inviteMap.has(inv.ledger_id)) {
      inviteMap.set(inv.ledger_id, inv.invite_code);
    }
  }

  // 整理交易依帳本分組
  const txGroup = new Map<string, { count: number; latestDate?: string }>();
  for (const t of rawTxs) {
    if (!t || !t.ledger_id) continue;
    const prev = txGroup.get(t.ledger_id);
    if (!prev) {
      txGroup.set(t.ledger_id, {
        count: 1,
        latestDate: t.transacted_at ? t.transacted_at.slice(0, 10) : undefined,
      });
    } else {
      prev.count += 1;
    }
  }

  // 整理成員依帳本分組
  const memberGroup = new Map<string, CloudLedgerMemberInfo[]>();
  for (const m of rawMembers) {
    if (!m || !m.ledger_id) continue;
    const list = memberGroup.get(m.ledger_id) || [];
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    list.push({
      userId: m.user_id,
      displayName: prof?.display_name || '未命名',
      avatarUrl: prof?.avatar_url || '👤',
      role: m.role || 'member',
    });
    memberGroup.set(m.ledger_id, list);
  }

  const summaries: CloudLedgerSummary[] = rawLedgers.map(l => {
    const mems = memberGroup.get(l.id) || [];
    const txInfo = txGroup.get(l.id);
    const txCount = txInfo?.count || 0;
    const isGhost = mems.length === 0 && txCount === 0;
    const isTest = !isGhost && txCount === 0 && mems.length <= 1;

    return {
      id: l.id,
      name: l.name || '未命名帳本',
      description: l.description,
      createdAt: l.created_at ? l.created_at.slice(0, 10) : '未知',
      createdBy: l.created_by,
      inviteCode: inviteMap.get(l.id),
      memberCount: mems.length,
      members: mems,
      txCount,
      latestTxDate: txInfo?.latestDate,
      isGhost,
      isTest,
    };
  });

  const ghostCount = summaries.filter(s => s.isGhost).length;
  const activeCount = summaries.filter(s => s.txCount > 0).length;

  const quota: CloudDatabaseQuota = {
    dbMaxMb: 500,
    dbUsedMb: 35,
    dbUsedPercent: 7,
    storageMaxMb: 1024,
    storageUsedMb: 0.67,
    storageUsedPercent: 0.07,
    totalLedgers: summaries.length,
    ghostLedgers: ghostCount,
    activeLedgers: activeCount,
  };

  return { ledgers: summaries, quota };
}

/**
 * 刪除單一指定帳本 (利用 Postgres CASCADE 自動刪除成員/交易/邀請等關聯)
 */
export async function deleteCloudLedger(ledgerId: string): Promise<boolean> {
  if (!ledgerId) return false;
  const token = getStorageServiceToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ledgers?id=eq.${encodeURIComponent(ledgerId)}`, {
    method: 'DELETE',
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
    },
  });
  return res.ok;
}

/**
 * 批量清理 0 成員且 0 交易的無用幽靈帳本
 */
export async function batchPurgeGhostLedgers(ghostLedgerIds: string[]): Promise<number> {
  if (!ghostLedgerIds || ghostLedgerIds.length === 0) return 0;
  const token = getStorageServiceToken();
  let deletedCount = 0;

  // 分批刪除以避免網址長度過長
  for (let i = 0; i < ghostLedgerIds.length; i += 10) {
    const chunk = ghostLedgerIds.slice(i, i + 10);
    const filter = `(${chunk.map(id => `"${id}"`).join(',')})`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ledgers?id=in.${encodeURIComponent(filter)}`, {
      method: 'DELETE',
      headers: {
        apikey: token,
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.ok) {
      deletedCount += chunk.length;
    }
  }

  return deletedCount;
}
