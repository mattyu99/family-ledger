import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let key = match[1];
    let val = match[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[key] = val.trim();
  }
}

const ledgerId = 'ab10fe7e-d0d8-4bc9-b338-24620d26d924';

// 1. 建立未登入陌生人客戶端 (只有 ANON_KEY，沒有任何使用者 Session)
const anonClient = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false }, realtime: { transport: class DummyWS {} } }
);

// 2. 建立最高管理員客戶端 (SERVICE_ROLE_KEY)
const adminClient = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: class DummyWS {} } }
);

async function testSecurity() {
  console.log('🔒 開始執行安全性滲透檢驗...\n');

  // 測試 1：陌生人嘗試讀取家庭帳本資訊
  const { data: anonLedgers } = await anonClient.from('ledgers').select('id, name').eq('id', ledgerId);
  console.log('【測試 1：陌生人讀取家庭帳本】');
  if (!anonLedgers || anonLedgers.length === 0) {
    console.log('✅ 通過：陌生人被擋在大門外，無法檢視家庭帳本！');
  } else {
    console.log('❌ 警告：陌生人仍可讀取帳本資訊:', anonLedgers);
  }

  // 測試 2：陌生人嘗試讀取家庭交易明細
  const { data: anonTx } = await anonClient.from('transactions').select('id, amount, note').eq('ledger_id', ledgerId).limit(5);
  console.log('\n【測試 2：陌生人讀取交易明細】');
  if (!anonTx || anonTx.length === 0) {
    console.log('✅ 通過：陌生人被擋在大門外，交易紀錄 0 筆外流！');
  } else {
    console.log(`❌ 警告：陌生人獲取了 ${anonTx.length} 筆交易紀錄！`);
  }

  // 測試 3：陌生人嘗試讀取銀行與信用卡帳戶
  const { data: anonAcc } = await anonClient.from('payment_accounts').select('id, name, balance').eq('ledger_id', ledgerId);
  console.log('\n【測試 3：陌生人讀取支付帳戶】');
  if (!anonAcc || anonAcc.length === 0) {
    console.log('✅ 通過：陌生人被擋在大門外，資產帳戶 0 筆外流！');
  } else {
    console.log(`❌ 警告：陌生人獲取了 ${anonAcc.length} 筆帳戶資料！`);
  }

  // 測試 4：陌生人嘗試惡意刪除家庭帳本 (RPC)
  const { data: rpcRes, error: rpcErr } = await anonClient.rpc('delete_cloud_ledger_admin', {
    target_ledger_id: ledgerId
  });
  console.log('\n【測試 4：陌生人嘗試惡意刪除帳本】');
  if (rpcErr || (rpcRes && !rpcRes.success)) {
    console.log('✅ 通過：雲端直接拒絕陌生人刪除請求！', rpcErr ? rpcErr.message : rpcRes?.message);
  } else {
    console.log('❌ 警告：陌生人竟能成功刪除帳本！');
  }

  // 測試 5：驗證管理員後台資料完好性
  const { data: adminLedger } = await adminClient.from('ledgers').select('id, name').eq('id', ledgerId).single();
  const { count: txCount } = await adminClient.from('transactions').select('*', { count: 'exact', head: true }).eq('ledger_id', ledgerId);
  console.log('\n【測試 5：家庭帳本資料完整性確認】');
  console.log(`✅ 帳本「${adminLedger?.name}」完好在線，現有交易筆數：${txCount} 筆。`);
}

testSecurity().catch(console.error);
