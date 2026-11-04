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

// 定義 SWEETHOME 固定 UUID 常數
export const DEMO_LEDGER_ID = 'ee100000-0000-4000-8000-000000000001';

export const DEMO_MEMBERS = [
  { id: 'ee200000-0000-4000-8000-000000000001', display_name: '智爸 (爸爸)', avatar_url: '👨', role: 'owner' },
  { id: 'ee200000-0000-4000-8000-000000000002', display_name: '瑩媽 (媽媽)', avatar_url: '👩', role: 'admin' },
  { id: 'ee200000-0000-4000-8000-000000000003', display_name: '洋洋 (哥哥)', avatar_url: '👦', role: 'member' },
  { id: 'ee200000-0000-4000-8000-000000000004', display_name: '豆豆 (妹妹)', avatar_url: '👧', role: 'member' },
];

export const DEMO_CATEGORIES = [
  { id: 'ee300000-0000-4000-8000-000000000001', ledger_id: DEMO_LEDGER_ID, name: '餐飲伙食', icon: '🍲', color: '#EF4444', type: 'expense', sort_order: 1 },
  { id: 'ee300000-0000-4000-8000-000000000002', ledger_id: DEMO_LEDGER_ID, name: '生鮮超市', icon: '🛒', color: '#F59E0B', type: 'expense', sort_order: 2 },
  { id: 'ee300000-0000-4000-8000-000000000003', ledger_id: DEMO_LEDGER_ID, name: '居家水電', icon: '💡', color: '#3B82F6', type: 'expense', sort_order: 3 },
  { id: 'ee300000-0000-4000-8000-000000000004', ledger_id: DEMO_LEDGER_ID, name: '交通出行', icon: '🚗', color: '#10B981', type: 'expense', sort_order: 4 },
  { id: 'ee300000-0000-4000-8000-000000000005', ledger_id: DEMO_LEDGER_ID, name: '休閒娛樂', icon: '🎬', color: '#8B5CF6', type: 'expense', sort_order: 5 },
  { id: 'ee300000-0000-4000-8000-000000000006', ledger_id: DEMO_LEDGER_ID, name: '醫療保健', icon: '💊', color: '#EC4899', type: 'expense', sort_order: 6 },
  { id: 'ee300000-0000-4000-8000-000000000007', ledger_id: DEMO_LEDGER_ID, name: '育兒教育', icon: '👶', color: '#06B6D4', type: 'expense', sort_order: 7 },
  { id: 'ee300000-0000-4000-8000-000000000008', ledger_id: DEMO_LEDGER_ID, name: '衣飾美容', icon: '👕', color: '#8B5CF6', type: 'expense', sort_order: 8 },
  { id: 'ee300000-0000-4000-8000-000000000009', ledger_id: DEMO_LEDGER_ID, name: '數位３Ｃ', icon: '💻', color: '#6B7280', type: 'expense', sort_order: 9 },
  { id: 'ee300000-0000-4000-8000-000000000010', ledger_id: DEMO_LEDGER_ID, name: '薪資收入', icon: '💰', color: '#059669', type: 'income', sort_order: 10 },
  { id: 'ee300000-0000-4000-8000-000000000011', ledger_id: DEMO_LEDGER_ID, name: '投資理財', icon: '📈', color: '#2563EB', type: 'income', sort_order: 11 },
  { id: 'ee300000-0000-4000-8000-000000000012', ledger_id: DEMO_LEDGER_ID, name: '零用錢', icon: '💵', color: '#10B981', type: 'income', sort_order: 12 },
  { id: 'ee300000-0000-4000-8000-000000000013', ledger_id: DEMO_LEDGER_ID, name: '生活備忘', icon: '📌', color: '#8B5CF6', type: 'expense', sort_order: 14 },
];

