// 先生へのレビューをAIで3行に要約し、保存する
import { handler, json, fail, readJson, requireUser, db, askClaude, parseJsonLoose, isUuid } from "../../server/lib.js";

export const onRequestPost = handler(async ({ request, env }) => {
  await requireUser(request, env);
  const b = await readJson(request, 2_000);
  const lang = b.lang === "en" ? "en" : "ja";
  if (!isUuid(b.professorId)) return fail("invalid");
  const p = await db(env, `professors?id=eq.${b.professorId}&status=eq.active&select=name,name_en,dept`);
  if (!p.length) return fail("not_found", 404);
  const rs = await db(env, `reviews?professor_id=eq.${b.professorId}&status=eq.published&select=course,quality,difficulty,would_take_again,attendance_required,body&order=created_at.desc&limit=60`);
  if (rs.length < 2) return fail("not_enough_reviews");
  const old = await db(env, `summaries?professor_id=eq.${b.professorId}&lang=eq.${lang}&select=review_count`);
  const total = (await db(env, `professor_stats?id=eq.${b.professorId}&select=n`))[0]?.n ?? rs.length;
  if (old.length && old[0].review_count === total) return json({ ok: true, unchanged: true });
  const yn = v => (v == null ? "n/a" : v ? "yes" : "no");
  const revText = rs.map(r => `- [${r.course}] quality ${r.quality}/5, difficulty ${r.difficulty}/5, would take again: ${yn(r.would_take_again)}, attendance mandatory: ${yn(r.attendance_required)}. Comment: ${r.body}`).join("\n");
  const prof = p[0];
  const prompt = `You edit a site where university students review their professors. Below are anonymous reviews (in Japanese and/or English) of professor ${prof.name || prof.name_en}${prof.name && prof.name_en ? ` (${prof.name_en})` : ""}, ${prof.dept}.
Summarize what the professor and their courses are like in exactly 3 lines for students deciding whether to enroll.
Rules:
- Write in ${lang === "en" ? "English. Each line is one sentence of at most 18 words." : "Japanese. Each line is one sentence of at most 40 characters."}
- Include both strengths and cautions (workload, difficulty, grading, attendance).
- Do not comment on the professor's personality, appearance or private life.
- Do not add facts that the reviews do not state.
Reply with only this JSON: {"lines":["line 1","line 2","line 3"]}

Reviews:
${revText}`;
  const out = parseJsonLoose(await askClaude(env, prompt, { fast: false, maxTokens: 600 }));
  const lines = out && Array.isArray(out.lines) ? out.lines.filter(l => typeof l === "string" && l.trim()).map(l => l.trim().slice(0, 160)).slice(0, 5) : [];
  if (!lines.length) return fail("ai_bad_output", 502);
  await db(env, "summaries?on_conflict=professor_id,lang", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { professor_id: b.professorId, lang, lines, review_count: total, updated_at: new Date().toISOString() },
  });
  return json({ ok: true, lines, count: total });
});
