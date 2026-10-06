import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 嘗試載入本地 .env 檔案（如果環境變數尚未設定）
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

// 取得環境變數（支援本機 .env 與 GitHub Actions Secrets）
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_TARGET_ID = process.env.LINE_TARGET_ID || process.env.LINE_GROUP_ID || process.env.LINE_USER_ID;
const TARGET_LEDGER_ID = process.env.LEDGER_ID;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 錯誤：未設定 SUPABASE_URL 或 SUPABASE_KEY 環境變數！');
  process.exit(1);
}

// 建立 Supabase 客戶端 (純後端查詢，略過瀏覽器端 Realtime WebSocket)
class DummyWS {}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: DummyWS },
});

// 計算台灣時間 (UTC+8) 的今日起訖時間與月份起訖
function getTaiwanTimeRanges() {
  const now = new Date();
  // 轉換為 UTC+8 時間
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const twDate = new Date(utcMs + 8 * 3600000);

  const year = twDate.getFullYear();
  const month = twDate.getMonth(); // 0-11
  const date = twDate.getDate();

  // 本日開始 (00:00:00 UTC+8 換算回 UTC)
  const startOfDayUtc = new Date(Date.UTC(year, month, date, 0 - 8, 0, 0, 0));
  // 本日結束 (23:59:59.999 UTC+8 換算回 UTC)
  const endOfDayUtc = new Date(Date.UTC(year, month, date, 23 - 8, 59, 59, 999));

  // 本月開始 (當月 1 號 00:00:00 UTC+8)
  const startOfMonthUtc = new Date(Date.UTC(year, month, 1, 0 - 8, 0, 0, 0));

  const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六'];
  const dayStr = daysOfWeek[twDate.getDay()];
  const yyyy = year;
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(date).padStart(2, '0');
  const hh = String(twDate.getHours()).padStart(2, '0');
  const min = String(twDate.getMinutes()).padStart(2, '0');

  return {
    startOfDayIso: startOfDayUtc.toISOString(),
    endOfDayIso: endOfDayUtc.toISOString(),
    startOfMonthIso: startOfMonthUtc.toISOString(),
    formattedDate: `${yyyy}/${mm}/${dd} (${dayStr}) ${hh}:${min}`,
    yearMonthStr: `${yyyy}年${month + 1}月`,
  };
}

