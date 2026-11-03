import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 1. 自動載入本地 .env
if (!process.env.SUPABASE_URL && !process.env.EXPO_PUBLIC_SUPABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...vals] = trimmed.split('=');
          const k = key.trim();
          const v = vals.join('=').trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      });
    }
  } catch {}
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const TARGET_LEDGER_ID = process.env.LEDGER_ID || 'ab10fe7e-d0d8-4bc9-b338-24620d26d924';

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ 錯誤：未找到 Supabase URL 或 ANON_KEY 環境變數');
  process.exit(1);
}

// 嚴格使用標準 anon_key 建立未登入訪客客戶端 (檢驗零金鑰架構真實防護能力)
class DummyWS {}
const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
  realtime: { transport: DummyWS },
});

async function runRpcTests() {
  console.log('====================================================');
  console.log('🛡️  開始執行 Supabase 零金鑰架構 (Zero-Token) 預存程序自動測試');
  console.log('====================================================\n');
  let hasFailed = false;

  // ----------------------------------------------------------------------------
  // 測試 1：未登入匿名訪客透過 secure_batch_add_transactions 安全直通記帳
  // ----------------------------------------------------------------------------
  const testTxId = '00000000-0000-4000-8000-' + Date.now().toString().slice(-12);
  try {
    console.log('▶ [測試 1] 驗證免登入訪客直通 secure_batch_add_transactions...');

    // 取得該帳本之一位有效成員 ID
    let validMemberId = null;
    const { data: memberRows } = await anonClient
      .from('ledger_members')
      .select('user_id')
      .eq('ledger_id', TARGET_LEDGER_ID)
      .limit(1);
    if (memberRows && memberRows.length > 0) {
      validMemberId = memberRows[0].user_id;
    }

    const { data: addRes, error: addErr } = await anonClient.rpc('secure_batch_add_transactions', {
      p_transactions: [{
        id: testTxId,
        ledger_id: TARGET_LEDGER_ID,
        creator_id: validMemberId,
        paid_by: validMemberId,
        amount: 1,
        type: 'expense',
        note: '[AUTOMATED_TEST_RPC_VERIFICATION]',
        transacted_at: new Date().toISOString(),
      }],
    });

    if (addErr || (addRes && addRes.success === false)) {
      console.error('   ❌ 測試 1 失敗: secure_batch_add_transactions 異常:', addErr || addRes);
      hasFailed = true;
    } else {
      console.log('   ✅ 測試 1 通過: 免登入訪客成功透過預存程序寫入交易 (Zero-Token Fast Path 正常運作)');
      // 清理測試資料 (Teardown)
      try {
        await anonClient.from('transactions').delete().eq('id', testTxId);
      } catch {}
    }
  } catch (e) {
    console.error('   ❌ 測試 1 拋出例外:', e);
    hasFailed = true;
  }

  // ----------------------------------------------------------------------------
  // 測試 2：未授權訪客試圖修改帳本名稱 (未帶正確 PIN 碼)
  // ----------------------------------------------------------------------------
  try {
    console.log('\n▶ [測試 2] 驗證 secure_update_ledger 未授權竄改防護...');
    const { data: updateRes, error: updateErr } = await anonClient.rpc('secure_update_ledger', {
      p_ledger_id: TARGET_LEDGER_ID,
      p_payload: { name: 'ILLEGAL_ALTERATION_ATTEMPT' },
      p_operator_id: null,
      p_admin_pin: 'INCORRECT_PIN_999999',
    });

    if (!updateErr && updateRes && updateRes.success === false && updateRes.error === 'unauthorized') {
      console.log('   ✅ 測試 2 通過: 匿名訪客竄改帳本被預存程序安全阻擋 (回傳 unauthorized)');
    } else {
      console.error('   ❌ 測試 2 失敗: 未授權操作未被正確攔截:', updateErr || updateRes);
      hasFailed = true;
    }
  } catch (e) {
    console.error('   ❌ 測試 2 拋出例外:', e);
    hasFailed = true;
  }

  // ----------------------------------------------------------------------------
  // 測試 3：邀請碼長度與防呆格式驗證 (secure_set_invite_code)
  // ----------------------------------------------------------------------------
  try {
    console.log('\n▶ [測試 3] 驗證 secure_set_invite_code 參數與安全防呆...');
    const { data: codeRes, error: codeErr } = await anonClient.rpc('secure_set_invite_code', {
      p_ledger_id: TARGET_LEDGER_ID,
      p_invite_code: 'AB', // 長度不足 3 碼
      p_operator_id: null,
      p_admin_pin: 'INCORRECT_PIN_999999',
    });

    if (!codeErr && codeRes && codeRes.success === false && codeRes.error === 'invalid_code_length') {
      console.log('   ✅ 測試 3 通過: 不合法邀請碼格式被正確拒絕 (回傳 invalid_code_length)');
    } else {
      console.error('   ❌ 測試 3 失敗: 邀請碼格式防呆未生效:', codeErr || codeRes);
      hasFailed = true;
    }
  } catch (e) {
    console.error('   ❌ 測試 3 拋出例外:', e);
    hasFailed = true;
  }

  // ----------------------------------------------------------------------------
  // 測試 4：成員移除安全權限防護 (secure_remove_member)
  // ----------------------------------------------------------------------------
  try {
    console.log('\n▶ [測試 4] 驗證 secure_remove_member 移除權限查核...');
    const dummyUserId = '00000000-0000-4000-8000-000000000001';
    const { data: removeRes, error: removeErr } = await anonClient.rpc('secure_remove_member', {
      p_ledger_id: TARGET_LEDGER_ID,
      p_user_id: dummyUserId,
      p_operator_id: null,
      p_admin_pin: 'INCORRECT_PIN_999999',
    });

    if (!removeErr && removeRes && removeRes.success === false && removeRes.error === 'unauthorized') {
      console.log('   ✅ 測試 4 通過: 未授權成員移除操作被安全阻擋 (回傳 unauthorized)');
    } else {
      console.error('   ❌ 測試 4 失敗: 未授權移除成員未被攔截:', removeErr || removeRes);
      hasFailed = true;
    }
  } catch (e) {
    console.error('   ❌ 測試 4 拋出例外:', e);
    hasFailed = true;
  }

  console.log('\n====================================================');
  if (hasFailed) {
    console.error('❌ 部分 RPC 安全預存程序測試未通過，請檢查雲端資料庫綱要與權限！');
    process.exit(1);
  } else {
    console.log('🎉 所有 Supabase RPC 安全預存程序整合測試全數通過！');
    console.log('====================================================\n');
    process.exit(0);
  }
}

runRpcTests();
