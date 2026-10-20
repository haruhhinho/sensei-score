// 過去問・資料を共有する（写真は非公開の保存場所に置き、ログインした人だけが見られる）
import { handler, json, fail, readJson, requireUser, db, storage, moderate, str, intIn, isUuid } from "../../server/lib.js";
const TERMS = ["前期", "後期", "通年", "集中"], KINDS = ["期末試験", "中間試験", "小テスト", "レポート課題", "その他"];

export const onRequestPost = handler(async ({ request, env }) => {
  const user = await requireUser(request, env);
  const b = await readJson(request, 3_000_000);
  const lang = b.lang === "en" ? "en" : "ja";
  const course = str(b.course, 60), memo = str(b.memo, 300), year = intIn(b.year, 2000, 2100);
  if (!isUuid(b.professorId) || !course || year == null || !TERMS.includes(b.term) || !KINDS.includes(b.kind)) return fail("invalid");
  const imgs = Array.isArray(b.images) ? b.images : [];
  if (imgs.length < 1 || imgs.length > 6) return fail("invalid_images");
  const bins = [];
  for (const d of imgs) {
    if (typeof d !== "string" || !d.startsWith("data:image/jpeg;base64,")) return fail("invalid_images");
    const bin = Uint8Array.from(atob(d.slice(23)), c => c.charCodeAt(0));
    if (bin.length > 400_000) return fail("image_too_large");
    bins.push(bin);
  }
  const prof = await db(env, `professors?id=eq.${b.professorId}&status=eq.active&select=id`);
  if (!prof.length) return fail("not_found", 404);
  if (memo) {
    const m = await moderate(env, { context: "notes attached to a shared past exam", text: memo, maxLen: 300, lang });
    if (m.verdict !== "ok") return json({ ok: false, code: "moderation", check: m });
  }
  const id = crypto.randomUUID();
  const written = [];
  try {
    for (let i = 0; i < bins.length; i++) {
      await storage(env, `object/exams/${id}/${i}.jpg`, { method: "POST", body: bins[i], contentType: "image/jpeg" });
      written.push(`${id}/${i}.jpg`);
    }
    await db(env, "exams", {
      method: "POST", prefer: "return=minimal",
      body: { id, professor_id: b.professorId, user_id: user.id, course, year, term: b.term, kind: b.kind, pages: bins.length, memo: memo || null },
    });
  } catch (e) {
    if (written.length) await storage(env, "object/exams", { method: "DELETE", body: JSON.stringify({ prefixes: written }), contentType: "application/json" }).catch(() => {});
    throw e;
  }
  return json({ ok: true, id });
});
