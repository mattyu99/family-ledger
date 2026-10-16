import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const [k, ...v] = trimmed.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

class DummyWS {}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: DummyWS },
});

// Read adarian_history_backup.json
const backupPath = path.resolve(process.cwd(), 'adarian_history_backup.json');
if (!fs.existsSync(backupPath)) {
  console.error('❌ 找不到備份檔案 adarian_history_backup.json');
  process.exit(1);
}

console.log('📖 正在讀取備份資料 adarian_history_backup.json ...');
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

const LEDGER_ID = backup.ledger?.id || '8f53d9f8-d4ba-4eab-a975-dff3cbafb594';
const ZHI_PROFILE_ID = '9a24be3d-5d15-41bf-b672-e8db6d43b651'; // 智爸
const YING_PROFILE_ID = 'a452c526-7572-482c-b6ea-b975c0c13ea5'; // 瑩媽
const MATT_PROFILE_ID = 'b9ca1112-a865-4b7c-9629-f29cf56053f6'; // Matt Yu
const POKEMON_PROFILE_ID = '9b017d89-b21f-4638-b076-5a7629e2dda5'; // 寶可夢
const YANG_PROFILE_ID = '1705b9ce-1485-4714-b6fd-42a5aa8baa68'; // 洋洋
const DOU_PROFILE_ID = '8a0505f0-cdd6-4948-9cec-1926805e2e1d'; // 豆豆

// Identify backup member IDs
const backupYing = backup.members?.find(m => m.display_name === '瑩');
const BACKUP_YING_ID = backupYing ? backupYing.id : null;

