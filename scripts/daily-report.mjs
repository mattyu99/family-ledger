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

// 計算台灣時間 (UTC+8) 的收支日報統計區間與月份起訖
function getTaiwanTimeRanges() {
  const now = new Date();
  // 轉換為 UTC+8 時間
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const currentTwDate = new Date(utcMs + 8 * 3600000);
  const currentHours = currentTwDate.getHours();

  // 跨午夜延遲防呆機制：
  // 每日收支日報預設於每晚 21:18~21:30 觸發。
  // 若因 GitHub Actions 排程佇列延誤，導致執行時間落在凌晨 (00:00 ~ 05:59)，
  // 自動將統計基準日回推至「前一日 (昨日)」，確保統計的是完整前一日收支而非清晨空白數據。
  const isDelayedOvernight = currentHours < 6;
  const targetTwDate = new Date(currentTwDate);
  if (isDelayedOvernight) {
    targetTwDate.setDate(targetTwDate.getDate() - 1);
    console.log(
      `ℹ️ [排程延遲防呆] 偵測到目前執行時間為台灣凌晨 ${String(currentHours).padStart(2, '0')}:${String(currentTwDate.getMinutes()).padStart(2, '0')}，` +
      `自動將日報統計區間回推為昨日 (${targetTwDate.getFullYear()}/${targetTwDate.getMonth() + 1}/${targetTwDate.getDate()})。`
    );
  }

  const year = targetTwDate.getFullYear();
  const month = targetTwDate.getMonth(); // 0-11
  const date = targetTwDate.getDate();

  // 本日開始 (00:00:00 UTC+8 換算回 UTC)
  const startOfDayUtc = new Date(Date.UTC(year, month, date, 0 - 8, 0, 0, 0));
  // 本日結束 (23:59:59.999 UTC+8 換算回 UTC)
  const endOfDayUtc = new Date(Date.UTC(year, month, date, 23 - 8, 59, 59, 999));

  // 本月開始 (當月 1 號 00:00:00 UTC+8)
  const startOfMonthUtc = new Date(Date.UTC(year, month, 1, 0 - 8, 0, 0, 0));

  const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六'];
  const dayStr = daysOfWeek[targetTwDate.getDay()];
  const yyyy = year;
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(date).padStart(2, '0');
  const hh = String(currentTwDate.getHours()).padStart(2, '0');
  const min = String(currentTwDate.getMinutes()).padStart(2, '0');

  const reportDateTag = isDelayedOvernight ? ' (昨夜收支)' : '';

  return {
    startOfDayIso: startOfDayUtc.toISOString(),
    endOfDayIso: endOfDayUtc.toISOString(),
    startOfMonthIso: startOfMonthUtc.toISOString(),
    formattedDate: `${yyyy}/${mm}/${dd} (${dayStr})${reportDateTag} · ${hh}:${min} 發送`,
    yearMonthStr: `${month + 1}月`,
    isDelayedOvernight,
    targetTwDate,
  };
}

/**
 * 檢查帳本內的信用卡是否適逢出帳日隔天或繳款到期前 3 天
 */
