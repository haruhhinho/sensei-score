// サーバー側（Cloudflare Pages Functions）の共通処理
// 必要な環境変数（Cloudflare の管理画面で設定）:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
//   AI_MODEL_FAST（任意。投稿チェック・翻訳用）, AI_MODEL_DEFAULT（任意。要約用）

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export const fail = (code, status = 400, extra = {}) => json({ ok: false, code, ...extra }, status);

// 新形式のキー（sb_secret_ / sb_publishable_）と旧形式（JWT）の両方に対応
function keyHeaders(key) {
  const h = { apikey: key };
  if (key && key.startsWith("eyJ")) h.Authorization = "Bearer " + key;
  return h;
}

export async function readJson(request, maxBytes = 3_000_000) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBytes) throw new HttpError("too_large", 413);
  try { return await request.json(); } catch { throw new HttpError("bad_json", 400); }
}

export class HttpError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

// ログインしている利用者を確かめる（Supabase に問い合わせる）
export async function requireUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new HttpError("not_signed_in", 401);
  const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!r.ok) throw new HttpError("not_signed_in", 401);
  const user = await r.json();
  if (!user || !user.id) throw new HttpError("not_signed_in", 401);
  return user;
}

// サービスロールでデータベースを操作する（RLS を通らない。必ず事前に権限を確認すること）
export async function db(env, path, { method = "GET", body, prefer } = {}) {
  const headers = { ...keyHeaders(env.SUPABASE_SERVICE_ROLE_KEY), "content-type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const err = new HttpError(data && data.code === "23505" ? "duplicate" : "db_error", r.status === 409 ? 409 : 500);
    err.detail = data;
    throw err;
  }
  return data;
}

export async function isAdmin(env, userId) {
  const rows = await db(env, `admins?user_id=eq.${encodeURIComponent(userId)}&select=user_id`);
  return rows.length > 0;
}

export async function storage(env, path, { method = "GET", body, contentType } = {}) {
  const headers = { ...keyHeaders(env.SUPABASE_SERVICE_ROLE_KEY) };
  if (contentType) headers["content-type"] = contentType;
  const r = await fetch(env.SUPABASE_URL + "/storage/v1/" + path, { method, headers, body });
  if (!r.ok) {
    const err = new HttpError("storage_error", 500);
    err.detail = await r.text();
    throw err;
  }
  return r;
}

// ---------------------------------------------------------------------
// AI（Anthropic Messages API）
// ---------------------------------------------------------------------
export async function askClaude(env, prompt, { fast = true, maxTokens = 800 } = {}) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError("ai_not_configured", 503);
  const model = fast ? (env.AI_MODEL_FAST || "claude-haiku-5-5") : (env.AI_MODEL_DEFAULT || "claude-sonnet-5-5");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (r.status === 429) throw new HttpError("ai_rate_limited", 429);
  if (!r.ok) {
    const err = new HttpError("ai_error", 502);
    err.detail = await r.text();
    throw err;
  }
  const data = await r.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
}

export function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

// AIを使う前の簡単なチェック（メールアドレス・電話番号・明らかな侮辱）
export function localCheck(text, lang) {
  const ja = lang !== "en", r = [];
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) r.push(ja ? "メールアドレスが含まれています" : "Contains an email address");
  if (/0\d{1,4}-?\d{1,4}-?\d{3,4}/.test(text)) r.push(ja ? "電話番号のような数字が含まれています" : "Contains what looks like a phone number");
  if (/(死ね|殺す|クズ|ゴミ|無能|キモい|ブス|ハゲ|idiot|stupid|moron|retard|\bugly\b)/i.test(text))
    r.push(ja ? "人格攻撃や侮辱的な表現が含まれています" : "Contains insults or personal attacks");
  return r;
}

// 投稿のAIチェック。日本語・英語どちらの投稿も審査し、理由は画面の言語で返す
export async function moderate(env, { context, text, maxLen, lang }) {
  const local = localCheck(text, lang);
  if (local.length) return { verdict: "local", reasons: local, suggestion: "" };
  const prompt = `You moderate a Japanese university review site. Review this post (${context}). It may be written in Japanese or English.
Not allowed:
1. Personal attacks, insults, abuse
2. Comments on any person's appearance, age, gender or private life
3. Discriminatory language
4. Personal information (email, phone number, address, social media accounts, real names of students or staff)
5. Stating crimes, harassment or misconduct as fact (these belong with the university's support office)
6. Content unrelated to ${context}
Frank, specific criticism of teaching, workload or grading IS allowed.
Verdicts:
- "ok": fine as is
- "revise": partly problematic but fixable. Put the full corrected text in "suggestion", in the SAME language as the post, at most ${maxLen} characters, fixing only the problem parts and keeping legitimate criticism.
- "reject": inappropriate as a whole
"reasons": short reasons shown to the author, written in ${lang === "en" ? "English" : "Japanese"} (empty array if ok).
Reply with only this JSON: {"verdict":"ok","reasons":[],"suggestion":""}

Post:
"""
${text}
"""`;
  const out = parseJsonLoose(await askClaude(env, prompt, { fast: true, maxTokens: 900 }));
  if (!out || !["ok", "revise", "reject"].includes(out.verdict)) return { verdict: "ok", reasons: [], suggestion: "" };
  return {
    verdict: out.verdict,
    reasons: Array.isArray(out.reasons) ? out.reasons.filter(x => typeof x === "string").slice(0, 5).map(x => x.slice(0, 160)) : [],
    suggestion: typeof out.suggestion === "string" ? out.suggestion.trim().slice(0, maxLen) : "",
  };
}

export const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const intIn = (v, a, b) => (Number.isInteger(v) && v >= a && v <= b ? v : null);
export const isUuid = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// エラーをまとめて JSON にする
export function handler(fn) {
  return async context => {
    try {
      if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) return fail("server_not_configured", 503);
      return await fn(context);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.detail) console.error(e.code, JSON.stringify(e.detail).slice(0, 500));
        return fail(e.code, e.status);
      }
      console.error(e);
      return fail("server_error", 500);
    }
  };
}