export const DEMO_ACCOUNTS = [
  {
    id: 'ee500000-0000-4000-8000-000000000001',
    ledger_id: DEMO_LEDGER_ID,
    name: '智爸現金皮夾',
    type: 'cash',
    balance: 3500,
    user_id: 'ee200000-0000-4000-8000-000000000001',
    color: '#10B981',
    icon: '💵',
  },
  {
    id: 'ee500000-0000-4000-8000-000000000002',
    ledger_id: DEMO_LEDGER_ID,
    name: '富邦家庭公帳',
    type: 'bank',
    balance: 128000,
    user_id: null, // 公帳
    color: '#3B82F6',
    icon: '🏦',
  },
  {
    id: 'ee500000-0000-4000-8000-000000000003',
    ledger_id: DEMO_LEDGER_ID,
    name: '國泰世華 CUBE 卡',
    type: 'credit_card',
    balance: -12450,
    user_id: 'ee200000-0000-4000-8000-000000000001',
    billing_cycle_date: 15,
    color: '#059669',
    icon: '💳',
  },
  {
    id: 'ee500000-0000-4000-8000-000000000004',
    ledger_id: DEMO_LEDGER_ID,
    name: '台新玫瑰卡',
    type: 'credit_card',
    balance: -4890,
    user_id: 'ee200000-0000-4000-8000-000000000002',
    billing_cycle_date: 20,
    color: '#EC4899',
    icon: '💳',
  },
  {
    id: 'ee500000-0000-4000-8000-000000000005',
    ledger_id: DEMO_LEDGER_ID,
    name: '洋洋學生悠遊卡',
    type: 'stored_value',
    balance: 751,
    user_id: 'ee200000-0000-4000-8000-000000000003',
    card_number: '1234567890',
    color: '#F59E0B',
    icon: '🚌',
  },
  {
    id: 'ee500000-0000-4000-8000-000000000006',
    ledger_id: DEMO_LEDGER_ID,
    name: '豆豆存錢筒',
    type: 'cash',
    balance: 200,
    user_id: 'ee200000-0000-4000-8000-000000000004',
    color: '#8B5CF6',
    icon: '🪙',
  },
];