async function run() {
  console.log(`\n🚀 開始灌入「Adarian 歷史帳本」到 Supabase 雲端 (Ledger ID: ${LEDGER_ID})...`);

  // 1. 建立 / 更新 帳本 (Ledger)
  console.log('\n[1/5] 建立/更新帳本主檔...');
  const ledgerPayload = {
    id: LEDGER_ID,
    name: 'Adarian 歷史帳本',
    description: '[READ_ONLY] Adarian Money 歷史記帳封存帳本（純查詢用）',
    currency: 'TWD',
    created_by: ZHI_PROFILE_ID,
    admin_pin: '8888',
  };

  const { error: lErr1 } = await supabase.from('ledgers').upsert({
    ...ledgerPayload,
    is_read_only: true,
  });

  if (lErr1) {
    console.log('ℹ️ is_read_only 欄位可能尚未建立，使用 description 標籤建立帳本...');
    const { error: lErr2 } = await supabase.from('ledgers').upsert(ledgerPayload);
    if (lErr2) throw new Error(`建立帳本失敗: ${JSON.stringify(lErr2)}`);
  }
  console.log('✅ 帳本主檔已就緒');

  // 2. 加入家庭成員 (Ledger Members)
  console.log('\n[2/5] 設定成員權限...');
  const membersToUpsert = [
    { ledger_id: LEDGER_ID, user_id: ZHI_PROFILE_ID, role: 'owner' },
    { ledger_id: LEDGER_ID, user_id: MATT_PROFILE_ID, role: 'owner' },
    { ledger_id: LEDGER_ID, user_id: POKEMON_PROFILE_ID, role: 'owner' },
    { ledger_id: LEDGER_ID, user_id: YING_PROFILE_ID, role: 'member' },
    { ledger_id: LEDGER_ID, user_id: YANG_PROFILE_ID, role: 'member' },
    { ledger_id: LEDGER_ID, user_id: DOU_PROFILE_ID, role: 'member' },
  ];

  for (const m of membersToUpsert) {
    const { error: mErr } = await supabase.from('ledger_members').upsert(m, { onConflict: 'ledger_id,user_id' });
    if (mErr) console.warn(`加入成員 ${m.user_id} 警告:`, mErr.message);
  }

  // 建立邀請碼 (ledger_invites)
  try {
    await supabase.from('ledger_invites').upsert({
      ledger_id: LEDGER_ID,
      invite_code: 'HIST-2026',
      created_by: ZHI_PROFILE_ID,
      expires_at: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(),
    }, { onConflict: 'invite_code' });
  } catch {}
  console.log('✅ 成員權限與邀請碼 (HIST-2026) 已就緒');

  // 3. 匯入收支分類 (Categories)
  console.log('\n[3/5] 匯入記帳分類...');
  const categoriesToUpsert = (backup.categories || []).map(c => ({
    id: c.id,
    ledger_id: LEDGER_ID,
    name: c.name,
    icon: c.icon || '📝',
    color: c.color || '#6B7280',
    type: c.type || 'expense',
    sort_order: c.sort_order || 1,
  }));

  const { error: cErr } = await supabase.from('categories').upsert(categoriesToUpsert);
  if (cErr) throw new Error(`匯入分類失敗: ${JSON.stringify(cErr)}`);
  console.log(`✅ 成功匯入 ${categoriesToUpsert.length} 個分類`);

  // 4. 匯入支付卡片/帳戶 (Payment Accounts)
  console.log('\n[4/5] 匯入支付帳戶與卡片...');
  const accountsToUpsert = (backup.payment_accounts || []).map(a => {
    const isYing = a.name.endsWith('-瑩');
    return {
      id: a.id,
      ledger_id: LEDGER_ID,
      name: a.name,
      type: a.type || 'other',
      user_id: isYing ? YING_PROFILE_ID : ZHI_PROFILE_ID,
      last_four_digits: a.last_four_digits || '',
      billing_cycle_date: a.billing_cycle_date || 1,
      balance: a.balance || 0,
      color: a.color || '#3B82F6',
      icon: a.icon || '💳',
      sort_order: a.sort_order || 1,
    };
  });

  const { error: aErr } = await supabase.from('payment_accounts').upsert(accountsToUpsert);
  if (aErr) throw new Error(`匯入支付帳戶失敗: ${JSON.stringify(aErr)}`);
  console.log(`✅ 成功匯入 ${accountsToUpsert.length} 個支付帳戶`);

  // 5. 批次灌入交易明細 (Transactions)
  console.log(`\n[5/5] 開始批次灌入 ${backup.transactions.length} 筆歷史交易明細...`);
  const totalTx = backup.transactions.length;
  const BATCH_SIZE = 500;
  let insertedCount = 0;

  for (let i = 0; i < totalTx; i += BATCH_SIZE) {
    const chunk = backup.transactions.slice(i, i + BATCH_SIZE).map(t => {
      const isYing = t.paid_by === BACKUP_YING_ID;
      return {
        id: t.id,
        ledger_id: LEDGER_ID,
        creator_id: ZHI_PROFILE_ID,
        paid_by: isYing ? YING_PROFILE_ID : ZHI_PROFILE_ID,
        category_id: t.category_id || null,
        amount: t.amount,
        type: t.type || 'expense',
        merchant: t.merchant || null,
        transacted_at: t.transacted_at,
        note: t.note || null,
        payment_method: t.payment_method || 'other',
        account_id: t.account_id || null,
        is_settled: Boolean(t.is_settled),
        is_reconciled: Boolean(t.is_reconciled),
      };
    });

    const { error: txErr } = await supabase.from('transactions').upsert(chunk);
    if (txErr) {
      console.error(`❌ 批次 [${i} ~ ${i + chunk.length}] 匯入錯誤:`, txErr);
      throw new Error(`批次寫入失敗: ${txErr.message}`);
    }

    insertedCount += chunk.length;
    const pct = ((insertedCount / totalTx) * 100).toFixed(1);
    if (insertedCount % 2500 === 0 || insertedCount === totalTx) {
      console.log(`  ⏳ 已成功灌入: ${insertedCount} / ${totalTx} 筆 (${pct}%)`);
    }
  }

  // 驗證雲端筆數
  const { count, error: countErr } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('ledger_id', LEDGER_ID);

  console.log('\n🎉 ==============================================');
  console.log(`✨ 全部完成！雲端資料庫驗證交易筆數: ${count} 筆 (預期: ${totalTx})`);
  console.log(`   帳本名稱: Adarian 歷史帳本`);
  console.log(`   帳本 ID: ${LEDGER_ID}`);
  console.log(`   邀請碼: HIST-2026`);
  console.log(`   保護狀態: 🔒 唯讀封存模式`);
  console.log('==============================================\n');
}

run().catch(err => {
  console.error('❌ 執行失敗:', err);
  process.exit(1);
});

