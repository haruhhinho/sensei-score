// レビューなどを日本語⇔英語に翻訳する
import { handler, json, fail, readJson, requireUser, askClaude, str } from "../../server/lib.js";

export const onRequestPost = handler(async ({ request, env }) => {
  await requireUser(request, env);
  const b = await readJson(request, 8_000);
  const text = str(b.text, 1200);
  if (!text) return fail("invalid");
  const target = b.target === "en" ? "English" : "Japanese";
  const out = await askClaude(env, `Translate this anonymous student review of a university course into natural ${target}. Keep course names and technical terms accurate. Reply with the translation only.\n\n"""\n${text}\n"""`, { fast: true, maxTokens: 900 });
  return json({ ok: true, text: out });
});
