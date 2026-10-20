// 先生のレビューを投稿する（AIチェックに通ったものだけを保存）
import { handler, json, fail, readJson, requireUser, db, moderate, str, intIn, isUuid } from "../../server/lib.js";
const GRADES = ["秀", "優", "良", "可", "不可"];

export const onRequestPost = handler(async ({ request, env }) => {
  const user = await requireUser(request, env);
  const b = await readJson(request, 20_000);
  const lang = b.lang === "en" ? "en" : "ja";
  const professorId = b.professorId, course = str(b.course, 60), text = str(b.text, 400);
  const quality = intIn(b.quality, 1, 5), difficulty = intIn(b.difficulty, 1, 5);
  if (!isUuid(professorId) || !course || quality == null || difficulty == null) return fail("invalid");
  const len = [...text].length;
  if (len < 15 || len > 350) return fail("invalid_length");
  const grade = GRADES.includes(b.grade) ? b.grade : null;
  const prof = await db(env, `professors?id=eq.${professorId}&status=eq.active&select=id`);
  if (!prof.length) return fail("not_found", 404);
  const dup = await db(env, `reviews?user_id=eq.${user.id}&professor_id=eq.${professorId}&course=eq.${encodeURIComponent('"'+course.replace(/["\\]/g,"\\$&")+'"')}&select=id`);
  if (dup.length) return fail("duplicate", 409);

  const m = await moderate(env, { context: `a review of a university professor's course "${course}"`, text, maxLen: 350, lang });
  if (m.verdict !== "ok") return json({ ok: false, code: "moderation", check: m });

  await db(env, "reviews", {
    method: "POST", prefer: "return=minimal",
    body: {
      professor_id: professorId, user_id: user.id, course, quality, difficulty,
      would_take_again: typeof b.again === "boolean" ? b.again : null,
      attendance_required: typeof b.att === "boolean" ? b.att : null,
      grade, body: text, ai_checked: true,
    },
  });
  return json({ ok: true });
});
