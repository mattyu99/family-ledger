import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

export const DEMO_LEDGER_ID = 'ee100000-0000-4000-8000-000000000001';

// 嘗試載入本地 .env 檔案（如果環境變數尚未設定，僅在不存在時載入）
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

function getEnvConfig() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    LINE_TARGET_ID: process.env.LINE_TARGET_ID || process.env.LINE_GROUP_ID || process.env.LINE_USER_ID,
    TARGET_LEDGER_ID: process.env.LEDGER_ID,
  };
}

class DummyWS {}

function createSupabaseBackendClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: DummyWS },
  });
}

/**
 * 判斷是否為應從 LINE 日報排除之示範帳本
 */
export function isExcludedDemoLedger(ledger) {
  if (!ledger) return true;
  const id = String(ledger.id || '');
  if (id === DEMO_LEDGER_ID || id === 'demo-ledger-id' || id.toLowerCase().includes('sweethome')) {
    return true;
  }
  const name = String(ledger.name || '').toLowerCase();
  return name.includes('sweethome') || name.includes('示範家庭');
}

/**
 * 判斷該帳本本日是否為「安靜日」（無消費/收入紀錄，且無信用卡或生活待辦提醒）
 */
export function isQuietDayReport({ todayCount = 0, billingAlertsCount = 0, memoAlertsCount = 0 }) {
  return Number(todayCount) === 0 && Number(billingAlertsCount) === 0 && Number(memoAlertsCount) === 0;
}

/**
 * 依接收者身份（個人／群組／舊版）過濾要提醒的信用卡，確保私卡不外洩
 */
export function filterCreditCardsForRecipient(cards, options = { mode: 'legacy' }) {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  const mode = options?.mode || 'legacy';
  if (mode === 'legacy') return cards;

  if (mode === 'group') {
    if (!options.includeCreditCards) return [];
    // 群組即便開啟信用卡播報，也僅限未指定持卡人的全家公用卡
    return cards.filter(c => !c.user_id);
  }

  if (options.includeCreditCards === false) return [];
  const uidSet = new Set((options.recipientUserIds || []).filter(Boolean));
  const nameSet = new Set((options.recipientNames || []).map(n => String(n).trim()).filter(Boolean));

  return cards.filter(c => {
    if (!c.user_id) return true;
    if (uidSet.has(c.user_id)) return true;
    const holder = options.profileMap?.get ? options.profileMap.get(c.user_id) : options.profileMap?.[c.user_id];
    const holderName = holder?.display_name ? String(holder.display_name).trim() : '';
    return Boolean(holderName && nameSet.has(holderName));
  });
}

/**
 * 依接收者身份過濾生活記事與待辦，強制保護 personal 隱私記事
 */
export function filterMemosForRecipient(memos, options = { mode: 'legacy' }) {
  if (!Array.isArray(memos) || memos.length === 0) return [];
  const mode = options?.mode || 'legacy';
  if (mode === 'legacy') return memos;
  if (options.includeMemos === false) return [];

  if (mode === 'group') {
    return memos.filter(m => m.reminder_target !== 'personal');
  }

  const uidSet = new Set((options.recipientUserIds || []).filter(Boolean));
  const nameSet = new Set((options.recipientNames || []).map(n => String(n).trim()).filter(Boolean));

  return memos.filter(m => {
    if (m.reminder_target !== 'personal') return true;
    const assigneeId = m.paid_by || m.creator_id;
    if (!assigneeId) return false;
    if (uidSet.has(assigneeId)) return true;
    const assignee = options.profileMap?.get ? options.profileMap.get(assigneeId) : options.profileMap?.[assigneeId];
    const assigneeName = assignee?.display_name ? String(assignee.display_name).trim() : '';
    return Boolean(assigneeName && nameSet.has(assigneeName));
  });
}

