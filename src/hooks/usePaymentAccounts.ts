import React, { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PaymentAccount,
  CustomPaymentMethod,
  PaymentMethod,
  Transaction,
  Category,
  Profile,
  Ledger,
} from '../types/database';
import { generateUUID } from '../lib/uuid';
import { safeAlert, isAccountBoundToUser } from '../lib/ledgerUtils';
import { isAccountBelongingToMember, DEFAULT_PAYMENT_METHODS, KNOWN_PAYMENT_METHOD_UUIDS } from '../lib/payment';
import { STORAGE_KEYS, DEFAULT_CATEGORIES } from '../constants/ledgerDefaults';
import { isDemoLedgerId } from '../constants/sweethomeDemo';
import { scheduleBillingReminderNotifications } from '../lib/billingNotifications';
import { findExistingCarrierAccount } from '../lib/cloudInvoiceSync';
// supabaseAdmin removed for zero-token security

export interface UsePaymentAccountsProps {
  currentLedger: Ledger;
  currentUser: Profile;
  effectiveCurrentUser?: Profile;
  effectiveIsOwner: boolean;
  members: Profile[];
  categories: Category[];
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  saveTransactionsToStorage: (txs: Transaction[]) => Promise<void>;
  addTransaction: (data: any) => Promise<string>;
  isConfigured: boolean;
  supabase: any;
  getMemberById?: (id?: string) => Profile | undefined;
}