async function seed() {
  console.log('🚀 開始建置 SWEETHOME 體驗帳本資料至 Supabase 雲端...');

  // 1. 建立帳本主檔
  console.log('[1/6] 建立 SWEETHOME 帳本主檔...');
  const { error: ledgerErr } = await supabase.from('ledgers').upsert({
    id: DEMO_LEDGER_ID,
    name: '💖 甜心示範家庭 (SWEETHOME)',
    description: '甜心記帳本官方標準示範家庭帳本（體驗試玩專用）',
    currency: 'TWD',
    admin_pin: '8888',
    is_read_only: false,
    allow_new_members: true,
  });
  if (ledgerErr) {
    console.error('❌ 建立帳本失敗:', ledgerErr);
    process.exit(1);
  }

  // 2. 建立或更新 SWEETHOME 邀請碼
  console.log('[2/6] 建立 SWEETHOME 邀請碼...');
  const { error: inviteErr } = await supabase.from('ledger_invites').upsert({
    ledger_id: DEMO_LEDGER_ID,
    invite_code: 'SWEETHOME',
    expires_at: '2099-12-31T23:59:59Z',
    max_uses: 9999999,
  }, { onConflict: 'invite_code' });
  if (inviteErr) {
    console.error('❌ 建立邀請碼失敗:', inviteErr);
  }

  // 3. 建立 4 位成員 Profiles 與 ledger_members
  console.log('[3/6] 建立成員 Profiles 與 ledger_members 關聯...');
  for (const m of DEMO_MEMBERS) {
    const { error: pErr } = await supabase.from('profiles').upsert({
      id: m.id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
    });
    if (pErr) console.warn(`Profiles ${m.display_name} 警告:`, pErr.message);

    const { error: lmErr } = await supabase.from('ledger_members').upsert({
      ledger_id: DEMO_LEDGER_ID,
      user_id: m.id,
      role: m.role,
    }, { onConflict: 'ledger_id,user_id' });
    if (lmErr) console.warn(`LedgerMember ${m.display_name} 警告:`, lmErr.message);
  }

  // 4. 建立示範分類
  console.log('[4/6] 建立示範收支分類...');
  for (const cat of DEMO_CATEGORIES) {
    const { error: catErr } = await supabase.from('categories').upsert(cat);
    if (catErr) console.warn(`Category ${cat.name} 警告:`, catErr.message);
  }

  // 5. 建立 6 個付款帳戶
  console.log('[5/6] 建立資產帳戶...');
  for (const acc of DEMO_ACCOUNTS) {
    const { error: accErr } = await supabase.from('payment_accounts').upsert({
      ...acc,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (accErr) console.warn(`Account ${acc.name} 警告:`, accErr.message);
  }

  // 6. 建立週期固定支出 (Recurring Rules)
  console.log('[6/6] 建立固定帳單提醒規則...');
  const now = new Date();
  const powerDueDate = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0];
  const netDueDate = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];

  const recurringRules = [
    {
      id: 'ee600000-0000-4000-8000-000000000001',
      ledger_id: DEMO_LEDGER_ID,
      name: '台電家庭電費',
      default_amount: 2340,
      merchant: '台灣電力公司',
      paid_by: DEMO_MEMBERS[0].id,
      payment_method: 'bank_transfer',
      category_id: DEMO_CATEGORIES[2].id, // 居家水電
      account_id: DEMO_ACCOUNTS[1].id,
      frequency: 'bimonthly',
      due_day: parseInt(powerDueDate.split('-')[2], 10),
      is_active: true,
      amount_type: 'variable',
    },
    {
      id: 'ee600000-0000-4000-8000-000000000002',
      ledger_id: DEMO_LEDGER_ID,
      name: '中華電信光世代 500M',
      default_amount: 1099,
      merchant: '中華電信',
      paid_by: DEMO_MEMBERS[0].id,
      payment_method: 'credit_card',
      category_id: DEMO_CATEGORIES[8].id, // 數位３Ｃ
      account_id: DEMO_ACCOUNTS[2].id,
      frequency: 'monthly',
      due_day: parseInt(netDueDate.split('-')[2], 10),
      is_active: true,
      amount_type: 'fixed',
    },
    {
      id: 'ee600000-0000-4000-8000-000000000003',
      ledger_id: DEMO_LEDGER_ID,
      name: '台北自來水費',
      default_amount: 480,
      merchant: '台北自來水事業處',
      paid_by: DEMO_MEMBERS[1].id,
      payment_method: 'bank_transfer',
      category_id: DEMO_CATEGORIES[2].id, // 居家水電
      account_id: DEMO_ACCOUNTS[1].id,
      frequency: 'bimonthly',
      due_day: 25,
      is_active: true,
      amount_type: 'variable',
    },
    {
      id: 'ee600000-0000-4000-8000-000000000004',
      ledger_id: DEMO_LEDGER_ID,
      name: 'Netflix 高級方案 4K',
      default_amount: 390,
      merchant: 'Netflix',
      paid_by: DEMO_MEMBERS[1].id,
      payment_method: 'credit_card',
      category_id: DEMO_CATEGORIES[4].id, // 休閒娛樂
      account_id: DEMO_ACCOUNTS[3].id,
      frequency: 'monthly',
      due_day: 18,
      is_active: true,
      amount_type: 'fixed',
    },
  ];

  for (const r of recurringRules) {
    const { error: rErr } = await supabase.from('recurring_rules').upsert(r);
    if (rErr) console.warn(`Recurring rule ${r.name} 警告:`, rErr.message);
  }

  // 7. 建立 25 筆逼真交易 + 3 筆共享備忘錄 (共 28 筆 transactions)
  console.log('[7/7] 建立家庭擬真消費紀錄與中獎發票及備忘錄...');
  const txBaseTime = now.getTime();

  const demoTransactions = [
    {
      id: 'ee400000-0000-4000-8000-000000000001',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 85,
      merchant: '7-11 統一超商',
      category_id: DEMO_CATEGORIES[0].id, // 餐飲伙食
      payment_method: 'cash',
      account_id: DEMO_ACCOUNTS[0].id,
      note: '☕ 大杯美式咖啡＋鮪魚蛋沙拉三明治 [🧾 HQ-74291168|11309|8888|won|200|六獎]',
      transacted_at: new Date(txBaseTime - 3600000 * 2).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000002',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 3850,
      merchant: '好市多 Costco',
      category_id: DEMO_CATEGORIES[1].id, // 生鮮超市
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[2].id,
      note: '全脂鮮奶 2 瓶、牛排牛肉片、三層厚抽取衛生紙 [🧾 HQ-89214532|11309|1234|pending|0|]',
      transacted_at: new Date(txBaseTime - 3600000 * 26).toISOString(),
      is_settled: false,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000003',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[1].id,
      paid_by: DEMO_MEMBERS[1].id,
      type: 'expense',
      amount: 680,
      merchant: '全聯福利中心',
      category_id: DEMO_CATEGORIES[1].id, // 生鮮超市
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[3].id,
      note: '晚餐食材：產銷履歷有機高麗菜、去骨雞胸肉、雞蛋、豆腐 [🧾 HQ-55124098|11309|5678|pending|0|]',
      transacted_at: new Date(txBaseTime - 3600000 * 30).toISOString(),
      is_settled: false,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000004',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 1200,
      merchant: '台灣中油直營站',
      category_id: DEMO_CATEGORIES[3].id, // 交通出行
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[2].id,
      note: '家庭休旅車 95 無鉛汽油加滿 [🧾 HQ-67812903|11309|9999|pending|0|]',
      transacted_at: new Date(txBaseTime - 3600000 * 48).toISOString(),
      is_settled: false,
      is_reconciled: true, // 示範已對帳項目
    },
    {
      id: 'ee400000-0000-4000-8000-000000000005',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 2480,
      merchant: '金色三麥啤酒餐廳',
      category_id: DEMO_CATEGORIES[0].id, // 餐飲伙食
      payment_method: 'bank_transfer',
      account_id: DEMO_ACCOUNTS[1].id,
      note: '週五全家歡聚家庭晚餐＋招牌椒麻雞',
      transacted_at: new Date(txBaseTime - 3600000 * 60).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000006',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'income',
      amount: 72000,
      merchant: '公司薪轉戶',
      category_id: DEMO_CATEGORIES[9].id, // 薪資收入
      payment_method: 'bank_transfer',
      account_id: DEMO_ACCOUNTS[1].id,
      note: '智爸 本月正式薪資入帳（已扣勞健保）',
      transacted_at: new Date(txBaseTime - 3600000 * 72).toISOString(),
      is_settled: true,
      is_reconciled: true,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000007',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[1].id,
      paid_by: DEMO_MEMBERS[1].id,
      type: 'income',
      amount: 15000,
      merchant: '出版社合作',
      category_id: DEMO_CATEGORIES[9].id, // 薪資收入
      payment_method: 'bank_transfer',
      account_id: DEMO_ACCOUNTS[1].id,
      note: '瑩媽 自由接案圖文插畫稿費入帳',
      transacted_at: new Date(txBaseTime - 3600000 * 80).toISOString(),
      is_settled: true,
      is_reconciled: true,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000008',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 500,
      merchant: '洋洋學生悠遊卡加值',
      category_id: DEMO_CATEGORIES[3].id, // 交通出行
      payment_method: 'cash',
      account_id: DEMO_ACCOUNTS[0].id,
      note: '智爸 現金皮夾 轉帳加值到洋洋學生悠遊卡',
      transacted_at: new Date(txBaseTime - 3600000 * 90).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000009',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[2].id,
      paid_by: DEMO_MEMBERS[2].id,
      type: 'expense',
      amount: 35,
      merchant: '台北捷運',
      category_id: DEMO_CATEGORIES[3].id, // 交通出行
      payment_method: 'stored_value',
      account_id: DEMO_ACCOUNTS[4].id,
      note: '洋洋放學搭乘捷運淡水信義線',
      transacted_at: new Date(txBaseTime - 3600000 * 15).toISOString(),
      is_settled: true,
      is_reconciled: true,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000010',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[2].id,
      paid_by: DEMO_MEMBERS[2].id,
      type: 'expense',
      amount: 55,
      merchant: '全家便利商店',
      category_id: DEMO_CATEGORIES[0].id, // 餐飲伙食
      payment_method: 'stored_value',
      account_id: DEMO_ACCOUNTS[4].id,
      note: '放學課後點心：低糖豆漿＋茶葉蛋 2 顆 [🧾 HQ-12349876|11309|4321|pending|0|]',
      transacted_at: new Date(txBaseTime - 3600000 * 18).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000011',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[3].id,
      paid_by: DEMO_MEMBERS[3].id,
      type: 'expense',
      amount: 120,
      merchant: '文具王國',
      category_id: DEMO_CATEGORIES[6].id, // 育兒教育
      payment_method: 'cash',
      account_id: DEMO_ACCOUNTS[5].id,
      note: '豆豆用自己的零用錢撲滿買 24 色粉蠟筆',
      transacted_at: new Date(txBaseTime - 3600000 * 40).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000012',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[1].id,
      paid_by: DEMO_MEMBERS[1].id,
      type: 'expense',
      amount: 1590,
      merchant: 'UNIQLO 門市',
      category_id: DEMO_CATEGORIES[7].id, // 衣飾美容
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[3].id,
      note: '換季採買：洋洋發熱衣 2 件、豆豆保暖刷毛褲',
      transacted_at: new Date(txBaseTime - 3600000 * 55).toISOString(),
      is_settled: false,
      is_reconciled: true, // 示範已對帳項目
    },
    {
      id: 'ee400000-0000-4000-8000-000000000013',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 850,
      merchant: '大樹連鎖藥局',
      category_id: DEMO_CATEGORIES[5].id, // 醫療保健
      payment_method: 'cash',
      account_id: DEMO_ACCOUNTS[0].id,
      note: '全家常備補給品：兒童維他命滴劑＋家庭綜合感冒藥水',
      transacted_at: new Date(txBaseTime - 3600000 * 85).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000014',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 60,
      merchant: '市府地下停車場',
      category_id: DEMO_CATEGORIES[3].id, // 交通出行
      payment_method: 'cash',
      account_id: DEMO_ACCOUNTS[0].id,
      note: '週末親子館停車費 2 小時',
      transacted_at: new Date(txBaseTime - 3600000 * 95).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000015',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 165,
      merchant: '早安美而美',
      category_id: DEMO_CATEGORIES[0].id, // 餐飲伙食
      payment_method: 'cash',
      account_id: DEMO_ACCOUNTS[0].id,
      note: '全家週六早午餐：豬排蛋餅、蘿蔔糕加蛋、溫紅茶 2 杯',
      transacted_at: new Date(txBaseTime - 3600000 * 105).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000016',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[1].id,
      paid_by: DEMO_MEMBERS[1].id,
      type: 'expense',
      amount: 4500,
      merchant: '長頸鹿英語補習班',
      category_id: DEMO_CATEGORIES[6].id, // 育兒教育
      payment_method: 'bank_transfer',
      account_id: DEMO_ACCOUNTS[1].id,
      note: '洋洋本期英語會話與課輔月費',
      transacted_at: new Date(txBaseTime - 3600000 * 120).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000017',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 420,
      merchant: '威秀影城',
      category_id: DEMO_CATEGORIES[4].id, // 休閒娛樂
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[2].id,
      note: '帶洋洋與豆豆看週末動畫電影《腦筋急轉彎 2》',
      transacted_at: new Date(txBaseTime - 3600000 * 135).toISOString(),
      is_settled: false,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000018',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[1].id,
      paid_by: DEMO_MEMBERS[1].id,
      type: 'expense',
      amount: 320,
      merchant: '50嵐 飲料店',
      category_id: DEMO_CATEGORIES[0].id, // 餐飲伙食
      payment_method: 'line_pay',
      account_id: DEMO_ACCOUNTS[3].id,
      note: '露營採買路上請朋友喝四季春珍波椰 4 杯',
      transacted_at: new Date(txBaseTime - 3600000 * 145).toISOString(),
      is_settled: false,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000019',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 980,
      merchant: '特力屋 B&Q',
      category_id: DEMO_CATEGORIES[2].id, // 居家水電
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[2].id,
      note: '居家修繕：浴室防滑條、LED 省電燈泡 4 顆組',
      transacted_at: new Date(txBaseTime - 3600000 * 160).toISOString(),
      is_settled: false,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000020',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 520,
      merchant: '蝦皮拍賣',
      category_id: DEMO_CATEGORIES[8].id, // 數位３Ｃ
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[2].id,
      note: 'Type-C 快充編織充電線 2 條組',
      transacted_at: new Date(txBaseTime - 3600000 * 170).toISOString(),
      is_settled: false,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000021',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[1].id,
      paid_by: DEMO_MEMBERS[1].id,
      type: 'expense',
      amount: 250,
      merchant: '屈臣氏',
      category_id: DEMO_CATEGORIES[5].id, // 醫療保健
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[3].id,
      note: '戶外防蚊噴霧液＋草本保濕洗手乳',
      transacted_at: new Date(txBaseTime - 3600000 * 180).toISOString(),
      is_settled: false,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000022',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'income',
      amount: 3200,
      merchant: '元大高股息 0056',
      category_id: DEMO_CATEGORIES[10].id, // 投資理財
      payment_method: 'bank_transfer',
      account_id: DEMO_ACCOUNTS[1].id,
      note: '本季 ETF 0056 現金股利配息入帳',
      transacted_at: new Date(txBaseTime - 3600000 * 200).toISOString(),
      is_settled: true,
      is_reconciled: true,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000023',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 150,
      merchant: '清心福全',
      category_id: DEMO_CATEGORIES[0].id, // 餐飲伙食
      payment_method: 'cash',
      account_id: DEMO_ACCOUNTS[0].id,
      note: '烏龍綠茶 2 杯＋布丁奶茶 1 杯',
      transacted_at: new Date(txBaseTime - 3600000 * 210).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000024',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[1].id,
      paid_by: DEMO_MEMBERS[1].id,
      type: 'expense',
      amount: 890,
      merchant: '誠品生活書店',
      category_id: DEMO_CATEGORIES[6].id, // 育兒教育
      payment_method: 'credit_card',
      account_id: DEMO_ACCOUNTS[3].id,
      note: '洋洋科學小百科童書＋豆豆立體翻翻繪本',
      transacted_at: new Date(txBaseTime - 3600000 * 220).toISOString(),
      is_settled: false,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000025',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'expense',
      amount: 45,
      merchant: 'OK 便利商店',
      category_id: DEMO_CATEGORIES[0].id, // 餐飲伙食
      payment_method: 'cash',
      account_id: DEMO_ACCOUNTS[0].id,
      note: '礦泉水與洋芋片零嘴',
      transacted_at: new Date(txBaseTime - 3600000 * 230).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    // 3 筆共享生活備忘錄 (以 type: 'memo' 存入 transactions)
    {
      id: 'ee400000-0000-4000-8000-000000000026',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'memo',
      amount: 0,
      merchant: '🏕️ 露營採買清單',
      category_id: DEMO_CATEGORIES[12].id, // 生活備忘
      note: '[🛒 採買清單] 週末新竹五峰露營裝備與採買\n- [x] 防蚊液與草本貼片 (瑩媽已買)\n- [x] 洋洋最愛的烤棉花糖 (洋洋已買)\n- [ ] 頂級雪花牛排 2 盒\n- [ ] 金色三麥精釀啤酒 6 罐\n- [ ] 瓦斯爐卡式瓦斯罐 3 罐',
      transacted_at: new Date(txBaseTime - 3600000 * 5).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000027',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[1].id,
      paid_by: DEMO_MEMBERS[1].id,
      type: 'memo',
      amount: 0,
      merchant: '🏫 幼兒園座談會',
      category_id: DEMO_CATEGORIES[12].id, // 生活備忘
      note: '[🎒 學校親子] 下週四豆豆幼稚園家長座談會\n時間：週四晚上 19:00～20:30\n地點：大白兔班教室\n提醒：智爸下班順路接豆豆，瑩媽負責帶簽到資料。',
      transacted_at: new Date(txBaseTime - 3600000 * 10).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
    {
      id: 'ee400000-0000-4000-8000-000000000028',
      ledger_id: DEMO_LEDGER_ID,
      creator_id: DEMO_MEMBERS[0].id,
      paid_by: DEMO_MEMBERS[0].id,
      type: 'memo',
      amount: 0,
      merchant: '✨ 體驗帳本秘訣',
      category_id: DEMO_CATEGORIES[12].id, // 生活備忘
      note: '[💡 靈感筆記] 甜心記帳本體驗小秘訣 (歡迎試玩！)\n- [x] 點擊頂部任務條，把「智爸」換成您自己的名字！\n- [x] 點擊發票對獎，看那張中了 200 元的幸運發票。\n- [ ] 試著新增一筆咖啡消費，體驗極速記帳手感。\n- [ ] 試玩所有變更僅存於本機，隨時可一鍵還原！',
      transacted_at: new Date(txBaseTime - 3600000 * 20).toISOString(),
      is_settled: true,
      is_reconciled: false,
    },
  ];

  for (const tx of demoTransactions) {
    const { error: txErr } = await supabase.from('transactions').upsert(tx);
    if (txErr) console.warn(`Transaction ${tx.merchant} 警告:`, txErr.message);
  }

  console.log('\n🎉 SWEETHOME 示範帳本資料已全部成功植入 Supabase 雲端！');
  console.log('• 帳本 ID:', DEMO_LEDGER_ID);
  console.log('• 邀請碼: SWEETHOME');
  console.log('• 成員數: 4 (智爸, 瑩媽, 洋洋, 豆豆)');
  console.log('• 交易數: 28 筆 (含 25 筆消費/收入 + 3 筆生活備忘錄)');
  console.log('• 帳戶數: 6 個 (現金, 公帳, 信用卡, 悠遊卡, 存錢筒)');
  console.log('• 週期帳單: 4 筆 (水電, 光世代, 串流)');
}

seed().catch(err => {
  console.error('執行過程發生未預期錯誤:', err);
  process.exit(1);
});