async function checkCreditCardAlerts(supabase, ledgerId, targetTwDate, profileMap) {
  try {
    const { data: cards, error } = await supabase
      .from('payment_accounts')
      .select('id, name, billing_cycle_date, user_id')
      .eq('ledger_id', ledgerId)
      .eq('type', 'credit_card');

    if (error || !cards || cards.length === 0) return [];

    const alerts = [];
    const nowYear = targetTwDate.getFullYear();
    const nowMonth = targetTwDate.getMonth();
    const nowDay = targetTwDate.getDate();
    const todayStart = new Date(nowYear, nowMonth, nowDay, 0, 0, 0, 0);

    for (const card of cards) {
      const cycleDate = Math.max(1, Math.min(31, card.billing_cycle_date || 15));
      const cardholder = card.user_id ? (profileMap?.get ? profileMap.get(card.user_id) : profileMap?.[card.user_id]) : null;
      const cardholderName = cardholder ? cardholder.display_name : '';
      const holderTag = cardholderName ? ` (${cardholderName})` : '';

      // 1. 出帳日隔天判定 (結帳日次日)
      const statementDate = new Date(nowYear, nowMonth, cycleDate + 1, 0, 0, 0, 0);
      const isStatementDay =
        statementDate.getFullYear() === nowYear &&
        statementDate.getMonth() === nowMonth &&
        statementDate.getDate() === nowDay;

      // 2. 繳款到期日判定 (結帳日後 20 天)
      const dueDate = new Date(nowYear, nowMonth, cycleDate + 20, 23, 59, 59, 999);
      const diffMs = dueDate.getTime() - todayStart.getTime();
      const daysRemaining = Math.ceil(diffMs / (24 * 3600 * 1000));
      const isDueSoon = daysRemaining >= 1 && daysRemaining <= 3;

      if (isStatementDay || isDueSoon) {
        // 查詢該卡待繳/未核銷金額
        const { data: cardTx } = await supabase
          .from('transactions')
          .select('amount')
          .eq('ledger_id', ledgerId)
          .eq('account_id', card.id)
          .eq('type', 'expense')
          .neq('is_reconciled', true);

        const pendingTotal = (cardTx || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const amountStr = pendingTotal > 0 ? `NT$ ${pendingTotal.toLocaleString()}` : '請見銀行帳單';
        const dueDayStr = `${dueDate.getMonth() + 1}月${dueDate.getDate()}號`;

        if (isStatementDay) {
          alerts.push({
            type: 'statement',
            cardName: card.name,
            title: `💳 ${card.name}${holderTag} 本期帳單已出帳`,
            body: `帳單已於今日出帳，待繳約 ${amountStr}，請記得於 ${dueDayStr} 前完成繳納！`,
          });
        } else if (isDueSoon) {
          alerts.push({
            type: 'due_soon',
            cardName: card.name,
            title: `⏰ ${card.name}${holderTag} 繳款期限倒數 ${daysRemaining} 天`,
            body: `帳單將於 ${dueDayStr} 到期，待繳約 ${amountStr}，請及早安排扣款或轉帳！`,
          });
        }
      }
    }

    return alerts;
  } catch (err) {
    console.warn('⚠️ 查詢信用卡帳單提醒時發生例外:', err.message);
    return [];
  }
}

/**
 * 檢查帳本內未完成的生活記事與待辦提醒（今日到期、逾期待辦與未來 3 天預告）
 */
async function checkMemoAlerts(supabase, ledgerId, targetTwDate, profileMap) {
  try {
    const { data: memos, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('ledger_id', ledgerId)
      .eq('type', 'memo')
      .neq('is_settled', true);

    if (error || !memos || memos.length === 0) {
      return { todayMemos: [], upcomingMemos: [], overdueMemos: [] };
    }

    const nowYear = targetTwDate.getFullYear();
    const nowMonth = String(targetTwDate.getMonth() + 1).padStart(2, '0');
    const nowDay = String(targetTwDate.getDate()).padStart(2, '0');
    const todayYmd = `${nowYear}-${nowMonth}-${nowDay}`;
    const todayTime = new Date(nowYear, targetTwDate.getMonth(), targetTwDate.getDate()).getTime();

    const todayMemos = [];
    const upcomingMemos = [];
    const overdueMemos = [];

    for (const m of memos) {
      if (!m.reminder_date) continue;
      const rYmd = m.reminder_date;

      // 提取責任人
      const assignee = profileMap?.get(m.paid_by) || profileMap?.get(m.creator_id);
      const assigneeName = assignee ? assignee.display_name : '';

      // 解析標題與乾淨內文
      const rawText = (m.note || '').trim();
      const match = rawText.match(/[\[［【]([^\[\]［］【】\n]{1,16})[\]］】]/);
      const title = match ? match[1].trim() : '生活待辦';
      const cleanContent = match ? rawText.replace(match[0], '').trim() : rawText;

      const isPersonal = m.reminder_target === 'personal';
      const scopeTag = isPersonal ? (assigneeName ? `[個人·${assigneeName}]` : '[個人]') : '[全家]';

      const item = {
        id: m.id,
        title: `${scopeTag} ${title}`,
        content: cleanContent || '(無備註)',
        reminderDate: rYmd,
        assigneeName,
        isPersonal,
      };

      if (rYmd === todayYmd) {
        todayMemos.push(item);
      } else if (rYmd < todayYmd) {
        overdueMemos.push(item);
      } else {
        const parts = rYmd.split('-');
        if (parts.length === 3) {
          const mDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
          const diffDays = Math.round((mDate - todayTime) / (24 * 3600 * 1000));
          if (diffDays >= 1 && diffDays <= 3) {
            upcomingMemos.push({ ...item, diffDays });
          }
        }
      }
    }

    return { todayMemos, upcomingMemos, overdueMemos };
  } catch (err) {
    console.warn('⚠️ 查詢生活記事提醒時發生例外:', err.message);
    return { todayMemos: [], upcomingMemos: [], overdueMemos: [] };
  }
}

/**
 * 建立 LINE Flex Message (超精美原生圖文卡片，徹底根絕折行破版)
 */
function buildFlexMessage({
  ledgerName,
  formattedDate,
  yearMonthStr,
  todayExpense,
  todayIncome,
  todayBalance,
  todayCount,
  memberExpenseMap,
  detailedItems,
  monthExpense,
  monthBalance,
  billingAlerts = [],
  memoAlerts = null,
}) {
  const isZero = todayCount === 0;
  const bodyContents = [];

  // 0. 信用卡結帳／繳款到期警戒卡片
  if (billingAlerts && billingAlerts.length > 0) {
    const alertItems = [];
    billingAlerts.forEach(a => {
      alertItems.push({
        type: 'text',
        text: a.title,
        size: 'sm',
        weight: 'bold',
        color: '#991B1B',
      });
      alertItems.push({
        type: 'text',
        text: a.body,
        size: 'xs',
        color: '#B91C1C',
        wrap: true,
        margin: 'xs',
      });
    });

    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FEF2F2',
      cornerRadius: '12px',
      paddingAll: '12px',
      borderWidth: '1px',
      borderColor: '#FECACA',
      contents: [
        {
          type: 'text',
          text: '💳 信用卡帳單與繳款警戒提醒',
          weight: 'bold',
          size: 'xs',
          color: '#DC2626',
          margin: 'none',
        },
        {
          type: 'separator',
          color: '#FCA5A5',
          margin: 'xs',
        },
        ...alertItems,
      ],
    });
  }

  // 0.5 生活記事與待辦備忘提醒卡片
  if (memoAlerts && (memoAlerts.todayMemos.length > 0 || memoAlerts.overdueMemos.length > 0 || memoAlerts.upcomingMemos.length > 0)) {
    const memoRows = [];

    // 今日待辦
    memoAlerts.todayMemos.forEach(m => {
      memoRows.push({
        type: 'text',
        text: `📌 今日待辦：【${m.title}】${m.content}${m.assigneeName ? ` (${m.assigneeName})` : ''}`,
        size: 'xs',
        color: '#1E293B',
        weight: 'bold',
        wrap: true,
        margin: 'xs',
      });
    });

    // 逾期待辦
    memoAlerts.overdueMemos.slice(0, 3).forEach(m => {
      memoRows.push({
        type: 'text',
        text: `⚠️ 逾期待辦：【${m.title}】${m.content}${m.assigneeName ? ` (${m.assigneeName})` : ''}`,
        size: 'xs',
        color: '#B91C1C',
        wrap: true,
        margin: 'xs',
      });
    });

    // 近期預告 (明天或後天)
    memoAlerts.upcomingMemos.slice(0, 3).forEach(m => {
      const daysText = m.diffDays === 1 ? '明天' : m.diffDays === 2 ? '後天' : `${m.diffDays}天後`;
      memoRows.push({
        type: 'text',
        text: `📅 ${daysText}預告：【${m.title}】${m.content}${m.assigneeName ? ` (${m.assigneeName})` : ''}`,
        size: 'xs',
        color: '#475569',
        wrap: true,
        margin: 'xs',
      });
    });

    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F8FAFC',
      cornerRadius: '12px',
      paddingAll: '12px',
      borderWidth: '1px',
      borderColor: '#E2E8F0',
      margin: 'sm',
      contents: [
        {
          type: 'text',
          text: '📌 生活記事與待辦備忘提醒',
          weight: 'bold',
          size: 'xs',
          color: '#334155',
          margin: 'none',
        },
        {
          type: 'separator',
          color: '#CBD5E1',
          margin: 'xs',
        },
        ...memoRows,
      ],
    });
  }

  // 1. KPI 總額區塊
  if (isZero) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F0FDF4',
      cornerRadius: '12px',
      paddingAll: '14px',
      contents: [
        {
          type: 'text',
          text: '🎉 今日全家零支出！',
          weight: 'bold',
          size: 'md',
          color: '#16A34A',
        },
        {
          type: 'text',
          text: '今天沒有任何開銷紀錄，荷包滿滿～大家都辛苦囉！',
          size: 'xs',
          color: '#15803D',
          margin: 'sm',
          wrap: true,
        },
      ],
    });
  } else {
    const kpiBox = [
      {
        type: 'text',
        text: `💸 今日總支出 (${todayCount}筆)`,
        size: 'xs',
        color: '#64748B',
      },
      {
        type: 'text',
        text: `NT$ ${todayExpense.toLocaleString()}`,
        weight: 'bold',
        size: 'xxl',
        color: '#E11D48',
        margin: 'xs',
      },
    ];

    if (todayIncome > 0) {
      kpiBox.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        contents: [
          { type: 'text', text: '💰 今日總收入', size: 'xs', color: '#64748B' },
          { type: 'text', text: `+NT$ ${todayIncome.toLocaleString()}`, size: 'xs', weight: 'bold', align: 'end', color: '#16A34A' },
        ],
      });
      kpiBox.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: '⚖️ 今日淨結餘', size: 'xs', color: '#64748B' },
          {
            type: 'text',
            text: `${todayBalance >= 0 ? '+' : ''}NT$ ${todayBalance.toLocaleString()}`,
            size: 'xs',
            weight: 'bold',
            align: 'end',
            color: todayBalance >= 0 ? '#16A34A' : '#E11D48',
          },
        ],
      });
    }

    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F8FAFC',
      cornerRadius: '12px',
      paddingAll: '12px',
      contents: kpiBox,
    });
  }

  // 2. 成員支出明細
  if (memberExpenseMap && memberExpenseMap.size > 0) {
    const memberRows = [];
    for (const [name, info] of memberExpenseMap.entries()) {
      memberRows.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `${info.avatar || '👤'} ${name}`, size: 'sm', color: '#334155' },
          {
            type: 'text',
            text: `NT$ ${info.total.toLocaleString()} (${info.count}筆)`,
            size: 'sm',
            weight: 'bold',
            align: 'end',
            color: '#0F172A',
          },
        ],
      });
    }

    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      margin: 'md',
      contents: [
        { type: 'text', text: '👥 成員支出明細', size: 'xs', weight: 'bold', color: '#64748B' },
        ...memberRows,
      ],
    });
  }

  // 3. 今日明細清單 (最多 8 筆，其餘摺疊)
  if (detailedItems && detailedItems.length > 0) {
    bodyContents.push({ type: 'separator', color: '#E2E8F0', margin: 'md' });

    const itemRows = [];
    const displayList = detailedItems.slice(0, 8);
    for (const item of displayList) {
      itemRows.push({
        type: 'box',
        layout: 'vertical',
        spacing: 'none',
        margin: 'xs',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: `${item.icon} ${item.name}`,
                size: 'sm',
                weight: 'bold',
                color: '#0F172A',
                flex: 7,
              },
              {
                type: 'text',
                text: `${item.type === 'income' ? '+' : '-'}NT$ ${item.amount.toLocaleString()}`,
                size: 'sm',
                weight: 'bold',
                align: 'end',
                color: item.type === 'income' ? '#16A34A' : '#E11D48',
                flex: 5,
              },
            ],
          },
          {
            type: 'text',
            text: `${item.payerName}${item.note ? ` · ${item.note}` : ''}`,
            size: 'xs',
            color: '#94A3B8',
            margin: 'none',
          },
        ],
      });
    }

    if (detailedItems.length > 8) {
      itemRows.push({
        type: 'text',
        text: `... 另有 ${detailedItems.length - 8} 筆明細，請開 App 查看`,
        size: 'xs',
        color: '#94A3B8',
        align: 'center',
        margin: 'sm',
      });
    }

    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        { type: 'text', text: '🛒 今日消費清單', size: 'xs', weight: 'bold', color: '#64748B' },
        ...itemRows,
      ],
    });
  }

  // 4. 本月累計數據
  bodyContents.push({ type: 'separator', color: '#E2E8F0', margin: 'md' });
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `📊 ${yearMonthStr}累計支出`, size: 'xs', color: '#64748B' },
          { type: 'text', text: `NT$ ${monthExpense.toLocaleString()}`, size: 'xs', weight: 'bold', align: 'end', color: '#334155' },
        ],
      },
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `💰 ${yearMonthStr}累計結餘`, size: 'xs', color: '#64748B' },
          {
            type: 'text',
            text: `${monthBalance >= 0 ? '+' : ''}NT$ ${monthBalance.toLocaleString()}`,
            size: 'xs',
            weight: 'bold',
            align: 'end',
            color: monthBalance >= 0 ? '#16A34A' : '#E11D48',
          },
        ],
      },
    ],
  });

  return {
    type: 'flex',
    altText: `💖 甜心記帳本・今日收支日報 (今日支出: NT$ ${todayExpense.toLocaleString()})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFF1F2',
        paddingTop: '16px',
        paddingBottom: '14px',
        paddingStart: '18px',
        paddingEnd: '18px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '💖 甜心記帳本', weight: 'bold', color: '#E11D48', size: 'sm' },
              {
                type: 'text',
                text: ledgerName || '家庭公帳',
                size: 'xs',
                color: '#9F1239',
                align: 'end',
                weight: 'bold',
              },
            ],
          },
          {
            type: 'text',
            text: '今日收支日報',
            weight: 'bold',
            size: 'xl',
            color: '#1C1917',
            margin: 'sm',
          },
          {
            type: 'text',
            text: `📅 ${formattedDate}`,
            size: 'xs',
            color: '#78716C',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '18px',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'text',
            text: '🌟 每一筆紀錄，都是全家人的溫馨生活記憶！',
            size: 'xxs',
            color: '#94A3B8',
            align: 'center',
          },
        ],
      },
    },
  };
}

/**
 * 建立乾淨、防折行的純文字訊息 (備援用途)
 */
function buildTextMessage({
  ledgerName,
  formattedDate,
  yearMonthStr,
  todayExpense,
  todayIncome,
  todayBalance,
  todayCount,
  memberExpenseMap,
  detailedItems,
  monthExpense,
  monthBalance,
  billingAlerts = [],
  memoAlerts = null,
}) {
  const lines = [
    `💖 甜心記帳本 · 收支日報`,
    `🏠 ${ledgerName || '家庭公帳'}`,
    `📅 ${formattedDate}`,
    `───────────────`,
  ];

  if (billingAlerts && billingAlerts.length > 0) {
    lines.push('💳 信用卡帳單與繳款警戒提醒：');
    billingAlerts.forEach(a => {
      lines.push(`• ${a.title}`);
      lines.push(`  ${a.body}`);
    });
    lines.push('───────────────');
  }

  if (memoAlerts && (memoAlerts.todayMemos.length > 0 || memoAlerts.overdueMemos.length > 0 || memoAlerts.upcomingMemos.length > 0)) {
    lines.push('📌 生活記事與待辦備忘提醒：');
    memoAlerts.todayMemos.forEach(m => {
      lines.push(`• 今日待辦：【${m.title}】${m.content}${m.assigneeName ? ` (${m.assigneeName})` : ''}`);
    });
    memoAlerts.overdueMemos.slice(0, 3).forEach(m => {
      lines.push(`• 逾期待辦：【${m.title}】${m.content}${m.assigneeName ? ` (${m.assigneeName})` : ''}`);
    });
    memoAlerts.upcomingMemos.slice(0, 3).forEach(m => {
      const daysText = m.diffDays === 1 ? '明天' : m.diffDays === 2 ? '後天' : `${m.diffDays}天後`;
      lines.push(`• ${daysText}預告：【${m.title}】${m.content}${m.assigneeName ? ` (${m.assigneeName})` : ''}`);
    });
    lines.push('───────────────');
  }

  if (todayCount === 0) {
    lines.push(`🎉 今日全家零支出！`);
    lines.push(`今天沒有任何花費開銷，荷包滿滿～大家辛苦囉！`);
  } else {
    lines.push(`💸 今日總支出 (${todayCount}筆)`);
    lines.push(`   NT$ ${todayExpense.toLocaleString()}`);

    if (todayIncome > 0) {
      lines.push(`💰 今日總收入`);
      lines.push(`   +NT$ ${todayIncome.toLocaleString()}`);
      lines.push(`⚖️ 今日淨結餘`);
      lines.push(`   ${todayBalance >= 0 ? '+' : ''}NT$ ${todayBalance.toLocaleString()}`);
    }

    if (memberExpenseMap && memberExpenseMap.size > 0) {
      lines.push('');
      lines.push(`👥 成員支出：`);
      for (const [name, info] of memberExpenseMap.entries()) {
        lines.push(`• ${info.avatar || '👤'} ${name}：NT$ ${info.total.toLocaleString()} (${info.count}筆)`);
      }
    }

    if (detailedItems && detailedItems.length > 0) {
      lines.push('');
      lines.push(`🛒 今日消費清單：`);
      detailedItems.slice(0, 8).forEach(item => {
        lines.push(`• ${item.icon} ${item.name}  -NT$ ${item.amount.toLocaleString()}`);
        lines.push(`  ${item.payerName}${item.note ? ` (${item.note})` : ''}`);
      });
      if (detailedItems.length > 8) {
        lines.push(`  ... 另有 ${detailedItems.length - 8} 筆請看 App`);
      }
    }
  }

  lines.push(`───────────────`);
  lines.push(`📊 ${yearMonthStr}累計支出：NT$ ${monthExpense.toLocaleString()}`);
  lines.push(`💰 ${yearMonthStr}累計結餘：${monthBalance >= 0 ? '+' : ''}NT$ ${monthBalance.toLocaleString()}`);
  lines.push(`🌟 辛苦了，每一筆都是愛的痕跡！`);

  return lines.join('\n');
}

/**
 * 發送 LINE 訊息：優先發送 Flex 卡片，若失敗則無縫降級為防折行純文字
 */
async function sendLineMessage(flexPayload, textPayload) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_TARGET_ID) {
    console.log('ℹ️ [LINE] 未偵測到 LINE_CHANNEL_ACCESS_TOKEN 或 LINE_TARGET_ID，跳過 LINE 發送。（Supabase 防休眠存取仍已圓滿完成）');
    return;
  }

  // 1. 優先發送高質感 Flex Message 卡片
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: LINE_TARGET_ID,
        messages: [flexPayload],
      }),
    });

    if (res.ok) {
      console.log('✅ [LINE] 成功將高質感 Flex 卡片日報推播至 LINE！');
      return;
    } else {
      const errText = await res.text();
      console.warn(`⚠️ [LINE] Flex 卡片推播未通過 (HTTP ${res.status}): ${errText}，即將切換為純文字備援發送...`);
    }
  } catch (err) {
    console.warn('⚠️ [LINE] Flex 卡片網路傳輸異常，嘗試純文字備援:', err);
  }

  // 2. 備援方案：若 Flex 格式未過，發送防折行純文字
  try {
    const fallbackRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: LINE_TARGET_ID,
        messages: [{ type: 'text', text: textPayload }],
      }),
    });

    if (fallbackRes.ok) {
      console.log('✅ [LINE] 成功將備援防折行文字日報推播至 LINE！');
    } else {
      const errText = await fallbackRes.text();
      console.error(`❌ [LINE] 備援文字推播失敗 (HTTP ${fallbackRes.status}):`, errText);
    }
  } catch (err) {
    console.error('❌ [LINE] 備援文字網路連線錯誤:', err);
  }
}

async function main() {
  console.log('🚀 開始執行 Supabase Keep-Alive 防休眠與收支日報生成任務...');

  // 1. 【防休眠保活】透過真實 API 查詢 Supabase profiles
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

  const { startOfDayIso, endOfDayIso, startOfMonthIso, formattedDate, yearMonthStr, targetTwDate } = getTaiwanTimeRanges();

  // 若目前資料庫尚無特定帳本紀錄，產生通用防休眠日報
  if (ledgersToReport.length === 0) {
    const fallbackText = [
      '💖 甜心記帳本 · 系統守護打卡',
      `📅 ${formattedDate}`,
      '───────────────',
      '🌟 雲端資料庫 Keep-Alive 自動存取已順利完成！',
      '目前尚未建立雲端帳本或無交易資料，隨時打開 App 即可秒開使用～',
      '───────────────',
      '🏠 每一筆記錄，都是全家人的溫馨生活記憶。',
    ].join('\n');

    const fallbackFlex = {
      type: 'flex',
      altText: '💖 甜心記帳本・系統守護打卡',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#FFF1F2',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: '💖 甜心記帳本', weight: 'bold', color: '#E11D48', size: 'sm' },
            { type: 'text', text: '系統守護打卡', weight: 'bold', size: 'lg', color: '#1C1917', margin: 'xs' },
            { type: 'text', text: `📅 ${formattedDate}`, size: 'xs', color: '#78716C', margin: 'xs' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: '🌟 雲端資料庫 Keep-Alive 已順利完成！', weight: 'bold', size: 'sm', color: '#16A34A' },
            { type: 'text', text: '目前尚未建立雲端帳本或尚無交易，打開 App 即可秒開使用～', size: 'xs', color: '#64748B', margin: 'sm', wrap: true },
          ],
        },
      },
    };

    console.log('\n--- 日報預覽 ---\n' + fallbackText + '\n----------------');
    await sendLineMessage(fallbackFlex, fallbackText);
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
    const detailedItems = [];

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

        detailedItems.push({
          type: 'expense',
          amount: amt,
          icon: cat.icon || '📝',
          name: cat.name || '其他',
          note: t.note || '',
          payerName: payer.display_name,
        });
      } else if (t.type === 'income') {
        todayIncome += amt;
        detailedItems.push({
          type: 'income',
          amount: amt,
          icon: '💰',
          name: cat.name || '收入',
          note: t.note || '',
          payerName: payer.display_name,
        });
      }
    });

    const todayBalance = todayIncome - todayExpense;

    // (D) 巡檢信用卡出帳日與繳款期限警戒
    const billingAlerts = await checkCreditCardAlerts(supabase, ledger.id, targetTwDate, profileMap);
    if (billingAlerts.length > 0) {
      console.log(`💳 偵測到 ${billingAlerts.length} 則信用卡帳單出帳或繳款警戒提醒！`);
    }

    // (E) 巡檢生活記事待辦提醒 (今日到期、逾期與未來 3 天重要預告)
    const memoAlerts = await checkMemoAlerts(supabase, ledger.id, targetTwDate, profileMap);
    const memoCount = memoAlerts.todayMemos.length + memoAlerts.overdueMemos.length + memoAlerts.upcomingMemos.length;
    if (memoCount > 0) {
      console.log(`📌 偵測到 ${memoCount} 則生活記事待辦提醒 (今日: ${memoAlerts.todayMemos.length}, 逾期: ${memoAlerts.overdueMemos.length}, 預告: ${memoAlerts.upcomingMemos.length})！`);
    }

    const reportData = {
      ledgerName: ledger.name,
      formattedDate,
      yearMonthStr,
      todayExpense,
      todayIncome,
      todayBalance,
      todayCount: (todayTx || []).length,
      memberExpenseMap,
      detailedItems,
      monthExpense,
      monthBalance,
      billingAlerts,
      memoAlerts,
    };

    const flexPayload = buildFlexMessage(reportData);
    const textPayload = buildTextMessage(reportData);

    console.log('\n--- 產生之純文字版預覽 ---\n' + textPayload + '\n------------------------\n');

    await sendLineMessage(flexPayload, textPayload);
  }

  console.log('🎉 任務全部順利執行完畢！');
}

main().catch(err => {
  console.error('💥 任務執行失敗:', err);
  process.exit(1);
});
