// 退会する（希望すれば投稿もすべて削除）
import { handler, json, readJson, requireUser, db, storage } from "../../server/lib.js";

export const onRequestPost = handler(async ({ request, env }) => {
  const user = await requireUser(request, env);
  const b = await readJson(request, 1_000);
  const uid = user.id;
  if (b.deletePosts === true) {
    const ex = await db(env, `exams?user_id=eq.${uid}&select=id,pages`);
    for (const e of ex) {
      const prefixes = Array.from({ length: e.pages }, (_, i) => `${e.id}/${i}.jpg`);
      await storage(env, "object/exams", { method: "DELETE", body: JSON.stringify({ prefixes }), contentType: "application/json" }).catch(() => {});
    }
    for (const t of ["replies", "reviews", "school_ratings", "exams"]) await db(env, `${t}?user_id=eq.${uid}`, { method: "DELETE", prefer: "return=minimal" });
  }
  // 返信は先生本人のものなので、退会時は常に削除する
  await db(env, `replies?user_id=eq.${uid}`, { method: "DELETE", prefer: "return=minimal" });
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers });
  if (!r.ok) { console.error("delete user failed", r.status, await r.text()); return json({ ok: false, code: "delete_failed" }, 500); }
  return json({ ok: true });
});