async function sendLineMessage(text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_TARGET_ID) {
    console.log('ℹ️ [LINE] 未偵測到 LINE_CHANNEL_ACCESS_TOKEN 或 LINE_TARGET_ID，跳過 LINE 發送。（Supabase 防休眠存取仍已圓滿完成）');
    return;
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: LINE_TARGET_ID,
        messages: [
          {
            type: 'text',
            text: text,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [LINE] 推播發送失敗 (HTTP ${res.status}):`, errText);
    } else {
      console.log('✅ [LINE] 成功將收支日報推播至 LINE 官方機器人目標群組！');
    }
  } catch (err) {
    console.error('❌ [LINE] 網路連線錯誤:', err);
  }
}

async function main() {
  console.log('🚀 開始執行 Supabase Keep-Alive 防休眠與收支日報生成任務...');

  // 1. 【防休眠保活】透過真實 API 查詢 Supabase profiles 與 ledgers
  const { data: pingProfiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name')
    .limit(5);

  if (profileErr) {
    console.warn('⚠️ 查詢 profiles 時發生警示:', profileErr.message);
  } else {
    console.log(`✅ [Keep-Alive] 成功讀取 Supabase profiles (${pingProfiles?.length || 0} 筆)，防休眠存取已生效！`);
  }

  // 2. 獲取帳本與相關成員名冊
  let ledgersToReport = [];
  if (TARGET_LEDGER_ID) {
    const { data: specificLedger } = await supabase
      .from('ledgers')
      .select('id, name')
      .eq('id', TARGET_LEDGER_ID)
      .maybeSingle();
    if (specificLedger) ledgersToReport = [specificLedger];
  } else {
    // 智慧防騷擾機制：若未指定帳本，自動挑選「最近有交易活動」或「最新建立」的單一主帳本，避免多發騷擾 LINE
    const { data: allLedgers } = await supabase
      .from('ledgers')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    if (allLedgers && allLedgers.length > 0) {
      if (allLedgers.length === 1) {
        ledgersToReport = allLedgers;
      } else {
        // 檢查哪一本帳本最近有交易紀錄
        const { data: recentTx } = await supabase
          .from('transactions')
          .select('ledger_id')
          .order('transacted_at', { ascending: false })
          .limit(1);

        const activeLedgerId = recentTx?.[0]?.ledger_id;
        const matched = activeLedgerId && allLedgers.find(l => l.id === activeLedgerId);
        ledgersToReport = [matched || allLedgers[0]];
      }
    }
  }

  // 3. 獲取全體分類表 (用於對應圖示與名稱)
  const { data: categories } = await supabase.from('categories').select('*');
  const catMap = new Map();
  (categories || []).forEach(c => catMap.set(c.id, c));

  // 4. 獲取全體成員 Profiles
  const { data: allProfiles } = await supabase.from('profiles').select('*');
  const profileMap = new Map();
  (allProfiles || []).forEach(p => profileMap.set(p.id, p));

  const { startOfDayIso, endOfDayIso, startOfMonthIso, formattedDate, yearMonthStr } = getTaiwanTimeRanges();

  // 若目前資料庫尚無特定帳本紀錄，產生通用防休眠日報
  if (ledgersToReport.length === 0) {
    const msg = [
      '💖 甜心記帳本・系統守護打卡',
      `📅 ${formattedDate}`,
      '━━━━━━━━━━━━━━━━',
      '🌟 雲端資料庫 Keep-Alive 自動存取已順利完成！',
      '目前尚未建立雲端帳本或無交易資料，隨時打開 App 即可秒開使用～',
      '━━━━━━━━━━━━━━━━',
      '🏠 每一筆記錄，都是全家人的溫馨生活記憶。',
    ].join('\n');

    console.log('\n--- 日報預覽 ---\n' + msg + '\n----------------');
    await sendLineMessage(msg);
    return;
  }

  // 針對帳本彙整報表（一般家庭通常使用一本主帳本）
  for (const ledger of ledgersToReport) {
    console.log(`\n📊 正在彙整帳本「${ledger.name}」(${ledger.id}) 的收支數據...`);

    // (A) 查詢「今日」交易
    const { data: todayTx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('ledger_id', ledger.id)
      .gte('transacted_at', startOfDayIso)
      .lte('transacted_at', endOfDayIso)
      .order('transacted_at', { ascending: true });

    if (txErr) {
      console.warn(`查詢帳本「${ledger.name}」今日交易失敗:`, txErr.message);
      continue;
    }

    // (B) 查詢「當月」累計交易
    const { data: monthTx } = await supabase
      .from('transactions')
      .select('amount, type')
      .eq('ledger_id', ledger.id)
      .gte('transacted_at', startOfMonthIso)
      .lte('transacted_at', endOfDayIso);

    let monthExpense = 0;
    let monthIncome = 0;
    (monthTx || []).forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'expense') monthExpense += amt;
      else if (t.type === 'income') monthIncome += amt;
    });
    const monthBalance = monthIncome - monthExpense;

    // (C) 統計今日數據
    let todayExpense = 0;
    let todayIncome = 0;
    const memberExpenseMap = new Map(); // 記錄各成員今日支出
    const txItems = [];

    (todayTx || []).forEach(t => {
      const amt = Number(t.amount) || 0;
      const cat = catMap.get(t.category_id) || { name: '其他', icon: '📝' };
      const payer = profileMap.get(t.paid_by) || profileMap.get(t.creator_id) || { display_name: '家人', avatar_url: '👤' };

      if (t.type === 'expense') {
        todayExpense += amt;
        const cur = memberExpenseMap.get(payer.display_name) || { total: 0, count: 0, avatar: payer.avatar_url || '👤' };
        cur.total += amt;
        cur.count += 1;
        memberExpenseMap.set(payer.display_name, cur);

        txItems.push(`• ${cat.icon} ${cat.name} -NT$ ${amt.toLocaleString()}${t.note ? ` (${t.note})` : ''} - ${payer.display_name}`);
      } else if (t.type === 'income') {
        todayIncome += amt;
        txItems.push(`• 💰 ${cat.name} +NT$ ${amt.toLocaleString()}${t.note ? ` (${t.note})` : ''} - ${payer.display_name}`);
      }
    });

    const todayBalance = todayIncome - todayExpense;

    // (D) 組裝溫馨日報訊息
    const lines = [
      `💖 甜心記帳本・今日收支日報`,
      `🏠 ${ledger.name}`,
      `📅 ${formattedDate}`,
      `━━━━━━━━━━━━━━━━`,
    ];

    if ((todayTx || []).length === 0) {
      lines.push(`🎉 太棒了！今天全家零支出！ 🥳`);
      lines.push(`今天沒有任何花費開銷，荷包滿滿～大家都辛苦囉！`);
    } else {
      lines.push(`💸 今日總支出：NT$ ${todayExpense.toLocaleString()} (${todayTx.length} 筆)`);
      if (todayIncome > 0) {
        lines.push(`💰 今日總收入：NT$ ${todayIncome.toLocaleString()}`);
        lines.push(`⚖️ 今日淨結餘：${todayBalance >= 0 ? '+' : ''}NT$ ${todayBalance.toLocaleString()}`);
      }

      if (memberExpenseMap.size > 0) {
        lines.push('');
        lines.push(`👥 成員支出明細：`);
        for (const [name, info] of memberExpenseMap.entries()) {
          lines.push(`  ${info.avatar} ${name}：NT$ ${info.total.toLocaleString()} (${info.count}筆)`);
        }
      }

      if (txItems.length > 0) {
        lines.push('');
        lines.push(`🛒 今日消費明細：`);
        txItems.forEach(item => lines.push(`  ${item}`));
      }
    }

    lines.push(`━━━━━━━━━━━━━━━━`);
    lines.push(`📊 ${yearMonthStr}累計支出：NT$ ${monthExpense.toLocaleString()}`);
    lines.push(`💰 ${yearMonthStr}累計結餘：${monthBalance >= 0 ? '+' : ''}NT$ ${monthBalance.toLocaleString()}`);
    lines.push(`🌟 每一筆紀錄，都是全家人的溫馨生活記憶！`);

    const finalReport = lines.join('\n');
    console.log('\n--- 產生之日報訊息 ---\n' + finalReport + '\n------------------------\n');

    await sendLineMessage(finalReport);
  }

  console.log('🎉 任務全部順利執行完畢！');
}

main().catch(err => {
  console.error('💥 任務執行失敗:', err);
  process.exit(1);
});
