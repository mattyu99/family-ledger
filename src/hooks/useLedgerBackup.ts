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
} from '../types/database';
import { generateUUID } from '../lib/uuid';
import { APP_FULL_VERSION } from '../constants/version';
import { STORAGE_KEYS, DEMO_LEDGER_ID, isValidUUID } from '../constants/ledgerDefaults';
import { hydrateTransactionWithInvoice, deduplicateMembers, buildMemberAliasMap } from '../lib/ledgerUtils';
import {
  StatementFile,
  loadCachedStatements,
  loadCachedRecurringStatements,
  saveCachedStatements,
  saveCachedRecurringStatements,
} from '../lib/statementStorage';
import { supabaseAdmin } from '../lib/supabase';

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

  useEffect(() => {
    if (!currentLedger?.id) return;
    let isMounted = true;
    Promise.all([
      loadCachedStatements(currentLedger.id),
      loadCachedRecurringStatements(currentLedger.id),
    ])
      .then(([stmts, recStmts]) => {
        if (isMounted) {
          cachedStatementsRef.current = stmts || [];
          cachedRecurringStatementsRef.current = recStmts || [];
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
        invite_code: inviteCode,
        is_read_only: currentLedger.is_read_only,
      },
      members: members.map(m => ({
        id: m.id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
        role: m.role,
      })),
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        type: c.type,
        sort_order: c.sort_order,
      })),
      payment_accounts: paymentAccounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        user_id: a.user_id,
        last_four_digits: a.last_four_digits,
        billing_cycle_date: a.billing_cycle_date,
        balance: a.balance,
        color: a.color,
        icon: a.icon,
        sort_order: a.sort_order,
      })),
      transactions: transactions.map(t => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        reminder_date: t.reminder_date,
        completed_by: t.completed_by,
        category_id: t.category_id,
        paid_by: t.paid_by,
        transacted_at: t.transacted_at,
        merchant: t.merchant,
        note: t.note,
        image_url: t.image_url,
        payment_method: t.payment_method,
        account_id: t.account_id,
        is_reconciled: t.is_reconciled,
        is_settled: t.is_settled,
      })),
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

      const isRealCloud = isConfigured && currentLedger?.id && currentLedger.id !== DEMO_LEDGER_ID;

      // 若備份檔標記此帳本為唯讀封存 (is_read_only)，自動同步啟用唯讀保護
      if (backup.ledger?.is_read_only) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_READ_ONLY}_${currentLedger.id}`, 'true');
        setCurrentLedger(prev => ({ ...prev, is_read_only: true }));
        setLedgers(prev => prev.map(l => l.id === currentLedger.id ? { ...l, is_read_only: true } : l));
        if (isRealCloud) {
          try {
            await supabaseAdmin.from('ledgers').update({ is_read_only: true, updated_at: new Date().toISOString() }).eq('id', currentLedger.id);
          } catch {}
        }
      }

      // 1. 還原/合併 家庭成員 (Members)
      let nextMembers = [...members];
      const memberIdMap: Record<string, string> = {};

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

            // 檢查是否與已加入清單（如 currentUser）重名或同 ID
            const existing = newMemberList.find(
              m => (backupId && m.id === backupId) ||
                   (m.display_name || '').trim().toLowerCase() === nameKey
            );

            if (existing) {
              if (backupId) {
                memberIdMap[backupId] = existing.id;
              }
              if (bm.avatar_url && !existing.avatar_url) {
                existing.avatar_url = bm.avatar_url;
              }
            } else {
              const isDemoConst = backupId?.startsWith('20000000');
              const targetId = (backupId && isValidUUID(backupId) && (!isRealCloud || !isDemoConst))
                ? backupId
                : generateUUID();

              const restoredProf: Profile = {
                id: targetId,
                display_name: rawName,
                avatar_url: bm.avatar_url || '😊',
                role: bm.role || 'member',
                email: bm.email || `${rawName.toLowerCase()}@family.local`,
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
                   (m.display_name || '').trim().toLowerCase() === nameKey
            );

            if (existing) {
              if (backupId) {
                memberIdMap[backupId] = existing.id;
              }
            } else {
              const isDemoConst = backupId?.startsWith('20000000');
              const targetId = (backupId && isValidUUID(backupId) && (!isRealCloud || !isDemoConst))
                ? backupId
                : generateUUID();

              const newProf: Profile = {
                id: targetId,
                display_name: rawName,
                avatar_url: bm.avatar_url || '😊',
                role: bm.role || 'member',
                email: bm.email || `${rawName.toLowerCase()}@family.local`,
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
              await supabaseAdmin.from('profiles').upsert({
                id: m.id,
                display_name: m.display_name,
                avatar_url: m.avatar_url || '😊',
                email: m.email || `${(m.display_name || 'member').toLowerCase()}@family.local`,
              });
              await supabaseAdmin.from('ledger_members').upsert({
                ledger_id: currentLedger.id,
                user_id: m.id,
                role: m.role || 'member',
              });
            }
          } catch (e) {
            console.warn('雲端還原同步成員名冊失敗:', e);
          }
        }

        // 重新構建成員別名映射表
        const updatedAliasMap = buildMemberAliasMap(nextMembers, nextMembers);
        setMemberAliasMap(updatedAliasMap);
        await AsyncStorage.setItem(STORAGE_KEYS.ALIAS_MAP, JSON.stringify(updatedAliasMap));
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
              if (bc.id) categoryIdMap[bc.id] = bc.id;
              return {
                id: bc.id,
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
              const targetId = (bc.id && isValidUUID(bc.id) && (!isRealCloud || !isDemoConst))
                ? bc.id
                : generateUUID();
              const newCat = {
                id: targetId,
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
      }

      // 3. 還原/合併 支付卡片與帳戶
      let nextAccounts = [...paymentAccounts];
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
            } else if (!nextMembers.some(m => m.id === ba.user_id)) {
              const matchedMember = nextMembers.find(m => m.display_name && ba.name?.includes(m.display_name));
              mappedUserId = matchedMember ? matchedMember.id : undefined;
            }
          }

          const isDemoConst = ba.id?.startsWith('50000000');
          const targetId = (ba.id && isValidUUID(ba.id) && (!isRealCloud || !isDemoConst))
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
            const accountsToSync = nextAccounts.map(acc => ({
              id: acc.id,
              ledger_id: currentLedger.id,
              name: acc.name,
              type: acc.type,
              user_id: acc.user_id && nextMembers.some(m => m.id === acc.user_id) ? acc.user_id : null,
              last_four_digits: acc.last_four_digits || '',
              billing_cycle_date: acc.billing_cycle_date || 1,
              balance: acc.balance || 0,
              color: acc.color || '#3B82F6',
              icon: acc.icon || '💳',
              sort_order: acc.sort_order || 1,
            }));
            await supabase.from('payment_accounts').upsert(accountsToSync);
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
            id: br.id || generateUUID(),
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
      }

      // 3.6 還原/合併 自訂付款方式 (Payment Methods)
      let nextPaymentMethods = [...paymentMethods];
      if (Array.isArray(backup.payment_methods) && backup.payment_methods.length > 0) {
        if (mode === 'overwrite') {
          nextPaymentMethods = backup.payment_methods.map((bm: any) => ({
            id: bm.id,
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
                id: bm.id || generateUUID(),
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
          await supabaseAdmin.from('deleted_transactions').delete().eq('ledger_id', targetLedgerId);
        }
      } catch {}

      if (mode === 'overwrite' && isRealCloud) {
        try {
          await supabaseAdmin.from('transactions').delete().eq('ledger_id', targetLedgerId);
        } catch (e) {
          console.warn('覆蓋模式清空舊交易失敗:', e);
        }
      }

      // 建立現有明細特徵指紋集合（以防 merge 模式重複補入）
      const existingFingerprints = new Set(
        transactions.map(t => `${t.type}_${Number(t.amount)}_${t.transacted_at}_${t.merchant || ''}_${t.note || ''}`)
      );

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

        // 核心免疫關鍵：一律生成全新獨立 UUID！
        // 徹底根除任何客戶端或資料庫中舊 ID 的「歷史刪除標記」，確保 100% 不會被自動刪除
        const freshTxId = generateUUID();

        const isBackupMemo = t.type === 'memo' || (t.type === 'transfer' && Number(t.amount) === 0) || t.merchant?.startsWith('remind:') || t.merchant === 'memo';
        const restoredType: TransactionType = isBackupMemo ? 'memo' : (t.type === 'income' ? 'income' : (t.type === 'transfer' ? 'transfer' : 'expense'));
        const restoredReminder = t.reminder_date || (t.merchant?.startsWith('remind:') ? t.merchant.replace('remind:', '') : undefined);

        sanitizedTxs.push({
          id: freshTxId,
          ledger_id: targetLedgerId,
          creator_id: resolvedCreatorId,
          category_id: matchedCategory?.id || targetCatId,
          amount: isBackupMemo ? 0 : Number(t.amount),
          type: restoredType,
          reminder_date: restoredReminder,
          completed_by: t.completed_by || undefined,
          paid_by: resolvedPaidBy,
          transacted_at: t.transacted_at || new Date().toISOString(),
          merchant: t.merchant || undefined,
          note: t.note || '',
          image_url: t.image_url || undefined,
          payment_method: t.payment_method || 'cash',
          account_id: resolvedAccountId || undefined,
          is_reconciled: Boolean(t.is_reconciled),
          category: matchedCategory,
          is_settled: t.is_settled ?? false,
          created_at: t.created_at || new Date().toISOString(),
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
            return p;
          });

          for (let i = 0; i < txsToUpsert.length; i += 500) {
            const batch = txsToUpsert.slice(i, i + 500);
            const { error: batchErr } = await supabase.from('transactions').upsert(batch);
            if (batchErr) {
              await supabaseAdmin.from('transactions').upsert(batch);
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
