// 本人確認済みの先生が、自分へのレビューに返信する
import { handler, json, fail, readJson, requireUser, db, moderate, str, isUuid } from "../../server/lib.js";

export const onRequestPost = handler(async ({ request, env }) => {
  const user = await requireUser(request, env);
  const b = await readJson(request, 10_000);
  const lang = b.lang === "en" ? "en" : "ja";
  if (!isUuid(b.reviewId)) return fail("invalid");
  const text = str(b.text, 320), n = [...text].length;
  if (n < 10 || n > 300) return fail("invalid_length");
  const rev = await db(env, `reviews?id=eq.${b.reviewId}&status=eq.published&select=id,professor_id`);
  if (!rev.length) return fail("not_found", 404);
  const v = await db(env, `faculty_verified?professor_id=eq.${rev[0].professor_id}&user_id=eq.${user.id}&select=professor_id`);
  if (!v.length) return fail("forbidden", 403);
  const m = await moderate(env, { context: "a professor's public reply to a student review of their course", text, maxLen: 300, lang });
  if (m.verdict !== "ok") return json({ ok: false, code: "moderation", check: m });
  await db(env, "replies?on_conflict=review_id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { review_id: b.reviewId, professor_id: rev[0].professor_id, user_id: user.id, body: text },
  });
  return json({ ok: true });
});
