// 共通の小さな道具・状態・データの読み込み
import { createClient } from "@supabase/supabase-js";
import { T, PREFS } from "./i18n.js";
import { deptEn } from "./dept.js";

export const SB_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
export const configured = !!(SB_URL && SB_KEY);
export const sb = configured ? createClient(SB_URL, SB_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } }) : null;

/* ---------- 状態 ---------- */
export const S = {
  LANG: "ja", AUTH: "loading", SESSION: null, MYID: null, ME: null, ISADMIN: false, CONSENTED: true,
  form: null, busy: false, profTab: "rev", profCourse: "", pendingTeacher: "", keepPending: false,
  addPrefill: "", addDept: "", addUniPrefill: "", ctxUni: null, ctxProf: "", barMode: "prof",
  lastUni: null, changingUni: false, animNext: true,
};
try {
  const v = localStorage.getItem("kohyo.lang");
  S.LANG = v === "en" || v === "ja" ? v : ((navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en");
} catch { S.LANG = (navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en"; }
try { const v = localStorage.getItem("kohyo.uni"); if (v && /^[\w-]{1,40}$/.test(v)) S.lastUni = v; } catch {}
export function rememberUni(id) { S.lastUni = id; S.changingUni = false; try { localStorage.setItem("kohyo.uni", id); } catch {} }

/* ---------- 文言 ---------- */
export const t = (k, ...a) => { const v = T[S.LANG][k]; return typeof v === "function" ? v(...a) : v; };

/* ---------- 小道具 ---------- */
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
export const intIn = (v, a, b) => (Number.isInteger(v) && v >= a && v <= b ? v : null);
const kata2hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const norm = s => kata2hira(String(s || "").normalize("NFKC").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s　・.\-'’]/g, ""));
export const flip = s => String(s || "").trim().split(/[\s　]+/).reverse().join(" ");
export const fmtDate = s => { const d = new Date(s); return isNaN(d) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
export const cls = q => (q == null ? "none" : q >= 4 ? "good" : q >= 3 ? "mid" : "bad");
export const hasJa = s => /[぀-ヿ㐀-鿿]/.test(s);
export function toast(m) { const e = $("#toast"); e.textContent = m; e.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (e.hidden = true), 3200); }

/* ---------- 表示名 ---------- */
export const prefEn = p => (PREFS.find(x => x[0] === p) || [])[1] || p;
export const uName = u => (u ? (S.LANG === "en" ? u.en || u.name : u.name) : "");
export const uPref = u => (u ? (S.LANG === "en" ? prefEn(u.pref) : u.pref) : "");
export const pName = p => (S.LANG === "en" ? p.en || p.name : p.name || p.en);
export const pAlt = p => { const a = S.LANG === "en" ? p.name : p.en; return a && a !== pName(p) ? a : ""; };
// 大学の公式の英語の学部名（名簿から読み込んだもの）を優先し、なければ辞書で英語にする
export const DEPT_EN = new Map();
export const dName = (d, uid) => (S.LANG === "en" ? DEPT_EN.get(uid + "|" + d) || deptEn(d) : d || "");
export const cName = c => c || "";

/* ---------- 名前の照合（日本語・かな・ローマ字、姓名どちらの順でも同じ人） ---------- */
export function profKeys(p) {
  const k = new Set();
  for (const v of [p.name, p.kana, p.en, flip(p.en), flip(p.name)]) { const n = norm(v); if (n) k.add(n); }
  return k;
}
export function profMatches(p, q) { if (!q) return false; for (const k of profKeys(p)) if (k.includes(q)) return true; return false; }
export function sameProf(p, names) { const k = profKeys(p); return names.some(n => { const a = norm(n), b = norm(flip(n)); return (a && k.has(a)) || (b && k.has(b)); }); }
export const uniMatches = (u, q) => q && [u.name, u.kana, u.en].some(v => norm(v).includes(q));
export const sameUni = (u, names) => names.some(n => { const k = norm(n); return k && [u.name, u.en, u.kana].some(v => norm(v) === k); });

/* ---------- データの読み込み（必要になったときに読み、読み終わったら描き直す） ---------- */
const cache = new Map(), pending = new Set();
let rerenderHook = () => {};
export const onDataLoaded = fn => (rerenderHook = fn);
export function need(key, loader) {
  if (cache.has(key)) return cache.get(key);
  if (!pending.has(key)) {
    pending.add(key);
    loader().then(v => cache.set(key, v)).catch(e => { console.error(key, e); cache.set(key, { error: true }); })
      .finally(() => { pending.delete(key); rerenderHook(); });
  }
  return undefined;
}
export const peek = key => cache.get(key);
export function invalidate(...prefixes) { for (const k of [...cache.keys()]) if (prefixes.some(p => k === p || k.startsWith(p + ":"))) cache.delete(k); }
export const isErr = v => v && v.error === true && !Array.isArray(v);

async function all(q, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await q().range(from, from + page - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

export const rowToUni = r => ({ id: r.id, name: r.name, en: r.name_en || "", kana: r.kana || "", pref: r.pref });
export const rowToProf = r => (r.dept_en && r.dept && DEPT_EN.set(r.university_id + "|" + r.dept, r.dept_en), {
  id: r.id, uni: r.university_id, name: r.name || "", en: r.name_en || "", kana: r.kana || "", dept: r.dept || "", deptEn: r.dept_en || "", verified: !!r.verified, mine: !!r.added_by_me,
  s: { n: r.n || 0, q: r.q == null ? null : Number(r.q), d: r.d == null ? null : Number(r.d), again: r.again_pct },
});
export const rowToRev = r => ({
  id: r.id, profId: r.professor_id, course: r.course, q: r.quality, d: r.difficulty, again: r.would_take_again,
  att: r.attendance_required, grade: r.grade || "", text: r.body, at: r.created_at, mine: !!r.is_mine,
});
export const SCATS = [["rep", "評判", "Reputation"], ["loc", "立地", "Location"], ["car", "就職・キャリア", "Career prospects"], ["fac", "施設", "Facilities"], ["net", "ネット環境", "Internet"], ["food", "学食", "Food"], ["club", "サークル・部活", "Clubs"], ["life", "学生生活", "Social life"], ["safe", "治安", "Safety"], ["happy", "満足度", "Happiness"]];
export const rowToSchool = r => ({ id: r.id, uni: r.university_id, s: Object.fromEntries(SCATS.map(([k]) => [k, r[k]])), text: r.body || "", at: r.created_at, mine: !!r.is_mine });

export const L = {
  unis: () => all(() => sb.from("universities").select("id,name,name_en,kana,pref").eq("status", "active").order("name").order("id")).then(rs => rs.map(rowToUni)),
  profs: uid => all(() => sb.from("professor_stats").select("*").eq("university_id", uid).order("name").order("id")).then(rs => rs.map(rowToProf)),
  prof: pid => sb.from("professor_stats").select("*").eq("id", pid).maybeSingle().then(({ data, error }) => { if (error) throw error; return data ? rowToProf(data) : null; }),
  reviews: pid => all(() => sb.from("reviews_public").select("*").eq("professor_id", pid).order("created_at", { ascending: false })).then(rs => rs.map(rowToRev)),
  replies: pid => sb.from("replies_public").select("*").eq("professor_id", pid).then(({ data, error }) => { if (error) throw error; return Object.fromEntries(data.map(r => [r.review_id, { text: r.body, at: r.created_at, mine: r.is_mine }])); }),
  summary: pid => sb.from("summaries").select("*").eq("professor_id", pid).then(({ data, error }) => { if (error) throw error; return Object.fromEntries(data.map(r => [r.lang, { lines: r.lines, count: r.review_count }])); }),
  exams: pid => sb.from("exams_public").select("*").eq("professor_id", pid).order("year", { ascending: false }).then(({ data, error }) => { if (error) throw error; return data; }),
  school: uid => all(() => sb.from("school_ratings_public").select("*").eq("university_id", uid).order("created_at", { ascending: false })).then(rs => rs.map(rowToSchool)),
  myVerified: () => sb.from("faculty_verified").select("professor_id").eq("user_id", S.MYID).then(({ data, error }) => { if (error) throw error; return data.map(r => r.professor_id); }),
  myReports: () => sb.from("reports").select("kind,target_id").eq("user_id", S.MYID).then(({ data, error }) => { if (error) throw error; return new Set(data.map(r => r.kind + "|" + r.target_id)); }),
  faculties: uid => sb.from("faculties").select("name,sort").eq("university_id", uid).order("sort").order("name").then(({ data, error }) => { if (error) return []; return data.map(r => r.name); }),
  myClaims: () => sb.from("faculty_claims").select("*").eq("user_id", S.MYID).order("created_at", { ascending: false }).then(({ data, error }) => { if (error) throw error; return data; }),
};

/* ---------- 投稿などのサーバー呼び出し ---------- */
export async function api(path, body) {
  const token = S.SESSION && S.SESSION.access_token;
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!data) throw { code: r.status === 404 ? "api_missing" : "server_error" };
  if (!data.ok && data.code !== "moderation") throw data;
  return data;
}
export function errText(e) {
  const c = e && e.code;
  if (c === "duplicate_school") return t("dupSchool");
  if (c === "duplicate") return t("dupReview");
  if (c === "ai_not_configured" || c === "ai_error") return t("aiDown");
  if (c === "ai_rate_limited") return t("aiLimitPost");
  if (c === "not_signed_in") return t("needLoginRate");
  if (c === "image_too_large") return t("imgTooLarge");
  if (c === "23505") return t("dupReview");
  return t("postFail");
}
