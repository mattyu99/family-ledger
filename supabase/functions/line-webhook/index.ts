// 本 Edge Function 採用 100% 零外部 HTTPS 匯入設計，直接呼叫 Supabase Edge Runtime 原生 API，
// 徹底避免在企業代理憑證或離線 Docker 環境打包時發生 TLS UnknownIssuer 失敗。
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const DEMO_LEDGER_ID = "ee100000-0000-4000-8000-000000000001";

interface RestResult<T = any> {
  data: T | null;
  error: { status?: number; message: string } | null;
}

/**
 * 輕量級 PostgREST 客戶端（原生 fetch 實作，零第三方相依）
 */
function createSupabaseRestClient(supabaseUrl: string, serviceRoleKey: string) {
  const baseRestUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
  const baseHeaders: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  async function request<T = any>(
    method: string,
    table: string,
    queryParts: string[],
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<RestResult<T>> {
    const query = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    const url = `${baseRestUrl}/${table}${query}`;
    const headers: Record<string, string> = {
      ...baseHeaders,
      ...(extraHeaders || {}),
    };
    if (body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          data: null,
          error: { status: res.status, message: rawText || `HTTP ${res.status}` },
        };
      }

      if (!rawText) {
        return { data: null, error: null };
      }

      try {
        return { data: JSON.parse(rawText) as T, error: null };
      } catch {
        return { data: null, error: null };
      }
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || String(err) },
      };
    }
  }

  const eqFilter = (col: string, val: string | number | boolean) =>
    `${col}=eq.${encodeURIComponent(String(val))}`;
  const neqFilter = (col: string, val: string | number | boolean) =>
    `${col}=neq.${encodeURIComponent(String(val))}`;
  const gtFilter = (col: string, val: string) =>
    `${col}=gt.${encodeURIComponent(val)}`;
  const ilikeFilter = (col: string, val: string) =>
    `${col}=ilike.${encodeURIComponent(val)}`;
  const inFilter = (col: string, vals: string[]) =>
    `${col}=in.(${vals.map((v) => encodeURIComponent(v)).join(",")})`;

  async function selectMany<T = any>(
    table: string,
    columns: string,
    filters: string[],
    limit?: number
  ): Promise<RestResult<T[]>> {
    const queryParts = [`select=${encodeURIComponent(columns)}`, ...filters];
    if (typeof limit === "number" && limit > 0) {
      queryParts.push(`limit=${limit}`);
    }
    return request<T[]>("GET", table, queryParts);
  }

  async function selectMaybeSingle<T = any>(
    table: string,
    columns: string,
    filters: string[]
  ): Promise<RestResult<T>> {
    const res = await selectMany<T>(table, columns, filters, 1);
    if (res.error) return { data: null, error: res.error };
    const first = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
    return { data: first, error: null };
  }

  async function upsert(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts: { onConflict: string; ignoreDuplicates?: boolean }
  ): Promise<RestResult<null>> {
    const prefer = opts.ignoreDuplicates
      ? "resolution=ignore-duplicates,return=minimal"
      : "resolution=merge-duplicates,return=minimal";
    const queryParts = [`on_conflict=${encodeURIComponent(opts.onConflict)}`];
    return request<null>("POST", table, queryParts, rows, { Prefer: prefer });
  }

  async function update(
    table: string,
    patch: Record<string, unknown>,
    filters: string[]
  ): Promise<RestResult<null>> {
    if (filters.length === 0) {
      return { data: null, error: { message: "Refusing update without filters" } };
    }
    return request<null>("PATCH", table, filters, patch, { Prefer: "return=minimal" });
  }

  async function remove(
    table: string,
    filters: string[]
  ): Promise<RestResult<null>> {
    if (filters.length === 0) {
      return { data: null, error: { message: "Refusing delete without filters" } };
    }
    return request<null>("DELETE", table, filters, undefined, { Prefer: "return=minimal" });
  }

  return {
    eqFilter,
    neqFilter,
    gtFilter,
    ilikeFilter,
    inFilter,
    selectMany,
    selectMaybeSingle,
    upsert,
    update,
    remove,
  };
}

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
  db: ReturnType<typeof createSupabaseRestClient>,
  userId: string,
  preferredLedgerId: string | null
): Promise<string[]> {
  const userIds = new Set<string>([userId]);

  const { data: profile } = await db.selectMaybeSingle<{ auth_email?: string | null }>(
    "profiles",
    "auth_email",
    [db.eqFilter("id", userId)]
  );

  const email = (profile?.auth_email || "").trim().toLowerCase();
  if (
    email &&
    email.includes("@") &&
    !email.endsWith("@family.local") &&
    !email.includes("anonymous")
  ) {
    const { data: sameEmailProfiles } = await db.selectMany<{ id: string }>(
      "profiles",
      "id",
      [db.ilikeFilter("auth_email", email)]
    );
    for (const p of sameEmailProfiles || []) {
      if (p?.id) userIds.add(p.id);
    }
  }

  const uidArray = Array.from(userIds);
  const ledgerIds = new Set<string>();

  if (preferredLedgerId && preferredLedgerId !== DEMO_LEDGER_ID) {
    ledgerIds.add(preferredLedgerId);
  }

  const [memberRes, ownedRes] = await Promise.all([
    db.selectMany<{ ledger_id: string }>("ledger_members", "ledger_id", [
      db.inFilter("user_id", uidArray),
    ]),
    db.selectMany<{ id: string; name?: string }>("ledgers", "id,name", [
      db.inFilter("created_by", uidArray),
    ]),
  ]);

  for (const r of memberRes.data || []) {
    if (r?.ledger_id && r.ledger_id !== DEMO_LEDGER_ID) {
      ledgerIds.add(r.ledger_id);
    }
  }
  for (const l of ownedRes.data || []) {
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

Deno.serve(async (req: Request) => {
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

  const db = createSupabaseRestClient(supabaseUrl, serviceRoleKey);

  for (const event of events) {
    try {
      const sourceType = event?.source?.type;

      // ================================================================
      // A. 個人取消追蹤（封鎖 / 刪除好友）➔ 自動停止個人推播
      // ================================================================
      if (event?.type === "unfollow" && sourceType === "user" && event?.source?.userId) {
        await db.update(
          "line_user_bindings",
          { enabled: false, updated_at: new Date().toISOString() },
          [db.eqFilter("line_user_id", event.source.userId)]
        );
        continue;
      }

      // ================================================================
      // B. 機器人被移出群組或多人聊天室 ➔ 清理該聊天室綁定紀錄
      // ================================================================
      const leaveChatId =
        sourceType === "group"
          ? event?.source?.groupId
          : sourceType === "room"
            ? event?.source?.roomId
            : null;
      if (event?.type === "leave" && leaveChatId) {
        await db.remove("line_group_bindings", [
          db.eqFilter("line_group_id", leaveChatId),
        ]);
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

          const { data: tokenRow } = await db.selectMaybeSingle<{
            code: string;
            user_id: string;
            ledger_id?: string | null;
          }>("line_bind_tokens", "*", [
            db.eqFilter("code", code),
            db.eqFilter("target_type", "user"),
            db.gtFilter("expires_at", nowIso),
          ]);

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
          await db.remove("line_user_bindings", [
            db.eqFilter("line_user_id", lineUserId),
            db.neqFilter("user_id", tokenRow.user_id),
          ]);

          const { error: upsertErr } = await db.upsert(
            "line_user_bindings",
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
            db,
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
            await db.upsert("line_ledger_subscriptions", subRows, {
              onConflict: "user_id,ledger_id",
              ignoreDuplicates: true,
            });
          }

          await db.remove("line_bind_tokens", [db.eqFilter("code", code)]);

          await replyLineText(
            replyToken,
            `✅ 綁定成功！${displayName ? `${displayName} 您好，` : ""}已連結您的甜心記帳本帳號。\n\n往後每晚 21:18 將為您送達專屬收支與提醒日報（僅含您的卡與本人／全家待辦，不外洩他人私事）。\n\n您隨時可回 App「🔔 提醒與個人」挑選要接收的帳簿，或直接傳送：\n・「暫停日報」\n・「恢復日報」\n・「狀態」`,
            accessToken
          );
          continue;
        }

        // 個人文字快捷指令
        const { data: userBinding } = await db.selectMaybeSingle<{
          user_id: string;
          enabled: boolean;
          skip_quiet_day: boolean;
        }>("line_user_bindings", "user_id,enabled,skip_quiet_day", [
          db.eqFilter("line_user_id", lineUserId),
        ]);

        if (/^(暫停日報|關閉日報|停用日報)$/.test(rawText)) {
          if (!userBinding) {
            await replyLineText(
              replyToken,
              "您尚未綁定甜心記帳本帳號，請從 App「🔔 提醒與個人」點擊一鍵綁定按鈕開始設定。",
              accessToken
            );
            continue;
          }
          await db.update(
            "line_user_bindings",
            { enabled: false, updated_at: new Date().toISOString() },
            [db.eqFilter("user_id", userBinding.user_id)]
          );
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
          await db.update(
            "line_user_bindings",
            { enabled: true, updated_at: new Date().toISOString() },
            [db.eqFilter("user_id", userBinding.user_id)]
          );
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

          const { data: subs } = await db.selectMany<any>(
            "line_ledger_subscriptions",
            "ledger_id,enabled,ledgers(name)",
            [
              db.eqFilter("user_id", userBinding.user_id),
              db.eqFilter("enabled", true),
            ]
          );

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
      // D. 家庭群組／多人聊天室訊息處理（GRP-XXXXXX 與群組指令）
      // ================================================================
      const multiChatId: string | null =
        sourceType === "group" && event?.source?.groupId
          ? event.source.groupId
          : sourceType === "room" && event?.source?.roomId
            ? event.source.roomId
            : null;

      if (multiChatId) {
        const isRoom = sourceType === "room";
        const chatRoleLabel = isRoom ? "家庭多人聊天室" : "家庭群組";
        const grpMatch = rawText.match(/\b(GRP-[A-Z0-9]{4,10})\b/i);

        if (grpMatch) {
          const code = grpMatch[1].toUpperCase();
          const nowIso = new Date().toISOString();

          const { data: tokenRow } = await db.selectMaybeSingle<{
            code: string;
            user_id: string;
            ledger_id?: string | null;
          }>("line_bind_tokens", "*", [
            db.eqFilter("code", code),
            db.eqFilter("target_type", "group"),
            db.gtFilter("expires_at", nowIso),
          ]);

          if (!tokenRow || !tokenRow.ledger_id || tokenRow.ledger_id === DEMO_LEDGER_ID) {
            await replyLineText(
              replyToken,
              "❌ 群組綁定碼無效或已過期（有效時間 10 分鐘），請管理員回「甜心記帳本」App 的「🔔 提醒與個人」重新產生群組綁定碼。",
              accessToken
            );
            continue;
          }

          const [groupName, ledgerRes] = await Promise.all([
            isRoom ? Promise.resolve("家庭多人聊天室") : fetchLineGroupName(multiChatId, accessToken),
            db.selectMaybeSingle<{ name?: string }>("ledgers", "name", [
              db.eqFilter("id", tokenRow.ledger_id),
            ]),
          ]);

          const ledgerName = ledgerRes?.data?.name || "家庭共同帳本";

          const { error: grpUpsertErr } = await db.upsert(
            "line_group_bindings",
            {
              ledger_id: tokenRow.ledger_id,
              line_group_id: multiChatId,
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

          await db.remove("line_bind_tokens", [db.eqFilter("code", code)]);

          await replyLineText(
            replyToken,
            `✅ ${chatRoleLabel}綁定成功！\n此處已連結帳本《${ledgerName}》。\n\n往後每晚 21:18 將定時播報全家公開版收支日報與全家待辦提醒（已自動隱藏個人私密備忘與個人信用卡，守護每位成員隱私）。\n管理員可回 App「🔔 提醒與個人」調整設定，或在此輸入「暫停群組日報」、「恢復群組日報」。`,
            accessToken
          );
          continue;
        }

        // 群組／聊天室文字快捷指令
        const { data: groupBindings } = await db.selectMany<any>(
          "line_group_bindings",
          "ledger_id,enabled,include_credit_cards,ledgers(name)",
          [db.eqFilter("line_group_id", multiChatId)]
        );

        if (!groupBindings || groupBindings.length === 0) {
          continue;
        }

        if (/^(暫停群組日報|關閉群組日報)$/.test(rawText)) {
          await db.update(
            "line_group_bindings",
            { enabled: false, updated_at: new Date().toISOString() },
            [db.eqFilter("line_group_id", multiChatId)]
          );
          await replyLineText(
            replyToken,
            `⏸️ 已暫停此${chatRoleLabel}的每日家庭收支播報，如需恢復請輸入「恢復群組日報」。`,
            accessToken
          );
          continue;
        }

        if (/^(恢復群組日報|開啟群組日報)$/.test(rawText)) {
          await db.update(
            "line_group_bindings",
            { enabled: true, updated_at: new Date().toISOString() },
            [db.eqFilter("line_group_id", multiChatId)]
          );
          await replyLineText(
            replyToken,
            `▶️ 已恢復此${chatRoleLabel}每日 21:18 的家庭收支公開播報！`,
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
            `🏠 ${chatRoleLabel}播報狀態\n${summaryLines.join("\n")}\n（已自動隱藏所有成員的個人私密記事）`,
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
