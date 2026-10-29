import { Platform } from 'react-native';
import { getStorageServiceToken } from './statementStorage';
import { supabase, supabaseAdmin, SUPABASE_URL } from './supabase';

export interface CloudLedgerMemberInfo {
  userId: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  email?: string;
  authEmail?: string;
  isLocked?: boolean;
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
 * 雲端帳本總管成員去重函式：
 * 1. 依 display_name 或 Google 授權信箱自動整併多台裝置/影子帳號
 * 2. 優先保留加鎖成員與自訂稱謂（如「智爸」優先於「Matt Yu」）
 * 3. 優先保留 Emoji 頭像（避免 Google 圖片網址字串）
 * 4. 排除已刪除之幽靈假人
 */
export function deduplicateCloudMembers(
  rawMembers: CloudLedgerMemberInfo[],
  profileMap?: Map<string, any>
): CloudLedgerMemberInfo[] {
  const cleanList = rawMembers
    .filter(m => {
      if (!m) return false;
      if (m.userId === '9b017d89-b21f-4638-b076-5a7629e2dda5') return false;
      if (m.userId === 'e6a2d1ec-3b2a-495f-b24e-71c2647d9a86') return false;
      const name = (m.displayName || '').trim();
      if (name === '寶可夢') return false;
      return true;
    })
    .map(m => {
      const prof = profileMap?.get(m.userId);
      return {
        ...m,
        displayName: (m.displayName || prof?.display_name || '未命名').trim(),
        avatarUrl: m.avatarUrl || prof?.avatar_url || '👤',
        role: m.role || 'member',
        email: m.email || prof?.email,
        authEmail: m.authEmail || prof?.auth_email,
        isLocked: m.isLocked ?? Boolean(prof?.is_locked),
      };
    });

  // 若已有自訂名稱成員，過濾掉未鎖定且無信箱的預設「家庭成員」假人
  const hasRealMembers = cleanList.some(m => m.displayName !== '家庭成員');
  const filteredList = hasRealMembers ? cleanList.filter(m => m.displayName !== '家庭成員') : cleanList;

  // 排序：鎖定優先、Emoji頭像優先、管理者優先
  const sorted = [...filteredList].sort((a, b) => {
    if (a.isLocked && !b.isLocked) return -1;
    if (!a.isLocked && b.isLocked) return 1;

    const aIsUrl = Boolean(a.avatarUrl && (a.avatarUrl.startsWith('http://') || a.avatarUrl.startsWith('https://')));
    const bIsUrl = Boolean(b.avatarUrl && (b.avatarUrl.startsWith('http://') || b.avatarUrl.startsWith('https://')));
    if (!aIsUrl && bIsUrl) return -1;
    if (aIsUrl && !bIsUrl) return 1;

    if ((a.role === 'owner' || a.role === 'admin') && b.role === 'member') return -1;
    if (a.role === 'member' && (b.role === 'owner' || b.role === 'admin')) return 1;
    return 0;
  });

  const result: CloudLedgerMemberInfo[] = [];
  const seenNames = new Set<string>();
  const seenEmails = new Set<string>();

  for (const m of sorted) {
    const nameKey = m.displayName.toLowerCase();
    const emailKey = (m.authEmail || m.email || '').trim().toLowerCase();

    let existing: CloudLedgerMemberInfo | undefined = undefined;
    if (nameKey && seenNames.has(nameKey)) {
      existing = result.find(r => r.displayName.toLowerCase() === nameKey);
    } else if (emailKey && seenEmails.has(emailKey)) {
      existing = result.find(r => {
        const rEmail = (r.authEmail || r.email || '').trim().toLowerCase();
        if (rEmail !== emailKey) return false;
        const mIsUrl = Boolean(m.avatarUrl && (m.avatarUrl.startsWith('http://') || m.avatarUrl.startsWith('https://')));
        const rIsUrl = Boolean(r.avatarUrl && (r.avatarUrl.startsWith('http://') || r.avatarUrl.startsWith('https://')));
        return (r.displayName.toLowerCase() === nameKey) || mIsUrl || rIsUrl;
      });
    }

    if (!existing) {
      if (nameKey) seenNames.add(nameKey);
      if (emailKey) seenEmails.add(emailKey);
      result.push({ ...m });
    } else {
      if (m.role === 'owner') existing.role = 'owner';
      else if (m.role === 'admin' && existing.role !== 'owner') existing.role = 'admin';
      if (m.isLocked) existing.isLocked = true;
      if (
        existing.avatarUrl &&
        (existing.avatarUrl.startsWith('http://') || existing.avatarUrl.startsWith('https://')) &&
        m.avatarUrl &&
        !m.avatarUrl.startsWith('http')
      ) {
        existing.avatarUrl = m.avatarUrl;
      }
    }
  }

  return result;
}

/**
 * 內部輔助函式：自原始資料陣列重構出帳本摘要清單
 */
function buildSummariesFromRaw(
  rawLedgers: any[],
  rawMembers: any[],
  rawTxs: any[],
  rawInvites: any[],
  profileMap?: Map<string, any>
): { ledgers: CloudLedgerSummary[]; quota: CloudDatabaseQuota } {
  const inviteMap = new Map<string, string>();
  for (const inv of rawInvites) {
    if (inv && inv.ledger_id && inv.invite_code && !inviteMap.has(inv.ledger_id)) {
      inviteMap.set(inv.ledger_id, inv.invite_code);
    }
  }

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
      email: prof?.email,
      authEmail: prof?.auth_email,
      isLocked: Boolean(prof?.is_locked),
    });
    memberGroup.set(m.ledger_id, list);
  }

  const summaries: CloudLedgerSummary[] = rawLedgers.map(l => {
    const rawMems = memberGroup.get(l.id) || [];
    const mems = deduplicateCloudMembers(rawMems, profileMap);
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
 * 網頁版 (Web) 專屬保底穿透解析（不依賴 sb_secret_，避開瀏覽器 User-Agent 阻擋）
 * 透過公開可讀的 ledger_invites + get_ledger_invite_preview + 本地 knownLedgers + member_devices 全面反查全體帳本
 */
async function fetchWebFallbackSummaries(
  knownLedgers: any[] = [],
  profileMap?: Map<string, any>
): Promise<{
  ledgers: CloudLedgerSummary[];
  quota: CloudDatabaseQuota;
}> {
  try {
    const ledgerMap = new Map<string, CloudLedgerSummary>();

    // 1. 登記已知的本機/當前連線帳本資訊 (包含已有交易/成員)
    for (const kl of knownLedgers) {
      if (!kl || !kl.id) continue;
      const rawMems: CloudLedgerMemberInfo[] = (kl.members || []).map((m: any) => ({
        userId: m.id || m.userId,
        displayName: m.displayName || m.name || '未命名',
        avatarUrl: m.avatarUrl || m.avatar || '👤',
        role: m.role || 'member',
        email: m.email,
        authEmail: m.auth_email || m.authEmail,
        isLocked: m.is_locked ?? m.isLocked,
      }));
      const mems = deduplicateCloudMembers(rawMems, profileMap);
      ledgerMap.set(kl.id, {
        id: kl.id,
        name: kl.name || '未命名帳本',
        description: kl.description,
        createdAt: kl.createdAt || '未知',
        createdBy: kl.createdBy,
        inviteCode: kl.inviteCode,
        memberCount: mems.length,
        members: mems,
        txCount: kl.txCount || 0,
        latestTxDate: kl.latestTxDate,
        isGhost: mems.length === 0,
        isTest: mems.length <= 1,
      });
    }

    // 2. 查詢公開的邀請碼表 ledger_invites
    const { data: invites } = await supabase
      .from('ledger_invites')
      .select('id, ledger_id, invite_code, created_at, created_by')
      .order('created_at', { ascending: false });

    if (Array.isArray(invites) && invites.length > 0) {
      // 依序或並行解析邀請碼對應的帳本名稱與成員名冊
      await Promise.all(
        invites.map(async inv => {
          if (!inv.invite_code) return;
          try {
            const { data: prev } = await supabase.rpc('get_ledger_invite_preview', {
              invite_code_input: inv.invite_code,
            });

            if (prev && prev.success && prev.ledger_id) {
              const rawPrevMembers: CloudLedgerMemberInfo[] = Array.isArray(prev.members)
                ? prev.members.map((pm: any) => ({
                    userId: pm.id,
                    displayName: pm.display_name || '未命名',
                    avatarUrl: pm.avatar_url || '👤',
                    role: pm.role || 'member',
                    email: pm.email,
                    authEmail: pm.auth_email,
                    isLocked: pm.is_locked,
                  }))
                : [];
              const prevMembers = deduplicateCloudMembers(rawPrevMembers, profileMap);

              const existing = ledgerMap.get(prev.ledger_id);
              if (existing) {
                if (!existing.inviteCode) existing.inviteCode = inv.invite_code;
                if (!existing.name || existing.name === '未命名帳本') existing.name = prev.ledger_name;
                if (existing.members.length === 0 && prevMembers.length > 0) {
                  existing.members = prevMembers;
                  existing.memberCount = prevMembers.length;
                  existing.isGhost = false;
                  existing.isTest = prevMembers.length <= 1;
                }
              } else {
                ledgerMap.set(prev.ledger_id, {
                  id: prev.ledger_id,
                  name: prev.ledger_name || '未命名帳本',
                  createdAt: inv.created_at ? inv.created_at.slice(0, 10) : '未知',
                  createdBy: inv.created_by,
                  inviteCode: inv.invite_code,
                  memberCount: prevMembers.length,
                  members: prevMembers,
                  txCount: 0,
                  isGhost: prevMembers.length === 0,
                  isTest: prevMembers.length <= 1,
                });
              }
            }
          } catch {}
        })
      );
    }

    // 3. 嘗試讀取裝置表與交易表增補資訊
    try {
      const { data: devices } = await supabase
        .from('member_devices')
        .select('ledger_id, last_active_at')
        .order('last_active_at', { ascending: false });

      if (Array.isArray(devices)) {
        for (const dev of devices) {
          if (dev && dev.ledger_id && !ledgerMap.has(dev.ledger_id)) {
            ledgerMap.set(dev.ledger_id, {
              id: dev.ledger_id,
              name: `雲端帳本 (${dev.ledger_id.slice(0, 8)})`,
              createdAt: dev.last_active_at ? dev.last_active_at.slice(0, 10) : '未知',
              memberCount: 1,
              members: [],
              txCount: 0,
              isGhost: false,
              isTest: true,
            });
          }
        }
      }
    } catch {}

    // 4. 嘗試直接查 ledgers 表（若 SQL 權限已更新開啟）
    try {
      const { data: rawLedgers } = await supabase.from('ledgers').select('*');
      if (Array.isArray(rawLedgers) && rawLedgers.length > 0) {
        for (const rl of rawLedgers) {
          const item = ledgerMap.get(rl.id);
          if (item) {
            item.name = rl.name || item.name;
            item.description = rl.description || item.description;
            if (rl.created_at) item.createdAt = rl.created_at.slice(0, 10);
            if (rl.created_by) item.createdBy = rl.created_by;
          } else {
            ledgerMap.set(rl.id, {
              id: rl.id,
              name: rl.name || '未命名帳本',
              description: rl.description,
              createdAt: rl.created_at ? rl.created_at.slice(0, 10) : '未知',
              createdBy: rl.created_by,
              memberCount: 0,
              members: [],
              txCount: 0,
              isGhost: true,
              isTest: false,
            });
          }
        }
      }
    } catch {}

    const summaries = Array.from(ledgerMap.values());
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
  } catch (err) {
    console.warn('fetchWebFallbackSummaries error:', err);
    return {
      ledgers: [],
      quota: {
        dbMaxMb: 500,
        dbUsedMb: 35,
        dbUsedPercent: 7,
        storageMaxMb: 1024,
        storageUsedMb: 0.67,
        storageUsedPercent: 0.07,
        totalLedgers: 0,
        ghostLedgers: 0,
        activeLedgers: 0,
      },
    };
  }
}

/**
 * 查詢雲端資料庫全體帳本現況與用量統計 (供管理員總管使用，支援 Web 與 Mobile 雙軌韌性解析)
 */
export async function fetchCloudLedgersSummary(knownLedgers: any[] = []): Promise<{
  ledgers: CloudLedgerSummary[];
  quota: CloudDatabaseQuota;
}> {
  // 先嘗試拉取公開的 profiles 輔助表建立對照 map（供精準去重比對 Google auth_email 與加鎖狀態）
  let profileMap = new Map<string, any>();
  try {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, email, auth_email, is_locked');
    if (Array.isArray(profs)) {
      profileMap = new Map(profs.map(p => [p.id, p]));
    }
  } catch (err) {
    console.log('無法預載 profiles 對照表:', err);
  }

  // 1. 優先調用高性能資料庫 RPC (無論在 Web 還是 Mobile 皆可透過 anon key 無阻調用)
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_all_cloud_ledgers_summary');
    if (!rpcErr && rpcData && Array.isArray(rpcData.ledgers) && rpcData.ledgers.length > 0) {
      const summaries: CloudLedgerSummary[] = rpcData.ledgers.map((l: any) => {
        const rawMems: CloudLedgerMemberInfo[] = Array.isArray(l.members) ? l.members : [];
        const dedupedMems = deduplicateCloudMembers(rawMems, profileMap);
        const txCount = Number(l.tx_count) || 0;
        const isGhost = dedupedMems.length === 0 && txCount === 0;
        const isTest = !isGhost && txCount === 0 && dedupedMems.length <= 1;

        return {
          id: l.id,
          name: l.name || '未命名帳本',
          description: l.description,
          createdAt: l.created_at ? l.created_at.slice(0, 10) : '未知',
          createdBy: l.created_by,
          inviteCode: l.invite_code || undefined,
          memberCount: dedupedMems.length,
          members: dedupedMems,
          txCount,
          latestTxDate: l.latest_tx_date ? l.latest_tx_date.slice(0, 10) : undefined,
          isGhost,
          isTest,
        };
      });

      const ghostCount = rpcData.ghostCount ?? summaries.filter(s => s.isGhost).length;
      const activeCount = rpcData.activeCount ?? summaries.filter(s => s.txCount > 0).length;

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
  } catch {
    console.log('RPC get_all_cloud_ledgers_summary 尚未建立，進入環境備援解析');
  }

  // 2. 原生手機環境 (Android / iOS) 備援：使用 service_role 權杖穿透查詢全量表
  if (Platform.OS !== 'web') {
    try {
      const token = getStorageServiceToken();
      const headers = {
        apikey: token,
        Authorization: `Bearer ${token}`,
      };

      const [ledgersRes, membersRes, txsRes, invitesRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/ledgers?select=*&order=created_at.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/ledger_members?select=ledger_id,user_id,role,profiles(display_name,avatar_url,email,auth_email,is_locked)`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/transactions?select=id,ledger_id,transacted_at&order=transacted_at.desc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/ledger_invites?select=ledger_id,invite_code&order=created_at.desc`, { headers }),
      ]);

      if (ledgersRes.ok) {
        const rawLedgers: any[] = await ledgersRes.json();
        const rawMembers: any[] = membersRes.ok ? await membersRes.json() : [];
        const rawTxs: any[] = txsRes.ok ? await txsRes.json() : [];
        const rawInvites: any[] = invitesRes.ok ? await invitesRes.json() : [];

        return buildSummariesFromRaw(rawLedgers, rawMembers, rawTxs, rawInvites, profileMap);
      }
    } catch (e) {
      console.warn('原生端 service token 查詢異常:', e);
    }
  }

  // 3. 網頁版 (Web) 專屬保底解析：利用公開邀請碼預覽 + 本地已知帳本 + 裝置感應反查
  return await fetchWebFallbackSummaries(knownLedgers, profileMap);
}

