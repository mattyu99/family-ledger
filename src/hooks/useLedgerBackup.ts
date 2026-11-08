import React, { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Ledger,
  Profile,
  Category,
  PaymentAccount,
  Transaction,
  TransactionType,
  RecurringRule,
  CustomPaymentMethod,
  LedgerBudget,
  CarrierRule,
} from '../types/database';
import { generateUUID } from '../lib/uuid';
import { APP_FULL_VERSION } from '../constants/version';
import { STORAGE_KEYS, isValidUUID } from '../constants/ledgerDefaults';
import { isDemoLedgerId } from '../constants/sweethomeDemo';
import { hydrateTransactionWithInvoice, deduplicateMembers, buildMemberAliasMap } from '../lib/ledgerUtils';
import { encodeMemoMerchantTag, decodeMemoMerchantTag } from '../lib/memo';
import { loadCarrierRules, persistCarrierRules } from '../lib/carrierRules';
import {
  StatementFile,
  loadCachedStatements,
  loadCachedRecurringStatements,
  saveCachedStatements,
  saveCachedRecurringStatements,
} from '../lib/statementStorage';
// supabaseAdmin removed for zero-token architecture

export interface UseLedgerBackupProps {
  currentLedger: Ledger;
  setCurrentLedger: React.Dispatch<React.SetStateAction<Ledger>>;
  currentUser: Profile;
  memberAliasMap: Record<string, Profile>;
  deletedTxIdsRef: React.MutableRefObject<Set<string>>;
  hasMerchantColumnRef: React.MutableRefObject<boolean>;
  hasPaymentColumnsRef: React.MutableRefObject<boolean>;
  setLedgers: React.Dispatch<React.SetStateAction<Ledger[]>>;
  members: Profile[];
  setMembers: React.Dispatch<React.SetStateAction<Profile[]>>;
  setMemberAliasMap: React.Dispatch<React.SetStateAction<Record<string, Profile>>>;
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  paymentAccounts: PaymentAccount[];
  setPaymentAccounts: React.Dispatch<React.SetStateAction<PaymentAccount[]>>;
  savePaymentAccountsToStorage: (accounts: PaymentAccount[]) => Promise<void>;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  saveTransactionsToStorage: (txs: Transaction[]) => Promise<void>;
  recurringRules: RecurringRule[];
  setRecurringRules: React.Dispatch<React.SetStateAction<RecurringRule[]>>;
  saveRecurringRulesToStorage: (rules: RecurringRule[], targetLedgerId?: string) => Promise<void>;
  paymentMethods: CustomPaymentMethod[];
  setPaymentMethods: React.Dispatch<React.SetStateAction<CustomPaymentMethod[]>>;
  savePaymentMethodsToStorage: (methods: CustomPaymentMethod[]) => Promise<void>;
  inviteCode?: string;
  effectiveIsOwner: boolean;
  isConfigured: boolean;
  supabase: any;
  getCategoryById: (id?: string, fallback?: Category) => Category;
  getMemberById: (id?: string) => Profile | undefined;
}

