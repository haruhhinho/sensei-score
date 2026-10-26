// Cloudflare Workers 用の入口。
// /api/... は functions/api/ の処理に回し、それ以外は dist/ の画面ファイルを返す。
import * as postReview from "../functions/api/post-review.js";
import * as postSchool from "../functions/api/post-school.js";
import * as postReply from "../functions/api/post-reply.js";
import * as postExam from "../functions/api/post-exam.js";
import * as deleteExam from "../functions/api/delete-exam.js";
import * as summarize from "../functions/api/summarize.js";
import * as translate from "../functions/api/translate.js";
import * as deleteAccount from "../functions/api/delete-account.js";

const ROUTES = {
  "post-review": postReview, "post-school": postSchool, "post-reply": postReply, "post-exam": postExam,
  "delete-exam": deleteExam, summarize, translate, "delete-account": deleteAccount,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const mod = ROUTES[url.pathname.slice(5).replace(/\/$/, "")];
      if (!mod) return Response.json({ ok: false, code: "not_found" }, { status: 404 });
      if (request.method !== "POST") return Response.json({ ok: false, code: "method_not_allowed" }, { status: 405 });
      return mod.onRequestPost({ request, env, waitUntil: p => ctx.waitUntil(p) });
    }
    return env.ASSETS.fetch(request);
  },
};
