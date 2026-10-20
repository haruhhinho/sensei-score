// 共有した過去問・資料を削除する（本人または管理者）
import { handler, json, fail, readJson, requireUser, db, storage, isAdmin, isUuid } from "../../server/lib.js";

export const onRequestPost = handler(async ({ request, env }) => {
  const user = await requireUser(request, env);
  const b = await readJson(request, 2_000);
  if (!isUuid(b.id)) return fail("invalid");
  const rows = await db(env, `exams?id=eq.${b.id}&select=id,user_id,pages`);
  if (!rows.length) return fail("not_found", 404);
  if (rows[0].user_id !== user.id && !(await isAdmin(env, user.id))) return fail("forbidden", 403);
  const prefixes = Array.from({ length: rows[0].pages }, (_, i) => `${b.id}/${i}.jpg`);
  await storage(env, "object/exams", { method: "DELETE", body: JSON.stringify({ prefixes }), contentType: "application/json" }).catch(() => {});
  await db(env, `exams?id=eq.${b.id}`, { method: "DELETE", prefer: "return=minimal" });
  return json({ ok: true });
});