export function usePaymentAccounts({
  currentLedger,
  currentUser,
  effectiveCurrentUser,
  effectiveIsOwner,
  members,
  categories,
  transactions,
  setTransactions,
  saveTransactionsToStorage,
  addTransaction,
  isConfigured,
  supabase,
  getMemberById,
}: UsePaymentAccountsProps) {
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const paymentAccountsRef = useRef<PaymentAccount[]>([]);
  paymentAccountsRef.current = paymentAccounts;
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>(DEFAULT_PAYMENT_METHODS);

  // 關鍵隔離防線：當帳本切換時，自動將內部卡片狀態過濾為當前帳本，杜絕跨帳本殘留
  useEffect(() => {
    if (currentLedger?.id) {
      setPaymentAccounts(prev => {
        const next = prev.filter(a => a.ledger_id === currentLedger.id);
        paymentAccountsRef.current = next;
        return next;
      });
    }
  }, [currentLedger?.id]);

  // 儲存付款帳戶至本地快取
  const savePaymentAccountsToStorage = useCallback(async (accounts: PaymentAccount[]) => {
    try {
      if (currentLedger?.id) {
        const scoped = accounts.filter(a => a.ledger_id === currentLedger.id);
        await AsyncStorage.setItem(`${STORAGE_KEYS.PAYMENT_ACCOUNTS}_${currentLedger.id}`, JSON.stringify(scoped));
        await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify(scoped));
      } else {
        await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify(accounts));
      }
    } catch (e) {
      console.warn('儲存付款帳戶快取失敗:', e);
    }
  }, [currentLedger?.id]);

  const isAccountBound = useCallback(
    (userId?: string | null) => isAccountBoundToUser(userId, effectiveCurrentUser || currentUser, members, getMemberById),
    [effectiveCurrentUser, currentUser, members, getMemberById]
  );

  // 輔助函式：將單筆帳號更新寫入雲端（兼容舊版資料庫無 issuer_bank / payment_due_day 欄位之情境）
  const persistAccountUpdateToCloud = useCallback(async (id: string, data: Partial<PaymentAccount>) => {
    if (!isConfigured || isDemoLedgerId(currentLedger.id)) return;
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('secure_update_payment_account', {
        p_account_id: id,
        p_payload: data,
      });
      if (rpcErr || (rpcRes && rpcRes.success === false)) {
        let { error: updErr } = await supabase
          .from('payment_accounts')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (
          updErr &&
          (updErr.code === '42703' ||
            updErr.code === 'PGRST204' ||
            updErr.message?.includes('card_number') ||
            updErr.message?.includes('issuer_bank') ||
            updErr.message?.includes('payment_due_day'))
        ) {
          const { card_number: _c, issuer_bank: _i, payment_due_day: _d, ...fallbackData } = data;
          await supabase
            .from('payment_accounts')
            .update({ ...fallbackData, updated_at: new Date().toISOString() })
            .eq('id', id);
        }
      } else {
        const patchPayload: Record<string, any> = {};
        if (rpcRes?.issuer_bank_supported !== true && Object.prototype.hasOwnProperty.call(data, 'issuer_bank')) {
          patchPayload.issuer_bank = data.issuer_bank ?? null;
        }
        if (rpcRes?.payment_due_day_supported !== true && Object.prototype.hasOwnProperty.call(data, 'payment_due_day')) {
          patchPayload.payment_due_day = data.payment_due_day ?? null;
        }
        if (Object.keys(patchPayload).length > 0) {
          patchPayload.updated_at = new Date().toISOString();
          try {
            await supabase.from('payment_accounts').update(patchPayload).eq('id', id);
          } catch {}
        }
      }
    } catch (e) {
      console.warn('雲端更新付款帳戶失敗:', e);
    }
  }, [isConfigured, currentLedger.id, supabase]);

  // 新增付款帳戶 / 信用卡 / 儲值卡
  const addPaymentAccount = useCallback(async (accountData: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>): Promise<PaymentAccount> => {
    const isTargetingSelf = !accountData.user_id || isAccountBound(accountData.user_id);
    if (!effectiveIsOwner && !isTargetingSelf) {
      safeAlert('權限不足', '只有帳本管理員才能新增全家或其他成員的支付卡片與帳戶');
      throw new Error('只有帳本管理員才能新增全家或其他成員的支付卡片與帳戶');
    }

    const currentScoped = paymentAccountsRef.current.filter(a => a.ledger_id === currentLedger.id);

    // 載具防重複保護：同一帳本同載具代碼（不分大小寫與空白）若已存在 type === 'carrier'，直接轉更新既有帳戶
    if (accountData.type === 'carrier' && accountData.card_number?.trim()) {
      const existingCarrier = findExistingCarrierAccount(
        currentScoped,
        accountData.card_number,
        currentLedger.id
      );
      if (existingCarrier) {
        const trimmedCardNo = accountData.card_number.trim();
        const nowIso = new Date().toISOString();
        const patchPayload: Partial<PaymentAccount> = {
          user_id: accountData.user_id !== undefined ? accountData.user_id : existingCarrier.user_id,
          name: existingCarrier.name || accountData.name,
          card_number: existingCarrier.card_number || trimmedCardNo,
          updated_at: nowIso,
        };
        const mergedCarrier: PaymentAccount = {
          ...existingCarrier,
          ...patchPayload,
        };
        const updated = currentScoped.map(a => (a.id === existingCarrier.id ? mergedCarrier : a));
        paymentAccountsRef.current = updated;
        setPaymentAccounts(updated);
        await savePaymentAccountsToStorage(updated);

        if (currentLedger?.id) {
          AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNTS_INITIALIZED}_${currentLedger.id}`, 'true').catch(() => {});
        }

        await persistAccountUpdateToCloud(existingCarrier.id, patchPayload);
        return mergedCarrier;
      }
    }

    const newAcc: PaymentAccount = {
      ...accountData,
      card_number: typeof accountData.card_number === 'string' ? accountData.card_number.trim() : accountData.card_number,
      id: generateUUID(),
      ledger_id: currentLedger.id,
      created_at: new Date().toISOString(),
      balance: accountData.balance ?? 0,
    };
    const updated = [...currentScoped, newAcc];
    paymentAccountsRef.current = updated;
    setPaymentAccounts(updated);
    await savePaymentAccountsToStorage(updated);

    if (currentLedger?.id) {
      AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNTS_INITIALIZED}_${currentLedger.id}`, 'true').catch(() => {});
    }

    if (isConfigured && !isDemoLedgerId(currentLedger.id)) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('secure_add_payment_account', {
          p_account: newAcc,
        });
        if (rpcErr || (rpcRes && rpcRes.success === false)) {
          const isTypeCheckErr =
            rpcErr?.message?.includes('payment_accounts_type_check') ||
            rpcRes?.error?.includes('payment_accounts_type_check');

          const payloadAcc = (isTypeCheckErr && newAcc.type === 'carrier')
            ? { ...newAcc, type: 'other' as const }
            : newAcc;

          let { error: insErr } = await supabase.from('payment_accounts').insert(payloadAcc);
          if (
            insErr &&
            (insErr.code === '42703' ||
              insErr.code === 'PGRST204' ||
              insErr.message?.includes('card_number') ||
              insErr.message?.includes('issuer_bank') ||
              insErr.message?.includes('payment_due_day'))
          ) {
            const { card_number: _c, issuer_bank: _i, payment_due_day: _d, ...fallbackAcc } = payloadAcc;
            await supabase.from('payment_accounts').insert(fallbackAcc);
          }
        } else {
          const patchPayload: Record<string, any> = {};
          if (rpcRes?.issuer_bank_supported !== true && newAcc.issuer_bank) {
            patchPayload.issuer_bank = newAcc.issuer_bank;
          }
          if (rpcRes?.payment_due_day_supported !== true && newAcc.payment_due_day !== undefined && newAcc.payment_due_day !== null) {
            patchPayload.payment_due_day = newAcc.payment_due_day;
          }
          if (Object.keys(patchPayload).length > 0) {
            try {
              await supabase.from('payment_accounts').update(patchPayload).eq('id', newAcc.id);
            } catch {}
          }
        }
      } catch (e) {
        console.warn('雲端新增付款帳戶連線失敗 (已保留本地):', e);
      }
    }
    if (newAcc.type === 'credit_card') {
      scheduleBillingReminderNotifications(updated, transactions, currentUser?.id, getMemberById).catch(() => {});
    }
    return newAcc;
  }, [effectiveIsOwner, isAccountBound, currentLedger.id, savePaymentAccountsToStorage, persistAccountUpdateToCloud, isConfigured, supabase, transactions, currentUser?.id, getMemberById]);

  // 修改付款帳戶
  const updatePaymentAccount = useCallback(async (id: string, data: Partial<PaymentAccount>): Promise<boolean> => {
    const currentAccounts = paymentAccountsRef.current;
    const existing = currentAccounts.find(a => a.id === id);
    const isOwnerOfCard = existing && isAccountBound(existing.user_id);
    const isChangingToOther = data.user_id !== undefined && data.user_id !== null && !isAccountBound(data.user_id);

    if (!effectiveIsOwner && (!isOwnerOfCard || isChangingToOther)) {
      safeAlert('權限不足', '只有帳本管理員才能修改全家或其他成員的支付卡片與帳戶');
      return false;
    }

    const updated = currentAccounts.map(a => a.id === id ? { ...a, ...data } : a);
    paymentAccountsRef.current = updated;
    setPaymentAccounts(updated);
    await savePaymentAccountsToStorage(updated);

    if (currentLedger?.id) {
      AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNTS_INITIALIZED}_${currentLedger.id}`, 'true').catch(() => {});
    }

    await persistAccountUpdateToCloud(id, data);
    if (existing?.type === 'credit_card' || data.type === 'credit_card') {
      scheduleBillingReminderNotifications(updated, transactions, currentUser?.id, getMemberById).catch(() => {});
    }
    return true;
  }, [isAccountBound, effectiveIsOwner, savePaymentAccountsToStorage, currentLedger.id, persistAccountUpdateToCloud, transactions, currentUser?.id, getMemberById]);

  // 批次同步同持卡人同發卡銀行多張信用卡之結帳日與繳款截止日（單次更新本機避免閉包覆蓋，並同步雲端與提醒排程）
  const syncPaymentAccountsBillingDates = useCallback(async (
    targetIds: string[],
    billingCycleDate: number,
    paymentDueDay: number | null
  ): Promise<boolean> => {
    const cleanIds = Array.from(new Set(targetIds.filter(Boolean)));
    if (cleanIds.length === 0) return true;

    const validCycle = Math.max(1, Math.min(31, Math.trunc(billingCycleDate)));
    const validDue =
      paymentDueDay !== null && paymentDueDay !== undefined && Number.isFinite(paymentDueDay)
        ? Math.max(1, Math.min(31, Math.trunc(paymentDueDay)))
        : null;

    const idSet = new Set(cleanIds);
    const latestAccounts = paymentAccountsRef.current;
    const updated = latestAccounts.map(a => {
      if (!idSet.has(a.id)) return a;
      const isOwnerOfCard = isAccountBound(a.user_id);
      if (!effectiveIsOwner && !isOwnerOfCard) return a;
      return {
        ...a,
        billing_cycle_date: validCycle,
        payment_due_day: validDue,
      };
    });

    paymentAccountsRef.current = updated;
    setPaymentAccounts(updated);
    await savePaymentAccountsToStorage(updated);

    const authorizedIds = cleanIds.filter(id => {
      const acc = latestAccounts.find(a => a.id === id);
      return acc && (effectiveIsOwner || isAccountBound(acc.user_id));
    });

    for (const id of authorizedIds) {
      await persistAccountUpdateToCloud(id, {
        billing_cycle_date: validCycle,
        payment_due_day: validDue,
      });
    }

    scheduleBillingReminderNotifications(updated, transactions, currentUser?.id, getMemberById).catch(() => {});
    return true;
  }, [paymentAccounts, isAccountBound, effectiveIsOwner, savePaymentAccountsToStorage, persistAccountUpdateToCloud, transactions, currentUser?.id, getMemberById]);

  // 刪除付款帳戶
  const deletePaymentAccount = useCallback(async (id: string): Promise<boolean> => {
    const currentAccounts = paymentAccountsRef.current;
    const deletedAcc = currentAccounts.find(a => a.id === id);
    const isOwnerOfCard = deletedAcc && isAccountBound(deletedAcc.user_id);

    if (!effectiveIsOwner && !isOwnerOfCard) {
      safeAlert('權限不足', '只有帳本管理員才能刪除全家或其他成員的支付卡片與帳戶');
      return false;
    }

    const updated = currentAccounts.filter(a => a.id !== id);
    paymentAccountsRef.current = updated;
    setPaymentAccounts(updated);
    await savePaymentAccountsToStorage(updated);

    if (currentLedger?.id) {
      try {
        const deletedKey = `${STORAGE_KEYS.DELETED_ACCOUNT_IDS}_${currentLedger.id}`;
        const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
        const deletedList: string[] = savedDeletedStr ? JSON.parse(savedDeletedStr) : [];
        if (!deletedList.includes(id)) deletedList.push(id);
        if (deletedAcc && deletedAcc.name && !deletedList.includes(deletedAcc.name)) {
          deletedList.push(deletedAcc.name);
        }
        await AsyncStorage.setItem(deletedKey, JSON.stringify(deletedList));
        await AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNTS_INITIALIZED}_${currentLedger.id}`, 'true');
      } catch (err) {
        console.warn('紀錄刪除卡片失敗:', err);
      }
    }

    if (isConfigured && !isDemoLedgerId(currentLedger.id)) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('secure_delete_payment_account', {
          p_account_id: id,
        });
        if (rpcErr || (rpcRes && rpcRes.success === false)) {
          await supabase.from('payment_accounts').delete().eq('id', id);
        }
      } catch (e) {
        console.warn('雲端刪除付款帳戶失敗:', e);
      }
    }
    if (deletedAcc?.type === 'credit_card') {
      scheduleBillingReminderNotifications(updated, transactions, currentUser?.id, getMemberById).catch(() => {});
    }
    return true;
  }, [isAccountBound, effectiveIsOwner, savePaymentAccountsToStorage, currentLedger?.id, isConfigured, supabase, transactions, currentUser?.id, getMemberById]);

  // 一鍵補齊 / 恢復預設示範卡片組合
  const restoreDefaultAccounts = useCallback(async () => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能恢復預設支付卡片');
      return;
    }
    if (!currentLedger?.id) return;
    try {
      const deletedKey = `${STORAGE_KEYS.DELETED_ACCOUNT_IDS}_${currentLedger.id}`;
      await AsyncStorage.removeItem(deletedKey);

      const defaultOwnerId = currentUser?.id || members[0]?.id;
      const secondOwner = members.find(m => m.id !== defaultOwnerId);
      const secondOwnerId = secondOwner?.id || defaultOwnerId;

      const defaultPresets: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>[] = [
        {
          name: '富邦 Costco 聯名卡',
          type: 'credit_card',
          user_id: defaultOwnerId,
          last_four_digits: '8829',
          billing_cycle_date: 15,
          balance: 0,
          color: '#1E40AF',
          icon: '💳',
          sort_order: 1,
        },
        {
          name: '國泰 CUBE 卡',
          type: 'credit_card',
          user_id: secondOwnerId,
          last_four_digits: '1234',
          billing_cycle_date: 27,
          balance: 0,
          color: '#047857',
          icon: '💳',
          sort_order: 2,
        },
        {
          name: '爸爸悠遊卡',
          type: 'stored_value',
          user_id: defaultOwnerId,
          last_four_digits: '',
          balance: 350,
          color: '#0284C7',
          icon: '🚌',
          sort_order: 3,
        },
        {
          name: '媽媽悠遊卡',
          type: 'stored_value',
          user_id: secondOwnerId,
          last_four_digits: '',
          balance: 500,
          color: '#EC4899',
          icon: '🚌',
          sort_order: 4,
        },
      ];

      const toInsert: PaymentAccount[] = [];
      for (const preset of defaultPresets) {
        const alreadyExists = paymentAccounts.some(
          a => a.name.trim() === preset.name.trim() ||
               (preset.last_four_digits && a.last_four_digits === preset.last_four_digits)
        );
        if (!alreadyExists) {
          toInsert.push({
            ...preset,
            id: generateUUID(),
            ledger_id: currentLedger.id,
            created_at: new Date().toISOString(),
          });
        }
      }

      if (toInsert.length > 0) {
        const updated = [...paymentAccounts, ...toInsert];
        setPaymentAccounts(updated);
        await savePaymentAccountsToStorage(updated);
        if (isConfigured && !isDemoLedgerId(currentLedger.id)) {
          try {
            for (const acc of toInsert) {
              await supabase.rpc('secure_add_payment_account', { p_account: acc });
            }
          } catch (e) {
            console.warn('恢復預設卡片至雲端失敗:', e);
          }
        }
      }
    } catch (err) {
      console.warn('恢復預設卡片失敗:', err);
    }
  }, [effectiveIsOwner, currentLedger?.id, currentUser?.id, members, paymentAccounts, savePaymentAccountsToStorage, isConfigured, supabase]);

  const savePaymentMethodsToStorage = useCallback(async (methods: CustomPaymentMethod[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_METHODS, JSON.stringify(methods));
      if (currentLedger?.id) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.PAYMENT_METHODS}_${currentLedger.id}`, JSON.stringify(methods));
      }
    } catch (e) {
      console.warn('儲存付款方式快取失敗:', e);
    }
  }, [currentLedger?.id]);

  // 新增自訂付款方式 (僅管理員有權限，雲端同步定義)
  const addPaymentMethod = useCallback(async (
    data: Omit<CustomPaymentMethod, 'id' | 'sort_order'>
  ): Promise<CustomPaymentMethod> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能新增付款方式');
      throw new Error('只有帳本管理員才能新增付款方式');
    }
    const newId = generateUUID();
    const maxOrder = paymentMethods.reduce((max, m) => Math.max(max, m.sort_order || 0), 0);
    const newMethod: CustomPaymentMethod = {
      ...data,
      id: newId,
      ledger_id: currentLedger.id,
      sort_order: maxOrder + 1,
      is_enabled: data.is_enabled ?? true,
      is_system: false,
      created_at: new Date().toISOString(),
    };

    const updated = [...paymentMethods, newMethod];
    setPaymentMethods(updated);
    await savePaymentMethodsToStorage(updated);

    if (isConfigured && !isDemoLedgerId(currentLedger.id)) {
      try {
        const methodPayload = {
          id: newId,
          ledger_id: currentLedger.id,
          name: newMethod.name,
          icon: newMethod.icon,
          color: newMethod.color,
          type: newMethod.type || (newMethod.supports_credit_card ? 'e_wallet' : 'other'),
          supports_credit_card: !!newMethod.supports_credit_card,
          is_system: false,
          sort_order: newMethod.sort_order,
        };
        await supabase.from('payment_methods').insert(methodPayload);
      } catch (cloudErr) {
        console.warn('雲端新增付款方式失敗 (已保留本地):', cloudErr);
      }
    }

    return newMethod;
  }, [effectiveIsOwner, paymentMethods, currentLedger.id, savePaymentMethodsToStorage, isConfigured, supabase]);

  // 編輯付款方式
  const updatePaymentMethod = useCallback(async (
    id: string,
    data: Partial<CustomPaymentMethod>
  ): Promise<boolean> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能修改付款方式');
      return false;
    }
    const updated = paymentMethods.map(m => {
      if (m.id === id) {
        return {
          ...m,
          ...data,
          is_enabled: id === 'cash' ? true : (data.is_enabled ?? m.is_enabled),
        };
      }
      return m;
    });
    setPaymentMethods(updated);
    await savePaymentMethodsToStorage(updated);

    if (isConfigured && !isDemoLedgerId(currentLedger.id)) {
      try {
        const updatePayload: any = { updated_at: new Date().toISOString() };
        if (data.name !== undefined) updatePayload.name = data.name;
        if (data.icon !== undefined) updatePayload.icon = data.icon;
        if (data.color !== undefined) updatePayload.color = data.color;
        if (data.type !== undefined) updatePayload.type = data.type;
        if (data.supports_credit_card !== undefined) updatePayload.supports_credit_card = data.supports_credit_card;

        await supabase
          .from('payment_methods')
          .update(updatePayload)
          .match({ ledger_id: currentLedger.id, id });
      } catch (cloudErr) {
        console.warn('雲端更新付款方式失敗:', cloudErr);
      }
    }

    return true;
  }, [effectiveIsOwner, paymentMethods, savePaymentMethodsToStorage, isConfigured, currentLedger.id, supabase]);

  // 刪除付款方式
  const deletePaymentMethod = useCallback(async (id: string): Promise<boolean> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能刪除付款方式');
      return false;
    }
    const target = paymentMethods.find(m => m.id === id);
    if (target?.is_system) {
      safeAlert('無法刪除', '系統預設的付款方式不可刪除，但您可以將其開關切換為「停用/隱藏」！');
      return false;
    }
    const updated = paymentMethods.filter(m => m.id !== id);
    setPaymentMethods(updated);
    await savePaymentMethodsToStorage(updated);

    if (isConfigured && !isDemoLedgerId(currentLedger.id)) {
      try {
        await supabase
          .from('payment_methods')
          .delete()
          .match({ ledger_id: currentLedger.id, id });
      } catch (cloudErr) {
        console.warn('雲端刪除付款方式失敗:', cloudErr);
      }
    }

    return true;
  }, [effectiveIsOwner, paymentMethods, savePaymentMethodsToStorage, isConfigured, currentLedger.id, supabase]);

  // 切換啟用/停用
  const togglePaymentMethodEnabled = useCallback(async (id: string): Promise<boolean> => {
    if (id === 'cash') {
      safeAlert('不可隱藏', '💵 現金為系統最基本的付款方式，必須保留至少一種付款方式，無法隱藏。');
      return false;
    }
    const updated = paymentMethods.map(m => (m.id === id ? { ...m, is_enabled: !m.is_enabled } : m));
    setPaymentMethods(updated);
    await savePaymentMethodsToStorage(updated);
    return true;
  }, [paymentMethods, savePaymentMethodsToStorage]);

  // 調整排序
  const reorderPaymentMethods = useCallback(async (methods: CustomPaymentMethod[]): Promise<void> => {
    const reordered = methods.map((m, idx) => ({ ...m, sort_order: idx + 1 }));
    setPaymentMethods(reordered);
    await savePaymentMethodsToStorage(reordered);
  }, [savePaymentMethodsToStorage]);

  // 恢復預設付款方式清單
  const restoreDefaultPaymentMethods = useCallback(async (): Promise<void> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能恢復預設付款方式清單');
      return;
    }
    setPaymentMethods(DEFAULT_PAYMENT_METHODS);
    await savePaymentMethodsToStorage(DEFAULT_PAYMENT_METHODS);
  }, [effectiveIsOwner, savePaymentMethodsToStorage]);

  // 取得付款方式資訊輔助函式
  const getPaymentMethodById = useCallback((id?: string): CustomPaymentMethod | undefined => {
    if (!id) return undefined;
    const normalizedId = KNOWN_PAYMENT_METHOD_UUIDS[id] || id;
    return (
      paymentMethods.find(m => m.id === id || m.id === normalizedId) ||
      DEFAULT_PAYMENT_METHODS.find(m => m.id === id || m.id === normalizedId)
    );
  }, [paymentMethods]);

  // 雙軌雲端同步卡片帳戶餘額 (優先呼叫 SECURITY DEFINER RPC，無需 service_role 金鑰即可安全更新)
  const syncAccountBalanceToCloud = useCallback(async (accountId: string, balance: number) => {
    if (!isConfigured || isDemoLedgerId(currentLedger.id) || !accountId || accountId.startsWith('50000000')) return;
    const payload = { balance, updated_at: new Date().toISOString() };
    try {
      const { data, error } = await supabase
        .from('payment_accounts')
        .update(payload)
        .eq('id', accountId)
        .select('id');
      if (error || !data || data.length === 0) {
        await supabase.rpc('secure_update_account_balance', {
          p_account_id: accountId,
          p_balance: balance,
        });
      }
    } catch {
      try {
        await supabase.rpc('secure_update_account_balance', {
          p_account_id: accountId,
          p_balance: balance,
        });
      } catch {}
    }
  }, [isConfigured, currentLedger.id, supabase]);

  // 加值儲值卡
  const topUpAccountBalance = useCallback(async (
    id: string,
    topUpAmount: number,
    options?: {
      sourceType?: PaymentMethod | 'cash' | 'credit_card' | 'transfer' | string;
      sourceAccountId?: string;
      payerId?: string;
      recordExpense?: boolean;
      note?: string;
    } | string
  ): Promise<boolean> => {
    try {
      const targetAcc = paymentAccounts.find(a => a.id === id);
      if (!targetAcc) return false;

      const opts = typeof options === 'string' ? { note: options } : (options || {});
      const recordExpense = opts.recordExpense !== false;
      const sourceType = (opts.sourceType || 'cash') as PaymentMethod;
      const sourceAccountId = opts.sourceAccountId;

      const newBalance = Number((targetAcc.balance + topUpAmount).toFixed(2));
      let updatedAccounts = paymentAccounts.map(a => a.id === id ? { ...a, balance: newBalance } : a);

      if (sourceAccountId && sourceAccountId !== id) {
        const sourceAcc = paymentAccounts.find(a => a.id === sourceAccountId);
        if (sourceAcc && sourceAcc.type === 'stored_value') {
          const srcNewBal = Number((sourceAcc.balance - topUpAmount).toFixed(2));
          updatedAccounts = updatedAccounts.map(a => a.id === sourceAccountId ? { ...a, balance: srcNewBal } : a);
          syncAccountBalanceToCloud(sourceAccountId, srcNewBal);
        }
      }

      setPaymentAccounts(updatedAccounts);
      await savePaymentAccountsToStorage(updatedAccounts);

      syncAccountBalanceToCloud(id, newBalance);

      if (recordExpense) {
        const trafficCat = categories.find(c => c.name.includes('交通') || c.name.includes('儲值'))
          || categories[0]
          || DEFAULT_CATEGORIES[0];

        const candidatePayerId = opts.payerId || targetAcc.user_id || currentUser.id;
        const matchedPayer = members.find(m => m.id === candidatePayerId)
          || members.find(m => m.id === currentUser.id)
          || members[0];
        const validPaidBy = matchedPayer?.id || currentUser.id;

        const isEasyCard = targetAcc.name.includes('悠遊') || targetAcc.name.includes('市民');
        const defaultMerchant = isEasyCard ? '悠遊卡加值' : `${targetAcc.name}加值`;

        await addTransaction({
          amount: topUpAmount,
          type: 'transfer',
          category_id: trafficCat ? trafficCat.id : categories[0]?.id,
          paid_by: validPaidBy,
          merchant: defaultMerchant,
          payment_method: sourceType,
          account_id: sourceAccountId,
          linked_transaction_id: targetAcc.id,
          note: opts.note !== undefined ? opts.note : `存入【${targetAcc.name}】`,
          transacted_at: new Date().toISOString(),
        });
      }

      return true;
    } catch (e) {
      console.warn('加值失敗:', e);
      return false;
    }
  }, [paymentAccounts, isConfigured, currentLedger.id, savePaymentAccountsToStorage, categories, currentUser.id, members, addTransaction, supabase]);

  // 直接校正儲值卡餘額
  const adjustAccountBalance = useCallback(async (id: string, newBalance: number): Promise<boolean> => {
    const targetAcc = paymentAccounts.find(a => a.id === id);
    const isOwnerOfCard = targetAcc && isAccountBound(targetAcc.user_id);

    if (!effectiveIsOwner && !isOwnerOfCard) {
      safeAlert('權限不足', '只有帳本管理員或持卡人本人才能校正卡片餘額');
      return false;
    }
    try {
      const updatedAccounts = paymentAccounts.map(a => a.id === id ? { ...a, balance: Number(newBalance.toFixed(2)) } : a);
      setPaymentAccounts(updatedAccounts);
      await savePaymentAccountsToStorage(updatedAccounts);

      syncAccountBalanceToCloud(id, Number(newBalance.toFixed(2)));
      return true;
    } catch (e) {
      console.warn('校正餘額失敗:', e);
      return false;
    }
  }, [paymentAccounts, isAccountBound, effectiveIsOwner, savePaymentAccountsToStorage, syncAccountBalanceToCloud]);

  // 切換特定交易的信用卡對帳核銷狀態 (is_reconciled，支援雙軌服務權杖穿透)
  const toggleReconcileTransaction = useCallback(async (transactionId: string): Promise<boolean> => {
    try {
      let nextReconciled = false;
      const updated = transactions.map(t => {
        if (t.id === transactionId) {
          nextReconciled = !t.is_reconciled;
          return { ...t, is_reconciled: nextReconciled };
        }
        return t;
      });
      setTransactions(updated);
      await saveTransactionsToStorage(updated);

      if (isConfigured && !isDemoLedgerId(currentLedger.id)) {
        try {
          const { data: recRows, error: recErr } = await supabase
            .from('transactions')
            .update({ is_reconciled: nextReconciled })
            .eq('id', transactionId)
            .select('id');
          if (recErr || !recRows || recRows.length === 0) {
            await supabase.rpc('secure_update_transaction', {
              p_tx_id: transactionId,
              p_payload: { is_reconciled: nextReconciled },
            });
          }
        } catch {}
      }
      return true;
    } catch (e) {
      console.warn('切換對帳狀態失敗:', e);
      return false;
    }
  }, [transactions, setTransactions, saveTransactionsToStorage, isConfigured, currentLedger.id, supabase]);

  // 透過 ID 取得卡片帳戶資料
  const getAccountById = useCallback(
    (id?: string): PaymentAccount | undefined => {
      if (!id) return undefined;
      const found = paymentAccounts.find(a => a.id === id);
      if (found) return found;

      if (id === '50000000-0000-4000-8000-000000000001') {
        return paymentAccounts.find(a => a.name.includes('富邦') || a.last_four_digits === '8829');
      }
      if (id === '50000000-0000-4000-8000-000000000002') {
        return paymentAccounts.find(a => a.name.includes('國泰') || a.last_four_digits === '1234');
      }
      if (id === '50000000-0000-4000-8000-000000000003') {
        return paymentAccounts.find(a => a.name.includes('爸爸') && a.type === 'stored_value') || paymentAccounts.find(a => a.type === 'stored_value');
      }
      if (id === '50000000-0000-4000-8000-000000000004') {
        return paymentAccounts.find(a => a.name.includes('媽媽') && a.type === 'stored_value');
      }

      return undefined;
    },
    [paymentAccounts]
  );

  // 家庭與個人財務淨值看板計算
  const getNetWorthSummary = useCallback(
    (targetMemberId?: string) => {
      const targetMember =
        !targetMemberId || targetMemberId === 'all'
          ? undefined
          : members.find(m => m.id === targetMemberId) || (currentUser?.id === targetMemberId ? currentUser : undefined);

      const isAccountBelonging = (acc: PaymentAccount) =>
        isAccountBelongingToMember(acc, targetMemberId, targetMember, currentUser, members, getMemberById);

      const banks = paymentAccounts.filter(a => a.type === 'bank' && isAccountBelonging(a));
      const cash = paymentAccounts.filter(a => a.type === 'cash' && isAccountBelonging(a));
      const storedValues = paymentAccounts.filter(a => a.type === 'stored_value' && isAccountBelonging(a));
      const creditCardsList = paymentAccounts.filter(a => a.type === 'credit_card' && isAccountBelonging(a));

      const bankTotal = banks.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
      const cashTotal = cash.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
      const storedValueTotal = storedValues.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

      let creditCardTotal = 0;
      const creditCardsWithDebt = creditCardsList.map(card => {
        const cardExpenses = transactions
          .filter(
            t =>
              t.type === 'expense' &&
              (t.account_id === card.id ||
                (t.payment_method === 'credit_card' &&
                  !t.account_id &&
                  (t.paid_by === card.user_id ||
                    (getMemberById &&
                      card.user_id &&
                      getMemberById(t.paid_by)?.display_name &&
                      getMemberById(t.paid_by)?.display_name === getMemberById(card.user_id)?.display_name)))) &&
              !t.is_reconciled
          )
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const cardPayments = transactions
          .filter(t => t.type === 'transfer' && t.linked_transaction_id === card.id)
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const baseBal = card.balance < 0 ? Math.abs(card.balance) : 0;
        const outstandingDebt = Math.max(0, cardExpenses + baseBal - cardPayments);
        creditCardTotal += outstandingDebt;

        return {
          ...card,
          outstandingDebt,
        };
      });

      const totalAssets = Number((bankTotal + cashTotal + storedValueTotal).toFixed(2));
      const totalLiabilities = Number(creditCardTotal.toFixed(2));
      const netWorth = Number((totalAssets - totalLiabilities).toFixed(2));

      return {
        totalAssets,
        totalLiabilities,
        netWorth,
        bankTotal,
        cashTotal,
        storedValueTotal,
        creditCardTotal,
        accounts: {
          banks,
          cash,
          storedValues,
          creditCards: creditCardsWithDebt,
        },
      };
    },
    [paymentAccounts, transactions, members, currentUser, getMemberById]
  );

  // 帳戶互轉、提款與繳卡費核心方法
  const executeTransfer = useCallback(async (params: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    fee?: number;
    payerId?: string;
    transactedAt?: string;
    note?: string;
  }): Promise<{ success: boolean; error?: string; transactionId?: string }> => {
    const { fromAccountId, toAccountId, amount, fee = 0, payerId, transactedAt, note } = params;

    if (!fromAccountId || !toAccountId) {
      return { success: false, error: '請選擇轉出與轉入帳戶' };
    }
    if (fromAccountId === toAccountId) {
      return { success: false, error: '轉出與轉入帳戶不能相同' };
    }
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: '請輸入大於 0 的有效轉帳金額' };
    }

    const fromAcc = paymentAccounts.find(a => a.id === fromAccountId);
    const toAcc = paymentAccounts.find(a => a.id === toAccountId);

    if (!fromAcc || !toAcc) {
      return { success: false, error: '找不到指定的轉出或轉入帳戶' };
    }

    const now = new Date();
    const txTime = transactedAt || now.toISOString();
    const effectivePayer = payerId || fromAcc.user_id || currentUser.id;

    try {
      const fromNewBal = Number((fromAcc.balance - amount - (fee > 0 ? fee : 0)).toFixed(2));
      const toNewBal = Number((toAcc.balance + amount).toFixed(2));

      const updatedAccounts = paymentAccounts.map(a => {
        if (a.id === fromAccountId) return { ...a, balance: fromNewBal };
        if (a.id === toAccountId) return { ...a, balance: toNewBal };
        return a;
      });

      setPaymentAccounts(updatedAccounts);
      await savePaymentAccountsToStorage(updatedAccounts);

      if (isConfigured && !isDemoLedgerId(currentLedger.id)) {
        if (!fromAccountId.startsWith('50000000')) {
          syncAccountBalanceToCloud(fromAccountId, fromNewBal);
        }
        if (!toAccountId.startsWith('50000000')) {
          syncAccountBalanceToCloud(toAccountId, toNewBal);
        }
      }

      const isCardPayment = toAcc.type === 'credit_card';
      const isTopUp = toAcc.type === 'stored_value';
      const defaultMerchant = isCardPayment
        ? `繳納【${toAcc.name}】卡費`
        : isTopUp
        ? `存入【${toAcc.name}】`
        : `轉入【${toAcc.name}】`;

      const defaultNote = note
        ? note
        : isCardPayment
        ? `從【${fromAcc.name}】轉帳繳清卡費`
        : `從【${fromAcc.name}】轉帳至【${toAcc.name}】`;

      const transferCat = categories.find(c => c.name.includes('轉帳') || c.name.includes('金融') || c.name.includes('交通') || c.name.includes('其他'))
        || categories[0];

      const createdTxId = await addTransaction({
        amount,
        type: 'transfer',
        category_id: transferCat?.id || categories[0]?.id,
        paid_by: effectivePayer,
        account_id: fromAccountId,
        linked_transaction_id: toAccountId,
        merchant: defaultMerchant,
        note: defaultNote,
        transacted_at: txTime,
      });

      if (fee > 0) {
        const feeCat = categories.find(c => c.name.includes('手續') || c.name.includes('金融') || c.name.includes('其他'))
          || categories[0];

        await addTransaction({
          amount: fee,
          type: 'expense',
          category_id: feeCat?.id || categories[0]?.id,
          paid_by: effectivePayer,
          account_id: fromAccountId,
          merchant: '銀行跨行手續費',
          note: `【${fromAcc.name}】跨行轉帳至【${toAcc.name}】手續費`,
          transacted_at: txTime,
        });
      }

      return { success: true, transactionId: createdTxId };
    } catch (err: any) {
      console.warn('執行帳戶轉帳失敗:', err);
      return { success: false, error: err?.message || '執行轉帳時發生錯誤' };
    }
  }, [paymentAccounts, categories, currentUser.id, currentLedger.id, isConfigured, addTransaction, savePaymentAccountsToStorage, supabase]);

  return {
    paymentAccounts,
    setPaymentAccounts,
    paymentMethods,
    setPaymentMethods,
    addPaymentAccount,
    updatePaymentAccount,
    syncPaymentAccountsBillingDates,
    deletePaymentAccount,
    restoreDefaultAccounts,
    savePaymentAccountsToStorage,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    togglePaymentMethodEnabled,
    reorderPaymentMethods,
    restoreDefaultPaymentMethods,
    getPaymentMethodById,
    savePaymentMethodsToStorage,
    topUpAccountBalance,
    adjustAccountBalance,
    toggleReconcileTransaction,
    getAccountById,
    getNetWorthSummary,
    executeTransfer,
  };
}

