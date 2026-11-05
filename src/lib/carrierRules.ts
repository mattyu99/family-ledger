import AsyncStorage from '@react-native-async-storage/async-storage';
import { CarrierRule } from '../types/database';
import { STORAGE_KEYS } from '../constants/ledgerDefaults';
import { generateUUID } from './uuid';
import { supabase, isConfigured } from './supabase';

export const getCarrierRulesStorageKey = (ledgerId: string): string => {
  return `${STORAGE_KEYS.CARRIER_RULES || '@family_ledger_carrier_rules'}_${ledgerId}`;
};

/**
 * 載入當前帳本的所有載具分流規則（隱喻的第三張卡）
 * 優先讀取本機 AsyncStorage，若線上已連線則自 Supabase Storage 備援同步
 */
export const loadCarrierRules = async (ledgerId: string): Promise<CarrierRule[]> => {
  if (!ledgerId) return [];
  const key = getCarrierRulesStorageKey(ledgerId);

  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('讀取本機載具規則快取異常:', err);
  }

  // 若本機為空且雲端已設定，嘗試自 Supabase Storage 下載備援
  if (isConfigured) {
    try {
      const { data, error } = await supabase.storage
        .from('statements')
        .download(`${ledgerId}/carrier_rules.json`);
      if (!error && data) {
        const text = await data.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          await AsyncStorage.setItem(key, JSON.stringify(parsed)).catch(() => {});
          return parsed;
        }
      }
    } catch {}
  }

  return [];
};

/**
 * 將載具分流規則同步存檔（雙軌：本機快取 + 雲端儲存）
 */
export const persistCarrierRules = async (
  ledgerId: string,
  rules: CarrierRule[]
): Promise<void> => {
  if (!ledgerId) return;
  const key = getCarrierRulesStorageKey(ledgerId);

  try {
    await AsyncStorage.setItem(key, JSON.stringify(rules));
  } catch (err) {
    console.warn('本機儲存載具規則失敗:', err);
  }

  // 雲端備援同步
  if (isConfigured) {
    try {
      const jsonStr = JSON.stringify(rules, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      await supabase.storage
        .from('statements')
        .upload(`${ledgerId}/carrier_rules.json`, blob, {
          upsert: true,
          contentType: 'application/json',
        });
    } catch (err) {
      console.warn('雲端同步載具規則失敗 (已保留本地):', err);
    }
  }
};

/**
 * 新增或更新載具分流規則
 */
export const addOrUpdateCarrierRule = async (
  ledgerId: string,
  ruleData: {
    carrier_no: string;
    carrier_name?: string;
    user_id: string;
    account_id?: string;
  }
): Promise<CarrierRule> => {
  const existingRules = await loadCarrierRules(ledgerId);
  const nowIso = new Date().toISOString();

  // 若已存在相同 carrier_no，直接更新歸屬人與卡片
  const existingIndex = existingRules.findIndex(
    r => r.carrier_no.trim().toLowerCase() === ruleData.carrier_no.trim().toLowerCase()
  );

  let targetRule: CarrierRule;

  if (existingIndex >= 0) {
    targetRule = {
      ...existingRules[existingIndex],
      ...ruleData,
      updated_at: nowIso,
    };
    existingRules[existingIndex] = targetRule;
  } else {
    targetRule = {
      id: generateUUID(),
      ledger_id: ledgerId,
      carrier_no: ruleData.carrier_no.trim(),
      carrier_name: ruleData.carrier_name?.trim(),
      user_id: ruleData.user_id,
      account_id: ruleData.account_id,
      created_at: nowIso,
      updated_at: nowIso,
    };
    existingRules.push(targetRule);
  }

  await persistCarrierRules(ledgerId, existingRules);
  return targetRule;
};

/**
 * 刪除載具分流規則（解綁）
 */
export const removeCarrierRule = async (
  ledgerId: string,
  ruleIdOrCarrierNo: string
): Promise<CarrierRule[]> => {
  const existingRules = await loadCarrierRules(ledgerId);
  const updated = existingRules.filter(
    r => r.id !== ruleIdOrCarrierNo && r.carrier_no !== ruleIdOrCarrierNo
  );
  await persistCarrierRules(ledgerId, updated);
  return updated;
};
