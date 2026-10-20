// 大学の評価を投稿する
import { handler, json, fail, readJson, requireUser, db, moderate, str, intIn } from "../../server/lib.js";
const KEYS = ["rep", "loc", "car", "fac", "net", "food", "club", "life", "safe", "happy"];

export const onRequestPost = handler(async ({ request, env }) => {
  const user = await requireUser(request, env);
  const b = await readJson(request, 10_000);
  const lang = b.lang === "en" ? "en" : "ja";
  const uni = str(b.universityId, 40);
  const s = b.scores || {};
  const row = { university_id: uni, user_id: user.id };
  for (const k of KEYS) { const v = intIn(s[k], 1, 5); if (v == null) return fail("invalid"); row[k] = v; }
  const text = str(b.text, 250);
  if ([...text].length > 200) return fail("invalid_length");
  const u = await db(env, `universities?id=eq.${encodeURIComponent(uni)}&status=eq.active&select=id`);
  if (!u.length) return fail("not_found", 404);
  if (text) {
    const m = await moderate(env, { context: "a rating of a university as a whole", text, maxLen: 200, lang });
    if (m.verdict !== "ok") return json({ ok: false, code: "moderation", check: m });
    row.ai_checked = true;
  }
  row.body = text || null;
  await db(env, "school_ratings", { method: "POST", prefer: "return=minimal", body: row });
  return json({ ok: true });
});