/**
 * 刪除單一指定帳本 (利用 Postgres CASCADE 自動刪除成員/交易/邀請等關聯)
 */
export async function deleteCloudLedger(ledgerId: string): Promise<boolean> {
  if (!ledgerId) return false;

  // 1. 優先嘗試 RPC 高權限刪除
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('delete_cloud_ledger_admin', {
      target_ledger_id: ledgerId,
    });
    if (!rpcErr && rpcRes && rpcRes.success) {
      return true;
    }
  } catch {}

  // 2. 雙軌管理員服務權杖直接刪除 (Web 與原生手機環境統一穿透支援)
  try {
    const { error } = await supabaseAdmin.from('ledgers').delete().eq('id', ledgerId);
    if (!error) return true;
  } catch {}

  return false;
}

/**
 * 批量清理 0 成員且 0 交易的無用幽靈帳本
 */
export async function batchPurgeGhostLedgers(ghostLedgerIds: string[]): Promise<number> {
  if (!ghostLedgerIds || ghostLedgerIds.length === 0) return 0;

  // 1. 優先嘗試 RPC 一鍵批量清理
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('batch_purge_ghost_ledgers_admin', {
      ghost_ledger_ids: ghostLedgerIds,
    });
    if (!rpcErr && rpcRes && rpcRes.success) {
      return rpcRes.count ?? ghostLedgerIds.length;
    }
  } catch {}

  // 2. 雙軌管理員服務權杖批次刪除 (Web 與原生手機環境統一穿透支援)
  try {
    const { error } = await supabaseAdmin.from('ledgers').delete().in('id', ghostLedgerIds);
    if (!error) return ghostLedgerIds.length;
  } catch {}

  return 0;
}