export function useLedgerBackup({
  currentLedger,
  setCurrentLedger,
  currentUser,
  memberAliasMap,
  deletedTxIdsRef,
  hasMerchantColumnRef,
  hasPaymentColumnsRef,
  setLedgers,
  members,
  setMembers,
  setMemberAliasMap,
  categories,
  setCategories,
  paymentAccounts,
  setPaymentAccounts,
  savePaymentAccountsToStorage,
  transactions,
  setTransactions,
  saveTransactionsToStorage,
  recurringRules,
  setRecurringRules,
  saveRecurringRulesToStorage,
  paymentMethods,
  setPaymentMethods,
  savePaymentMethodsToStorage,
  inviteCode,
  effectiveIsOwner,
  isConfigured,
  supabase,
  getCategoryById,
  getMemberById,
}: UseLedgerBackupProps) {
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);
  const [autoBackupInterval, setAutoBackupInterval] = useState<7 | 14 | 30>(7);

  const cachedStatementsRef = useRef<StatementFile[]>([]);
  const cachedRecurringStatementsRef = useRef<StatementFile[]>([]);
  const cachedBudgetRef = useRef<LedgerBudget | null>(null);
  const cachedCarrierRulesRef = useRef<CarrierRule[]>([]);

  useEffect(() => {
    if (!currentLedger?.id) return;
    let isMounted = true;
    Promise.all([
      loadCachedStatements(currentLedger.id),
      loadCachedRecurringStatements(currentLedger.id),
      AsyncStorage.getItem(`${STORAGE_KEYS.BUDGET}_${currentLedger.id}`)
        .then(str => (str ? JSON.parse(str) : null))
        .catch(() => null),
      loadCarrierRules(currentLedger.id).catch(() => []),
    ])
      .then(([stmts, recStmts, budget, carrierRules]) => {
        if (isMounted) {
          cachedStatementsRef.current = stmts || [];
          cachedRecurringStatementsRef.current = recStmts || [];
          cachedBudgetRef.current = budget || null;
          cachedCarrierRulesRef.current = carrierRules || [];
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [currentLedger?.id]);

  const recordBackupComplete = useCallback(async () => {
    const nowIso = new Date().toISOString();
    setLastBackupAt(nowIso);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_BACKUP_AT, nowIso);
    } catch {}
  }, []);

  const updateAutoBackupConfig = useCallback(async (enabled: boolean, intervalDays: 7 | 14 | 30) => {
    setAutoBackupEnabled(enabled);
    setAutoBackupInterval(intervalDays);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.AUTO_BACKUP_CONFIG,
        JSON.stringify({ enabled, intervalDays })
      );
    } catch {}
  }, []);

  const exportToCSV = (): string => {
    const BOM = '\uFEFF';
    const headers = ['日期', '類型', '分類', '金額', '付款人', '店家/對象', '備註'];
    const rows = transactions.map(t => {
      const cat = getCategoryById(t.category_id, t.category)?.name || '未分類';
      const payer = getMemberById(t.paid_by)?.display_name || t.payer_profile?.display_name || '家庭成員';
      const typeStr = t.type === 'expense' ? '支出' : '收入';
      const dateStr = t.transacted_at ? new Date(t.transacted_at).toLocaleDateString('zh-TW') : '';
      return `"${dateStr}","${typeStr}","${cat}",${t.amount},"${payer}","${(t.merchant || '').replace(/"/g, '""')}","${(t.note || '').replace(/"/g, '""')}"`;
    });
    return BOM + [headers.join(','), ...rows].join('\n');
  };

  const exportToJSON = (): string => {
    const backupData = {
      app: '甜心記帳本',
      version: APP_FULL_VERSION,
      exported_at: new Date().toISOString(),
      ledger: {
        id: currentLedger.id,
        name: currentLedger.name,
        description: currentLedger.description || '',
        currency: currentLedger.currency || 'TWD',
        invite_code: inviteCode,
        is_read_only: currentLedger.is_read_only,
        allow_new_members: currentLedger.allow_new_members,
        admin_pin: currentLedger.admin_pin,
      },
      members: members.map(m => ({
        id: m.id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
        role: m.role,
        custom_name: m.custom_name,
        custom_avatar: m.custom_avatar,
        mof_barcode: m.mof_barcode,
        mof_sync_enabled: m.mof_sync_enabled,
      })),
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        type: c.type,
        sort_order: c.sort_order,
      })),
      payment_accounts: (paymentAccounts || [])
        .filter(a => a.ledger_id === currentLedger.id)
        .map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          user_id: a.user_id,
          last_four_digits: a.last_four_digits,
          card_number: a.card_number,
          issuer_bank: a.issuer_bank,
          billing_cycle_date: a.billing_cycle_date,
          balance: a.balance,
          color: a.color,
          icon: a.icon,
          sort_order: a.sort_order,
        })),
      transactions: transactions.map(t => {
        const isMemo = t.type === 'memo';
        const encodedMerchant = isMemo
          ? (t.merchant || encodeMemoMerchantTag({
              reminderDate: t.reminder_date,
              reminderCalendar: t.reminder_calendar,
              reminderRepeat: t.reminder_repeat,
              completedBy: t.completed_by,
              completedAt: t.completed_at,
            }))
          : t.merchant;

        return {
          id: t.id,
          creator_id: t.creator_id,
          created_at: t.created_at,
          amount: t.amount,
          type: t.type,
          reminder_date: t.reminder_date,
          reminder_calendar: t.reminder_calendar,
          reminder_repeat: t.reminder_repeat,
          reminder_target: t.reminder_target,
          completed_by: t.completed_by,
          completed_at: t.completed_at,
          completion_note: t.completion_note,
          linked_transaction_id: t.linked_transaction_id,
          category_id: t.category_id,
          paid_by: t.paid_by,
          transacted_at: t.transacted_at,
          merchant: encodedMerchant,
          note: t.note,
          image_url: t.image_url,
          payment_method: t.payment_method,
          account_id: t.account_id,
          is_reconciled: t.is_reconciled,
          is_settled: t.is_settled,
          // 統一發票與雲端載具延伸明細
          invoice_number: t.invoice_number,
          invoice_period: t.invoice_period,
          invoice_random_code: t.invoice_random_code,
          invoice_status: t.invoice_status,
          invoice_prize_amount: t.invoice_prize_amount,
          invoice_prize_name: t.invoice_prize_name,
          invoice_sync_status: t.invoice_sync_status,
          cloud_synced_at: t.cloud_synced_at,
          invoice_items: t.invoice_items,
          cloud_carrier_name: t.cloud_carrier_name,
          // 多人分攤明細
          splits: t.splits,
        };
      }),
      statement_attachments: (cachedStatementsRef.current || []).map(s => ({
        path: s.path,
        fileName: s.fileName,
        cardId: s.cardId,
        targetId: s.targetId || s.cardId,
        ruleId: s.ruleId,
        cycleKey: s.cycleKey,
        originalName: s.originalName,
        mimeType: s.mimeType,
        size: s.size,
        createdAt: s.createdAt,
        publicUrl: s.publicUrl,
      })),
      recurring_statement_attachments: (cachedRecurringStatementsRef.current || []).map(s => ({
        path: s.path,
        fileName: s.fileName,
        cardId: s.cardId,
        targetId: s.targetId || s.cardId,
        ruleId: s.ruleId,
        cycleKey: s.cycleKey,
        originalName: s.originalName,
        mimeType: s.mimeType,
        size: s.size,
        createdAt: s.createdAt,
        publicUrl: s.publicUrl,
      })),
      recurring_rules: recurringRules
        .filter(r => !r.ledger_id || r.ledger_id === currentLedger.id)
        .map(r => ({
          id: r.id,
          name: r.name,
          amount_type: r.amount_type,
          default_amount: r.default_amount,
          category_id: r.category_id,
          merchant: r.merchant,
          paid_by: r.paid_by,
          payment_method: r.payment_method,
          account_id: r.account_id,
          frequency: r.frequency,
          due_day: r.due_day,
          bimonthly_start_month: r.bimonthly_start_month,
          is_active: r.is_active,
          last_recorded_period: r.last_recorded_period,
          is_installment: r.is_installment,
          total_installments: r.total_installments,
          current_installment: r.current_installment,
          installment_start_period: r.installment_start_period,
          note: r.note,
        })),
      payment_methods: paymentMethods.map(m => ({
        id: m.id,
        name: m.name,
        icon: m.icon,
        color: m.color,
        type: m.type,
        supports_credit_card: m.supports_credit_card,
        is_enabled: m.is_enabled,
        is_system: m.is_system,
        sort_order: m.sort_order,
      })),
      budget: cachedBudgetRef.current || undefined,
      carrier_rules: (cachedCarrierRulesRef.current && cachedCarrierRulesRef.current.length > 0)
        ? cachedCarrierRulesRef.current
        : undefined,
    };
    return JSON.stringify(backupData, null, 2);
  };

  const restoreFromJSON = async (
    jsonStr: string,
    options?: { mode?: 'merge' | 'overwrite' }
  ): Promise<{ success: boolean; message: string; restoredCount?: number }> => {
    if (!effectiveIsOwner) {
      return { success: false, message: '權限不足：只有帳本管理員才能回復帳本資料' };
    }
    const mode = options?.mode || 'merge';
    try {
      if (!jsonStr || typeof jsonStr !== 'string' || !jsonStr.trim()) {
        return { success: false, message: '請提供有效的 JSON 備份內容' };
      }

      let backup: any;
      try {
        backup = JSON.parse(jsonStr.trim());
      } catch {
        return { success: false, message: 'JSON 格式解析錯誤，請確認文字內容完整' };
      }

      if (!backup || typeof backup !== 'object') {
        return { success: false, message: '備份檔內容格式不正確' };
      }

      if (!Array.isArray(backup.transactions)) {
        return { success: false, message: '備份檔中缺少交易明細資料 (transactions)' };
      }

      const isRealCloud = isConfigured && currentLedger?.id && !isDemoLedgerId(currentLedger.id);
      // 跨帳本還原防護：若備份檔來自不同帳本，強制生成全套全新 UUID，絕不重用原帳本 ID，杜絕跨帳本碰撞覆蓋原帳本卡片與設定
      const isCrossLedgerRestore = Boolean(backup.ledger?.id && currentLedger?.id && backup.ledger.id !== currentLedger.id);

      // 若備份檔標記此帳本為唯讀封存 (is_read_only)，自動同步啟用唯讀保護
      if (backup.ledger?.is_read_only) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_READ_ONLY}_${currentLedger.id}`, 'true');
        setCurrentLedger(prev => ({ ...prev, is_read_only: true }));
        setLedgers(prev => prev.map(l => l.id === currentLedger.id ? { ...l, is_read_only: true } : l));
        if (isRealCloud) {
          try {
            await supabase.from('ledgers').update({ is_read_only: true, updated_at: new Date().toISOString() }).eq('id', currentLedger.id);
          } catch {}
        }
      }

      // 1. 還原/合併 家庭成員 (Members)
      let nextMembers = [...members];
      const memberIdMap: Record<string, string> = {};
      let activeAliasMap: Record<string, Profile> = buildMemberAliasMap(nextMembers, members);

      // 預設將現有成員自身的 ID 映射給自己
      nextMembers.forEach(m => {
        if (m.id) {
          memberIdMap[m.id] = m.id;
        }
      });

      if (Array.isArray(backup.members) && backup.members.length > 0) {
        const validBackupMembers = backup.members.filter(
          (m: any) => m && (m.display_name || m.name)
        );

        if (mode === 'overwrite') {
          // 覆蓋模式：以備份成員名冊為骨幹，但嚴格保留當前裝置操作者 currentUser
          const newMemberList: Profile[] = [];
          if (currentUser?.id) {
            newMemberList.push({ ...currentUser });
            memberIdMap[currentUser.id] = currentUser.id;
          }

          for (const bm of validBackupMembers) {
            const rawName = (bm.display_name || bm.name || '').trim();
            const nameKey = rawName.toLowerCase();
            const backupId = bm.id;

            // 檢查是否與已加入清單（如 currentUser）重名、同 ID 或同暱稱別名（支援「瑩」與「瑩媽」）
            const existing = newMemberList.find(
              m => (backupId && m.id === backupId) ||
                   (m.display_name || '').trim().toLowerCase() === nameKey ||
                   (nameKey && (m.display_name || '').trim().toLowerCase().startsWith(nameKey)) ||
                   ((m.display_name || '').trim() && nameKey.startsWith((m.display_name || '').trim().toLowerCase()))
            );

            if (existing) {
              if (backupId) {
                memberIdMap[backupId] = existing.id;
              }
              if (bm.avatar_url && !existing.avatar_url) {
                existing.avatar_url = bm.avatar_url;
              }
              if (bm.custom_name && !existing.custom_name) {
                existing.custom_name = bm.custom_name;
              }
              if (bm.custom_avatar && !existing.custom_avatar) {
                existing.custom_avatar = bm.custom_avatar;
              }
              if (bm.mof_barcode && !existing.mof_barcode) {
                existing.mof_barcode = bm.mof_barcode;
              }
              if (bm.mof_sync_enabled !== undefined && existing.mof_sync_enabled === undefined) {
                existing.mof_sync_enabled = bm.mof_sync_enabled;
              }
            } else {
              const isDemoConst = backupId?.startsWith('20000000');
              const targetId = (backupId && isValidUUID(backupId) && !isCrossLedgerRestore && (!isRealCloud || !isDemoConst))
                ? backupId
                : generateUUID();

              const restoredProf: Profile = {
                id: targetId,
                display_name: rawName,
                avatar_url: bm.avatar_url || '😊',
                role: bm.role || 'member',
                email: bm.email || `${rawName.toLowerCase()}@family.local`,
                custom_name: bm.custom_name || null,
                custom_avatar: bm.custom_avatar || null,
                mof_barcode: bm.mof_barcode || undefined,
                mof_sync_enabled: bm.mof_sync_enabled !== undefined ? bm.mof_sync_enabled : undefined,
              };
              newMemberList.push(restoredProf);
              if (backupId) {
                memberIdMap[backupId] = targetId;
              }
            }
          }
          nextMembers = deduplicateMembers(newMemberList);
        } else {
          // 合併模式 (merge)：保留現有名冊，去重補入備份檔中不存在的新成員
          for (const bm of validBackupMembers) {
            const rawName = (bm.display_name || bm.name || '').trim();
            const nameKey = rawName.toLowerCase();
            const backupId = bm.id;

            const existing = nextMembers.find(
              m => (backupId && m.id === backupId) ||
                   (m.display_name || '').trim().toLowerCase() === nameKey ||
                   (nameKey && (m.display_name || '').trim().toLowerCase().startsWith(nameKey)) ||
                   ((m.display_name || '').trim() && nameKey.startsWith((m.display_name || '').trim().toLowerCase()))
            );

            if (existing) {
              if (backupId) {
                memberIdMap[backupId] = existing.id;
              }
              if (bm.custom_name && !existing.custom_name) {
                existing.custom_name = bm.custom_name;
              }
              if (bm.custom_avatar && !existing.custom_avatar) {
                existing.custom_avatar = bm.custom_avatar;
              }
              if (bm.mof_barcode && !existing.mof_barcode) {
                existing.mof_barcode = bm.mof_barcode;
              }
              if (bm.mof_sync_enabled !== undefined && existing.mof_sync_enabled === undefined) {
                existing.mof_sync_enabled = bm.mof_sync_enabled;
              }
            } else {
              const isDemoConst = backupId?.startsWith('20000000');
              const targetId = (backupId && isValidUUID(backupId) && !isCrossLedgerRestore && (!isRealCloud || !isDemoConst))
                ? backupId
                : generateUUID();

              const newProf: Profile = {
                id: targetId,
                display_name: rawName,
                avatar_url: bm.avatar_url || '😊',
                role: bm.role || 'member',
                email: bm.email || `${rawName.toLowerCase()}@family.local`,
                custom_name: bm.custom_name || null,
                custom_avatar: bm.custom_avatar || null,
                mof_barcode: bm.mof_barcode || undefined,
                mof_sync_enabled: bm.mof_sync_enabled !== undefined ? bm.mof_sync_enabled : undefined,
              };
              nextMembers.push(newProf);
              if (backupId) {
                memberIdMap[backupId] = targetId;
              }
            }
          }
          nextMembers = deduplicateMembers(nextMembers);
        }

        setMembers(nextMembers);
        await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(nextMembers));
        if (currentLedger?.id) {
          await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`, JSON.stringify(nextMembers));
        }

        // 若為已連線之 Supabase 雲端帳本，同步建立 profiles 與 ledger_members
        if (isRealCloud) {
          try {
            for (const m of nextMembers) {
              await supabase.from('profiles').upsert({
                id: m.id,
                display_name: m.display_name,
                avatar_url: m.avatar_url || '😊',
                email: m.email || `${(m.display_name || 'member').toLowerCase()}@family.local`,
              });
              await supabase.from('ledger_members').upsert({
                ledger_id: currentLedger.id,
                user_id: m.id,
                role: m.role || 'member',
                custom_name: m.custom_name || null,
                custom_avatar: m.custom_avatar || null,
              });
            }
          } catch (e) {
            console.warn('雲端還原同步成員名冊失敗:', e);
          }
        }

        // 重新構建成員別名映射表
        const updatedAliasMap = buildMemberAliasMap(nextMembers, nextMembers);
        activeAliasMap = updatedAliasMap;
        setMemberAliasMap(updatedAliasMap);
        await AsyncStorage.setItem(STORAGE_KEYS.ALIAS_MAP, JSON.stringify(updatedAliasMap));
        if (currentLedger?.id) {
          await AsyncStorage.setItem(`${STORAGE_KEYS.ALIAS_MAP}_${currentLedger.id}`, JSON.stringify(updatedAliasMap));
        }

        // 確保 memberIdMap 中所有對應目標均校正為去重後的倖存 Profile
        for (const [origId, mappedId] of Object.entries(memberIdMap)) {
          const canonical = activeAliasMap[mappedId] || nextMembers.find(m => m.id === mappedId);
          if (canonical) {
            memberIdMap[origId] = canonical.id;
          }
        }
      }

      // 2. 還原/合併 自訂分類
      let nextCategories = [...categories];
      const categoryIdMap: Record<string, string> = {};

      nextCategories.forEach(c => {
        if (c.id) categoryIdMap[c.id] = c.id;
      });

      if (Array.isArray(backup.categories) && backup.categories.length > 0) {
        if (mode === 'overwrite') {
          const validBackupCats = backup.categories.filter((c: any) => c && c.name && c.id);
          if (validBackupCats.length > 0) {
            nextCategories = validBackupCats.map((bc: any) => {
              const existingSameName = categories.find(
                c => c.name === bc.name && (c.type || 'expense') === (bc.type || 'expense') && isValidUUID(c.id) && !c.id.startsWith('30000000')
              );
              const isDemoConst = bc.id?.startsWith('30000000');
              const targetId = existingSameName
                ? existingSameName.id
                : (bc.id && isValidUUID(bc.id) && !isCrossLedgerRestore && (!isRealCloud || !isDemoConst))
                  ? bc.id
                  : generateUUID();
              if (bc.id) categoryIdMap[bc.id] = targetId;
              return {
                id: targetId,
                ledger_id: currentLedger?.id,
                name: bc.name,
                icon: bc.icon || '📝',
                color: bc.color || '#6B7280',
                type: bc.type || 'expense',
                sort_order: bc.sort_order || 1,
              };
            });
          }
        } else {
          backup.categories.forEach((bc: any) => {
            if (!bc || !bc.name) return;
            const existing = nextCategories.find(c => c.id === bc.id || c.name === bc.name);
            if (existing) {
              if (bc.id) categoryIdMap[bc.id] = existing.id;
            } else {
              const isDemoConst = bc.id?.startsWith('30000000');
              const targetId = (bc.id && isValidUUID(bc.id) && !isCrossLedgerRestore && (!isRealCloud || !isDemoConst))
                ? bc.id
                : generateUUID();
              const newCat = {
                id: targetId,
                ledger_id: currentLedger?.id,
                name: bc.name,
                icon: bc.icon || '📝',
                color: bc.color || '#6B7280',
                type: bc.type || 'expense',
                sort_order: bc.sort_order || nextCategories.length + 1,
              };
              nextCategories.push(newCat);
              if (bc.id) categoryIdMap[bc.id] = targetId;
            }
          });
        }
        setCategories(nextCategories);
        await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(nextCategories));
        if (currentLedger?.id) {
          await AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${currentLedger.id}`, JSON.stringify(nextCategories));
        }
        if (isRealCloud) {
          try {
            for (const cat of nextCategories) {
              if (cat.id && isValidUUID(cat.id) && !cat.id.startsWith('30000000')) {
                await supabase.rpc('secure_add_category', {
                  p_category: {
                    ...cat,
                    ledger_id: currentLedger.id,
                  },
                });
              }
            }
          } catch (catSyncErr) {
            console.warn('雲端還原同步分類失敗:', catSyncErr);
          }
        }
      }

      // 3. 還原/合併 支付卡片與帳戶
      let nextAccounts = (paymentAccounts || []).filter(a => a.ledger_id === currentLedger.id);
      const accountIdMap: Record<string, string> = {};

      nextAccounts.forEach(a => {
        if (a.id) accountIdMap[a.id] = a.id;
      });

      if (Array.isArray(backup.payment_accounts) && backup.payment_accounts.length > 0) {
        const processAccount = (ba: any) => {
          let mappedUserId = ba.user_id;
          if (ba.user_id) {
            if (memberIdMap[ba.user_id]) {
              mappedUserId = memberIdMap[ba.user_id];
            } else if (activeAliasMap && activeAliasMap[ba.user_id]) {
              mappedUserId = activeAliasMap[ba.user_id].id;
            } else if (!nextMembers.some(m => m.id === ba.user_id)) {
              // 智慧名稱與前綴反查（如「瑩市民卡」反查「瑩媽」，「智市民卡」反查「智爸」）
              const matchedMember = nextMembers.find(m => {
                const dName = (m.display_name || '').trim().toLowerCase();
                const bName = (ba.name || '').trim().toLowerCase();
                if (!dName || !bName) return false;
                return bName.includes(dName) ||
                       (dName.length >= 1 && bName.includes(dName[0])) ||
                       (dName.length >= 1 && bName.startsWith(dName[0]));
              });
              mappedUserId = matchedMember ? matchedMember.id : undefined;
            }
          }

          // 若備份中該卡片 user_id 遺失，但既有名冊/卡片中有同名同卡號卡片且持有有效持有人，沿用既有持有人
          if (!mappedUserId) {
            const existingInLedger = nextAccounts.find(
              a => a.id === ba.id || (a.name === ba.name && a.last_four_digits === ba.last_four_digits)
            );
            if (existingInLedger && existingInLedger.user_id) {
              mappedUserId = existingInLedger.user_id;
            }
          }

          const isDemoConst = ba.id?.startsWith('50000000');
          const targetId = (ba.id && isValidUUID(ba.id) && !isCrossLedgerRestore && (!isRealCloud || !isDemoConst))
            ? ba.id
            : generateUUID();

          if (ba.id) {
            accountIdMap[ba.id] = targetId;
          }

          return {
            ...ba,
            id: targetId,
            user_id: mappedUserId,
            ledger_id: currentLedger.id,
          };
        };

        if (mode === 'overwrite') {
          nextAccounts = backup.payment_accounts
            .filter((a: any) => a && a.name)
            .map(processAccount);
        } else {
          backup.payment_accounts.forEach((ba: any) => {
            if (!ba || !ba.name) return;
            const existing = nextAccounts.find(
              a => a.id === ba.id || (a.name === ba.name && a.last_four_digits === ba.last_four_digits)
            );
            if (existing) {
              if (ba.id) accountIdMap[ba.id] = existing.id;
            } else {
              nextAccounts.push(processAccount(ba));
            }
          });
        }
        setPaymentAccounts(nextAccounts);
        await savePaymentAccountsToStorage(nextAccounts);

        // 同步卡片至 Supabase 雲端 (若為已連線雲端帳本)
        if (isRealCloud) {
          try {
            const accountsToSync = nextAccounts.map(acc => {
              const validUserId = acc.user_id && (nextMembers.some(m => m.id === acc.user_id) || (activeAliasMap && activeAliasMap[acc.user_id]))
                ? (activeAliasMap && activeAliasMap[acc.user_id] ? activeAliasMap[acc.user_id].id : acc.user_id)
                : (acc.user_id || null);

              return {
                id: acc.id,
                ledger_id: currentLedger.id,
                name: acc.name,
                type: acc.type,
                user_id: validUserId,
                last_four_digits: acc.last_four_digits || '',
                card_number: acc.card_number || null,
                issuer_bank: acc.issuer_bank || null,
                billing_cycle_date: acc.billing_cycle_date || 1,
                balance: acc.balance || 0,
                color: acc.color || '#3B82F6',
                icon: acc.icon || '💳',
                sort_order: acc.sort_order || 1,
              };
            });
            for (const acc of accountsToSync) {
              await supabase.rpc('secure_add_payment_account', { p_account: acc });
            }
          } catch (e) {
            console.warn('雲端還原同步卡片帳戶失敗:', e);
          }
        }
      }

      // 3.5 還原/合併 週期扣款規則 (Recurring Rules)
      let nextRecurringRules = [...recurringRules];
      if (Array.isArray(backup.recurring_rules) && backup.recurring_rules.length > 0) {
        const processRule = (br: any): RecurringRule => {
          let mappedPaidBy = br.paid_by;
          if (br.paid_by && memberIdMap[br.paid_by]) {
            mappedPaidBy = memberIdMap[br.paid_by];
          } else if (currentUser?.id) {
            mappedPaidBy = currentUser.id;
          }

          let mappedCategoryId = br.category_id;
          if (br.category_id && categoryIdMap[br.category_id]) {
            mappedCategoryId = categoryIdMap[br.category_id];
          }

          let mappedAccountId = br.account_id;
          if (br.account_id && accountIdMap[br.account_id]) {
            mappedAccountId = accountIdMap[br.account_id];
          }

          return {
            ...br,
            id: (!isCrossLedgerRestore && br.id && isValidUUID(br.id)) ? br.id : generateUUID(),
            ledger_id: currentLedger.id,
            paid_by: mappedPaidBy,
            category_id: mappedCategoryId || nextCategories[0]?.id || '',
            account_id: mappedAccountId,
            is_installment: br.is_installment,
            total_installments: br.total_installments,
            current_installment: br.current_installment,
            installment_start_period: br.installment_start_period,
            updated_at: new Date().toISOString(),
          };
        };

        if (mode === 'overwrite') {
          nextRecurringRules = backup.recurring_rules
            .filter((r: any) => r && r.name)
            .map(processRule);
        } else {
          backup.recurring_rules.forEach((br: any) => {
            if (!br || !br.name) return;
            const existing = nextRecurringRules.find(r => r.id === br.id || r.name === br.name);
            if (!existing) {
              nextRecurringRules.push(processRule(br));
            }
          });
        }
        setRecurringRules(nextRecurringRules);
        await saveRecurringRulesToStorage(nextRecurringRules, currentLedger.id);

        if (isRealCloud && nextRecurringRules.length > 0) {
          try {
            const rulesToUpsert = nextRecurringRules.map(r => ({
              id: r.id,
              ledger_id: currentLedger.id,
              name: r.name,
              amount_type: r.amount_type || 'variable',
              default_amount: Number(r.default_amount) || 0,
              category_id: r.category_id || null,
              merchant: r.merchant || null,
              paid_by: r.paid_by || null,
              payment_method: r.payment_method || 'credit_card',
              account_id: r.account_id && !r.account_id.startsWith('50000000') ? r.account_id : null,
              frequency: r.frequency || 'monthly',
              due_day: r.due_day || 1,
              bimonthly_start_month: r.bimonthly_start_month || null,
              is_active: r.is_active ?? true,
              last_recorded_period: r.last_recorded_period || null,
              is_installment: Boolean(r.is_installment),
              total_installments: r.total_installments || null,
              current_installment: r.current_installment || 1,
              installment_start_period: r.installment_start_period || null,
              note: r.note || null,
            }));
            await supabase.from('recurring_rules').upsert(rulesToUpsert);
          } catch (ruleCloudErr) {
            console.warn('雲端還原同步週期規則失敗:', ruleCloudErr);
          }
        }
      }

      // 3.6 還原/合併 自訂付款方式 (Payment Methods)
      let nextPaymentMethods = [...paymentMethods];
      if (Array.isArray(backup.payment_methods) && backup.payment_methods.length > 0) {
        if (mode === 'overwrite') {
          nextPaymentMethods = backup.payment_methods.map((bm: any) => ({
            id: (!isCrossLedgerRestore && bm.id && isValidUUID(bm.id)) ? bm.id : generateUUID(),
            ledger_id: currentLedger.id,
            name: bm.name,
            icon: bm.icon || '💳',
            color: bm.color || '#6366F1',
            type: bm.type || 'other',
            supports_credit_card: !!bm.supports_credit_card,
            is_enabled: bm.is_enabled !== false,
            is_system: !!bm.is_system,
            sort_order: bm.sort_order || 1,
            created_at: new Date().toISOString(),
          }));
        } else {
          backup.payment_methods.forEach((bm: any) => {
            if (!bm || !bm.name) return;
            const existingIndex = nextPaymentMethods.findIndex(m => m.id === bm.id || m.name === bm.name);
            if (existingIndex >= 0) {
              nextPaymentMethods[existingIndex] = {
                ...nextPaymentMethods[existingIndex],
                is_enabled: bm.is_enabled !== false,
                sort_order: bm.sort_order ?? nextPaymentMethods[existingIndex].sort_order,
              };
            } else {
              nextPaymentMethods.push({
                id: (!isCrossLedgerRestore && bm.id && isValidUUID(bm.id)) ? bm.id : generateUUID(),
                ledger_id: currentLedger.id,
                name: bm.name,
                icon: bm.icon || '💳',
                color: bm.color || '#6366F1',
                type: bm.type || 'other',
                supports_credit_card: !!bm.supports_credit_card,
                is_enabled: bm.is_enabled !== false,
                is_system: !!bm.is_system,
                sort_order: bm.sort_order || nextPaymentMethods.length + 1,
                created_at: new Date().toISOString(),
              });
            }
          });
        }
        setPaymentMethods(nextPaymentMethods);
        await savePaymentMethodsToStorage(nextPaymentMethods);

        if (isRealCloud && nextPaymentMethods.length > 0) {
          try {
            const methodsToUpsert = nextPaymentMethods.map(m => ({
              id: m.id,
              ledger_id: currentLedger.id,
              name: m.name,
              icon: m.icon || '📱',
              color: m.color || '#0055B8',
              type: m.type || 'other',
              supports_credit_card: Boolean(m.supports_credit_card),
              is_system: Boolean(m.is_system),
              sort_order: m.sort_order || 1,
            }));
            await supabase.from('payment_methods').upsert(methodsToUpsert);
          } catch (pmCloudErr) {
            console.warn('雲端還原同步付款方式失敗:', pmCloudErr);
          }
        }
      }

      // 4. 還原/合併 交易明細
      const backupTxs = Array.isArray(backup.transactions) ? backup.transactions : [];
      const targetLedgerId = currentLedger.id;
      const fallbackPayerId = currentUser?.id || nextMembers[0]?.id || 'unknown';

      // 關鍵防禦：徹底清空本機與雲端墓碑名冊，防止任何還原紀錄被既有刪除快取阻擋
      deletedTxIdsRef.current.clear();
      try {
        await AsyncStorage.removeItem(STORAGE_KEYS.DELETED_TX_IDS);
        await AsyncStorage.removeItem(`${STORAGE_KEYS.DELETED_TX_IDS}_${targetLedgerId}`);
        if (isRealCloud) {
          await supabase.from('deleted_transactions').delete().eq('ledger_id', targetLedgerId);
        }
      } catch {}

      if (mode === 'overwrite' && isRealCloud) {
        try {
          await supabase.from('transactions').delete().eq('ledger_id', targetLedgerId);
        } catch (e) {
          console.warn('覆蓋模式清空舊交易失敗:', e);
        }
      }

      // 建立現有明細特徵指紋集合（以防 merge 模式重複補入）
      const existingFingerprints = new Set(
        transactions.map(t => `${t.type}_${Number(t.amount)}_${t.transacted_at}_${t.merchant || ''}_${t.note || ''}`)
      );

      // 建立新舊交易 ID 映射表，以便連動之交易與分攤明細能精確對齊
      const txIdMap: Record<string, string> = {};
      for (const t of backupTxs) {
        if (t && t.id) {
          txIdMap[t.id] = generateUUID();
        }
      }

      const sanitizedTxs: Transaction[] = [];

      for (const t of backupTxs) {
        if (!t || isNaN(Number(t.amount))) continue;

        const fingerprint = `${t.type}_${Number(t.amount)}_${t.transacted_at}_${t.merchant || ''}_${t.note || ''}`;
        if (mode === 'merge' && existingFingerprints.has(fingerprint)) {
          // 合併模式下，若已存在完全相同的明細，跳過避免重複
          continue;
        }

        // 分類對齊
        const targetCatId = t.category_id && categoryIdMap[t.category_id] ? categoryIdMap[t.category_id] : t.category_id;
        const matchedCategory = nextCategories.find(c => c.id === targetCatId) || nextCategories[0];

        // 付款人對齊
        let resolvedPaidBy = fallbackPayerId;
        if (t.paid_by) {
          if (memberIdMap[t.paid_by]) {
            resolvedPaidBy = memberIdMap[t.paid_by];
          } else if (nextMembers.some(m => m.id === t.paid_by)) {
            resolvedPaidBy = t.paid_by;
          } else if (memberAliasMap[t.paid_by]) {
            resolvedPaidBy = memberAliasMap[t.paid_by].id;
          }
        }

        // 建立者對齊
        let resolvedCreatorId = currentUser.id;
        if (t.creator_id) {
          if (memberIdMap[t.creator_id]) {
            resolvedCreatorId = memberIdMap[t.creator_id];
          } else if (nextMembers.some(m => m.id === t.creator_id)) {
            resolvedCreatorId = t.creator_id;
          }
        }

        // 扣款卡片對齊
        let resolvedAccountId = t.account_id;
        if (resolvedAccountId && accountIdMap[resolvedAccountId]) {
          resolvedAccountId = accountIdMap[resolvedAccountId];
        }

        const freshTxId = (t.id && txIdMap[t.id]) ? txIdMap[t.id] : generateUUID();

        // 待辦與生活備忘資訊解析
        const decodedMemo = decodeMemoMerchantTag(t.merchant);
        const isBackupMemo = t.type === 'memo' || (t.type === 'transfer' && Number(t.amount) === 0) || decodedMemo.isMemo;
        const restoredType: TransactionType = isBackupMemo ? 'memo' : (t.type === 'income' ? 'income' : (t.type === 'transfer' ? 'transfer' : 'expense'));

        const restoredReminderDate = t.reminder_date || decodedMemo.reminderDate || undefined;
        const restoredReminderCal = t.reminder_calendar || decodedMemo.reminderCalendar || undefined;
        const restoredReminderRep = t.reminder_repeat || decodedMemo.reminderRepeat || undefined;
        const restoredReminderTarget = t.reminder_target || 'family';
        const restoredCompletedBy = t.completed_by ? (memberIdMap[t.completed_by] || t.completed_by) : (decodedMemo.completedBy ? (memberIdMap[decodedMemo.completedBy] || decodedMemo.completedBy) : undefined);
        const restoredCompletedAt = t.completed_at || decodedMemo.completedAt || undefined;
        const restoredCompletionNote = t.completion_note || undefined;

        // 若為生活備忘，確保 merchant 標籤完整編碼，杜絕跨版本遺失
        const restoredMerchant = isBackupMemo
          ? encodeMemoMerchantTag({
              reminderDate: restoredReminderDate,
              reminderCalendar: restoredReminderCal,
              reminderRepeat: restoredReminderRep,
              completedBy: restoredCompletedBy,
              completedAt: restoredCompletedAt,
            })
          : (t.merchant || undefined);

        // 分攤明細 (splits) 成員 ID 重新對齊
        let restoredSplits = t.splits;
        if (Array.isArray(t.splits) && t.splits.length > 0) {
          restoredSplits = t.splits.map((s: any) => ({
            ...s,
            id: generateUUID(),
            transaction_id: freshTxId,
            user_id: memberIdMap[s.user_id] || s.user_id,
          }));
        }

        sanitizedTxs.push({
          id: freshTxId,
          ledger_id: targetLedgerId,
          creator_id: resolvedCreatorId,
          category_id: matchedCategory?.id || targetCatId,
          amount: isBackupMemo ? 0 : Number(t.amount),
          type: restoredType,
          reminder_date: restoredReminderDate,
          reminder_calendar: restoredReminderCal,
          reminder_repeat: restoredReminderRep,
          reminder_target: restoredReminderTarget,
          completed_by: restoredCompletedBy,
          completed_at: restoredCompletedAt,
          completion_note: restoredCompletionNote,
          linked_transaction_id: t.linked_transaction_id ? (txIdMap[t.linked_transaction_id] || t.linked_transaction_id) : undefined,
          paid_by: resolvedPaidBy,
          transacted_at: t.transacted_at || new Date().toISOString(),
          merchant: restoredMerchant,
          note: t.note || '',
          image_url: t.image_url || undefined,
          payment_method: t.payment_method || 'cash',
          account_id: resolvedAccountId || undefined,
          is_reconciled: Boolean(t.is_reconciled),
          category: matchedCategory,
          is_settled: t.is_settled ?? false,
          created_at: t.created_at || new Date().toISOString(),
          // 發票延伸明細
          invoice_number: t.invoice_number || undefined,
          invoice_period: t.invoice_period || undefined,
          invoice_random_code: t.invoice_random_code || undefined,
          invoice_status: t.invoice_status || undefined,
          invoice_prize_amount: t.invoice_prize_amount || undefined,
          invoice_prize_name: t.invoice_prize_name || undefined,
          invoice_sync_status: t.invoice_sync_status || undefined,
          cloud_synced_at: t.cloud_synced_at || undefined,
          invoice_items: t.invoice_items || undefined,
          cloud_carrier_name: t.cloud_carrier_name || undefined,
          splits: restoredSplits,
        });
      }

      let finalTxs: Transaction[];
      if (mode === 'overwrite') {
        finalTxs = sanitizedTxs;
      } else {
        finalTxs = [...transactions, ...sanitizedTxs];
      }

      finalTxs.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());

      setTransactions(finalTxs);
      await saveTransactionsToStorage(finalTxs);

      // 同步還原交易至 Supabase 雲端 (若為已連線雲端帳本)
      if (isRealCloud && sanitizedTxs.length > 0) {
        try {
          const txsToUpsert = sanitizedTxs.map(t => {
            const p: any = {
              id: t.id,
              ledger_id: t.ledger_id,
              creator_id: t.creator_id || currentUser?.id,
              category_id: t.category_id,
              amount: t.amount,
              type: t.type,
              paid_by: t.paid_by,
              transacted_at: t.transacted_at,
              is_settled: t.is_settled || false,
              note: t.note || '',
              created_at: t.created_at || new Date().toISOString(),
            };
            if (t.image_url) {
              p.image_url = t.image_url;
            }
            if (hasMerchantColumnRef.current) {
              p.merchant = t.merchant || null;
            }
            if (hasPaymentColumnsRef.current) {
              if (t.payment_method) p.payment_method = t.payment_method;
              if (t.account_id && !t.account_id.startsWith('50000000')) p.account_id = t.account_id;
              if (t.is_reconciled !== undefined) p.is_reconciled = t.is_reconciled;
            }
            // 🌟 生活待辦與提醒延伸欄位寫入雲端
            if (t.reminder_date) p.reminder_date = t.reminder_date;
            if (t.reminder_target) p.reminder_target = t.reminder_target;
            if (t.completed_by && isValidUUID(t.completed_by)) p.completed_by = t.completed_by;
            if (t.completed_at) p.completed_at = t.completed_at;
            if (t.completion_note) p.completion_note = t.completion_note;
            if (t.linked_transaction_id && isValidUUID(t.linked_transaction_id)) p.linked_transaction_id = t.linked_transaction_id;
            return p;
          });

          for (let i = 0; i < txsToUpsert.length; i += 500) {
            const batch = txsToUpsert.slice(i, i + 500);
            const { error: batchErr } = await supabase.from('transactions').upsert(batch);
            if (batchErr) {
              // 若因資料庫尚未加新欄位 (42703)，移除生活備忘延伸欄位後重試
              if (batchErr.code === '42703' || batchErr.message?.includes('column')) {
                const compatBatch = batch.map((item: any) => {
                  const copy = { ...item };
                  delete copy.reminder_date;
                  delete copy.reminder_target;
                  delete copy.completed_by;
                  delete copy.completed_at;
                  delete copy.completion_note;
                  delete copy.linked_transaction_id;
                  return copy;
                });
                const { error: compatErr } = await supabase.from('transactions').upsert(compatBatch);
                if (compatErr) {
                  await supabase.rpc('secure_batch_add_transactions', { p_transactions: compatBatch });
                }
              } else {
                await supabase.rpc('secure_batch_add_transactions', { p_transactions: batch });
              }
            }
          }
        } catch (cloudErr) {
          console.warn('雲端還原同步交易失敗:', cloudErr);
        }
      }

      // 5. 還原/合併 電子帳單與繳費單附件清單 (Statement Attachments)
      const stmtsFromBackup = backup.statement_attachments || backup.statements;
      if (Array.isArray(stmtsFromBackup) && stmtsFromBackup.length > 0) {
        try {
          let mergedStatements = [...cachedStatementsRef.current];
          if (mode === 'overwrite') {
            mergedStatements = stmtsFromBackup;
          } else {
            stmtsFromBackup.forEach((bs: StatementFile) => {
              if (!bs || !bs.path) return;
              if (!mergedStatements.some(s => s.path === bs.path)) {
                mergedStatements.push(bs);
              }
            });
          }
          cachedStatementsRef.current = mergedStatements;
          await saveCachedStatements(targetLedgerId, mergedStatements);
        } catch (stmtErr) {
          console.warn('還原信用卡帳單中繼資料快取失敗:', stmtErr);
        }
      }

      const recStmtsFromBackup = backup.recurring_statement_attachments || backup.recurring_statements;
      if (Array.isArray(recStmtsFromBackup) && recStmtsFromBackup.length > 0) {
        try {
          let mergedRecurring = [...cachedRecurringStatementsRef.current];
          if (mode === 'overwrite') {
            mergedRecurring = recStmtsFromBackup;
          } else {
            recStmtsFromBackup.forEach((bs: StatementFile) => {
              if (!bs || !bs.path) return;
              if (!mergedRecurring.some(s => s.path === bs.path)) {
                mergedRecurring.push(bs);
              }
            });
          }
          cachedRecurringStatementsRef.current = mergedRecurring;
          await saveCachedRecurringStatements(targetLedgerId, mergedRecurring);
        } catch (recStmtErr) {
          console.warn('還原固定帳單中繼資料快取失敗:', recStmtErr);
        }
      }

      // 6. 還原/合併 月度總預算設定 (Ledger Budget)
      if (backup.budget) {
        try {
          const rawBudget = backup.budget;
          const remappedCategoryBudgets: Record<string, number> = {};
          if (rawBudget.category_budgets) {
            for (const [catId, amt] of Object.entries(rawBudget.category_budgets)) {
              const targetCatId = categoryIdMap[catId] || catId;
              remappedCategoryBudgets[targetCatId] = Number(amt) || 0;
            }
          }
          const remappedMemberBudgets: Record<string, number> = {};
          if (rawBudget.member_budgets) {
            for (const [memId, amt] of Object.entries(rawBudget.member_budgets)) {
              const targetMemId = memberIdMap[memId] || memId;
              remappedMemberBudgets[targetMemId] = Number(amt) || 0;
            }
          }
          const restoredBudget: LedgerBudget = {
            ledger_id: currentLedger.id,
            is_enabled: rawBudget.is_enabled ?? true,
            monthly_total: Number(rawBudget.monthly_total) || 40000,
            alert_threshold: Number(rawBudget.alert_threshold) || 80,
            category_budgets: remappedCategoryBudgets,
            member_budgets: remappedMemberBudgets,
            updated_at: new Date().toISOString(),
          };
          cachedBudgetRef.current = restoredBudget;
          await AsyncStorage.setItem(`${STORAGE_KEYS.BUDGET}_${currentLedger.id}`, JSON.stringify(restoredBudget));
          if (isRealCloud) {
            try {
              await supabase.from('ledger_budgets').upsert({
                ledger_id: currentLedger.id,
                is_enabled: restoredBudget.is_enabled,
                monthly_total: restoredBudget.monthly_total,
                alert_threshold: restoredBudget.alert_threshold,
                category_budgets: restoredBudget.category_budgets,
                member_budgets: restoredBudget.member_budgets,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'ledger_id' });
            } catch (bCloudErr) {
              console.warn('雲端還原同步預算失敗:', bCloudErr);
            }
          }
        } catch (budgetErr) {
          console.warn('還原預算失敗:', budgetErr);
        }
      }

      // 7. 還原/合併 雲端發票載具歸屬規則 (Carrier Rules)
      if (Array.isArray(backup.carrier_rules) && backup.carrier_rules.length > 0) {
        try {
          const restoredCarrierRules: CarrierRule[] = backup.carrier_rules.map((cr: any) => {
            const targetUserId = cr.user_id ? (memberIdMap[cr.user_id] || cr.user_id) : fallbackPayerId;
            const targetAccId = cr.account_id ? (accountIdMap[cr.account_id] || cr.account_id) : undefined;
            return {
              id: (!isCrossLedgerRestore && cr.id && isValidUUID(cr.id)) ? cr.id : generateUUID(),
              ledger_id: currentLedger.id,
              carrier_no: cr.carrier_no,
              carrier_name: cr.carrier_name,
              user_id: targetUserId,
              account_id: targetAccId,
              created_at: cr.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          });
          cachedCarrierRulesRef.current = restoredCarrierRules;
          await persistCarrierRules(currentLedger.id, restoredCarrierRules);
        } catch (crErr) {
          console.warn('還原發票載具規則失敗:', crErr);
        }
      }

      // 8. 還原/更新 帳本設定 (管理員密碼鎖與新成員門禁)
      if (backup.ledger) {
        try {
          if (backup.ledger.admin_pin) {
            await AsyncStorage.setItem(`${STORAGE_KEYS.ADMIN_PIN}_${currentLedger.id}`, backup.ledger.admin_pin);
            setCurrentLedger(prev => ({ ...prev, admin_pin: backup.ledger.admin_pin }));
          }
          if (backup.ledger.allow_new_members !== undefined) {
            await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_ALLOW_NEW_MEMBERS}_${currentLedger.id}`, backup.ledger.allow_new_members ? 'true' : 'false');
            setCurrentLedger(prev => ({ ...prev, allow_new_members: Boolean(backup.ledger.allow_new_members) }));
          }
        } catch (lErr) {
          console.warn('還原帳本設定失敗:', lErr);
        }
      }

      const parts: string[] = [`${sanitizedTxs.length} 筆明細`];
      if (Array.isArray(backup.members) && backup.members.length > 0) {
        parts.push(`${nextMembers.length} 位成員`);
      }
      if (Array.isArray(backup.payment_accounts) && backup.payment_accounts.length > 0) {
        parts.push(`${nextAccounts.length} 張卡片`);
      }
      if (Array.isArray(backup.categories) && backup.categories.length > 0) {
        parts.push(`${nextCategories.length} 個分類`);
      }
      if (Array.isArray(backup.recurring_rules) && backup.recurring_rules.length > 0) {
        parts.push(`${nextRecurringRules.length} 個週期規則`);
      }
      if (Array.isArray(backup.payment_methods) && backup.payment_methods.length > 0) {
        parts.push(`${nextPaymentMethods.length} 個付款方式`);
      }
      if (Array.isArray(stmtsFromBackup) && stmtsFromBackup.length > 0) {
        parts.push(`${stmtsFromBackup.length} 份帳單附件`);
      }
      if (backup.budget) {
        parts.push('1 組月度預算');
      }
      if (Array.isArray(backup.carrier_rules) && backup.carrier_rules.length > 0) {
        parts.push(`${backup.carrier_rules.length} 條載具規則`);
      }

      return {
        success: true,
        message: `成功還原！${mode === 'overwrite' ? '已覆蓋還原' : '已合併補入'} ${parts.join('、')}。`,
        restoredCount: sanitizedTxs.length,
      };
    } catch (err: any) {
      console.error('restoreFromJSON 錯誤:', err);
      return { success: false, message: `還原失敗: ${err?.message || '未知錯誤'}` };
    }
  };


  return {
    lastBackupAt,
    setLastBackupAt,
    autoBackupEnabled,
    setAutoBackupEnabled,
    autoBackupInterval,
    setAutoBackupInterval,
    recordBackupComplete,
    updateAutoBackupConfig,
    exportToCSV,
    exportToJSON,
    restoreFromJSON,
  };
}
