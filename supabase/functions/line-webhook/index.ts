import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEMO_LEDGER_ID = "ee100000-0000-4000-8000-000000000001";

/**
 * 驗證 LINE Official Account Webhook HMAC-SHA256 數位簽章，防止偽造請求
 */
async function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const bytes = new Uint8Array(mac);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const expectedBase64 = btoa(binary);

    if (expectedBase64.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedBase64.length; i++) {
      diff |= expectedBase64.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch (err) {
    console.warn("[line-webhook] 簽章驗證例外:", err);
    return false;
  }
}

/**
 * 呼叫 LINE 免費 Reply API 回覆事件（不扣除每月主動推播額度）
 */
async function replyLineText(
  replyToken: string | undefined,
  text: string,
  accessToken: string
): Promise<void> {
  if (!replyToken || !accessToken) return;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[line-webhook] Reply 失敗 (${res.status}): ${errText}`);
    }
  } catch (err) {
    console.warn("[line-webhook] Reply 網路異常:", err);
  }
}

/**
 * 取得 LINE 使用者顯示暱稱（失敗時回傳 null，不中斷綁定）
 */
async function fetchLineUserDisplayName(
  lineUserId: string,
  accessToken: string
): Promise<string | null> {
  if (!lineUserId || !accessToken) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * 取得 LINE 群組名稱（失敗時 fallback 為通用名稱）
 */
async function fetchLineGroupName(
  groupId: string,
  accessToken: string
): Promise<string> {
  if (!groupId || !accessToken) return "家庭 LINE 群組";
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return "家庭 LINE 群組";
    const data = await res.json();
    return typeof data?.groupName === "string" && data.groupName.trim()
      ? data.groupName.trim()
      : "家庭 LINE 群組";
  } catch {
    return "家庭 LINE 群組";
  }
}

/**
 * 取得同一成員所有關聯的非示範帳本 ID（涵蓋同 auth_email、created_by、ledger_members 與觸發綁定碼的 ledger_id）
 */
async function collectUserLedgerIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  preferredLedgerId: string | null
): Promise<string[]> {
  const userIds = new Set<string>([userId]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("auth_email")
    .eq("id", userId)
    .maybeSingle();

  const email = (profile?.auth_email || "").trim().toLowerCase();
  if (
    email &&
    email.includes("@") &&
    !email.endsWith("@family.local") &&
    !email.includes("anonymous")
  ) {
    const { data: sameEmailProfiles } = await supabase
      .from("profiles")
      .select("id")
      .ilike("auth_email", email);
    for (const p of sameEmailProfiles || []) {
      if (p?.id) userIds.add(p.id);
    }
  }

  const uidArray = Array.from(userIds);
  const ledgerIds = new Set<string>();

  if (preferredLedgerId && preferredLedgerId !== DEMO_LEDGER_ID) {
    ledgerIds.add(preferredLedgerId);
  }

  const [{ data: memberRows }, { data: ownedLedgers }] = await Promise.all([
    supabase.from("ledger_members").select("ledger_id").in("user_id", uidArray),
    supabase.from("ledgers").select("id, name").in("created_by", uidArray),
  ]);

  for (const r of memberRows || []) {
    if (r?.ledger_id && r.ledger_id !== DEMO_LEDGER_ID) {
      ledgerIds.add(r.ledger_id);
    }
  }
  for (const l of ownedLedgers || []) {
    if (
      l?.id &&
      l.id !== DEMO_LEDGER_ID &&
      !(l.name || "").toLowerCase().includes("sweethome")
    ) {
      ledgerIds.add(l.id);
    }
  }

  return Array.from(ledgerIds);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const channelSecret = (Deno.env.get("LINE_CHANNEL_SECRET") || "").trim();
  const accessToken = (Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "").trim();
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

  if (!channelSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("[line-webhook] 缺少必要環境變數 LINE_CHANNEL_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "Server configuration incomplete" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");
  const isValid = await verifyLineSignature(rawBody, signature, channelSecret);
  if (!isValid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: any = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const events: any[] = Array.isArray(payload?.events) ? payload.events : [];
  if (events.length === 0) {
    // LINE Developers 後台點擊 Verify 時會送空 events 陣列
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (const event of events) {
    try {
      const sourceType = event?.source?.type;

      // ================================================================
      // A. 個人取消追蹤（封鎖 / 刪除好友）➔ 自動停止個人推播
      // ================================================================
      if (event?.type === "unfollow" && sourceType === "user" && event?.source?.userId) {
        await supabase
          .from("line_user_bindings")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("line_user_id", event.source.userId);
        continue;
      }

      // ================================================================
      // B. 機器人被移出群組 ➔ 清理該群組綁定紀錄
      // ================================================================
      if (event?.type === "leave" && sourceType === "group" && event?.source?.groupId) {
        await supabase
          .from("line_group_bindings")
          .delete()
          .eq("line_group_id", event.source.groupId);
        continue;
      }

      if (event?.type !== "message" || event?.message?.type !== "text") {
        continue;
      }

      const rawText: string = String(event.message.text || "").trim();
      const replyToken: string | undefined = event.replyToken;

      // ================================================================
      // C. 個人聊天室訊息處理（BIND-XXXXXX 與快捷指令）
      // ================================================================
      if (sourceType === "user" && event?.source?.userId) {
        const lineUserId: string = event.source.userId;
        const bindMatch = rawText.match(/\b(BIND-[A-Z0-9]{4,10})\b/i);

        if (bindMatch) {
          const code = bindMatch[1].toUpperCase();
          const nowIso = new Date().toISOString();

          const { data: tokenRow } = await supabase
            .from("line_bind_tokens")
            .select("*")
            .eq("code", code)
            .eq("target_type", "user")
            .gt("expires_at", nowIso)
            .maybeSingle();

          if (!tokenRow) {
            await replyLineText(
              replyToken,
              "❌ 綁定碼無效或已過期（有效時間 10 分鐘），請回「甜心記帳本」App 的「🔔 提醒與個人」重新點擊綁定按鈕。",
              accessToken
            );
            continue;
          }

          const displayName = await fetchLineUserDisplayName(lineUserId, accessToken);

          // 若同一個 LINE 帳號先前曾綁在別的 Profile，先刪除舊紀錄避免 UNIQUE 衝突
          await supabase
            .from("line_user_bindings")
            .delete()
            .eq("line_user_id", lineUserId)
            .neq("user_id", tokenRow.user_id);

          const { error: upsertErr } = await supabase
            .from("line_user_bindings")
            .upsert(
              {
                user_id: tokenRow.user_id,
                line_user_id: lineUserId,
                line_display_name: displayName,
                enabled: true,
                updated_at: nowIso,
              },
              { onConflict: "user_id" }
            );

          if (upsertErr) {
            console.error("[line-webhook] 寫入 line_user_bindings 失敗:", upsertErr);
            await replyLineText(
              replyToken,
              "⚠️ 綁定寫入雲端資料庫時發生暫時性問題，請稍後再試一次。",
              accessToken
            );
            continue;
          }

          // 自動為名下非示範帳本建立預設訂閱（已存在的偏好保留不覆蓋）
          const targetLedgerIds = await collectUserLedgerIds(
            supabase,
            tokenRow.user_id,
            tokenRow.ledger_id || null
          );
          if (targetLedgerIds.length > 0) {
            const subRows = targetLedgerIds.map((lid) => ({
              user_id: tokenRow.user_id,
              ledger_id: lid,
              enabled: true,
              include_summary: true,
              include_credit_cards: true,
              include_memos: true,
              updated_at: nowIso,
            }));
            await supabase
              .from("line_ledger_subscriptions")
              .upsert(subRows, { onConflict: "user_id,ledger_id", ignoreDuplicates: true });
          }

          await supabase.from("line_bind_tokens").delete().eq("code", code);

          await replyLineText(
            replyToken,
            `✅ 綁定成功！${displayName ? `${displayName} 您好，` : ""}已連結您的甜心記帳本帳號。\n\n往後每晚 21:18 將為您送達專屬收支與提醒日報（僅含您的卡與本人／全家待辦，不外洩他人私事）。\n\n您隨時可回 App「🔔 提醒與個人」挑選要接收的帳簿，或直接傳送：\n・「暫停日報」\n・「恢復日報」\n・「狀態」`,
            accessToken
          );
          continue;
        }

        // 個人文字快捷指令
        const { data: userBinding } = await supabase
          .from("line_user_bindings")
          .select("user_id, enabled, skip_quiet_day")
          .eq("line_user_id", lineUserId)
          .maybeSingle();

        if (/^(暫停日報|關閉日報|停用日報)$/.test(rawText)) {
          if (!userBinding) {
            await replyLineText(
              replyToken,
              "您尚未綁定甜心記帳本帳號，請從 App「🔔 提醒與個人」點擊一鍵綁定按鈕開始設定。",
              accessToken
            );
            continue;
          }
          await supabase
            .from("line_user_bindings")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("user_id", userBinding.user_id);
          await replyLineText(
            replyToken,
            "⏸️ 已暫停發送您的個人每日收支日報！日後若想恢復接收，只要傳送「恢復日報」或回 App 重新開啟即可。",
            accessToken
          );
          continue;
        }

        if (/^(恢復日報|開啟日報|啟用日報)$/.test(rawText)) {
          if (!userBinding) {
            await replyLineText(
              replyToken,
              "您尚未綁定甜心記帳本帳號，請從 App「🔔 提醒與個人」點擊一鍵綁定按鈕開始設定。",
              accessToken
            );
            continue;
          }
          await supabase
            .from("line_user_bindings")
            .update({ enabled: true, updated_at: new Date().toISOString() })
            .eq("user_id", userBinding.user_id);
          await replyLineText(
            replyToken,
            "▶️ 已為您恢復每日 21:18 個人收支與提醒日報！",
            accessToken
          );
          continue;
        }

        if (/^(狀態|日報狀態)$/.test(rawText)) {
          if (!userBinding) {
            await replyLineText(
              replyToken,
              "目前狀態：⚪ 尚未綁定甜心記帳本帳號。\n請從 App「🔔 提醒與個人」點擊「💚 一鍵開啟 LINE 綁定」即可完成連結。",
              accessToken
            );
            continue;
          }

          const { data: subs } = await supabase
            .from("line_ledger_subscriptions")
            .select("ledger_id, enabled, ledgers(name)")
            .eq("user_id", userBinding.user_id)
            .eq("enabled", true);

          const activeNames = (subs || [])
            .map((s: any) => (Array.isArray(s.ledgers) ? s.ledgers[0]?.name : s.ledgers?.name))
            .filter(Boolean);

          await replyLineText(
            replyToken,
            `📊 您的甜心記帳本 LINE 日報狀態\n• 個人總開關：${userBinding.enabled ? "🟢 開啟中" : "⏸️ 已暫停"}\n• 安靜日免打擾：${userBinding.skip_quiet_day ? "🌙 開啟（零收支且無提醒不發送）" : "🔔 每天固定報告"}\n• 接收帳簿 (${activeNames.length} 本)：${activeNames.length > 0 ? activeNames.join("、") : "尚未勾選任何帳簿（可回 App 勾選）"}`,
            accessToken
          );
          continue;
        }

        continue;
      }

      // ================================================================
      // D. 家庭群組訊息處理（GRP-XXXXXX 與群組指令）
      // ================================================================
      if (sourceType === "group" && event?.source?.groupId) {
        const groupId: string = event.source.groupId;
        const grpMatch = rawText.match(/\b(GRP-[A-Z0-9]{4,10})\b/i);

        if (grpMatch) {
          const code = grpMatch[1].toUpperCase();
          const nowIso = new Date().toISOString();

          const { data: tokenRow } = await supabase
            .from("line_bind_tokens")
            .select("*")
            .eq("code", code)
            .eq("target_type", "group")
            .gt("expires_at", nowIso)
            .maybeSingle();

          if (!tokenRow || !tokenRow.ledger_id || tokenRow.ledger_id === DEMO_LEDGER_ID) {
            await replyLineText(
              replyToken,
              "❌ 群組綁定碼無效或已過期（有效時間 10 分鐘），請管理員回「甜心記帳本」App 的「🔔 提醒與個人」重新產生群組綁定碼。",
              accessToken
            );
            continue;
          }

          const [groupName, ledgerRes] = await Promise.all([
            fetchLineGroupName(groupId, accessToken),
            supabase.from("ledgers").select("name").eq("id", tokenRow.ledger_id).maybeSingle(),
          ]);

          const ledgerName = ledgerRes?.data?.name || "家庭共同帳本";

          const { error: grpUpsertErr } = await supabase
            .from("line_group_bindings")
            .upsert(
              {
                ledger_id: tokenRow.ledger_id,
                line_group_id: groupId,
                group_name: groupName,
                enabled: true,
                bound_by: tokenRow.user_id,
                bound_at: nowIso,
                updated_at: nowIso,
              },
              { onConflict: "ledger_id" }
            );

          if (grpUpsertErr) {
            console.error("[line-webhook] 寫入 line_group_bindings 失敗:", grpUpsertErr);
            await replyLineText(
              replyToken,
              "⚠️ 群組綁定寫入失敗，請稍後再試一次。",
              accessToken
            );
            continue;
          }

          await supabase.from("line_bind_tokens").delete().eq("code", code);

          await replyLineText(
            replyToken,
            `✅ 家庭群組綁定成功！\n本群組已連結帳本《${ledgerName}》。\n\n往後每晚 21:18 將定時播報全家公開版收支日報與全家待辦提醒（已自動隱藏個人私密備忘與個人信用卡，守護每位成員隱私）。\n管理員可回 App「🔔 提醒與個人」調整設定，或在群組輸入「暫停群組日報」、「恢復群組日報」。`,
            accessToken
          );
          continue;
        }

        // 群組文字快捷指令
        const { data: groupBindings } = await supabase
          .from("line_group_bindings")
          .select("ledger_id, enabled, include_credit_cards, ledgers(name)")
          .eq("line_group_id", groupId);

        if (!groupBindings || groupBindings.length === 0) {
          continue;
        }

        if (/^(暫停群組日報|關閉群組日報)$/.test(rawText)) {
          await supabase
            .from("line_group_bindings")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("line_group_id", groupId);
          await replyLineText(
            replyToken,
            "⏸️ 已暫停本群組的每日家庭收支播報，如需恢復請輸入「恢復群組日報」。",
            accessToken
          );
          continue;
        }

        if (/^(恢復群組日報|開啟群組日報)$/.test(rawText)) {
          await supabase
            .from("line_group_bindings")
            .update({ enabled: true, updated_at: new Date().toISOString() })
            .eq("line_group_id", groupId);
          await replyLineText(
            replyToken,
            "▶️ 已恢復本群組每日 21:18 的家庭收支公開播報！",
            accessToken
          );
          continue;
        }

        if (/^(群組日報狀態)$/.test(rawText)) {
          const summaryLines = groupBindings.map((g: any) => {
            const name = Array.isArray(g.ledgers) ? g.ledgers[0]?.name : g.ledgers?.name;
            return `• 《${name || "家庭帳本"}》：${g.enabled ? "🟢 開啟中" : "⏸️ 已暫停"}`;
          });
          await replyLineText(
            replyToken,
            `🏠 家庭群組播報狀態\n${summaryLines.join("\n")}\n（已自動隱藏所有成員的個人私密記事）`,
            accessToken
          );
          continue;
        }
      }
    } catch (evErr) {
      console.error("[line-webhook] 單筆事件處理例外:", evErr);
    }
  }

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