// 計算台灣時間 (UTC+8) 的收支日報統計區間與月份起訖
export function getTaiwanTimeRanges(baseDate = new Date()) {
  const utcMs = baseDate.getTime() + baseDate.getTimezoneOffset() * 60000;
  const currentTwDate = new Date(utcMs + 8 * 3600000);
  const currentHours = currentTwDate.getHours();

  // 跨午夜延遲防呆機制：
  // 若因 GitHub Actions 排程佇列延誤，導致執行時間落在台灣凌晨 (00:00 ~ 05:59)，
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
  const month = targetTwDate.getMonth();
  const date = targetTwDate.getDate();

  const startOfDayUtc = new Date(Date.UTC(year, month, date, 0 - 8, 0, 0, 0));
  const endOfDayUtc = new Date(Date.UTC(year, month, date, 23 - 8, 59, 59, 999));
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
 * 輔助函式：推算信用卡發卡機構簡稱（若無 issuer_bank 則從卡名判斷）
 */
export function detectCardBank(card) {
  if (card.issuer_bank && card.issuer_bank.trim()) {
    return card.issuer_bank.trim();
  }
  const name = card.name || '';
  const bankPatterns = [
    { name: '國泰世華', match: /國泰|cathay|cube|koko/i },
    { name: '台北富邦', match: /富邦|fubon|momo|costco/i },
    { name: '中國信託', match: /中信|中國信託|ctbc|line pay/i },
    { name: '台新銀行', match: /台新|taishin|richart|gogo|flygo|玫瑰/i },
    { name: '玉山銀行', match: /玉山|esun|unicard|u bear/i },
    { name: '聯邦銀行', match: /聯邦|federal|吉鶴/i },
    { name: '永豐銀行', match: /永豐|sinopac|大戶|幣倍/i },
    { name: '星展銀行', match: /星展|dbs/i },
    { name: '匯豐銀行', match: /匯豐|hsbc/i },
    { name: '兆豐銀行', match: /兆豐|megabank/i },
    { name: '華南銀行', match: /華南/i },
    { name: '第一銀行', match: /第一|一銀/i },
    { name: '合作金庫', match: /合庫|合作金庫/i },
    { name: '彰化銀行', match: /彰銀|彰化/i },
    { name: '臺灣銀行', match: /臺銀|臺灣銀行/i },
  ];
  for (const b of bankPatterns) {
    if (b.match.test(name)) return b.name;
  }
  return '';
}

/**
 * 檢查帳本內的信用卡是否適逢出帳日隔天、繳款到期前 3 天或今日到期
 * 完整支援自訂 payment_due_day、跨月繳款推算、同銀行帳單週期整併，以及個人／群組隱私過濾
 */
export async function checkCreditCardAlerts(
  supabase,
  ledgerId,
  targetTwDate,
  profileMap,
  filterOpts = { mode: 'legacy' }
) {
  try {
    if (filterOpts?.mode === 'group' && !filterOpts.includeCreditCards) {
      return [];
    }
    if (filterOpts?.mode === 'user' && filterOpts.includeCreditCards === false) {
      return [];
    }

    const { data: rawCards, error } = await supabase
      .from('payment_accounts')
      .select('id, name, billing_cycle_date, payment_due_day, issuer_bank, user_id')
      .eq('ledger_id', ledgerId)
      .eq('type', 'credit_card');

    if (error || !rawCards || rawCards.length === 0) return [];

    // 1. 在過濾前，先依同持卡人、同發卡機構共享補全 billing_cycle_date 與 payment_due_day
    const allCards = rawCards.map(c => ({
      ...c,
      detectedBank: detectCardBank(c),
    }));

    const bankCycleMap = new Map();
    const bankDueMap = new Map();
    allCards.forEach(c => {
      const bankKey = `${c.user_id || 'shared'}__${c.detectedBank || c.id}`;
      if (c.billing_cycle_date && !bankCycleMap.has(bankKey)) {
        bankCycleMap.set(bankKey, c.billing_cycle_date);
      }
      if (c.payment_due_day && !bankDueMap.has(bankKey)) {
        bankDueMap.set(bankKey, c.payment_due_day);
      }
    });

    // 2. 依接收者身份篩選允許提醒之信用卡
    const targetCards = filterCreditCardsForRecipient(allCards, {
      ...filterOpts,
      profileMap,
    });
    if (targetCards.length === 0) return [];

    const alerts = [];
    const nowYear = targetTwDate.getFullYear();
    const nowMonth = targetTwDate.getMonth();
    const nowDay = targetTwDate.getDate();
    const todayStart = new Date(nowYear, nowMonth, nowDay, 0, 0, 0, 0);

    for (const card of targetCards) {
      const bankKey = `${card.user_id || 'shared'}__${card.detectedBank || card.id}`;
      const effectiveCycle = card.billing_cycle_date || bankCycleMap.get(bankKey) || 15;
      const cycleDate = Math.max(1, Math.min(31, Math.trunc(effectiveCycle)));

      const effectiveDue = card.payment_due_day || bankDueMap.get(bankKey);
      const rawDueDay =
        effectiveDue && Number.isFinite(effectiveDue) && effectiveDue >= 1
          ? Math.min(31, Math.trunc(effectiveDue))
          : null;

      const cardholder = card.user_id ? (profileMap?.get ? profileMap.get(card.user_id) : profileMap?.[card.user_id]) : null;
      const cardholderName = cardholder ? cardholder.display_name : '';
      const holderTag = cardholderName ? ` (${cardholderName})` : '';

      // (A) 出帳日判定 (結帳日次日，如 5 號結帳則 6 號出帳)
      const statementDateThisMonth = new Date(nowYear, nowMonth, cycleDate + 1, 0, 0, 0, 0);
      const isStatementDay =
        statementDateThisMonth.getFullYear() === nowYear &&
        statementDateThisMonth.getMonth() === nowMonth &&
        statementDateThisMonth.getDate() === nowDay;

      // (B) 繳款截止日判定 (支援自訂 payment_due_day 或結帳日 + 20 天)
      const candidateDueDates = [-1, 0, 1].map(monthOffset => {
        if (rawDueDay !== null) {
          const dueMonthOffset = rawDueDay > cycleDate ? monthOffset : monthOffset + 1;
          return new Date(nowYear, nowMonth + dueMonthOffset, rawDueDay, 23, 59, 59, 999);
        }
        return new Date(nowYear, nowMonth + monthOffset, cycleDate + 20, 23, 59, 59, 999);
      });

      let matchedDueDate = null;
      let matchedDiffDays = null;
      for (const d of candidateDueDates) {
        const diffMs = d.getTime() - todayStart.getTime();
        const diffDays = Math.round(diffMs / (24 * 3600 * 1000));
        if (diffDays >= 0 && diffDays <= 3) {
          matchedDueDate = d;
          matchedDiffDays = diffDays;
          break;
        }
      }

      if (isStatementDay && !matchedDueDate) {
        if (rawDueDay !== null) {
          const dueMonthOffset = rawDueDay > cycleDate ? 0 : 1;
          matchedDueDate = new Date(nowYear, nowMonth + dueMonthOffset, rawDueDay, 23, 59, 59, 999);
        } else {
          matchedDueDate = new Date(nowYear, nowMonth, cycleDate + 20, 23, 59, 59, 999);
        }
        matchedDiffDays = Math.round((matchedDueDate.getTime() - todayStart.getTime()) / (24 * 3600 * 1000));
      }

      const isDueToday = matchedDiffDays === 0;
      const isDueSoon = matchedDiffDays !== null && matchedDiffDays >= 1 && matchedDiffDays <= 3;

      if (isStatementDay || isDueToday || isDueSoon) {
        const { data: cardTx } = await supabase
          .from('transactions')
          .select('amount')
          .eq('ledger_id', ledgerId)
          .eq('account_id', card.id)
          .eq('type', 'expense')
          .neq('is_reconciled', true);

        const pendingTotal = (cardTx || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const amountStr = pendingTotal > 0 ? `NT$ ${pendingTotal.toLocaleString()}` : '請見銀行帳單';
        const dueDayStr = matchedDueDate ? `${matchedDueDate.getMonth() + 1}月${matchedDueDate.getDate()}號` : '繳款截止日';

        if (isDueToday) {
          alerts.push({
            type: 'due_today',
            cardName: card.name,
            title: `⏰ ${card.name}${holderTag} 今天繳款截止！`,
            body: `帳單最後繳款日就是今天，待繳約 ${amountStr}，請務必於今日完成繳款！`,
          });
        } else if (isDueSoon) {
          alerts.push({
            type: 'due_soon',
            cardName: card.name,
            title: `⏰ ${card.name}${holderTag} 繳款期限倒數 ${matchedDiffDays} 天`,
            body: `帳單將於 ${dueDayStr} 到期，待繳約 ${amountStr}，請及早安排扣款或轉帳！`,
          });
        } else if (isStatementDay) {
          alerts.push({
            type: 'statement',
            cardName: card.name,
            title: `💳 ${card.name}${holderTag} 本期帳單已出帳`,
            body: `帳單已於今日出帳，待繳約 ${amountStr}，請記得於 ${dueDayStr} 前完成繳納！`,
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
 * 具備逾期天數計算、責任人呈現、純淨標題排版與個人／群組隱私分流
 */
export async function checkMemoAlerts(
  supabase,
  ledgerId,
  targetTwDate,
  profileMap,
  filterOpts = { mode: 'legacy' }
) {
  try {
    if (filterOpts?.includeMemos === false) {
      return { todayMemos: [], upcomingMemos: [], overdueMemos: [] };
    }

    const { data: rawMemos, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('ledger_id', ledgerId)
      .eq('type', 'memo')
      .neq('is_settled', true);

    if (error || !rawMemos || rawMemos.length === 0) {
      return { todayMemos: [], upcomingMemos: [], overdueMemos: [] };
    }

    const memos = filterMemosForRecipient(rawMemos, {
      ...filterOpts,
      profileMap,
    });

    if (memos.length === 0) {
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

      const assignee = profileMap?.get(m.paid_by) || profileMap?.get(m.creator_id);
      const assigneeName = assignee ? assignee.display_name : '';

      const rawText = (m.note || '').trim();
      const match = rawText.match(/^[\[［【]([^\[\]［］【】\n]{1,20})[\]］】]\s*/);
      const tag = match ? match[1].trim() : '';
      const cleanContent = match ? rawText.substring(match[0].length).trim() : rawText;

      const isPersonal = m.reminder_target === 'personal';
      const scopeTag = isPersonal ? (assigneeName ? `[個人·${assigneeName}]` : '[個人]') : '[全家]';
      const tagPart = tag ? `【${tag}】` : '';
      const contentPart = cleanContent || '(無備註)';

      const parts = rYmd.split('-');
      let diffDays = 0;
      if (parts.length === 3) {
        const mDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
        diffDays = Math.round((mDate - todayTime) / (24 * 3600 * 1000));
      }

      if (rYmd === todayYmd || diffDays === 0) {
        todayMemos.push({
          id: m.id,
          reminderDate: rYmd,
          formattedText: `📌 今日待辦：${scopeTag} ${tagPart}${contentPart}`,
        });
      } else if (diffDays < 0) {
        const overdueDays = Math.abs(diffDays);
        overdueMemos.push({
          id: m.id,
          reminderDate: rYmd,
          overdueDays,
          formattedText: `⚠️ 逾期待辦 (已逾期 ${overdueDays} 天)：${scopeTag} ${tagPart}${contentPart}`,
        });
      } else if (diffDays >= 1 && diffDays <= 3) {
        const daysText = diffDays === 1 ? '明天' : diffDays === 2 ? '後天' : `${diffDays}天後`;
        upcomingMemos.push({
          id: m.id,
          reminderDate: rYmd,
          diffDays,
          formattedText: `📅 ${daysText}預告：${scopeTag} ${tagPart}${contentPart}`,
        });
      }
    }

    overdueMemos.sort((a, b) => b.overdueDays - a.overdueDays);

    return { todayMemos, upcomingMemos, overdueMemos };
  } catch (err) {
    console.warn('⚠️ 查詢生活記事提醒時發生例外:', err.message);
    return { todayMemos: [], upcomingMemos: [], overdueMemos: [] };
  }
}

/**
 * 建立單本帳簿的 LINE Flex Bubble（支援單張與 Carousel 多帳簿合併共用）
 */
export function buildFlexBubble({
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
  audienceLabel = '',
  omitSummary = false,
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

    memoAlerts.todayMemos.forEach(m => {
      memoRows.push({
        type: 'text',
        text: m.formattedText || `📌 今日待辦：【${m.title}】${m.content}`,
        size: 'xs',
        color: '#1E293B',
        weight: 'bold',
        wrap: true,
        margin: 'xs',
      });
    });

    memoAlerts.overdueMemos.slice(0, 3).forEach(m => {
      memoRows.push({
        type: 'text',
        text: m.formattedText || `⚠️ 逾期待辦：【${m.title}】${m.content}`,
        size: 'xs',
        color: '#B91C1C',
        wrap: true,
        margin: 'xs',
      });
    });

    memoAlerts.upcomingMemos.slice(0, 3).forEach(m => {
      memoRows.push({
        type: 'text',
        text: m.formattedText || `📅 預告：【${m.title}】${m.content}`,
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

  // 1~4. 收支摘要、成員支出與今日明細（支援依訂閱設定略過摘要只留提醒）
  if (!omitSummary) {
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
  }

  if (bodyContents.length === 0) {
    bodyContents.push({
      type: 'text',
      text: '✨ 今日暫無新增待辦或帳單提醒，祝您順心！',
      size: 'xs',
      color: '#64748B',
      wrap: true,
    });
  }

  return {
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
          text: audienceLabel ? `今日收支日報 · ${audienceLabel}` : '今日收支日報',
          weight: 'bold',
          size: 'lg',
          color: '#1C1917',
          margin: 'sm',
          wrap: true,
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
  };
}

/**
 * 相容單本帳簿 Flex 訊息建置函式
 */
export function buildFlexMessage(reportData) {
  return {
    type: 'flex',
    altText: `💖 甜心記帳本・${reportData.ledgerName || '今日'}收支日報 (今日支出: NT$ ${Number(reportData.todayExpense || 0).toLocaleString()})`,
    contents: buildFlexBubble(reportData),
  };
}

/**
 * 將多本帳簿報表封裝為單一推播載荷（1 本出單張 Bubble，2~12 本自動轉 Carousel，節省推播額度）
 */
export function buildCarouselFlexMessage(reportDataList, altPrefix = '💖 甜心記帳本・今日收支日報') {
  if (!Array.isArray(reportDataList) || reportDataList.length === 0) return null;
  if (reportDataList.length === 1) {
    return buildFlexMessage(reportDataList[0]);
  }
  const bubbles = reportDataList.slice(0, 12).map(data => buildFlexBubble(data));
  const summaryNames = reportDataList.slice(0, 3).map(d => d.ledgerName || '帳本').join('、');
  const suffix = reportDataList.length > 3 ? ` 等 ${reportDataList.length} 本` : ` (${reportDataList.length} 本)`;
  const altText = `${altPrefix}：${summaryNames}${suffix}`.slice(0, 390);
  return {
    type: 'flex',
    altText,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

/**
 * 建立乾淨、防折行的純文字訊息 (單本備援用途)
 */
export function buildTextMessage({
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
  audienceLabel = '',
  omitSummary = false,
}) {
  const lines = [
    `💖 甜心記帳本 · 收支日報${audienceLabel ? ` (${audienceLabel})` : ''}`,
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
      lines.push(`• ${m.formattedText || `今日待辦：【${m.title}】${m.content}`}`);
    });
    memoAlerts.overdueMemos.slice(0, 3).forEach(m => {
      lines.push(`• ${m.formattedText || `逾期待辦：【${m.title}】${m.content}`}`);
    });
    memoAlerts.upcomingMemos.slice(0, 3).forEach(m => {
      lines.push(`• ${m.formattedText || `預告：【${m.title}】${m.content}`}`);
    });
    lines.push('───────────────');
  }

  if (!omitSummary) {
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
  }

  lines.push(`🌟 辛苦了，每一筆都是愛的痕跡！`);

  return lines.join('\n');
}

/**
 * 將多本帳簿的純文字備援報表合併為單則訊息
 */
export function buildCombinedTextMessage(reportDataList) {
  if (!Array.isArray(reportDataList) || reportDataList.length === 0) return '';
  if (reportDataList.length === 1) return buildTextMessage(reportDataList[0]);
  return reportDataList
    .slice(0, 12)
    .map(data => buildTextMessage(data))
    .join('\n\n════════════════\n\n');
}

/**
 * 發送 LINE 訊息至指定對象：優先發送 Flex 卡片，若失敗則無縫降級為防折行純文字
 */
async function sendLineMessage(targetId, accessToken, flexPayload, textPayload) {
  if (!accessToken || !targetId) {
    console.log('ℹ️ [LINE] 未偵測到 LINE_CHANNEL_ACCESS_TOKEN 或推播對象 ID，跳過 LINE 發送。');
    return false;
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: targetId,
        messages: [flexPayload],
      }),
    });

    if (res.ok) {
      console.log(`✅ [LINE] 成功將 Flex 卡片日報推播至目標 (${targetId.slice(0, 6)}...)！`);
      return true;
    } else {
      const errText = await res.text();
      console.warn(`⚠️ [LINE] Flex 卡片推播未通過 (HTTP ${res.status}): ${errText}，切換純文字備援...`);
    }
  } catch (err) {
    console.warn('⚠️ [LINE] Flex 卡片網路傳輸異常，切換純文字備援:', err);
  }

  try {
    const fallbackRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: targetId,
        messages: [{ type: 'text', text: textPayload.slice(0, 4900) }],
      }),
    });

    if (fallbackRes.ok) {
      console.log(`✅ [LINE] 成功將備援純文字日報推播至目標 (${targetId.slice(0, 6)}...)！`);
      return true;
    } else {
      const errText = await fallbackRes.text();
      console.error(`❌ [LINE] 備援文字推播失敗 (HTTP ${fallbackRes.status}):`, errText);
    }
  } catch (err) {
    console.error('❌ [LINE] 備援文字網路連線錯誤:', err);
  }
  return false;
}

/**
 * 建立請求級帳本交易快取與統一報表組裝函式（避免多成員訂閱同帳本時重複查詢 Supabase）
 */
function createLedgerReportBuilder({
  supabase,
  catMap,
  profileMap,
  timeRange,
}) {
  const snapshotCache = new Map();

  async function getLedgerSnapshot(ledgerId) {
    if (snapshotCache.has(ledgerId)) {
      return snapshotCache.get(ledgerId);
    }

    const [{ data: todayTx, error: txErr }, { data: monthTx }] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('ledger_id', ledgerId)
        .gte('transacted_at', timeRange.startOfDayIso)
        .lte('transacted_at', timeRange.endOfDayIso)
        .order('transacted_at', { ascending: true }),
      supabase
        .from('transactions')
        .select('amount, type')
        .eq('ledger_id', ledgerId)
        .gte('transacted_at', timeRange.startOfMonthIso)
        .lte('transacted_at', timeRange.endOfDayIso),
    ]);

    if (txErr) {
      console.warn(`查詢帳本 (${ledgerId}) 今日交易失敗:`, txErr.message);
      snapshotCache.set(ledgerId, null);
      return null;
    }

    let monthExpense = 0;
    let monthIncome = 0;
    (monthTx || []).forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'expense') monthExpense += amt;
      else if (t.type === 'income') monthIncome += amt;
    });

    let todayExpense = 0;
    let todayIncome = 0;
    const memberExpenseMap = new Map();
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

    const snapshot = {
      todayExpense,
      todayIncome,
      todayBalance: todayIncome - todayExpense,
      todayCount: (todayTx || []).length,
      memberExpenseMap,
      detailedItems,
      monthExpense,
      monthBalance: monthIncome - monthExpense,
    };
    snapshotCache.set(ledgerId, snapshot);
    return snapshot;
  }

  return async function buildReportForRecipient(ledger, opts = {}) {
    if (!ledger || isExcludedDemoLedger(ledger)) return null;
    const snapshot = await getLedgerSnapshot(ledger.id);
    if (!snapshot) return null;

    const filterOpts = {
      mode: opts.mode || 'legacy',
      recipientUserIds: opts.recipientUserIds || [],
      recipientNames: opts.recipientNames || [],
      includeCreditCards: opts.includeCreditCards,
      includeMemos: opts.includeMemos,
    };

    const [billingAlerts, memoAlerts] = await Promise.all([
      checkCreditCardAlerts(supabase, ledger.id, timeRange.targetTwDate, profileMap, filterOpts),
      checkMemoAlerts(supabase, ledger.id, timeRange.targetTwDate, profileMap, filterOpts),
    ]);

    const memoCount =
      memoAlerts.todayMemos.length +
      memoAlerts.overdueMemos.length +
      memoAlerts.upcomingMemos.length;

    const omitSummary = opts.includeSummary === false;
    const quiet = isQuietDayReport({
      todayCount: omitSummary ? 0 : snapshot.todayCount,
      billingAlertsCount: billingAlerts.length,
      memoAlertsCount: memoCount,
    });

    if (opts.skipQuietDay && quiet) {
      return null;
    }

    return {
      ledgerName: ledger.name,
      formattedDate: timeRange.formattedDate,
      yearMonthStr: timeRange.yearMonthStr,
      ...snapshot,
      billingAlerts,
      memoAlerts,
      audienceLabel: opts.audienceLabel || '',
      omitSummary,
    };
  };
}

/**
 * 解析同位使用者（含同 auth_email）的所有 profile IDs 與姓名
 */
function resolveRecipientIdentity(bindingUserId, allProfiles) {
  const uids = new Set([bindingUserId]);
  const names = new Set();
  const baseProfile = allProfiles.find(p => p.id === bindingUserId);
  if (baseProfile?.display_name) names.add(baseProfile.display_name.trim());

  const email = (baseProfile?.auth_email || '').trim().toLowerCase();
  if (email && email.includes('@') && !email.endsWith('@family.local') && !email.includes('anonymous')) {
    allProfiles.forEach(p => {
      if (p.auth_email && p.auth_email.trim().toLowerCase() === email) {
        uids.add(p.id);
        if (p.display_name) names.add(p.display_name.trim());
      }
    });
  }
  return {
    recipientUserIds: Array.from(uids),
    recipientNames: Array.from(names),
  };
}

export async function main() {
  const { SUPABASE_URL, SUPABASE_KEY, LINE_CHANNEL_ACCESS_TOKEN, LINE_TARGET_ID, TARGET_LEDGER_ID } = getEnvConfig();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ 錯誤：未設定 SUPABASE_URL 或 SUPABASE_KEY 環境變數！');
    process.exit(1);
  }

  const supabase = createSupabaseBackendClient(SUPABASE_URL, SUPABASE_KEY);

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

  // 2. 取得共用參考表（分類、成員名冊）與時間區間
  const [{ data: categories }, { data: allProfiles }] = await Promise.all([
    supabase.from('categories').select('*'),
    supabase.from('profiles').select('*'),
  ]);

  const catMap = new Map();
  (categories || []).forEach(c => catMap.set(c.id, c));

  const profileMap = new Map();
  (allProfiles || []).forEach(p => profileMap.set(p.id, p));

  const timeRange = getTaiwanTimeRanges();
  const buildReportForRecipient = createLedgerReportBuilder({
    supabase,
    catMap,
    profileMap,
    timeRange,
  });

  // 3. 優先嘗試載入雲端 LINE 個人自主訂閱與家庭群組雙軌設定
  let cloudRoutingAvailable = false;
  let userBindings = [];
  let ledgerSubscriptions = [];
  let groupBindings = [];

  try {
    const [ubRes, subRes, gbRes] = await Promise.all([
      supabase.from('line_user_bindings').select('*'),
      supabase.from('line_ledger_subscriptions').select('*'),
      supabase.from('line_group_bindings').select('*'),
    ]);

    if (!ubRes.error && !subRes.error && !gbRes.error) {
      userBindings = ubRes.data || [];
      ledgerSubscriptions = subRes.data || [];
      groupBindings = gbRes.data || [];
      cloudRoutingAvailable = userBindings.length > 0 || groupBindings.length > 0;
      if (cloudRoutingAvailable) {
        console.log(
          `📡 [雲端雙軌日報] 偵測到 ${userBindings.length} 位個人 LINE 綁定、${groupBindings.length} 個家庭群組綁定，啟用動態隱私分流推播！`
        );
      } else {
        console.log('ℹ️ [雲端雙軌日報] 資料表已就緒但尚無正式綁定紀錄，暫沿用預設環境變數模式。');
      }
    } else {
      const msg = ubRes.error?.message || subRes.error?.message || gbRes.error?.message || '';
      console.log(`ℹ️ [相容模式] 雲端 LINE 訂閱表尚未建立或無權限讀取 (${msg})，沿用舊版環境變數模式。`);
    }
  } catch (err) {
    console.warn('⚠️ 檢查雲端訂閱設定時發生例外，安全降級至舊版模式:', err.message);
  }

  // =========================================================================
  // 模式一：雲端訂閱驅動雙軌推播（個人自主訂閱 ＋ 家庭群組公開播報）
  // =========================================================================
  if (cloudRoutingAvailable) {
    const [{ data: allLedgers }, { data: allMembers }] = await Promise.all([
      supabase.from('ledgers').select('id, name, created_by, created_at'),
      supabase.from('ledger_members').select('ledger_id, user_id'),
    ]);

    const ledgerMap = new Map();
    (allLedgers || []).forEach(l => {
      if (!isExcludedDemoLedger(l)) ledgerMap.set(l.id, l);
    });

    const ledgerMemberSetMap = new Map();
    (allMembers || []).forEach(m => {
      if (!ledgerMemberSetMap.has(m.ledger_id)) ledgerMemberSetMap.set(m.ledger_id, new Set());
      ledgerMemberSetMap.get(m.ledger_id).add(m.user_id);
    });

    let pushCount = 0;

    // 軌道 A：個人自主訂閱推播
    for (const ub of userBindings) {
      if (!ub.enabled || !ub.line_user_id) continue;

      const { recipientUserIds, recipientNames } = resolveRecipientIdentity(ub.user_id, allProfiles || []);
      const userSubs = ledgerSubscriptions.filter(s => s.user_id === ub.user_id && s.enabled);

      const userReports = [];
      for (const sub of userSubs) {
        const ledger = ledgerMap.get(sub.ledger_id);
        if (!ledger) continue;

        const memberSet = ledgerMemberSetMap.get(ledger.id) || new Set();
        const isStillMember =
          recipientUserIds.some(uid => memberSet.has(uid) || ledger.created_by === uid);
        if (!isStillMember) continue;

        const reportData = await buildReportForRecipient(ledger, {
          mode: 'user',
          recipientUserIds,
          recipientNames,
          includeSummary: sub.include_summary !== false,
          includeCreditCards: sub.include_credit_cards !== false,
          includeMemos: sub.include_memos !== false,
          skipQuietDay: Boolean(ub.skip_quiet_day),
          audienceLabel: '個人專屬',
        });

        if (reportData) userReports.push(reportData);
      }

      if (userReports.length === 0) {
        console.log(`🌙 [個人訂閱] ${ub.line_display_name || ub.user_id} 今日無須發送（未勾選或為安靜日）。`);
        continue;
      }

      const flexPayload = buildCarouselFlexMessage(userReports, '💖 甜心記帳本・您的專屬收支日報');
      const textPayload = buildCombinedTextMessage(userReports);
      console.log(`\n📤 準備發送給個人訂閱者「${ub.line_display_name || ub.user_id}」(${userReports.length} 本帳簿)...`);
      await sendLineMessage(ub.line_user_id, LINE_CHANNEL_ACCESS_TOKEN, flexPayload, textPayload);
      pushCount += 1;
    }

    // 軌道 B：家庭群組公開播報（強制隱藏 personal 私密備忘，信用卡依群組隱私開關決定）
    for (const gb of groupBindings) {
      if (!gb.enabled || !gb.line_group_id) continue;
      const ledger = ledgerMap.get(gb.ledger_id);
      if (!ledger) continue;

      const groupReport = await buildReportForRecipient(ledger, {
        mode: 'group',
        includeSummary: true,
        includeCreditCards: Boolean(gb.include_credit_cards),
        includeMemos: true,
        skipQuietDay: Boolean(gb.skip_quiet_day),
        audienceLabel: '家庭公開版',
      });

      if (!groupReport) {
        console.log(`🌙 [群組播報] 《${ledger.name}》今日為安靜日，已依設定略過群組推播。`);
        continue;
      }

      const flexPayload = buildFlexMessage(groupReport);
      const textPayload = buildTextMessage(groupReport);
      console.log(`\n📤 準備發送至家庭群組「${gb.group_name || ledger.name}」...`);
      await sendLineMessage(gb.line_group_id, LINE_CHANNEL_ACCESS_TOKEN, flexPayload, textPayload);
      pushCount += 1;
    }

    console.log(`🎉 雲端雙軌日報任務完成！本次共執行 ${pushCount} 次精準推播。`);
    return;
  }

  // =========================================================================
  // 模式二：舊版環境變數備援模式（未設任何雲端綁定時自動沿用，並自動排除示範帳本）
  // =========================================================================
  let ledgersToReport = [];
  if (TARGET_LEDGER_ID) {
    const { data: specificLedger } = await supabase
      .from('ledgers')
      .select('id, name')
      .eq('id', TARGET_LEDGER_ID)
      .maybeSingle();
    if (specificLedger && !isExcludedDemoLedger(specificLedger)) {
      ledgersToReport = [specificLedger];
    }
  } else {
    const { data: allLedgers } = await supabase
      .from('ledgers')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    const realLedgers = (allLedgers || []).filter(l => !isExcludedDemoLedger(l));
    if (realLedgers.length === 1) {
      ledgersToReport = realLedgers;
    } else if (realLedgers.length > 1) {
      const realLedgerIds = new Set(realLedgers.map(l => l.id));
      const { data: recentTx } = await supabase
        .from('transactions')
        .select('ledger_id')
        .order('transacted_at', { ascending: false })
        .limit(20);

      const activeRow = (recentTx || []).find(r => realLedgerIds.has(r.ledger_id));
      const matched = activeRow && realLedgers.find(l => l.id === activeRow.ledger_id);
      ledgersToReport = [matched || realLedgers[0]];
    }
  }

  if (ledgersToReport.length === 0) {
    const fallbackText = [
      '💖 甜心記帳本 · 系統守護打卡',
      `📅 ${timeRange.formattedDate}`,
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
            { type: 'text', text: `📅 ${timeRange.formattedDate}`, size: 'xs', color: '#78716C', margin: 'xs' },
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
    await sendLineMessage(LINE_TARGET_ID, LINE_CHANNEL_ACCESS_TOKEN, fallbackFlex, fallbackText);
    return;
  }

  for (const ledger of ledgersToReport) {
    console.log(`\n📊 正在彙整帳本「${ledger.name}」(${ledger.id}) 的收支數據...`);
    const reportData = await buildReportForRecipient(ledger, { mode: 'legacy' });
    if (!reportData) continue;

    if (reportData.billingAlerts.length > 0) {
      console.log(`💳 偵測到 ${reportData.billingAlerts.length} 則信用卡帳單出帳或繳款警戒提醒！`);
    }
    const memoCount =
      reportData.memoAlerts.todayMemos.length +
      reportData.memoAlerts.overdueMemos.length +
      reportData.memoAlerts.upcomingMemos.length;
    if (memoCount > 0) {
      console.log(
        `📌 偵測到 ${memoCount} 則生活記事待辦提醒 (今日: ${reportData.memoAlerts.todayMemos.length}, 逾期: ${reportData.memoAlerts.overdueMemos.length}, 預告: ${reportData.memoAlerts.upcomingMemos.length})！`
      );
    }

    const flexPayload = buildFlexMessage(reportData);
    const textPayload = buildTextMessage(reportData);

    console.log('\n--- 產生之純文字版預覽 ---\n' + textPayload + '\n------------------------\n');

    await sendLineMessage(LINE_TARGET_ID, LINE_CHANNEL_ACCESS_TOKEN, flexPayload, textPayload);
  }

  console.log('🎉 任務全部順利執行完畢！');
}

const isDirectCliRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectCliRun) {
  main().catch(err => {
    console.error('💥 任務執行失敗:', err);
    process.exit(1);
  });
}
