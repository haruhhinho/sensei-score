import "./style.css";
import { T, LEGAL, PREFS, TERMS_VERSION } from "./i18n.js";
import {
  sb, configured, S, t, $, esc, str, intIn, norm, flip, fmtDate, cls, hasJa, toast, rememberUni,
  uName, uPref, pName, pAlt, dName, cName, profMatches, sameProf, uniMatches, sameUni,
  need, peek, invalidate, isErr, onDataLoaded, L, api, errText, SCATS, rowToUni, rowToProf,
} from "./core.js";

const GRADES = ["秀", "優", "良", "可", "不可"];
const TERMS = ["前期", "後期", "通年", "集中"];
const KINDS = ["期末試験", "中間試験", "小テスト", "レポート課題", "その他"];
const LOADING = () => `<div class="notice">${esc(t("loading"))}</div>`;
const LOADFAIL = () => `<div class="notice"><b>${esc(t("loadFail"))}</b> <button class="btn sm" onclick="location.reload()">${esc(t("retry"))}</button></div>`;

/* ===================================================================
   データの取り出し（読み込み中は undefined を返し、読み終わると自動で描き直す）
   =================================================================== */
const unisAll = () => need("unis", L.unis);
const allUnis = () => { const u = unisAll(); return Array.isArray(u) ? u : []; };
const uniById = id => allUnis().find(u => u.id === id);
const profsOf = uid => need("profs:" + uid, () => L.profs(uid));
function profById(pid) {
  for (const [k, v] of cacheEntries()) if (k.startsWith("profs:") && Array.isArray(v)) { const p = v.find(x => x.id === pid); if (p) return p; }
  const one = need("prof:" + pid, () => L.prof(pid));
  return one && !isErr(one) ? one : one === null ? null : undefined;
}
function cacheEntries() { const out = []; for (const k of ["profs:" + S.ctxUni, "profs:" + S.lastUni]) { const v = peek(k); if (v) out.push([k, v]); } return out; }
const reviewsOf = pid => need("revs:" + pid, () => L.reviews(pid));
const myVerified = () => (S.MYID ? need("myver", L.myVerified) : []);
const myReports = () => (S.MYID ? need("myrep", L.myReports) : new Set());

function statsOf(rs) {
  const n = rs.length;
  if (!n) return { n: 0, rs };
  const q = rs.reduce((a, r) => a + r.q, 0) / n, d = rs.reduce((a, r) => a + r.d, 0) / n;
  const ag = rs.filter(r => r.again != null);
  const again = ag.length ? Math.round((ag.filter(r => r.again).length / ag.length) * 100) : null;
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; rs.forEach(r => dist[r.q]++);
  return { n, q: Math.round(q * 10) / 10, d: Math.round(d * 10) / 10, again, dist, rs };
}

/* ===================================================================
   ルーティング（#p.<id> など）
   =================================================================== */
function route() {
  const h = decodeURIComponent(location.hash.slice(1)), dot = h.indexOf(".");
  const v = dot < 0 ? h : h.slice(0, dot), id = dot < 0 ? "" : h.slice(dot + 1);
  if (v === "find" || v === "dept") { const i = id.indexOf("~"); if (i > 0 && id.slice(i + 1).trim()) return { v, id: id.slice(0, i), q: id.slice(i + 1) }; return { v: "home" }; }
  if (["u", "p", "rate", "add", "school", "srate", "exam", "removal"].includes(v)) return { v: v === "u" ? "uni" : v === "p" ? "prof" : v, id };
  if (["help", "terms", "privacy", "cookies", "copyright", "contact"].includes(v)) return { v: "legal", id: v };
  if (["guidelines", "admin", "faculty", "adduni", "me"].includes(v)) return { v };
  if (v === "login" || v === "signup") return { v: "login", id: v };
  return { v: "home" };
}
function go(h) { if (location.hash === "#" + h) render(); else location.hash = h; }
window.addEventListener("hashchange", () => {
  const nv = route().v;
  if (nv === "admin") invalidate("admin");
  if (nv === "me") invalidate("me", "myclaims");
  S.animNext = true; S.form = null; if (!S.keepPending) S.pendingTeacher = ""; S.keepPending = false;
  render(); window.scrollTo(0, 0);
});

/* ===================================================================
   ヘッダー・フッター・言語
   =================================================================== */
function paintStatic() {
  document.documentElement.lang = S.LANG;
  document.title = t("brand");
  $("#brand").textContent = t("brand");
  $("#footnote").textContent = t("foot");
  document.querySelectorAll("[data-fl]").forEach(a => (a.textContent = t(a.dataset.fl)));
  $("#fcopy").textContent = t("copy"); $("#fmark").textContent = t("brand");
  $("#lab-uni").textContent = t("uni"); $("#lab-prof").textContent = t("prof"); $("#lab-school").textContent = t("uni");
  $("#mode-btn").setAttribute("aria-label", t("modeAria"));
  document.querySelector('#mode-list [data-m="prof"]').textContent = t("modeProf");
  document.querySelector('#mode-list [data-m="school"]').textContent = t("modeSchool");
  $("#lang-btn").setAttribute("aria-label", t("langAria"));
  $("#lang-cur").textContent = S.LANG === "en" ? "English" : "日本語";
  document.querySelectorAll("#lang-list [data-l]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.l === S.LANG)));
}
function setLang(l) { if (l === S.LANG) return; S.LANG = l; try { localStorage.setItem("kohyo.lang", l); } catch {} paintStatic(); renderAuth(); render(); }
function renderAuth() {
  const a = $("#auth");
  if (S.AUTH === "loading") { a.textContent = t("loading"); return; }
  if (S.AUTH === "in") {
    a.innerHTML = `<a class="melink" href="#me" title="${esc(t("me"))}"><b></b></a>`;
    a.querySelector("b").textContent = (S.ME && S.ME.name) || t("signedIn");
    return;
  }
  a.innerHTML = `<a class="btn sm" href="#login">${esc(t("loginBtn"))}</a><a class="btn sm solid mhide" href="#signup">${esc(t("signupBtn"))}</a>`;
}

/* ===================================================================
   画面の描き分け
   =================================================================== */
function render() {
  const r = route(), app = $("#app");
  if (!configured) { app.innerHTML = `<div class="notice"><b>Supabase is not configured.</b> Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</div>`; return; }
  if (S.animNext) { S.animNext = false; app.classList.add("anim"); clearTimeout(render.at); render.at = setTimeout(() => app.classList.remove("anim"), 1400); }
  document.body.classList.toggle("at-home", r.v === "home" || r.v === "uni");
  $("#adminlink").hidden = !S.ISADMIN;
  S.ctxUni = null; S.ctxProf = "";
  if (r.v === "uni") rememberUni(r.id);
  if (r.v === "prof" || r.v === "rate" || r.v === "exam") { const p = profById(r.id); if (p) { S.ctxUni = p.uni; S.ctxProf = pName(p); } }
  if (r.v === "school" || r.v === "srate") { S.ctxUni = r.id; S.barMode = "school"; }
  else if (r.v === "prof" || r.v === "rate") S.barMode = "prof";
  if (r.v === "dept" || r.v === "find") { S.ctxUni = r.id; S.barMode = "prof"; if (r.v === "find") { S.ctxProf = r.q; rememberUni(r.id); } }
  $("#bar").hidden = !["prof", "rate", "school", "srate", "dept", "find"].includes(r.v);
  applyMode(); syncBar();
  if (S.AUTH === "in" && !S.CONSENTED && r.v !== "legal") return renderConsent(app);
  const unis = unisAll();
  if (unis === undefined && !["legal", "guidelines", "login", "removal"].includes(r.v)) { app.innerHTML = LOADING(); return; }
  if (isErr(unis) && !["legal", "guidelines", "login", "removal"].includes(r.v)) { app.innerHTML = LOADFAIL(); return; }
  const fn = {
    home: renderHome, uni: renderFind, prof: renderProf, rate: renderRate, add: renderAdd, school: renderSchool,
    srate: renderSRate, exam: renderExamForm, removal: renderRemoval, legal: renderLegal, guidelines: renderGuide,
    admin: renderAdmin, faculty: renderFaculty, adduni: renderAddUni, me: renderMe, login: renderLogin,
    dept: (a, id) => renderDept(a, id, r.q), find: (a, id) => renderResults(a, id, r.q),
  }[r.v];
  fn(app, r.id);
}
// データが届いたときの描き直し（入力中の画面は書き換えない）
function rerenderSafe() {
  const v = route().v;
  const ae = document.activeElement;
  if (ae && ["b-uni", "b-prof", "b-school", "profq", "uniq", "c-prof", "c-uni-q"].includes(ae.id)) { if (ae.value) ae.dispatchEvent(new Event("input")); return; }
  if (document.querySelector(".modal")) return;
  if (S.form && ["rate", "add", "srate", "exam", "removal", "adduni", "faculty"].includes(v) && S.form.started) return;
  render();
}
onDataLoaded(rerenderSafe);

const crumb = (...parts) => `<nav class="crumb">${parts.map(([h, l]) => (h ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`)).join("<span>／</span>")}</nav>`;
const notFound = () => `<div class="notice"><b>${esc(t("profNotFound"))}</b> <a href="#home">${esc(t("backSearch"))}</a></div>`;
const loginLink = () => ` <a href="#login">${esc(t("loginBtn"))}</a>`;

/* ===================================================================
   トップ：大学 → 先生
   =================================================================== */
function renderHome(app) {
  if (S.lastUni && !uniById(S.lastUni)) S.lastUni = null;
  if (S.lastUni && !S.changingUni) return renderFind(app, S.lastUni);
  const empty = allUnis().length === 0;
  app.innerHTML = `<section class="home"><div class="logo">${esc(t("brand"))}</div>
    ${S.lastUni ? `<div class="fixed"><span class="k">${esc(t("changingUni"))}</span><button class="chg" id="cancelchg">${esc(t("keepUni", uName(uniById(S.lastUni))))}</button></div>` : `<div class="fixed ph0" aria-hidden="true"></div>`}
    <label for="uniq">${esc(t("enterUni"))}</label>
    <input id="uniq" class="line" type="text" autocomplete="off">
    <ul class="hits" id="hits"></ul>
    <div class="after" id="uafter">${empty ? `<div class="notice">${esc(t("noUnisYet"))}</div>` : ""}</div>
  </section>`;
  const inp = $("#uniq"), out = $("#hits");
  inp.oninput = () => {
    const q = norm(inp.value);
    const hits = q ? allUnis().filter(u => uniMatches(u, q)).slice(0, 30) : [];
    out.innerHTML = hits.map(u => `<li><a href="#u.${esc(u.id)}"><span>${esc(uName(u))}${S.LANG === "en" && u.en ? `<span class="sub">　${esc(u.name)}</span>` : ""}</span><span class="sub">${esc(uPref(u))}</span></a></li>`).join("");
    $("#uafter").innerHTML = q ? `<div class="addrow"><span class="sub small">${esc(t("addUniHint"))}</span><a class="btn sm" href="#adduni" data-addu="${esc(inp.value.trim())}">＋ ${esc(t("addUniBtn"))}</a></div>` : "";
  };
  kbNav(inp, out, () => inp.oninput());
  const c = $("#cancelchg"); if (c) c.onclick = () => { S.changingUni = false; render(); };
  inp.focus({ preventScroll: true });
}

function renderFind(app, uid) {
  const u = uniById(uid);
  if (!u) { S.lastUni = null; app.innerHTML = notFound(); return; }
  const profs = profsOf(uid);
  app.innerHTML = `<section class="home"><div class="logo">${esc(t("brand"))}</div>
    <div class="fixed"><span class="k">${esc(t("uni"))}</span><a class="v" href="#school.${esc(uid)}" title="${esc(t("seeSchool", uName(u)))}">${esc(uName(u))}</a><button class="chg" id="chg">${esc(t("change"))}</button></div>
    <label for="profq">${esc(t("enterProf"))}</label>
    <input id="profq" class="line" type="text" autocomplete="off" value="${esc(S.pendingTeacher)}">
    <ul class="hits" id="phits"></ul>
    <div class="after" id="after"></div>
  </section>`;
  $("#chg").onclick = () => { S.changingUni = true; if (location.hash && location.hash !== "#home") location.hash = "home"; else render(); };
  const inp = $("#profq"), out = $("#phits"), after = $("#after");
  const draw = () => {
    const raw = inp.value.trim(), q = norm(raw);
    const cur = peek("profs:" + uid), list = Array.isArray(cur) ? cur : [];
    const hits = q ? list.filter(p => profMatches(p, q)).slice(0, 12) : [];
    out.innerHTML = hits.map(p => { const s = p.s, alt = pAlt(p); return `<li><a href="#p.${esc(p.id)}"><span><span class="nm">${esc(pName(p))}</span>${alt ? `<span class="sub">　${esc(alt)}</span>` : ""}<span class="sub">　${esc(dName(p.dept))}</span></span><span class="sub">${s.n ? esc(t("scoreN", s.q.toFixed(1), s.n)) : esc(t("noReviews"))}</span></a></li>`; }).join("");
    const exact = hits.some(p => sameProf(p, [raw]));
    let html = "";
    if (cur === undefined && q) html += `<div class="small sub">${esc(t("loading"))}</div>`;
    if (S.pendingTeacher && norm(S.pendingTeacher) === q && !exact && Array.isArray(cur)) html += `<div><b>${esc(t("notRegistered", S.pendingTeacher, uName(u)))}</b></div>`;
    if (q) html += addProfLink(uid, raw, "");
    after.innerHTML = html;
  };
  inp.oninput = draw;
  kbNav(inp, out, () => goResults(uid, inp.value));
  draw();
  inp.focus({ preventScroll: true });
}

/* 候補の操作：マウスを合わせるか矢印キーで選んだ候補だけを Enter で開く。何も選んでいない Enter は fallback */
function kbNav(inp, list, fallback) {
  let idx = -1;
  const items = () => [...list.querySelectorAll("a")];
  const mark = () => items().forEach((a, i) => a.classList.toggle("hl", i === idx));
  list.addEventListener("mouseover", e => { const a = e.target.closest("a"); if (!a) return; idx = items().indexOf(a); mark(); });
  list.addEventListener("mouseleave", () => { idx = -1; mark(); });
  inp.addEventListener("input", () => { idx = -1; });
  inp.onkeydown = e => {
    const its = items(), open = !list.hidden && its.length > 0;
    if (e.key === "ArrowDown" && open) { e.preventDefault(); idx = Math.min(its.length - 1, idx + 1); mark(); its[idx].scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp" && open) { e.preventDefault(); idx = Math.max(-1, idx - 1); mark(); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && idx >= 0 && its[idx]) its[idx].click(); else fallback(); }
    else if (e.key === "Escape") inp.blur();
  };
}
const goResults = (uid, q) => { q = q.trim(); if (q && uid) { S.pendingTeacher = ""; go("find." + uid + "~" + q); } };
const addProfLink = (uid, pre, dept) => `<div class="addrow"><span class="sub small">${esc(t("addProfHint"))}</span><a class="btn sm" href="#add.${esc(uid)}" data-addp="${esc(pre || "")}" data-addd="${esc(dept || "")}">＋ ${esc(t("addProfBtn"))}</a></div>`;
document.addEventListener("click", e => {
  const a = e.target.closest("[data-addp]"); if (a) { S.addPrefill = a.dataset.addp || ""; S.addDept = a.dataset.addd || ""; }
  const u = e.target.closest("[data-addu]"); if (u) S.addUniPrefill = u.dataset.addu || "";
});

/* ===================================================================
   上部の欄（評価の種類／先生／大学）
   =================================================================== */
function syncBar() {
  const bu = $("#b-uni"), bp = $("#b-prof"), bs = $("#b-school");
  if (document.activeElement !== bu) bu.value = S.ctxUni ? uName(uniById(S.ctxUni)) : "";
  if (document.activeElement !== bp) bp.value = S.ctxProf;
  const r = route();
  if (document.activeElement !== bs) bs.value = r.v === "school" || r.v === "srate" ? uName(uniById(r.id)) : "";
  $("#dd-uni").hidden = true; $("#dd-prof").hidden = true; $("#dd-school").hidden = true;
}
function applyMode() {
  const sc = S.barMode === "school";
  $("#bar").classList.toggle("school", sc);
  $("#fld-prof").hidden = sc; $("#fld-school").hidden = !sc;
  $("#mode-cur").textContent = sc ? t("modeSchool") : t("modeProf");
  document.querySelectorAll("#mode-list [data-m]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.m === S.barMode)));
}
function showSchoolHits() {
  const q = norm($("#b-school").value), dd = $("#dd-school");
  const hits = q ? allUnis().filter(u => uniMatches(u, q)).slice(0, 20) : [];
  if (!hits.length) { dd.hidden = true; return; }
  dd.innerHTML = hits.map(u => `<li><a href="#school.${esc(u.id)}"><span>${esc(uName(u))}<span class="sub">　${esc(uPref(u))}</span></span></a></li>`).join("");
  dd.hidden = false;
  dd.querySelectorAll("a").forEach(a => { a.onmousedown = e => e.preventDefault(); a.onclick = () => $("#b-school").blur(); });
}
function showUniHits() {
  const q = norm($("#b-uni").value), dd = $("#dd-uni");
  const hits = q ? allUnis().filter(u => uniMatches(u, q)).slice(0, 20) : [];
  if (!hits.length) { dd.hidden = true; return; }
  dd.innerHTML = hits.map(u => `<li><a href="#u.${esc(u.id)}" data-u="${esc(u.id)}"><span>${esc(uName(u))}</span><span class="sub">${esc(uPref(u))}</span></a></li>`).join("");
  dd.hidden = false;
  dd.querySelectorAll("a").forEach(a => { a.onmousedown = e => e.preventDefault(); a.onclick = e => { e.preventDefault(); pickUni(a.dataset.u); }; });
}
// 先生の名前を残したまま大学を変えたときは、その大学の同じ先生（日本語・英語どちらの表記でも）を探す
async function pickUni(uid) {
  const r = route(), cur = r.v === "prof" || r.v === "rate" ? profById(r.id) : null;
  const typed = $("#b-prof").value.trim();
  $("#b-uni").blur();
  const names = cur ? [cur.name, cur.en, typed].filter(Boolean) : typed ? [typed] : [];
  if (!names.length) { S.pendingTeacher = ""; go("u." + uid); return; }
  rememberUni(uid);
  let list = peek("profs:" + uid);
  if (!Array.isArray(list)) { try { list = await L.profs(uid); } catch { list = []; } }
  const m = list.find(p => sameProf(p, names));
  if (m) { S.pendingTeacher = ""; go("p." + m.id); return; }
  S.pendingTeacher = typed || names[0]; S.keepPending = true;
  go("u." + uid);
}
function showProfHits() {
  const q = norm($("#b-prof").value), dd = $("#dd-prof");
  const list = S.ctxUni ? profsOf(S.ctxUni) : [];
  const hits = q && Array.isArray(list) ? list.filter(p => profMatches(p, q)).slice(0, 10) : [];
  if (!hits.length) { dd.hidden = true; return; }
  dd.innerHTML = hits.map(p => `<li><a href="#p.${esc(p.id)}"><span>${esc(pName(p))}<span class="sub">　${esc(dName(p.dept))}</span></span><span class="sub">${p.s.n ? p.s.q.toFixed(1) + " / 5" : esc(t("noReviews"))}</span></a></li>`).join("");
  dd.hidden = false;
  dd.querySelectorAll("a").forEach(a => { a.onmousedown = e => e.preventDefault(); a.onclick = () => { S.pendingTeacher = ""; $("#b-prof").blur(); }; });
}
const pdClosers = []; const closeAllPd = () => pdClosers.forEach(f => f());
function initBar() {
  const bu = $("#b-uni"), bp = $("#b-prof"), bs = $("#b-school");
  bu.oninput = showUniHits; bp.oninput = showProfHits; bs.oninput = showSchoolHits;
  bu.onfocus = () => bu.select(); bp.onfocus = () => { if (bp.value) showProfHits(); }; bs.onfocus = () => bs.select();
  kbNav(bu, $("#dd-uni"), showUniHits);
  kbNav(bp, $("#dd-prof"), () => { const q = bp.value; bp.blur(); goResults(S.ctxUni, q); });
  kbNav(bs, $("#dd-school"), showSchoolHits);
  bu.onblur = () => { $("#dd-uni").hidden = true; bu.value = S.ctxUni ? uName(uniById(S.ctxUni)) : ""; };
  bp.onblur = () => { $("#dd-prof").hidden = true; };
  bs.onblur = () => { $("#dd-school").hidden = true; };
  const pulldown = (btn, list) => {
    const open = o => { list.hidden = !o; btn.setAttribute("aria-expanded", String(o)); };
    btn.onclick = e => { e.stopPropagation(); const o = list.hidden; closeAllPd(); open(o); };
    pdClosers.push(() => open(false));
    return open;
  };
  const openList = pulldown($("#mode-btn"), $("#mode-list"));
  const openLang = pulldown($("#lang-btn"), $("#lang-list"));
  document.addEventListener("click", e => { if (!e.target.closest(".pd")) closeAllPd(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAllPd(); });
  $("#mode-list").querySelectorAll("[data-m]").forEach(b => (b.onclick = () => {
    openList(false); const m = b.dataset.m; if (m === S.barMode) return;
    S.barMode = m; applyMode();
    if (m === "prof") { const r = route(); if (r.v === "school" || r.v === "srate") { S.ctxUni = r.id; syncBar(); } bp.focus(); }
    else { bs.value = ""; bs.focus(); }
  }));
  $("#lang-list").querySelectorAll("[data-l]").forEach(b => (b.onclick = () => { openLang(false); setLang(b.dataset.l); }));
}

/* ===================================================================
   先生のページ
   =================================================================== */
function renderProf(app, pid) {
  const p = profById(pid);
  if (p === undefined) { app.innerHTML = LOADING(); return; }
  if (!p) { app.innerHTML = notFound(); return; }
  const u = uniById(p.uni) || { id: p.uni, name: "", en: "" };
  const rs = reviewsOf(pid);
  if (rs === undefined) { app.innerHTML = LOADING(); return; }
  if (isErr(rs)) { app.innerHTML = LOADFAIL(); return; }
  const s = statsOf(rs), alt = pAlt(p);
  const courses = [...new Set(rs.map(r => r.course))];
  if (S.profCourse && !courses.includes(S.profCourse)) S.profCourse = "";
  const exams = S.MYID ? need("exams:" + pid, () => L.exams(pid)) : null;
  app.innerHTML = `
  ${crumb(["#home", t("top")], ["#u." + u.id, uName(u)], [null, pName(p)])}
  <section class="ph">
    <div>
      <div class="score"><span class="n ${cls(s.n ? s.q : null)}">${s.n ? s.q.toFixed(1) : "—"}</span><span class="of">/ 5</span></div>
      <div class="basis">${esc(t("basis", s.n))}</div>
      <h1 class="pname">${esc(pName(p))}${p.verified ? ` <span class="mark ok" style="font-size:12px;vertical-align:middle">${esc(t("verified"))}</span>` : ""}</h1>
      ${alt ? `<div class="altname">${esc(alt)}</div>` : ""}
      <p class="pmeta">${p.dept ? `<a href="#dept.${esc(u.id)}~${encodeURIComponent(p.dept)}" title="${esc(t("deptListOf", dName(p.dept)))}">${esc(dName(p.dept))}</a>` : esc(t("deptUnset"))}　<a href="#school.${esc(u.id)}" title="${esc(t("schoolEvalOf", uName(u)))}">${esc(uName(u))}</a></p>
      ${s.n ? `<div class="figs"><div><b>${s.again != null ? s.again + "%" : "—"}</b><span>${esc(t("again"))}</span></div><div><b>${s.d.toFixed(1)}</b><span>${esc(t("diff5"))}</span></div></div>` : ""}
      <div class="row" style="margin-top:20px">${S.AUTH === "in" ? `<a class="btn solid" href="#rate.${esc(pid)}">${esc(t("rateThis"))}</a>` : `<div class="notice">${esc(t("needLoginRate"))}${loginLink()}</div>`}</div>
      ${S.ISADMIN ? `<div class="row" style="margin-top:14px">${adminHide("professors", p.id, t("adminHidePage"))}</div>` : ""}
      <a class="rmlink" href="#removal.${esc(pid)}">${esc(t("removalFromProf"))}</a>
    </div>
    <div style="display:flex;flex-direction:column;gap:28px">
      ${s.n ? `<div class="dist"><h3>${esc(t("dist"))}<span>${esc(t("countN", s.n))}</span></h3>${distChart(s)}</div>` : ""}
      <div class="sum" id="sum"></div>
    </div>
  </section>
  <section>
    <div class="tabs" role="tablist">
      <button role="tab" id="t-rev" aria-selected="${S.profTab === "rev"}">${esc(t("tabRev"))} ${s.n}</button>
      <button role="tab" id="t-exam" aria-selected="${S.profTab === "exam"}">${esc(t("tabExam"))}${Array.isArray(exams) ? " " + exams.length : ""}</button>
    </div>
    ${S.profTab === "rev" && courses.length > 1 ? `<div class="tabtools"><select id="cf" aria-label="${esc(t("filterCourse"))}"><option value="">${esc(t("allCourses"))}</option>${courses.map(c => `<option value="${esc(c)}" ${c === S.profCourse ? "selected" : ""}>${esc(cName(c))}</option>`).join("")}</select></div>` : ""}
    <div id="tabbody"></div>
  </section>`;
  const cf = $("#cf"); if (cf) cf.onchange = () => { S.profCourse = cf.value; drawRevs(p, rs); };
  $("#t-rev").onclick = () => { S.profTab = "rev"; renderProf(app, pid); };
  $("#t-exam").onclick = () => { S.profTab = "exam"; renderProf(app, pid); };
  if (S.profTab === "rev") { $("#tabbody").innerHTML = '<div id="revs"></div>'; drawRevs(p, rs); }
  else drawExams(p, exams);
  drawSum(p, s);
}
function distChart(s) {
  const max = Math.max(...[1, 2, 3, 4, 5].map(k => s.dist[k]), 1), q5 = t("q5");
  return `<div class="hchart" role="img" aria-label="${esc(t("dist"))}">${[5, 4, 3, 2, 1].map(k => { const c = s.dist[k];
    return `<div class="hrow"><span>${k}　${esc(q5[k])}</span><span class="track"><i style="width:${(c / max) * 100}%;--i:${5 - k}"></i></span><span class="c">${c}</span></div>`; }).join("")}</div>`;
}
function drawRevs(p, rs) {
  const list = rs.filter(r => !S.profCourse || r.course === S.profCourse);
  const el = $("#revs"), G = t("grades");
  const replies = need("replies:" + p.id, () => L.replies(p.id)) || {};
  const canReply = (myVerified() || []).includes?.(p.id);
  el.innerHTML = list.length ? list.map(r => `
    <article class="rev">
      <div class="sc"><div><small>${esc(t("ov"))}</small><span class="sq ${cls(r.q)}">${r.q.toFixed(1)}</span></div><div><small>${esc(t("diff"))}</small><span class="sq plain">${r.d.toFixed(1)}</span></div></div>
      <div class="bd">
        <div class="l1"><span class="course">${esc(cName(r.course))}</span><span class="date">${fmtDate(r.at)}</span></div>
        <div class="at">${r.again != null ? `<span>${esc(t("again"))}<b>${esc(r.again ? t("yes") : t("no"))}</b></span>` : ""}${r.att != null ? `<span>${esc(t("att"))}<b>${esc(r.att ? t("req") : t("opt"))}</b></span>` : ""}${r.grade ? `<span>${esc(t("grade"))}<b>${esc(G[r.grade] || r.grade)}</b></span>` : ""}</div>
        ${r.text ? trP(r.id, r.text) : ""}${replyHTML(r, replies[r.id], canReply)}
        <div class="ft"><span>${esc(t("anon"))}</span>${trB(r.id, r.text)}${r.mine ? `<span class="mark me">${esc(t("mine"))}</span><button class="del" data-del="${esc(r.id)}">${esc(t("del"))}</button>` : reportBtn("review", r.id)}${S.ISADMIN ? adminHide("reviews", r.id) : ""}</div>
      </div>
    </article>`).join("") : `<div class="notice" style="margin-top:16px">${esc(rs.length ? t("noRevCourse") : t("noRev"))}</div>`;
  el.querySelectorAll("[data-del]").forEach(b => (b.onclick = async () => {
    if (!(await askDelete(t("cfReview")))) return;
    const { error } = await sb.from("reviews").delete().eq("id", b.dataset.del);
    if (error) return toast(t("delFail"));
    invalidate("revs:" + p.id, "profs:" + p.uni, "prof:" + p.id, "me"); toast(t("deleted")); render();
  }));
}

/* ---------- 先生からの返信 ---------- */
function replyHTML(r, x, canReply) {
  if (x) return `<div class="reply"><div class="rh"><b>${esc(t("replyFrom"))}</b><span class="mark ok">${esc(t("verified"))}</span><span class="date">${fmtDate(x.at)}</span>${x.mine ? `<button class="del" data-rdel="${esc(r.id)}">${esc(t("delReply"))}</button>` : ""}</div>${trP("rp_" + r.id, x.text)}${trB("rp_" + r.id, x.text)}</div>`;
  if (canReply) return `<div><button class="btn sm" data-reply="${esc(r.id)}" data-rprof="${esc(r.profId)}">${esc(t("reply"))}</button></div>`;
  return "";
}
document.addEventListener("click", async e => {
  const a = e.target.closest("[data-reply]"); if (a) { openReply(a.dataset.reply, a.dataset.rprof); return; }
  const d = e.target.closest("[data-rdel]");
  if (d) {
    if (!(await askDelete(t("cfReply")))) return;
    const { error } = await sb.from("replies").delete().eq("review_id", d.dataset.rdel);
    if (error) return toast(t("delFail"));
    invalidate("replies"); toast(t("deleted")); render();
  }
});
function openReply(revId, profId) {
  const rs = peek("revs:" + profId); const r = Array.isArray(rs) && rs.find(x => x.id === revId); if (!r) return;
  const v = modal(`<form class="mbox" novalidate>
    <h2>${esc(t("replyTitle"))}</h2><p class="small sub">${esc(t("replyLead"))}</p><p class="quote">${esc(r.text)}</p>
    <label class="lb small" for="rpl"><b>${esc(t("reply"))}</b> <span class="sub">${esc(t("replyRule"))}</span></label>
    <textarea id="rpl" class="ruled" maxlength="300"></textarea><div id="rpl-check"></div>
    <div class="row"><button class="btn solid" type="submit">${esc(t("post"))}</button><button class="btn" type="button" data-close>${esc(t("cancel"))}</button><span class="msg" id="rpl-msg"></span></div></form>`);
  const ta = v.querySelector("#rpl"); ta.focus();
  v.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const msg = v.querySelector("#rpl-msg"); msg.classList.remove("ng");
    const text = ta.value.trim(), n = [...text].length;
    if (n < 10 || n > 300) { msg.textContent = t("eReply"); msg.classList.add("ng"); return; }
    msg.textContent = t("aiChecking");
    try {
      const res = await api("post-reply", { reviewId: revId, text, lang: S.LANG });
      if (!res.ok) { msg.textContent = ""; checkBox(v.querySelector("#rpl-check"), res.check, ta, 300); return; }
      v.remove(); invalidate("replies"); toast(t("replyPosted")); render();
    } catch (err) { msg.textContent = errText(err); msg.classList.add("ng"); }
  };
}

/* ---------- 翻訳 ---------- */
const TRSRC = {}, TR = {};
const needsTr = s => !!s && (S.LANG === "en" ? hasJa(s) : !hasJa(s) && /[A-Za-z]{3}/.test(s));
function trP(id, text, klass) { TRSRC[id] = text; const st = TR[id + "|" + S.LANG]; return `<p class="${klass || ""}" data-trp="${esc(id)}">${esc(st && st.on && st.t ? st.t : text)}</p>`; }
function trB(id, text) {
  if (S.AUTH !== "in" || !needsTr(text)) return "";
  const st = TR[id + "|" + S.LANG];
  return `<button class="trb" data-tr="${esc(id)}">${st && st.busy ? t("translating") : st && st.on ? t("original") : t("translate")}</button>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-tr]"); if (!b) return;
  const id = b.dataset.tr, k = id + "|" + S.LANG, src = TRSRC[id]; if (!src) return;
  const st = TR[k] || (TR[k] = { t: null, on: false, busy: false });
  const p = document.querySelector(`[data-trp="${CSS.escape(id)}"]`);
  if (st.busy) return;
  if (st.t) { st.on = !st.on; if (p) p.textContent = st.on ? st.t : src; b.textContent = st.on ? t("original") : t("translate"); return; }
  st.busy = true; b.textContent = t("translating"); b.disabled = true;
  try {
    const res = await api("translate", { text: src, target: S.LANG });
    st.t = res.text; st.on = true; if (p && p.isConnected) p.textContent = st.t; if (b.isConnected) b.textContent = t("original");
  } catch { if (b.isConnected) b.textContent = t("trFail"); }
  finally { st.busy = false; if (b.isConnected) b.disabled = false; }
});

/* ---------- AI要約 ---------- */
function drawSum(p, s) {
  const box = $("#sum"); if (!box) return;
  const all = need("sum:" + p.id, () => L.summary(p.id));
  const sum = all && !isErr(all) ? all[S.LANG] : null;
  const lines = sum && Array.isArray(sum.lines) ? sum.lines.filter(l => typeof l === "string").slice(0, 5) : null;
  const stale = lines && sum.count !== s.n;
  const canGen = S.AUTH === "in" && s.n >= 2 && (!lines || stale);
  let body;
  if (lines) body = `<ol>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ol><div class="meta">${esc(t("sumMeta", sum.count, stale))}</div>`;
  else if (s.n < 2) body = `<div class="meta">${esc(t("sumNeed2"))}</div>`;
  else if (S.AUTH !== "in") body = `<div class="meta">${esc(t("sumLogin"))}</div>`;
  else body = `<div class="meta">${esc(t("sumWill", s.n))}</div>`;
  box.innerHTML = `<h3>${esc(t("sumTitle"))}<span>${esc(t("sumBy"))}</span></h3><div id="sumb">${body}</div>${canGen ? `<div><button class="btn sm" id="gen">${esc(lines ? t("sumRegen") : t("sumGen"))}</button></div>` : ""}`;
  const g = $("#gen");
  if (g) g.onclick = async () => {
    g.disabled = true; $("#sumb").innerHTML = `<div class="meta">${esc(t("sumMaking"))}</div>`;
    try { await api("summarize", { professorId: p.id, lang: S.LANG }); invalidate("sum:" + p.id); render(); }
    catch (e) { drawSum(p, s); const b = $("#sumb"); if (b) b.insertAdjacentHTML("afterbegin", `<div class="err">${esc(e.code === "ai_rate_limited" ? t("aiLimited") : t("sumFail"))}</div>`); }
  };
}

/* ===================================================================
   先生を評価する
   =================================================================== */
function marks(id, opts, cur) {
  return `<div class="marks" id="${id}">${opts.map(([v, n, l]) => `<button type="button" class="mk" data-v="${esc(v)}" aria-pressed="${cur === v}"><span class="o">${esc(n)}</span><span class="t">${esc(l)}</span></button>`).join("")}</div>`;
}
function chips(id, opts, cur, label) {
  return `<div class="chips" id="${id}">${opts.map(o => `<button type="button" data-v="${esc(o)}" aria-pressed="${cur === o}">${esc(label ? label(o) : o)}</button>`).join("")}</div>`;
}
function bindChoice(id, set, required) {
  $("#" + id).querySelectorAll("button").forEach(b => (b.onclick = () => {
    const cur = b.getAttribute("aria-pressed") === "true";
    const v = cur && !required ? null : b.dataset.v;
    set(v); S.form.started = true;
    $("#" + id).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.v === v)));
  }));
}
function checkBox(el, c, ta, max) {
  if (!c) { el.innerHTML = ""; return; }
  const reasons = c.reasons && c.reasons.length ? `<ul>${c.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : "";
  if (c.verdict === "revise") {
    el.innerHTML = `<div class="check warn"><b>${esc(t("chkRevise"))}</b>${reasons}${c.suggestion ? `<div class="small sub">${esc(t("altLabel"))}</div><div class="alt">${esc(c.suggestion)}</div><div class="row"><button type="button" class="btn sm" data-use>${esc(t("useAlt"))}</button><span class="small sub">${esc(t("useAltNote"))}</span></div>` : ""}</div>`;
    const b = el.querySelector("[data-use]");
    if (b) b.onclick = () => { ta.value = c.suggestion.slice(0, max); ta.dispatchEvent(new Event("input")); el.innerHTML = ""; toast(t("altUsed")); };
  } else {
    el.innerHTML = `<div class="check ng"><b>${esc(c.verdict === "reject" ? t("chkReject") : t("chkLocal"))}</b>${reasons}${c.verdict === "reject" ? `<div class="small sub">${esc(t("chkHelp"))}</div>` : ""}</div>`;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}
function renderRate(app, pid) {
  const p = profById(pid);
  if (p === undefined) { app.innerHTML = LOADING(); return; }
  if (!p) { app.innerHTML = notFound(); return; }
  const u = uniById(p.uni) || { id: p.uni };
  if (S.AUTH !== "in") { app.innerHTML = `${crumb(["#p." + pid, "← " + pName(p)])}<div class="notice"><b>${esc(t("needLoginRate"))}</b>${loginLink()}</div>`; return; }
  if (!S.form || S.form.kind !== "rate" || S.form.pid !== pid) S.form = { kind: "rate", pid, course: "", q: null, d: null, again: null, att: null, grade: "", text: "" };
  const f = S.form, rs = peek("revs:" + pid);
  const courses = Array.isArray(rs) ? [...new Set(rs.map(r => r.course))] : [];
  const q5 = t("q5"), d5 = t("d5"), G = t("grades");
  app.innerHTML = `
  ${crumb(["#home", t("top")], ["#u." + u.id, uName(u)], ["#p." + pid, pName(p)], [null, t("evalCrumb")])}
  <section class="title"><h1>${esc(t("rateTitle", pName(p)))}</h1><p>${esc(t("rateLead"))} <a href="#guidelines">${esc(t("guideTitle"))}</a></p></section>
  <form id="rf" novalidate style="display:flex;flex-direction:column;gap:20px">
    <div class="sheet">
      <div class="q"><label class="lb" for="f-course">${esc(t("course"))}<small>${esc(t("required"))}</small></label>
        <div><input id="f-course" type="text" list="cl" maxlength="60" value="${esc(f.course)}"><datalist id="cl">${courses.map(c => `<option value="${esc(c)}"></option>`).join("")}</datalist></div></div>
      <div class="q"><span class="lb">${esc(t("ov"))}<small>${esc(t("required"))}</small></span>${marks("f-q", [1, 2, 3, 4, 5].map(k => [String(k), k, q5[k]]), f.q == null ? null : String(f.q))}</div>
      <div class="q"><span class="lb">${esc(t("diff"))}<small>${esc(t("required"))}</small></span>${marks("f-d", [1, 2, 3, 4, 5].map(k => [String(k), k, d5[k]]), f.d == null ? null : String(f.d))}</div>
      <div class="q"><span class="lb">${esc(t("againQ"))}</span>${chips("f-again", ["1", "0"], f.again == null ? null : f.again ? "1" : "0", v => (v === "1" ? t("yes") : t("no")))}</div>
      <div class="q"><span class="lb">${esc(t("att"))}</span>${chips("f-att", ["1", "0"], f.att == null ? null : f.att ? "1" : "0", v => (v === "1" ? t("req") : t("opt")))}</div>
      <div class="q"><span class="lb">${esc(t("gradeQ"))}<small>${esc(t("optional"))}</small></span>${chips("f-grade", GRADES, f.grade || null, g => (S.LANG === "en" ? `${G[g]}（${g}）` : g))}</div>
      <div class="q"><label class="lb" for="f-text">${esc(t("comment"))}<small>${esc(t("commentRule"))}</small></label>
        <div><textarea id="f-text" class="ruled" maxlength="400">${esc(f.text)}</textarea><div class="cnt" id="f-cnt"></div></div></div>
    </div>
    <div id="f-check"></div>
    <div class="row"><button class="btn solid" type="submit" id="f-sub">${esc(t("submitAI"))}</button><a class="btn" href="#p.${esc(pid)}">${esc(t("cancel"))}</a><span class="msg" id="f-msg"></span></div>
  </form>`;
  bindChoice("f-q", v => (f.q = v == null ? null : Number(v)), true);
  bindChoice("f-d", v => (f.d = v == null ? null : Number(v)), true);
  bindChoice("f-again", v => (f.again = v == null ? null : v === "1"));
  bindChoice("f-att", v => (f.att = v == null ? null : v === "1"));
  bindChoice("f-grade", v => (f.grade = v || ""));
  $("#f-course").oninput = e => { f.course = e.target.value; f.started = true; };
  const ta = $("#f-text"), cnt = () => { const n = [...ta.value].length; $("#f-cnt").textContent = t("cnt", n, 350); $("#f-cnt").classList.toggle("over", n > 350); };
  ta.oninput = () => { f.text = ta.value; f.started = true; cnt(); }; cnt();
  $("#rf").onsubmit = async e => {
    e.preventDefault(); if (S.busy) return;
    const msg = $("#f-msg"), setMsg = (m, ng) => { msg.textContent = m; msg.classList.toggle("ng", !!ng); };
    const course = f.course.trim(), text = f.text.trim(), len = [...text].length;
    if (!course) return setMsg(t("eCourse"), 1);
    if (!f.q) return setMsg(t("eQ"), 1);
    if (!f.d) return setMsg(t("eD"), 1);
    if (len > 0 && len < 15) return setMsg(t("eShort"), 1);
    if (len > 350) return setMsg(t("eLong"), 1);
    S.busy = true; const btn = $("#f-sub"); btn.disabled = true; setMsg(len ? t("aiChecking") : t("posting"));
    try {
      const res = await api("post-review", { professorId: pid, course, quality: f.q, difficulty: f.d, again: f.again, att: f.att, grade: f.grade || null, text, lang: S.LANG });
      if (!res.ok) { setMsg(""); checkBox($("#f-check"), res.check, ta, 350); return; }
      S.form = null; S.profCourse = ""; invalidate("revs:" + pid, "profs:" + p.uni, "prof:" + pid, "me");
      go("p." + pid); toast(t("postedAI"));
    } catch (err) { setMsg(errText(err), 1); }
    finally { S.busy = false; if (btn.isConnected) btn.disabled = false; }
  };
}

/* ===================================================================
   検索結果・学部の一覧
   =================================================================== */
function roster(list, showDept) {
  return `<div class="roster">
    <div class="rrow rhd"><span>${esc(t("ov"))}</span><span>${esc(t("name"))}</span><span class="wide">${showDept ? esc(t("dept")) : ""}</span><span class="wide num">${esc(t("count"))}</span><span class="wide num">${esc(t("again"))}</span><span class="wide num">${esc(t("diff"))}</span></div>
    ${list.map(p => { const s = p.s; return `<a class="rrow" href="#p.${esc(p.id)}">
      <span class="sq ${cls(s.n ? s.q : null)}">${s.n ? s.q.toFixed(1) : "—"}</span>
      <span class="nm">${esc(pName(p))}${pAlt(p) ? `<span class="alt2">${esc(pAlt(p))}</span>` : ""}<span class="mob">${showDept ? esc(dName(p.dept)) + "　" : ""}${esc(s.n ? t("mobLine", s.n, s.again ?? "—", s.d.toFixed(1)) : t("noReviews"))}</span></span>
      <span class="wide small">${showDept ? esc(dName(p.dept)) : ""}</span>
      <span class="wide num">${s.n || "—"}</span>
      <span class="wide num">${s.n && s.again != null ? s.again + "%" : "—"}</span>
      <span class="wide num">${s.n ? s.d.toFixed(1) : "—"}</span>
    </a>`; }).join("")}</div>`;
}
const byScore = (a, b) => (b.s.n ? 1 : 0) - (a.s.n ? 1 : 0) || (b.s.q || 0) - (a.s.q || 0) || pName(a).localeCompare(pName(b), S.LANG);
function renderResults(app, uid, q) {
  const u = uniById(uid); if (!u) { app.innerHTML = notFound(); return; }
  const profs = profsOf(uid);
  if (profs === undefined) { app.innerHTML = LOADING(); return; }
  if (isErr(profs)) { app.innerHTML = LOADFAIL(); return; }
  const list = profs.filter(p => profMatches(p, norm(q))).sort(byScore);
  app.innerHTML = `${crumb(["#home", t("top")], ["#school." + uid, uName(u)], [null, t("searchTop")])}
  <section class="title"><h1>${esc(t("resultsTitle", q))}</h1><p>${esc(t("resultsCount", uName(u), list.length))}</p></section>
  ${list.length ? roster(list, true) : `<div class="notice">${esc(t("noResults"))}</div>`}
  ${addProfLink(uid, q, "")}`;
}
function renderDept(app, uid, dept) {
  const u = uniById(uid); if (!u) { app.innerHTML = notFound(); return; }
  const profs = profsOf(uid);
  if (profs === undefined) { app.innerHTML = LOADING(); return; }
  if (isErr(profs)) { app.innerHTML = LOADFAIL(); return; }
  const list = profs.filter(p => p.dept === dept).sort(byScore);
  app.innerHTML = `${crumb(["#home", t("top")], ["#school." + uid, uName(u)], [null, dName(dept)])}
  <section class="title"><h1>${esc(dName(dept))}</h1><p>${esc(t("deptMembers", uName(u), list.length))}</p></section>
  ${list.length ? roster(list, false) : `<div class="notice">${esc(t("noDeptProfs"))}</div>`}
  ${addProfLink(uid, "", dept)}`;
}

/* ===================================================================
   先生・大学の追加
   =================================================================== */
function renderAdd(app, uid) {
  const u = uniById(uid);
  if (!u) { app.innerHTML = notFound(); return; }
  if (S.AUTH !== "in") { app.innerHTML = `${crumb(["#u." + uid, "← " + uName(u)])}<div class="notice"><b>${esc(t("needLoginAdd"))}</b>${loginLink()}</div>`; return; }
  // 検索欄に入れた名前を、姓と名に分けて最初から入れておく
  const pre = String(S.addPrefill || "").trim(), parts = pre.split(/[\s　]+/);
  const preJa = hasJa(pre) ? parts : ["", ""], preEn = !hasJa(pre) && pre ? (parts.length > 1 ? [parts[parts.length - 1], parts.slice(0, -1).join(" ")] : [pre, ""]) : ["", ""];
  if (!S.form || S.form.kind !== "add") S.form = { kind: "add" };
  const pair = (idA, idB, la, lb, va, vb, max) => `<div class="namepair"><label><span class="small sub">${esc(la)}</span><input id="${idA}" type="text" maxlength="${max}" value="${esc(va || "")}"></label><label><span class="small sub">${esc(lb)}</span><input id="${idB}" type="text" maxlength="${max}" value="${esc(vb || "")}"></label></div>`;
  app.innerHTML = `${crumb(["#home", t("top")], ["#u." + uid, uName(u)], [null, t("addProf")])}
  <section class="title"><h1>${esc(t("addProf"))}</h1><p>${esc(t("addLead", uName(u)))}</p></section>
  <form id="af" novalidate style="display:flex;flex-direction:column;gap:20px">
    <div class="sheet">
      <div class="q"><span class="lb">${esc(t("nameEn"))}<small>${esc(t("required"))}</small></span>${pair("a-enf", "a-eng", t("famEn"), t("givEn"), preEn[0], preEn[1], 30)}</div>
      <div class="q"><span class="lb">${esc(t("nameJa"))}<small>${esc(t("optional"))}</small></span>${pair("a-jaf", "a-jag", t("famJa"), t("givJa"), preJa[0], preJa.slice(1).join(" "), 20)}</div>
      <div class="q"><span class="lb">${esc(t("uniKana"))}<small>${esc(t("optional"))}</small></span>${pair("a-kaf", "a-kag", t("famKana"), t("givKana"), "", "", 20)}</div>
      <div class="q"><label class="lb" for="a-dept">${esc(t("dept"))}<small>${esc(t("required"))}</small></label><div style="display:flex;flex-direction:column;gap:8px;min-width:0">
        <input id="a-dept" type="text" maxlength="40" value="${esc(S.addDept)}" placeholder="${esc(t("facPh"))}">
        <span class="small sub">${esc(t("facHintFree"))}</span></div></div>
    </div>
    <div class="row"><button class="btn solid" type="submit" id="a-sub">${esc(t("addBtn"))}</button><a class="btn" href="#u.${esc(uid)}">${esc(t("cancel"))}</a><span class="msg" id="a-msg"></span></div>
  </form>`;
  app.querySelectorAll("#af input").forEach(i => i.addEventListener("input", () => (S.form.started = true)));
  const v = id => $("#" + id).value.trim().replace(/[\s　]+/g, " ");
  $("#af").onsubmit = async e => {
    e.preventDefault(); if (S.busy) return;
    const msg = $("#a-msg"); msg.classList.add("ng");
    const enF = v("a-enf"), enG = v("a-eng"), jaF = v("a-jaf"), jaG = v("a-jag"), kaF = v("a-kaf"), kaG = v("a-kag");
    if (!isRoman(enF) || !isRoman(enG)) { msg.textContent = t("eNameEn"); return; }
    if ((jaF && !jaG) || (!jaF && jaG)) { msg.textContent = t("eNameJaPair"); return; }
    const cap = w => w.split(" ").map(x => x.split("-").map(p => (p === p.toUpperCase() || p === p.toLowerCase() ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p)).join("-")).join(" ");
    const en = `${cap(enG)} ${cap(enF)}`, name = jaF ? `${jaF} ${jaG}` : "", kana = kaF || kaG ? `${kaF} ${kaG}`.trim() : "";
    const dept = facultyOnly(v("a-dept"));
    if (!dept) { msg.textContent = t("eDept"); return; }
    if (!isFaculty(dept)) { msg.textContent = t("eDeptFormat"); return; }
    let list = peek("profs:" + uid); if (!Array.isArray(list)) { try { list = await L.profs(uid); } catch { list = []; } }
    const dup = list.find(p => sameProf(p, [name, en].filter(Boolean)));
    if (dup) { msg.innerHTML = `${esc(t("dupProf"))} <a href="#p.${esc(dup.id)}">${esc(pName(dup))}</a>`; return; }
    S.busy = true; $("#a-sub").disabled = true; msg.classList.remove("ng"); msg.textContent = t("adding");
    const { data, error } = await sb.from("professors").insert({ university_id: uid, name: name || null, name_en: en, kana: kana || null, dept, created_by: S.MYID }).select("id").single();
    S.busy = false;
    if (error) { $("#a-sub").disabled = false; msg.classList.add("ng"); msg.textContent = t("addFail"); return; }
    S.form = null; invalidate("profs:" + uid, "me"); go("p." + data.id); toast(t("added"));
  };
}
function renderAddUni(app) {
  if (S.AUTH !== "in") { app.innerHTML = `${crumb(["#home", t("top")], [null, t("addUniTitle")])}<div class="notice"><b>${esc(t("needLoginAddUni"))}</b>${loginLink()}</div>`; return; }
  const pre = S.addUniPrefill, preJa = hasJa(pre) ? pre : "", preEn = hasJa(pre) ? "" : pre;
  if (!S.form || S.form.kind !== "adduni") S.form = { kind: "adduni" };
  app.innerHTML = `${crumb(["#home", t("top")], [null, t("addUniTitle")])}
  <section class="title"><h1>${esc(t("addUniTitle"))}</h1><p>${esc(t("addUniLead"))}</p></section>
  <form id="uf" novalidate style="display:flex;flex-direction:column;gap:20px">
    <div class="sheet">
      <div class="q"><label class="lb" for="u-ja">${esc(t("uniJa"))}<small>${esc(t("oneOf"))}</small></label><input id="u-ja" type="text" maxlength="60" value="${esc(preJa)}"></div>
      <div class="q"><label class="lb" for="u-kana">${esc(t("uniKana"))}<small>${esc(t("optional"))}</small></label><input id="u-kana" type="text" maxlength="60"></div>
      <div class="q"><label class="lb" for="u-en">${esc(t("uniEn"))}<small>${esc(t("oneOf"))}</small></label><input id="u-en" type="text" maxlength="80" value="${esc(preEn)}"></div>
      <div class="q"><label class="lb" for="u-pref">${esc(t("pref"))}<small>${esc(t("required"))}</small></label><select id="u-pref" class="selbox"><option value="">—</option>${PREFS.map(([j, e]) => `<option value="${j}">${esc(S.LANG === "en" ? e : j)}</option>`).join("")}</select></div>
    </div>
    <div class="row"><button class="btn solid" type="submit" id="u-sub">${esc(t("addBtn"))}</button><a class="btn" href="#home">${esc(t("cancel"))}</a><span class="msg" id="u-msg"></span></div>
  </form>`;
  app.querySelectorAll("#uf input,#uf select").forEach(i => i.addEventListener("input", () => (S.form.started = true)));
  $("#uf").onsubmit = async e => {
    e.preventDefault(); if (S.busy) return;
    const ja = $("#u-ja").value.trim(), en = $("#u-en").value.trim(), kana = $("#u-kana").value.trim(), pref = $("#u-pref").value, msg = $("#u-msg");
    msg.classList.add("ng");
    if ([...ja].length < 2 && [...en].length < 2) { msg.textContent = t("eUniName"); return; }
    if (!pref) { msg.textContent = t("ePref"); return; }
    const dup = allUnis().find(u => sameUni(u, [ja, en, kana].filter(Boolean)));
    if (dup) { msg.innerHTML = `${esc(t("dupUni"))} <a href="#u.${esc(dup.id)}">${esc(uName(dup))}</a>`; return; }
    S.busy = true; $("#u-sub").disabled = true; msg.classList.remove("ng"); msg.textContent = t("adding");
    const id = "u_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const { error } = await sb.from("universities").insert({ id, name: ja || en, name_en: en || null, kana: kana || null, pref, created_by: S.MYID });
    S.busy = false;
    if (error) { $("#u-sub").disabled = false; msg.classList.add("ng"); msg.textContent = t("addFail"); return; }
    S.form = null; invalidate("unis", "me"); rememberUni(id); go("u." + id); toast(t("uniAdded"));
  };
}

/* ===================================================================
   大学の評価
   =================================================================== */
const scatL = c => (S.LANG === "en" ? c[2] : c[1]);
const rowAvg = r => Math.round((SCATS.reduce((a, [k]) => a + r.s[k], 0) / SCATS.length) * 10) / 10;
function renderSchool(app, uid) {
  const u = uniById(uid); if (!u) { app.innerHTML = notFound(); return; }
  const rows = need("school:" + uid, () => L.school(uid));
  if (rows === undefined) { app.innerHTML = LOADING(); return; }
  if (isErr(rows)) { app.innerHTML = LOADFAIL(); return; }
  const n = rows.length, cat = {};
  for (const [k] of SCATS) cat[k] = n ? Math.round((rows.reduce((a, r) => a + r.s[k], 0) / n) * 10) / 10 : 0;
  const avg = n ? Math.round((Object.values(cat).reduce((a, v) => a + v, 0) / SCATS.length) * 10) / 10 : null;
  app.innerHTML = `
  ${crumb(["#home", t("top")], ["#u." + uid, uName(u)], [null, t("modeSchool")])}
  <section>
    <div class="score"><span class="n ${cls(avg)}">${n ? avg.toFixed(1) : "—"}</span><span class="of">/ 5</span></div>
    <div class="basis">${esc(t("schoolBasis", n))}</div>
    <h1 class="pname">${esc(uName(u))}</h1>
    ${S.LANG === "en" && u.en ? `<div class="altname">${esc(u.name)}</div>` : ""}
    <p class="pmeta">${esc(uPref(u))}</p>
    <div class="row" style="margin-top:20px">${S.AUTH === "in" ? `<a class="btn solid" href="#srate.${esc(uid)}">${esc(t("rateSchool"))}</a>` : `<div class="notice">${esc(t("needLoginSchool"))}${loginLink()}</div>`}</div>
  </section>
  <section><div class="dist"><h3>${esc(t("byCat"))}<span>${esc(t("avg5"))}</span></h3>
    ${n ? `<div class="hchart two" role="img" aria-label="${esc(t("byCat"))}">${SCATS.map((c, ci) => `<div class="hrow wide"><span>${esc(scatL(c))}</span><span class="track"><i style="width:${(cat[c[0]] / 5) * 100}%;--i:${ci}"></i></span><span class="c">${cat[c[0]].toFixed(1)}</span></div>`).join("")}</div>` : `<div class="notice" style="margin-top:12px">${esc(t("noSchoolEval"))}</div>`}
  </div></section>
  <section>
    <div class="tabs"><button aria-selected="true">${esc(t("schoolRevs"))} ${n}</button></div>
    <div>${rows.map(r => `
      <article class="srev">
        <div><span class="sq ${cls(rowAvg(r))}">${rowAvg(r).toFixed(1)}</span></div>
        <div class="bd">
          <div class="cats">${SCATS.map(c => `<span><small>${esc(scatL(c))}</small><b>${r.s[c[0]]}</b></span>`).join("")}</div>
          ${r.text ? trP(r.id, r.text, "small sub") : ""}
          <div class="small sub" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span>${fmtDate(r.at)}</span>${r.text ? trB(r.id, r.text) : ""}${r.mine ? `<span class="mark me">${esc(t("mine"))}</span><button class="del" data-sdel="${esc(r.id)}">${esc(t("del"))}</button>` : reportBtn("school", r.id)}${S.ISADMIN ? adminHide("school_ratings", r.id) : ""}</div>
        </div>
      </article>`).join("")}</div>
  </section>`;
  app.querySelectorAll("[data-sdel]").forEach(b => (b.onclick = async () => {
    if (!(await askDelete(t("cfSchool")))) return;
    const { error } = await sb.from("school_ratings").delete().eq("id", b.dataset.sdel);
    if (error) return toast(t("delFail"));
    invalidate("school:" + uid, "me"); toast(t("deleted")); render();
  }));
}
function renderSRate(app, uid) {
  const u = uniById(uid); if (!u) { app.innerHTML = notFound(); return; }
  if (S.AUTH !== "in") { app.innerHTML = `${crumb(["#school." + uid, "← " + t("schoolEvalOf", uName(u))])}<div class="notice"><b>${esc(t("needLoginSchool"))}</b>${loginLink()}</div>`; return; }
  if (!S.form || S.form.kind !== "school" || S.form.uid !== uid) S.form = { kind: "school", uid, s: {}, text: "" };
  const f = S.form;
  app.innerHTML = `
  ${crumb(["#home", t("top")], ["#school." + uid, t("schoolEvalOf", uName(u))], [null, t("evalCrumb")])}
  <section class="title"><h1>${esc(t("srateTitle", uName(u)))}</h1><p>${esc(t("srateLead"))}</p></section>
  <form id="sf" novalidate style="display:flex;flex-direction:column;gap:20px">
    <div class="sheet">
      ${SCATS.map(c => `<div class="q"><span class="lb">${esc(scatL(c))}</span>${marks("s-" + c[0], [1, 2, 3, 4, 5].map(n => [String(n), n, n === 1 ? t("bad") : n === 5 ? t("good") : ""]), f.s[c[0]] ? String(f.s[c[0]]) : null)}</div>`).join("")}
      <div class="q"><label class="lb" for="f-text">${esc(t("oneLine"))}<small>${esc(t("oneLineRule"))}</small></label>
        <div><textarea id="f-text" class="ruled" maxlength="250" style="min-height:4em">${esc(f.text)}</textarea><div class="cnt" id="f-cnt"></div></div></div>
    </div>
    <div id="f-check"></div>
    <div class="row"><button class="btn solid" type="submit" id="f-sub">${esc(t("post"))}</button><a class="btn" href="#school.${esc(uid)}">${esc(t("cancel"))}</a><span class="msg" id="f-msg"></span></div>
  </form>`;
  for (const [k] of SCATS) bindChoice("s-" + k, v => (f.s[k] = Number(v)), true);
  const ta = $("#f-text"), cnt = () => { const n = [...ta.value].length; $("#f-cnt").textContent = t("cnt", n, 200); $("#f-cnt").classList.toggle("over", n > 200); };
  ta.oninput = () => { f.text = ta.value; f.started = true; cnt(); }; cnt();
  $("#sf").onsubmit = async e => {
    e.preventDefault(); if (S.busy) return;
    const msg = $("#f-msg"), setMsg = (m, ng) => { msg.textContent = m; msg.classList.toggle("ng", !!ng); };
    const miss = SCATS.filter(([k]) => !f.s[k]);
    if (miss.length) return setMsg(t("eMissing", scatL(miss[0]), miss.length), 1);
    const text = f.text.trim();
    if ([...text].length > 200) return setMsg(t("eOneLong"), 1);
    S.busy = true; const btn = $("#f-sub"); btn.disabled = true; setMsg(text ? t("aiCheckingLine") : t("posting"));
    try {
      const res = await api("post-school", { universityId: uid, scores: f.s, text, lang: S.LANG });
      if (!res.ok) { setMsg(""); checkBox($("#f-check"), res.check, ta, 200); return; }
      S.form = null; invalidate("school:" + uid, "me"); go("school." + uid); toast(t("schoolPosted"));
    } catch (err) { setMsg(errText(err), 1); }
    finally { S.busy = false; if (btn.isConnected) btn.disabled = false; }
  };
}

/* ===================================================================
   過去問・資料
   =================================================================== */
const examTitle = x => t("examHead", x.year, t("terms")[x.term], t("kinds")[x.kind]);
function drawExams(p, list) {
  const el = $("#tabbody");
  if (S.AUTH !== "in") { el.innerHTML = `<div class="notice" style="margin-top:16px"><b>${esc(t("examLoginOnly"))}</b>${loginLink()}</div>`; return; }
  if (list === undefined) { el.innerHTML = LOADING(); return; }
  if (isErr(list)) { el.innerHTML = LOADFAIL(); return; }
  el.innerHTML = `<div class="tabbar"><span class="small sub">${esc(t("examWarn"))}</span><a class="btn sm" href="#exam.${esc(p.id)}">${esc(t("shareExam"))}</a></div>
  ${list.length ? list.map((x, i) => `
    <article class="ex">
      <div><div class="t">${esc(examTitle(x))}</div><div class="m"><span>${esc(cName(x.course))}</span><span>${esc(t("pages", x.pages))}</span><span>${esc(t("sharedOn", fmtDate(x.created_at)))}</span></div></div>
      <button class="btn sm" data-open="${i}">${esc(t("view"))}</button>
      ${x.memo ? trP(x.id, x.memo) : ""}
      <div class="ft"><span>${esc(t("anon"))}</span>${x.memo ? trB(x.id, x.memo) : ""}${x.is_mine ? `<span class="mark me">${esc(t("myShare"))}</span><button class="del" data-edel="${i}">${esc(t("del"))}</button>` : reportBtn("exam", x.id)}${S.ISADMIN ? adminHide("exams", x.id) : ""}</div>
    </article>`).join("") : `<div class="notice" style="margin-top:16px">${esc(t("noExam"))}</div>`}`;
  el.querySelectorAll("[data-open]").forEach(b => (b.onclick = () => openExam(list[+b.dataset.open])));
  el.querySelectorAll("[data-edel]").forEach(b => (b.onclick = async () => {
    if (!(await askDelete(t("cfExam")))) return;
    try { await api("delete-exam", { id: list[+b.dataset.edel].id }); invalidate("exams:" + p.id, "me"); toast(t("deleted")); render(); }
    catch { toast(t("delFail")); }
  }));
}
function openExam(x) {
  const v = modal(`<div class="in"><div class="hd"><b></b><button class="btn sm solid" data-close></button></div><div id="vpages" style="display:flex;flex-direction:column;gap:12px;color:var(--paper)"></div></div>`, "viewer");
  v.querySelector("b").textContent = `${examTitle(x)}　${x.course}`;
  v.querySelector("[data-close]").textContent = t("close");
  const box = v.querySelector("#vpages"); box.textContent = t("loading2");
  (async () => {
    const urls = [];
    for (let i = 0; i < x.pages; i++) {
      const { data } = await sb.storage.from("exams").createSignedUrl(`${x.id}/${i}.jpg`, 600);
      if (data && data.signedUrl) urls.push(data.signedUrl);
    }
    if (!v.isConnected) return;
    if (!urls.length) { box.textContent = t("imgFail"); return; }
    box.innerHTML = ""; urls.forEach((s, i) => { const im = new Image(); im.alt = t("pageN", i + 1); im.src = s; box.appendChild(im); });
  })();
}
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("load")); i.src = url; });
    let side = 1800, q = 0.78;
    for (let k = 0; k < 10; k++) {
      const sc = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL("image/jpeg", q);
      if (d.length < 500000) return d;
      side *= 0.82; q = Math.max(0.5, q - 0.06);
    }
    throw new Error("big");
  } finally { URL.revokeObjectURL(url); }
}
function renderExamForm(app, pid) {
  const p = profById(pid);
  if (p === undefined) { app.innerHTML = LOADING(); return; }
  if (!p) { app.innerHTML = notFound(); return; }
  if (S.AUTH !== "in") { app.innerHTML = `${crumb(["#p." + pid, "← " + pName(p)])}<div class="notice"><b>${esc(t("needLoginExam"))}</b>${loginLink()}</div>`; return; }
  const u = uniById(p.uni) || { id: p.uni }, thisYear = new Date().getFullYear();
  if (!S.form || S.form.kind !== "exam" || S.form.pid !== pid) S.form = { kind: "exam", pid, course: "", year: String(thisYear), term: null, ekind: null, imgs: [], text: "", a1: false, a2: false };
  const f = S.form, rs = peek("revs:" + pid);
  const courses = Array.isArray(rs) ? [...new Set(rs.map(r => r.course))] : [];
  app.innerHTML = `
  ${crumb(["#home", t("top")], ["#u." + u.id, uName(u)], ["#p." + pid, pName(p)], [null, t("examCrumb")])}
  <section class="title"><h1>${esc(t("shareExam"))}</h1><p>${esc(t("examLead", pName(p)))}</p></section>
  <form id="ef" novalidate style="display:flex;flex-direction:column;gap:20px">
    <div class="sheet">
      <div class="q"><label class="lb" for="e-course">${esc(t("course"))}<small>${esc(t("required"))}</small></label><div><input id="e-course" type="text" list="ecl" maxlength="60" value="${esc(f.course)}"><datalist id="ecl">${courses.map(c => `<option value="${esc(c)}"></option>`).join("")}</datalist></div></div>
      <div class="q"><label class="lb" for="e-year">${esc(t("year"))}<small>${esc(t("required"))}</small></label><div><select id="e-year" class="selbox">${Array.from({ length: 11 }, (_, i) => thisYear - i).map(y => `<option value="${y}" ${String(y) === f.year ? "selected" : ""}>${S.LANG === "en" ? "AY" + y : y}</option>`).join("")}</select>　${esc(t("yearSuffix"))}</div></div>
      <div class="q"><span class="lb">${esc(t("term"))}<small>${esc(t("required"))}</small></span>${chips("e-term", TERMS, f.term, o => t("terms")[o])}</div>
      <div class="q"><span class="lb">${esc(t("kind"))}<small>${esc(t("required"))}</small></span>${chips("e-kind", KINDS, f.ekind, o => t("kinds")[o])}</div>
      <div class="q"><label class="lb" for="e-file">${esc(t("photos"))}<small>${esc(t("photosRule"))}</small></label>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><input id="e-file" type="file" accept="image/jpeg,image/png,image/webp" multiple><div class="thumbs" id="e-thumbs"></div><span class="small sub" id="e-fmsg"></span></div></div>
      <div class="q"><label class="lb" for="f-text">${esc(t("memo"))}<small>${esc(t("memoRule"))}</small></label>
        <div><textarea id="f-text" class="ruled" maxlength="300" style="min-height:6em">${esc(f.text)}</textarea><div class="small sub">${esc(t("memoHint"))}</div></div></div>
      <div class="q"><span class="lb">${esc(t("confirm"))}<small>${esc(t("required"))}</small></span><div style="display:flex;flex-direction:column;gap:8px">
        <label class="agree"><input type="checkbox" id="e-a1" ${f.a1 ? "checked" : ""}>${esc(t("agree1"))}</label>
        <label class="agree"><input type="checkbox" id="e-a2" ${f.a2 ? "checked" : ""}>${esc(t("agree2"))}</label></div></div>
    </div>
    <div id="f-check"></div>
    <div class="row"><button class="btn solid" type="submit" id="f-sub">${esc(t("share"))}</button><a class="btn" href="#p.${esc(pid)}">${esc(t("cancel"))}</a><span class="msg" id="f-msg"></span></div>
  </form>`;
  bindChoice("e-term", v => (f.term = v), true); bindChoice("e-kind", v => (f.ekind = v), true);
  $("#e-course").oninput = e => { f.course = e.target.value; f.started = true; };
  $("#e-year").onchange = e => (f.year = e.target.value);
  $("#e-a1").onchange = e => (f.a1 = e.target.checked); $("#e-a2").onchange = e => (f.a2 = e.target.checked);
  const ta = $("#f-text"); ta.oninput = e => { f.text = e.target.value; f.started = true; };
  const drawThumbs = () => {
    const box = $("#e-thumbs"); box.innerHTML = "";
    f.imgs.forEach((d, i) => {
      const w = document.createElement("div"); w.className = "th";
      const im = new Image(); im.src = d; im.alt = t("pageN", i + 1);
      const rm = document.createElement("button"); rm.type = "button"; rm.className = "x"; rm.textContent = "×"; rm.setAttribute("aria-label", t("removeN", i + 1));
      rm.onclick = () => { f.imgs.splice(i, 1); drawThumbs(); };
      w.append(im, rm); box.appendChild(w);
    });
  };
  drawThumbs();
  $("#e-file").onchange = async e => {
    const files = [...e.target.files]; e.target.value = ""; const fm = $("#e-fmsg"); f.started = true;
    for (const file of files) {
      if (f.imgs.length >= 6) { fm.textContent = t("max6"); break; }
      fm.textContent = t("compressing");
      try { f.imgs.push(await compressImage(file)); fm.textContent = ""; } catch { fm.textContent = t("badImg"); }
      drawThumbs();
    }
  };
  $("#ef").onsubmit = async e => {
    e.preventDefault(); if (S.busy) return;
    const msg = $("#f-msg"), setMsg = (m, ng) => { msg.textContent = m; msg.classList.toggle("ng", !!ng); };
    const course = f.course.trim(), memo = f.text.trim();
    if (!course) return setMsg(t("eCourse"), 1);
    if (!f.term) return setMsg(t("eTerm"), 1);
    if (!f.ekind) return setMsg(t("eKind"), 1);
    if (!f.imgs.length) return setMsg(t("ePhoto"), 1);
    if (!f.a1 || !f.a2) return setMsg(t("eAgree"), 1);
    S.busy = true; const btn = $("#f-sub"); btn.disabled = true; setMsg(memo ? t("aiMemo") : t("saving", f.imgs.length, f.imgs.length));
    try {
      const res = await api("post-exam", { professorId: pid, course, year: Number(f.year), term: f.term, kind: f.ekind, memo, images: f.imgs, lang: S.LANG });
      if (!res.ok) { setMsg(""); checkBox($("#f-check"), res.check, ta, 300); return; }
      S.form = null; S.profTab = "exam"; invalidate("exams:" + pid, "me"); go("p." + pid); toast(t("shared"));
    } catch (err) { setMsg(errText(err), 1); }
    finally { S.busy = false; if (btn.isConnected) btn.disabled = false; }
  };
}

/* ===================================================================
   通報・確認ポップアップ
   =================================================================== */
function modal(inner, klass) {
  const v = document.createElement("div"); v.className = klass || "modal"; v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true");
  v.innerHTML = inner; document.body.appendChild(v);
  const close = () => { v.remove(); document.removeEventListener("keydown", k1); };
  const k1 = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", k1);
  v.addEventListener("click", e => { if (e.target === v || e.target.closest("[data-close]")) close(); });
  v.close = close;
  return v;
}
function askConfirm({ title, body, detail, ok, danger = true }) {
  return new Promise(res => {
    const v = modal(`<div class="mbox cf"><h2></h2>${detail ? `<p class="cfd"></p>` : ""}<p class="small sub"></p><div class="row"><button class="btn ${danger ? "danger" : "solid"}" id="cf-ok"></button><button class="btn" id="cf-no"></button></div></div>`);
    v.setAttribute("role", "alertdialog");
    v.querySelector("h2").textContent = title; if (detail) v.querySelector(".cfd").textContent = detail;
    v.querySelector(".small").textContent = body || ""; v.querySelector("#cf-ok").textContent = ok; v.querySelector("#cf-no").textContent = t("cancel");
    let done = false; const fin = r => { if (done) return; done = true; v.close(); res(r); };
    v.querySelector("#cf-ok").onclick = () => fin(true); v.querySelector("#cf-no").onclick = () => fin(false);
    new MutationObserver((_, o) => { if (!v.isConnected) { o.disconnect(); fin(false); } }).observe(document.body, { childList: true });
    v.querySelector("#cf-no").focus();
  });
}
const askDelete = detail => askConfirm({ title: t("cfDelTitle"), detail, body: t("cfDelBody"), ok: t("cfDelOk") });

function reportBtn(kind, id) {
  if (S.AUTH !== "in") return "";
  const mine = myReports();
  if (mine && mine.has && mine.has(kind + "|" + id)) return `<span class="rep done">${esc(t("reported"))}</span>`;
  return `<button class="rep" data-rep="${esc(kind)}|${esc(id)}">${esc(t("report"))}</button>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-rep]"); if (!b) return; const [kind, id] = b.dataset.rep.split("|"); openReport(kind, id); });
function openReport(kind, id) {
  const keys = kind === "exam" ? ["copyright", "personal", "abuse", "false", "offtopic", "other"] : ["abuse", "personal", "false", "offtopic", "other"];
  const R = t("reasons"); let reason = null;
  const v = modal(`<form class="mbox" novalidate>
    <h2>${esc(kind === "exam" ? t("reportTitleExam") : t("reportTitle"))}</h2><p class="small sub">${esc(t("reportLead"))}</p>
    <div class="lb small"><b>${esc(t("reasonQ"))}</b></div>
    <div class="chips stack" id="rp-r">${keys.map(k => `<button type="button" data-v="${k}" aria-pressed="false">${esc(R[k])}</button>`).join("")}</div>
    <label class="lb small" for="rp-note"><b>${esc(t("detail"))}</b> <span class="sub">${esc(t("detailRule"))}</span></label>
    <textarea id="rp-note" class="ruled" maxlength="200" style="min-height:4em"></textarea>
    <div class="row"><button class="btn solid" type="submit">${esc(t("send"))}</button><button class="btn" type="button" data-close>${esc(t("cancel"))}</button><span class="msg" id="rp-msg"></span></div></form>`);
  v.querySelectorAll("#rp-r button").forEach(b => (b.onclick = () => { reason = b.dataset.v; v.querySelectorAll("#rp-r button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); }));
  v.querySelector("#rp-r button").focus();
  v.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const msg = v.querySelector("#rp-msg");
    if (!reason) { msg.textContent = t("eReason"); msg.classList.add("ng"); return; }
    const note = v.querySelector("#rp-note").value.trim().slice(0, 200);
    const { error } = await sb.from("reports").insert({ kind, target_id: id, reason, note: note || null, user_id: S.MYID });
    if (error && error.code !== "23505") { msg.textContent = t("reportFail"); msg.classList.add("ng"); return; }
    v.close(); invalidate("myrep"); toast(t("reportSent")); render();
  };
}

/* ===================================================================
   評価ガイドライン・規約などのページ
   =================================================================== */
function renderGuide(app) {
  app.innerHTML = `${crumb(["#home", t("top")], [null, t("guideTitle")])}
  <article class="doc"><h1>${esc(t("guideTitle"))}</h1><p class="lead">${esc(t("guideLead"))}</p>
    ${t("guide").map(([h, items]) => `<section><h2>${esc(h)}</h2><ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></section>`).join("")}
    <p><a class="btn" href="#removal">${esc(t("removalTitle"))}</a></p></article>`;
}
function renderLegal(app, key) {
  const d = LEGAL[S.LANG][key];
  const table = d.table ? `<div class="tblwrap"><table class="tbl"><thead><tr>${d.tableHead.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${d.table.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
  const isList = !["help", "about", "contact"].includes(key);
  app.innerHTML = `${crumb(["#home", t("top")], [null, d.title])}
  <article class="doc"><h1>${esc(d.title)}</h1>${d.lead ? `<p class="lead">${esc(d.lead)}</p>` : ""}${table}
    ${key === "about" ? `<dl class="dl">${d.secs.map(([h, it]) => `<dt>${esc(h)}</dt><dd>${it.map(esc).join("<br>")}</dd>`).join("")}</dl>`
      : d.secs.map(([h, items]) => `<section><h2>${esc(h)}</h2>${isList && items.length > 1 ? `<ol class="${/^(第|Article)/.test(h) ? "num" : "plain"}">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ol>` : items.map(i => `<p>${esc(i)}</p>`).join("")}</section>`).join("")}
    ${["terms", "privacy", "cookies", "copyright"].includes(key) ? `<p class="small sub">${esc(t("enacted"))}</p>` : ""}</article>`;
}

/* ---------- 削除依頼（ログインしていなくても送れる） ---------- */
function renderRemoval(app, pid) {
  const p = pid ? profById(pid) : null;
  if (!S.form || S.form.kind !== "removal") {
    const u = p ? uniById(p.uni) : null;
    S.form = { kind: "removal", name: p ? pName(p) : "", uni: u ? uName(u) : "", role: null, scope: null, target: p ? pName(p) : "", reason: "", email: "", agree: false, done: false };
  }
  const f = S.form;
  if (f.done) { app.innerHTML = `${crumb(["#home", t("top")], [null, t("removalTitle")])}<div class="notice"><b>${esc(t("removalDone"))}</b></div>`; return; }
  const RO = t("roles"), SC = t("scopes");
  app.innerHTML = `${crumb(["#home", t("top")], ["#guidelines", t("guideTitle")], [null, t("removalTitle")])}
  <section class="title"><h1>${esc(t("removalTitle"))}</h1><p>${esc(t("removalLead"))} <a href="#guidelines">${esc(t("guideTitle"))}</a></p></section>
  <form id="rmf" novalidate style="display:flex;flex-direction:column;gap:20px">
    <div class="sheet">
      <div class="q"><label class="lb" for="r-name">${esc(t("rName"))}<small>${esc(t("required"))}</small></label><input id="r-name" type="text" maxlength="60" value="${esc(f.name)}"></div>
      <div class="q"><label class="lb" for="r-uni">${esc(t("rUni"))}<small>${esc(t("required"))}</small></label><input id="r-uni" type="text" maxlength="80" value="${esc(f.uni)}"></div>
      <div class="q"><span class="lb">${esc(t("rRole"))}<small>${esc(t("required"))}</small></span>${chips("r-role", Object.keys(RO), f.role, k => RO[k])}</div>
      <div class="q"><span class="lb">${esc(t("rScope"))}<small>${esc(t("required"))}</small></span>${chips("r-scope", Object.keys(SC), f.scope, k => SC[k])}</div>
      <div class="q"><label class="lb" for="r-target">${esc(t("rTarget"))}<small>${esc(t("required"))}</small></label><div><input id="r-target" type="text" maxlength="200" value="${esc(f.target)}"><div class="small sub">${esc(t("rTargetHint"))}</div></div></div>
      <div class="q"><label class="lb" for="r-reason">${esc(t("rReason"))}<small>${esc(t("rReasonRule"))}</small></label><textarea id="r-reason" class="ruled" maxlength="1000">${esc(f.reason)}</textarea></div>
      <div class="q"><label class="lb" for="r-email">${esc(t("rEmail"))}<small>${esc(t("required"))}</small></label><div><input id="r-email" type="email" maxlength="120" value="${esc(f.email)}" autocomplete="email"><div class="small sub">${esc(t("rEmailHint"))}</div></div></div>
      <div class="q"><span class="lb">${esc(t("confirm"))}<small>${esc(t("required"))}</small></span><label class="agree"><input type="checkbox" id="r-agree" ${f.agree ? "checked" : ""}>${esc(t("rAgree"))}</label></div>
    </div>
    <div class="row"><button class="btn solid" type="submit" id="r-sub">${esc(t("send"))}</button><span class="msg" id="r-msg"></span></div>
  </form>`;
  bindChoice("r-role", v => (f.role = v), true); bindChoice("r-scope", v => (f.scope = v), true);
  for (const [id, k] of [["r-name", "name"], ["r-uni", "uni"], ["r-target", "target"], ["r-reason", "reason"], ["r-email", "email"]]) $("#" + id).oninput = e => { f[k] = e.target.value; f.started = true; };
  $("#r-agree").onchange = e => (f.agree = e.target.checked);
  $("#rmf").onsubmit = async e => {
    e.preventDefault(); if (S.busy) return;
    const msg = $("#r-msg"), setMsg = (m, ng) => { msg.textContent = m; msg.classList.toggle("ng", !!ng); };
    if (!f.name.trim()) return setMsg(t("eRName"), 1);
    if (!f.uni.trim()) return setMsg(t("eRUni"), 1);
    if (!f.role) return setMsg(t("eRRole"), 1);
    if (!f.scope) return setMsg(t("eRScope"), 1);
    if (!f.target.trim()) return setMsg(t("eRTarget"), 1);
    if ([...f.reason.trim()].length < 20) return setMsg(t("eRReason"), 1);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setMsg(t("eREmail"), 1);
    if (!f.agree) return setMsg(t("eRAgree"), 1);
    S.busy = true; $("#r-sub").disabled = true;
    const { error } = await sb.from("removal_requests").insert({ user_id: S.MYID || null, name: f.name.trim().slice(0, 60), university: f.uni.trim().slice(0, 80), role: f.role, scope: f.scope, target: f.target.trim().slice(0, 200), reason: f.reason.trim().slice(0, 1000), email: f.email.trim().slice(0, 120), professor_id: pid && /^[0-9a-f-]{36}$/.test(pid) ? pid : null });
    S.busy = false;
    if (error) { $("#r-sub").disabled = false; return setMsg(t("reportFail"), 1); }
    f.done = true; invalidate("me", "admin"); render(); window.scrollTo(0, 0); toast(t("removalSent"));
  };
}

/* ===================================================================
   ログイン・新規登録（Googleアカウント／メールアドレスに届くリンク）
   =================================================================== */
function renderLogin(app, mode) {
  const su = mode === "signup";
  if (S.AUTH === "in") { app.innerHTML = `<section class="auth-card"><h1>${esc(su ? t("signupTitle") : t("loginTitle"))}</h1><div class="notice"><b>${esc(t("signedInAs", (S.ME && S.ME.name) || t("signedIn")))}</b></div><a class="btn" href="#home">${esc(t("backTop"))}</a></section>`; return; }
  app.innerHTML = `<section class="auth-card">
    <div class="tabs" role="tablist"><a role="tab" href="#login" aria-selected="${!su}">${esc(t("loginTitle"))}</a><a role="tab" href="#signup" aria-selected="${su}">${esc(t("signupTitle"))}</a></div>
    ${su ? `<label class="agree"><input type="checkbox" id="lg-agree">${esc(t("agreeA"))}<a href="#terms">${esc(t("fTerms"))}</a>${esc(t("agreeB"))}<a href="#privacy">${esc(t("fPrivacy"))}</a>${esc(t("agreeC"))}</label>` : ""}
    <button type="button" class="btn wide" id="lg-google">${esc(t("google"))}</button>
    <div class="or"><span>${esc(t("or"))}</span></div>
    <form id="lg-form" novalidate>
      <label class="lb small" for="lg-email"><b>${esc(t("emailL"))}</b></label>
      <input id="lg-email" type="email" autocomplete="email" class="box" maxlength="120">
      ${su ? `<p class="small sub">${esc(t("anyEmail"))}</p>` : ""}
      <button class="btn solid wide" type="submit" id="lg-send">${esc(su ? t("sendSignup") : t("sendLogin"))}</button>
      <p class="small sub">${esc(t("noPw"))}${su ? " " + esc(t("signupNote")) : ""}</p>
      <div class="msg" id="lg-msg" aria-live="polite"></div>
    </form>
    <p class="small switch">${su ? `${esc(t("haveAcct"))} <a href="#login">${esc(t("loginTitle"))}</a>` : `${esc(t("noAcct"))} <a href="#signup">${esc(t("signupTitle"))}</a>`}</p>
  </section>`;
  const msg = $("#lg-msg"), setMsg = (m, ng) => { msg.textContent = m; msg.classList.toggle("ng", !!ng); };
  const agreed = () => !su || $("#lg-agree").checked;
  $("#lg-google").onclick = async () => {
    if (!agreed()) return setMsg(t("eAgreeS"), 1);
    if (su) try { sessionStorage.setItem("kohyo.agreed", TERMS_VERSION); } catch {}
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    if (error) setMsg(t("authFail"), 1);
  };
  $("#lg-form").onsubmit = async e => {
    e.preventDefault();
    const em = $("#lg-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setMsg(t("eEmail"), 1);
    if (!agreed()) return setMsg(t("eAgreeS"), 1);
    $("#lg-send").disabled = true;
    if (su) try { localStorage.setItem("kohyo.agreed", TERMS_VERSION); } catch {}
    const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: su, emailRedirectTo: location.origin + location.pathname } });
    $("#lg-send").disabled = false;
    if (error) {
      const m = String(error.message || "").toLowerCase();
      if (!su && (m.includes("signups not allowed") || m.includes("user not found"))) return setMsg(t("emailNotFound"), 1);
      if (error.status === 429 || m.includes("rate")) return setMsg(t("tooMany"), 1);
      return setMsg(t("authFail"), 1);
    }
    setMsg(t("linkSent"));
  };
}
function renderConsent(app) {
  app.innerHTML = `<section class="auth-card"><h1>${esc(t("consentTitle"))}</h1><p>${esc(t("consentLead"))}</p>
    <label class="agree"><input type="checkbox" id="cs-agree">${esc(t("agreeA"))}<a href="#terms">${esc(t("fTerms"))}</a>${esc(t("agreeB"))}<a href="#privacy">${esc(t("fPrivacy"))}</a>${esc(t("agreeC"))}</label>
    <div class="row"><button class="btn solid" id="cs-ok">${esc(t("consentOk"))}</button><button class="btn" id="cs-out">${esc(t("signOut"))}</button></div><div class="msg" id="cs-msg"></div></section>`;
  $("#cs-ok").onclick = async () => {
    if (!$("#cs-agree").checked) { $("#cs-msg").textContent = t("eAgreeS"); $("#cs-msg").classList.add("ng"); return; }
    const { error } = await sb.from("consents").upsert({ user_id: S.MYID, terms_version: TERMS_VERSION });
    if (error) { $("#cs-msg").textContent = t("postFail"); return; }
    S.CONSENTED = true; render();
  };
  $("#cs-out").onclick = () => sb.auth.signOut();
}

/* ===================================================================
   教員の方へ（本人確認と返信）
   =================================================================== */
function renderFaculty(app) {
  const head = `${crumb(["#home", t("top")], [null, t("facTitle")])}<section class="title"><h1>${esc(t("facTitle"))}</h1><p>${esc(t("facLead"))}</p></section>`;
  const perks = `<ul class="perks">${t("facPerks").map(x => `<li>${esc(x)}</li>`).join("")}</ul><div class="notice"><b>${esc(t("facHow"))}</b><br>${esc(t("facHowText"))}</div>`;
  if (S.AUTH !== "in") { app.innerHTML = head + perks + `<div class="notice"><b>${esc(t("facGuest"))}</b>${loginLink()}</div>`; return; }
  const vps = myVerified(), claims = need("myclaims", L.myClaims);
  if (vps === undefined || claims === undefined) { app.innerHTML = head + LOADING(); return; }
  if (Array.isArray(vps) && vps.length) {
    const pid = vps[0], p = profById(pid), rs = reviewsOf(pid);
    if (!p || !Array.isArray(rs)) { app.innerHTML = head + LOADING(); return; }
    const s = statsOf(rs), replies = need("replies:" + pid, () => L.replies(pid)) || {};
    app.innerHTML = `${crumb(["#home", t("top")], [null, t("facTitle")])}
    <section class="title"><h1>${esc(t("dashTitle", pName(p)))} <span class="mark ok">${esc(t("verified"))}</span></h1><p>${esc(t("dashLead"))}</p></section>
    <div class="figs"><div><b>${s.n ? s.q.toFixed(1) : "—"}</b><span>${esc(t("ov"))}</span></div><div><b>${s.n}</b><span>${esc(t("count"))}</span></div><div><b>${s.n && s.again != null ? s.again + "%" : "—"}</b><span>${esc(t("again"))}</span></div><div><b>${s.n ? s.d.toFixed(1) : "—"}</b><span>${esc(t("diff"))}</span></div></div>
    <div class="row"><a class="btn" href="#p.${esc(pid)}">${esc(t("openPage"))}</a></div>
    <section><div class="tabs"><button aria-selected="true">${esc(t("recent"))}</button></div>
      ${rs.slice(0, 30).map(r => `<article class="adm"><div class="l1"><b>${esc(r.course)}</b><span class="sq ${cls(r.q)}" style="width:40px;height:32px;font-size:14px">${r.q.toFixed(1)}</span><span class="sub small">${fmtDate(r.at)}</span></div>${r.text ? trP("fd_" + r.id, r.text, "quote") : ""}${replyHTML(r, replies[r.id], true)}</article>`).join("")}
    </section>`;
    return;
  }
  const c = Array.isArray(claims) ? claims[0] : null;
  if (c && c.status === "pending") { app.innerHTML = head + perks + `<div class="notice"><b>${esc(t("claimPending"))}</b></div>`; return; }
  if (!S.form || S.form.kind !== "claim") S.form = { kind: "claim", uni: S.lastUni || "", pid: "", pq: "", email: "", title: "", agree: false };
  const f = S.form;
  app.innerHTML = head + perks + `
  ${c && c.status === "rejected" ? `<div class="notice"><b>${esc(t("claimRejected"))}</b></div>` : ""}
  <section class="title"><h1 style="font-size:24px">${esc(t("claimTitle"))}</h1><p>${esc(t("claimLead"))}</p></section>
  <form id="cf" novalidate style="display:flex;flex-direction:column;gap:20px">
    <div class="sheet">
      <div class="q"><label class="lb" for="c-uni-q">${esc(t("cUni"))}<small>${esc(t("required"))}</small></label><div style="position:relative;min-width:0"><input id="c-uni-q" type="text" autocomplete="off" value="${esc(f.uni ? uName(uniById(f.uni)) : "")}"><ul class="dd" id="c-udd" hidden></ul></div></div>
      <div class="q"><label class="lb" for="c-prof">${esc(t("cProf"))}<small>${esc(t("required"))}</small></label><div style="position:relative;min-width:0"><input id="c-prof" type="text" autocomplete="off" value="${esc(f.pq)}"><ul class="dd" id="c-dd" hidden></ul><div class="small sub">${esc(t("cProfHint"))}</div></div></div>
      <div class="q"><label class="lb" for="c-title">${esc(t("cTitle"))}<small>${esc(t("optional"))}</small></label><input id="c-title" type="text" maxlength="40" value="${esc(f.title)}"></div>
      <div class="q"><label class="lb" for="c-email">${esc(t("cEmail"))}<small>${esc(t("required"))}</small></label><div><input id="c-email" type="email" maxlength="120" autocomplete="email" value="${esc(f.email)}"><div class="small sub">${esc(t("cEmailHint"))}</div></div></div>
      <div class="q"><span class="lb">${esc(t("confirm"))}<small>${esc(t("required"))}</small></span><label class="agree"><input type="checkbox" id="c-agree" ${f.agree ? "checked" : ""}>${esc(t("cAgree"))}</label></div>
    </div>
    <div class="row"><button class="btn solid" type="submit" id="c-sub">${esc(t("claimSend"))}</button><span class="msg" id="c-msg"></span></div>
  </form>`;
  const ui = $("#c-uni-q"), udd = $("#c-udd"), pi = $("#c-prof"), dd = $("#c-dd");
  const showU = () => {
    const q = norm(ui.value); const hits = q ? allUnis().filter(u => uniMatches(u, q)).slice(0, 8) : [];
    if (!hits.length) { udd.hidden = true; return; }
    udd.innerHTML = hits.map(u => `<li><a href="#" data-uid="${esc(u.id)}"><span>${esc(uName(u))}</span><span class="sub">${esc(uPref(u))}</span></a></li>`).join(""); udd.hidden = false;
    udd.querySelectorAll("a").forEach(a => { a.onmousedown = e => e.preventDefault(); a.onclick = e => { e.preventDefault(); f.uni = a.dataset.uid; ui.value = uName(uniById(f.uni)); udd.hidden = true; f.pid = ""; f.pq = ""; pi.value = ""; profsOf(f.uni); }; });
  };
  ui.oninput = () => { f.uni = ""; f.started = true; showU(); }; ui.onblur = () => (udd.hidden = true); kbNav(ui, udd, showU);
  const showC = () => {
    const q = norm(pi.value); const list = f.uni ? peek("profs:" + f.uni) : null;
    const hits = q && Array.isArray(list) ? list.filter(p => profMatches(p, q)).slice(0, 8) : [];
    if (!hits.length) { dd.hidden = true; return; }
    dd.innerHTML = hits.map(p => `<li><a href="#" data-pid="${esc(p.id)}"><span>${esc(pName(p))}<span class="sub">　${esc(dName(p.dept))}</span></span></a></li>`).join(""); dd.hidden = false;
    dd.querySelectorAll("a").forEach(a => { a.onmousedown = e => e.preventDefault(); a.onclick = e => { e.preventDefault(); const p = list.find(x => x.id === a.dataset.pid); f.pid = p.id; f.pq = pName(p); pi.value = f.pq; dd.hidden = true; }; });
  };
  pi.onfocus = () => { if (f.uni) profsOf(f.uni); };
  pi.oninput = () => { f.pq = pi.value; f.pid = ""; f.started = true; showC(); }; pi.onblur = () => (dd.hidden = true); kbNav(pi, dd, showC);
  $("#c-email").oninput = e => (f.email = e.target.value); $("#c-title").oninput = e => (f.title = e.target.value);
  $("#c-agree").onchange = e => (f.agree = e.target.checked);
  $("#cf").onsubmit = async e => {
    e.preventDefault(); if (S.busy) return;
    const msg = $("#c-msg"), setMsg = (m, ng) => { msg.textContent = m; msg.classList.toggle("ng", !!ng); };
    if (!f.uni) return setMsg(t("eCUni"), 1);
    if (!f.pid) return setMsg(t("eCProf"), 1);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setMsg(t("eCEmail"), 1);
    if (!f.agree) return setMsg(t("eCAgree"), 1);
    S.busy = true; $("#c-sub").disabled = true;
    const { error } = await sb.from("faculty_claims").insert({ user_id: S.MYID, university_id: f.uni, professor_id: f.pid, email: f.email.trim().slice(0, 120), title: f.title.trim().slice(0, 40) || null });
    S.busy = false;
    if (error) { $("#c-sub").disabled = false; return setMsg(t("reportFail"), 1); }
    S.form = null; invalidate("myclaims"); toast(t("claimSent")); render();
  };
}

/* 管理者用：投稿や先生のページを非表示にする（いつでも「非表示中」から戻せる） */
function adminHide(table, id, label, unhide) {
  return `<button class="btn sm${unhide ? "" : " danger"}" data-ahide="${table}|${esc(id)}|${unhide ? 0 : 1}">${esc(label || (unhide ? t("unhide") : t("adminHide")))}</button>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-ahide]"); if (!b || !S.ISADMIN) return;
  const [table, id, on] = b.dataset.ahide.split("|");
  if (on === "1" && !(await askConfirm({ title: t("cfHide"), body: t("cfHideBody"), ok: t("cfHideOk") }))) return;
  const shown = table === "professors" || table === "universities" ? "active" : "published";
  const { error } = await sb.from(table).update({ status: on === "1" ? "hidden" : shown }).eq("id", id);
  if (error) return toast(t("reportFail"));
  invalidate("admin", "revs", "school", "exams", "profs", "prof", "unis");
  toast(on === "1" ? t("hiddenDone") : t("unhiddenDone"));
  if (on === "1" && table === "professors" && route().v === "prof") go("home"); else render();
});
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-rlist]"); if (!b || !S.ISADMIN) return;
  const pid = b.dataset.rlist, box = document.querySelector(`[data-rposts="${CSS.escape(pid)}"]`); if (!box) return;
  box.textContent = t("loading");
  const [rv, ex] = await Promise.all([
    sb.from("reviews").select("id,course,body,status,created_at").eq("professor_id", pid).order("created_at", { ascending: false }),
    sb.from("exams").select("id,course,year,memo,status").eq("professor_id", pid),
  ]);
  if (rv.error || ex.error) { box.textContent = t("loadFail"); return; }
  const item = (table, id, title, text, hidden) => `<article class="adm"><div class="l1"><b>${esc(title)}</b>${hidden ? `<span class="mark">${esc(t("adminHidden"))}</span>` : ""}</div>${text ? `<p class="quote">${esc(text)}</p>` : ""}<div class="row">${adminHide(table, id, null, hidden)}</div></article>`;
  box.innerHTML = rv.data.map(r => item("reviews", r.id, `${t("kindReview")}　${r.course}　${fmtDate(r.created_at)}`, r.body, r.status === "hidden")).join("")
    + ex.data.map(x => item("exams", x.id, `${t("kindExam")}　${x.course}　${x.year}`, x.memo, x.status === "hidden")).join("")
    || `<div class="small sub">${esc(t("adminNoPosts"))}</div>`;
});

/* 自分が追加した先生・大学の削除（ほかの人のレビューなどがある場合は削除依頼で対応） */
async function deleteOwn(kind, id, uni) {
  if (!(await askDelete(kind === "prof" ? t("cfProfDel") : t("cfUniDel")))) return;
  const { data, error } = await sb.rpc(kind === "prof" ? "delete_own_professor" : "delete_own_university", kind === "prof" ? { pid: id } : { uid: id });
  if (error) { toast(error.code === "PGRST202" || /function/i.test(error.message || "") ? t("needMigration") : t("delFail")); return; }
  const msg = { ok: null, has_others: t("delHasOthers"), has_exams: t("delHasExams"), has_profs: t("delHasProfs"), not_owner: t("delNotOwner"), not_found: t("delFail") }[data];
  if (msg) { toast(msg); return; }
  invalidate("me", "profs", "prof", "unis", "revs");
  toast(t("deleted"));
  if (kind === "prof" && route().v === "prof") go(uni ? "u." + uni : "home"); else render();
}

/* ===================================================================
   マイページ・退会
   =================================================================== */
async function loadMe() {
  const q = (tb, cols) => sb.from(tb).select(cols).eq(tb === "professors" || tb === "universities" ? "created_by" : "user_id", S.MYID).order("created_at", { ascending: false });
  const [rv, sc, ex, pf, un, rp, rr] = await Promise.all([
    q("reviews", "id,professor_id,course,quality,status,created_at"), q("school_ratings", "id,university_id,status,created_at,rep,loc,car,fac,net,food,club,life,safe,happy"),
    q("exams", "id,professor_id,course,year,status,created_at"), q("professors", "id,name,name_en,created_at"), q("universities", "id,name,name_en,created_at"),
    q("reports", "id,created_at"), q("removal_requests", "id,name,target,scope,status,created_at"),
  ]);
  for (const x of [rv, sc, ex, pf, un, rp, rr]) if (x.error) throw x.error;
  const pids = [...new Set([...rv.data, ...ex.data].map(r => r.professor_id))];
  const names = {};
  if (pids.length) { const { data } = await sb.from("professors").select("id,name,name_en").in("id", pids); (data || []).forEach(p => (names[p.id] = { name: p.name || "", en: p.name_en || "" })); }
  return { rv: rv.data, sc: sc.data, ex: ex.data, pf: pf.data, un: un.data, nRep: rp.data.length, nRem: rr.data.length, rems: rr.data, names };
}
function renderMe(app) {
  if (S.AUTH !== "in") { app.innerHTML = `${crumb(["#home", t("top")], [null, t("me")])}<div class="notice"><b>${esc(t("needLoginRate"))}</b>${loginLink()}</div>`; return; }
  const d = need("me", loadMe), claims = need("myclaims", L.myClaims), vps = myVerified();
  if (d === undefined) { app.innerHTML = LOADING(); return; }
  if (isErr(d)) { app.innerHTML = LOADFAIL(); return; }
  const c = Array.isArray(claims) ? claims[0] : null;
  const ST = { pending: t("stPending"), approved: t("stApproved"), rejected: t("stRejected") };
  const none = `<p class="sub small">${esc(t("meNone"))}</p>`;
  const sec = (title, n, body) => `<section class="mesec"><h2>${esc(title)} <span class="sub">${n}</span></h2>${body}</section>`;
  const pn = id => { const x = d.names[id]; return x ? pName(x) : "—"; };
  const hiddenMark = r => (r.status === "hidden" ? `・<span class="sub">${esc(t("adminHidden"))}</span>` : "");
  const prov = S.ME && S.ME.provider === "google" ? t("meLoginGoogle") : t("meLoginEmail");
  app.innerHTML = `${crumb(["#home", t("top")], [null, t("me")])}
  <section class="title"><h1>${esc(t("me"))}</h1><p>${esc(t("meLead"))}</p></section>
  <dl class="dl">
    <dt>${esc(t("meAccount"))}</dt><dd><span id="me-name"></span>${Array.isArray(vps) && vps.length ? ` <span class="mark ok">${esc(t("verified"))}</span>` : ""}</dd>
    <dt>${esc(t("meLoginBy"))}</dt><dd>${esc(prov)}</dd>
    <dt>${esc(t("meLang"))}</dt><dd>${S.LANG === "en" ? "English" : "日本語"}</dd>
    ${c ? `<dt>${esc(t("meClaim"))}</dt><dd>${esc(ST[c.status] || "")}</dd>` : ""}
  </dl>
  ${sec(t("meReviews"), d.rv.length, d.rv.length ? `<ul class="melist">${d.rv.map(r => `<li><a href="#p.${esc(r.professor_id)}">${esc(pn(r.professor_id))}</a><span class="sub small">${esc(r.course)}・${Number(r.quality).toFixed(1)}・${fmtDate(r.created_at)}${hiddenMark(r)}</span><button class="del" data-mdel="review|${esc(r.id)}">${esc(t("del"))}</button></li>`).join("")}</ul>` : none)}
  ${sec(t("meSchools"), d.sc.length, d.sc.length ? `<ul class="melist">${d.sc.map(r => { const u = uniById(r.university_id); const avg = SCATS.reduce((a, [k]) => a + r[k], 0) / SCATS.length; return `<li><a href="#school.${esc(r.university_id)}">${esc(u ? uName(u) : "—")}</a><span class="sub small">${avg.toFixed(1)}・${fmtDate(r.created_at)}${hiddenMark(r)}</span><button class="del" data-mdel="school|${esc(r.id)}">${esc(t("del"))}</button></li>`; }).join("")}</ul>` : none)}
  ${sec(t("meExams"), d.ex.length, d.ex.length ? `<ul class="melist">${d.ex.map(x => `<li><a href="#p.${esc(x.professor_id)}">${esc(pn(x.professor_id))}</a><span class="sub small">${esc(x.course)}・${x.year}${hiddenMark(x)}</span><button class="del" data-mdel="exam|${esc(x.id)}">${esc(t("del"))}</button></li>`).join("")}</ul>` : none)}
  ${sec(t("meAdded"), d.pf.length + d.un.length, d.pf.length + d.un.length ? `<ul class="melist">${d.un.map(u => `<li><a href="#u.${esc(u.id)}">${esc(S.LANG === "en" ? u.name_en || u.name : u.name)}</a><span class="sub small">${esc(t("uni"))}</span><button class="del" data-odel="uni|${esc(u.id)}">${esc(t("del"))}</button></li>`).join("")}${d.pf.map(p => `<li><a href="#p.${esc(p.id)}">${esc(S.LANG === "en" ? p.name_en || p.name : p.name || p.name_en)}</a><span class="sub small">${esc(t("prof"))}</span><button class="del" data-odel="prof|${esc(p.id)}">${esc(t("del"))}</button></li>`).join("")}</ul>` : none)}
  ${sec(t("meRequests"), d.nRep + d.nRem, `<p class="small">${esc(t("meReported", d.nRep))}　${esc(t("meRemovals", d.nRem))}</p>${d.rems.length ? `<ul class="melist">${d.rems.map(r => `<li><span>${esc(str(r.target, 60))}</span><span class="sub small">${esc((t("scopes") || {})[r.scope] || "")}・${fmtDate(r.created_at)}</span><span class="mark ${r.status === "done" ? "ok" : "warn"}">${esc(r.status === "done" ? t("stDone") : t("stOpen"))}</span></li>`).join("")}</ul>` : ""}`)}
  <section class="mesec"><div class="row"><button class="btn" id="me-out">${esc(t("signOut"))}</button></div></section>
  <section class="mesec danger"><h2>${esc(t("leaveTitle"))}</h2><p class="small">${esc(t("leaveLead"))}</p><div><button class="btn" id="me-leave">${esc(t("leave"))}</button></div></section>`;
  $("#me-name").textContent = (S.ME && S.ME.name) || t("signedIn");
  app.querySelectorAll("[data-mdel]").forEach(b => (b.onclick = async () => {
    const [kind, id] = b.dataset.mdel.split("|");
    if (!(await askDelete(kind === "review" ? t("cfReview") : kind === "school" ? t("cfSchool") : t("cfExam")))) return;
    let ok = true;
    if (kind === "review") ok = !(await sb.from("reviews").delete().eq("id", id)).error;
    else if (kind === "school") ok = !(await sb.from("school_ratings").delete().eq("id", id)).error;
    else try { await api("delete-exam", { id }); } catch { ok = false; }
    if (!ok) return toast(t("delFail"));
    invalidate("me", "revs", "profs", "school", "exams"); toast(t("deleted")); render();
  }));
  app.querySelectorAll("[data-odel]").forEach(b => (b.onclick = () => { const [k, id] = b.dataset.odel.split("|"); deleteOwn(k, id); }));
  $("#me-out").onclick = async () => { await sb.auth.signOut(); toast(t("signedOut")); go("home"); };
  $("#me-leave").onclick = openLeave;
}
function openLeave() {
  const v = modal(`<form class="mbox" novalidate><h2>${esc(t("leaveTitle"))}</h2><p class="small">${esc(t("leaveLead"))}</p>
    <label class="agree"><input type="checkbox" id="lv-del">${esc(t("leaveDelete"))}</label><p class="small sub">${esc(t("leaveKeep"))}</p>
    <div class="row"><button class="btn danger" type="submit">${esc(t("leaveConfirm"))}</button><button class="btn" type="button" data-close>${esc(t("cancel"))}</button></div><div class="msg" id="lv-msg"></div></form>`);
  v.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const msg = v.querySelector("#lv-msg"); msg.textContent = t("leaving");
    try {
      await api("delete-account", { deletePosts: v.querySelector("#lv-del").checked });
      try { localStorage.removeItem("kohyo.uni"); } catch {}
      await sb.auth.signOut().catch(() => {});
      v.querySelector("form").innerHTML = `<h2>${esc(t("leaveTitle"))}</h2><div class="notice"><b>${esc(t("leaveDone"))}</b></div><div class="row"><a class="btn" href="#home" data-close>${esc(t("backTop"))}</a></div>`;
    } catch { msg.textContent = t("postFail"); msg.classList.add("ng"); }
  };
}

/* ===================================================================
   管理（管理者だけ）
   =================================================================== */
async function loadAdmin() {
  const [rep, rem, cl, hr, hs, he, hp] = await Promise.all([
    sb.from("reports").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("removal_requests").select("*").order("status", { ascending: false }).order("created_at", { ascending: false }).limit(300),
    sb.from("faculty_claims").select("*").order("created_at", { ascending: false }).limit(200),
    sb.from("reviews").select("id,professor_id,course,body").eq("status", "hidden").limit(200),
    sb.from("school_ratings").select("id,university_id,body").eq("status", "hidden").limit(200),
    sb.from("exams").select("id,professor_id,course,memo").eq("status", "hidden").limit(200),
    sb.from("professors").select("id,name,name_en,university_id,dept").eq("status", "hidden").limit(200),
  ]);
  for (const x of [rep, rem, cl, hr, hs, he, hp]) if (x.error) throw x.error;
  const ids = k => [...new Set(rep.data.filter(r => r.kind === k).map(r => r.target_id))];
  const get = async (tb, cols, list) => (list.length ? (await sb.from(tb).select(cols).in("id", list)).data || [] : []);
  const [tr, ts, te, tp] = await Promise.all([
    get("reviews", "id,professor_id,course,body,status", ids("review")), get("school_ratings", "id,university_id,body,status", ids("school")),
    get("exams", "id,professor_id,course,memo,status", ids("exam")), Promise.resolve(null),
  ]);
  const pids = [...new Set([...tr, ...te, ...hr.data, ...he.data, ...cl.data, ...rem.data].map(r => r.professor_id).filter(Boolean))];
  const names = {};
  if (pids.length) ((await sb.from("professors").select("id,name,name_en").in("id", pids)).data || []).forEach(p => (names[p.id] = { name: p.name || "", en: p.name_en || "" }));
  const targets = {};
  tr.forEach(r => (targets["review|" + r.id] = { text: r.body, title: `${names[r.professor_id] ? pName(names[r.professor_id]) : ""}　${r.course}`, href: "#p." + r.professor_id, hidden: r.status === "hidden", table: "reviews" }));
  ts.forEach(r => (targets["school|" + r.id] = { text: r.body || "", title: uName(uniById(r.university_id)), href: "#school." + r.university_id, hidden: r.status === "hidden", table: "school_ratings" }));
  te.forEach(r => (targets["exam|" + r.id] = { text: r.memo || "", title: `${names[r.professor_id] ? pName(names[r.professor_id]) : ""}　${r.course}`, href: "#p." + r.professor_id, hidden: r.status === "hidden", table: "exams" }));
  const hidden = [
    ...hp.data.map(p => ({ id: p.id, table: "professors", text: "", title: `${t("adminProfPage")}：${pName({ name: p.name || "", en: p.name_en || "" })}（${uName(uniById(p.university_id))} ${p.dept}）`, href: "" })),
    ...hr.data.map(r => ({ id: r.id, table: "reviews", text: r.body, title: `${names[r.professor_id] ? pName(names[r.professor_id]) : ""}　${r.course}`, href: "#p." + r.professor_id })),
    ...hs.data.map(r => ({ id: r.id, table: "school_ratings", text: r.body || "", title: uName(uniById(r.university_id)), href: "#school." + r.university_id })),
    ...he.data.map(r => ({ id: r.id, table: "exams", text: r.memo || "", title: `${names[r.professor_id] ? pName(names[r.professor_id]) : ""}　${r.course}`, href: "#p." + r.professor_id })),
  ];
  return { reports: rep.data, removals: rem.data, claims: cl.data, targets, hidden, names };
}
function renderAdmin(app) {
  if (!S.ISADMIN) { app.innerHTML = `<div class="notice"><b>${esc(t("adminOnly"))}</b></div>`; return; }
  const d = need("admin", loadAdmin);
  if (d === undefined) { app.innerHTML = LOADING(); return; }
  if (isErr(d)) { app.innerHTML = LOADFAIL(); return; }
  const R = t("reasons"), K = { review: t("kindReview"), school: t("kindSchool"), exam: t("kindExam"), reply: t("replyFrom") };
  const groups = {};
  for (const r of d.reports) { const k = r.kind + "|" + r.target_id; (groups[k] || (groups[k] = { kind: r.kind, id: r.target_id, list: [] })).list.push(r); }
  const reps = Object.values(groups).sort((a, b) => b.list.length - a.list.length);
  const RO = t("roles"), SC = t("scopes"), ST = { pending: t("stPending"), approved: t("stApproved"), rejected: t("stRejected") };
  const pend = d.claims.filter(c => c.status === "pending").length;
  app.innerHTML = `${crumb(["#home", t("top")], [null, t("adminTitle")])}
  <section class="title"><h1>${esc(t("adminTitle"))}</h1></section>
  <section><div class="tabs"><button aria-selected="true">${esc(t("adminClaims"))} ${pend}</button></div>
    ${d.claims.length ? d.claims.map(c => { const u = uniById(c.university_id), n = d.names[c.professor_id]; return `<article class="adm">
      <div class="l1"><b><a href="#p.${esc(c.professor_id)}">${esc(n ? pName(n) : "—")}</a></b><span>${esc(u ? uName(u) : "")}</span><span class="mark ${c.status === "approved" ? "ok" : c.status === "pending" ? "warn" : ""}">${esc(ST[c.status] || "")}</span><span class="sub small">${fmtDate(c.created_at)}</span></div>
      <div class="small"><b>${esc(t("cEmail"))}：</b><span class="sel">${esc(str(c.email, 120))}</span>${c.title ? `　<b>${esc(t("cTitle"))}：</b>${esc(str(c.title, 40))}` : ""}</div>
      ${c.status === "pending" ? `<div class="row"><button class="btn sm solid" data-cl="ok|${esc(c.id)}">${esc(t("approve"))}</button><button class="btn sm" data-cl="ng|${esc(c.id)}">${esc(t("reject"))}</button></div>` : ""}
    </article>`; }).join("") : `<div class="notice" style="margin-top:12px">${esc(t("noClaims"))}</div>`}
  </section>
  <section><div class="tabs"><button aria-selected="true">${esc(t("adminReports"))} ${reps.length}</button></div>
    ${reps.length ? reps.map(g => { const tg = d.targets[g.kind + "|" + g.id]; return `<article class="adm">
      <div class="l1"><b>${esc(K[g.kind] || g.kind)}</b>${tg ? `<a href="${tg.href}">${esc(tg.title)}</a>` : `<span class="sub">${esc(t("targetGone"))}</span>`}<span class="mark ${tg && tg.hidden ? "" : "warn"}">${esc(t("nReports", g.list.length))}</span></div>
      ${tg && tg.text ? `<p class="quote">${esc(tg.text)}</p>` : ""}
      <ul class="small">${g.list.map(r => `<li>${esc(R[r.reason] || r.reason)}${r.note ? `：${esc(str(r.note, 200))}` : ""} <span class="sub">${fmtDate(r.created_at)}</span></li>`).join("")}</ul>
      ${tg ? `<div class="row"><button class="btn sm ${tg.hidden ? "" : "solid"}" data-hide="${esc(tg.table)}|${esc(g.id)}|${tg.hidden ? 0 : 1}">${esc(tg.hidden ? t("unhide") : t("hide"))}</button></div>` : ""}
    </article>`; }).join("") : `<div class="notice" style="margin-top:12px">${esc(t("noReports"))}</div>`}
  </section>
  <section><div class="tabs"><button aria-selected="true">${esc(t("adminRemovals"))} ${d.removals.length}</button></div>
    ${d.removals.length ? d.removals.map(r => `<article class="adm">
      <div class="l1"><b>${esc(str(r.name, 60))}</b><span>${esc(str(r.university, 80))}</span><span class="mark">${esc(RO[r.role] || "")}</span><span class="mark">${esc(SC[r.scope] || "")}</span><span class="mark ${r.status === "done" ? "ok" : "warn"}">${esc(r.status === "done" ? t("stDone") : t("stOpen"))}</span><span class="sub small">${fmtDate(r.created_at)}</span></div>
      <div class="small"><b>${esc(t("rTarget"))}：</b>${esc(str(r.target, 200))}</div>
      ${r.professor_id ? `<div class="row"><a class="btn sm" href="#p.${esc(r.professor_id)}">${esc(t("adminOpenTarget"))}</a>${adminHide("professors", r.professor_id, t("adminHidePage"))}<button class="btn sm" data-rlist="${esc(r.professor_id)}">${esc(t("adminShowPosts"))}</button></div><div data-rposts="${esc(r.professor_id)}"></div>` : `<div class="small sub">${esc(t("adminFindHint"))}</div>`}
      <p class="quote">${esc(str(r.reason, 1000))}</p>
      <div class="small"><b>${esc(t("rEmail"))}：</b><span class="sel">${esc(str(r.email, 120))}</span></div>
      <div class="row"><button class="btn sm ${r.status === "done" ? "" : "solid"}" data-rst="${esc(r.id)}|${r.status === "done" ? "open" : "done"}">${esc(r.status === "done" ? t("markOpen") : t("markDone"))}</button></div>
    </article>`).join("") : `<div class="notice" style="margin-top:12px">${esc(t("noRemovals"))}</div>`}
  </section>
  <section><div class="tabs"><button aria-selected="true">${esc(t("adminHidden"))} ${d.hidden.length}</button></div>
    ${d.hidden.length ? d.hidden.map(h => `<article class="adm"><div class="l1">${h.href ? `<a href="${h.href}">${esc(h.title)}</a>` : `<b>${esc(h.title)}</b>`}</div>${h.text ? `<p class="quote">${esc(h.text)}</p>` : ""}<div class="row">${adminHide(h.table, h.id, null, true)}</div></article>`).join("") : `<div class="notice" style="margin-top:12px">${esc(t("noHidden"))}</div>`}
  </section>
  <section><div class="tabs"><button aria-selected="true">${esc(t("importTitle"))}</button></div>
    <p class="small">${esc(t("importLead"))}</p>
    <div class="row"><input type="file" id="imp-file" accept=".csv,text/csv"><label class="agree"><input type="checkbox" id="imp-short">${esc(t("importShort"))}</label></div>
    <div class="row"><button class="btn sm solid" id="imp-run" disabled>${esc(t("importRun"))}</button><span class="msg" id="imp-msg"></span></div>
  </section>
  <section><div class="tabs"><button aria-selected="true">${esc(t("pimpTitle"))}</button></div>
    <p class="small">${esc(t("pimpLead"))}</p>
    <p class="small sub">${esc(t("pimpCols"))}</p>
    <div class="row"><button class="btn sm" id="pimp-tpl">${esc(t("pimpTemplate"))}</button><input type="file" id="pimp-file" accept=".csv,text/csv"></div>
    <div class="row"><button class="btn sm solid" id="pimp-run" disabled>${esc(t("importRun"))}</button><span class="msg" id="pimp-msg"></span></div>
    <div class="small" id="pimp-detail"></div>
  </section>`;
  app.querySelectorAll("[data-hide]").forEach(b => (b.onclick = async () => {
    const [table, id, on] = b.dataset.hide.split("|");
    if (on === "1" && !(await askConfirm({ title: t("cfHide"), body: t("cfHideBody"), ok: t("cfHideOk") }))) return;
    const { error } = await sb.from(table).update({ status: on === "1" ? "hidden" : "published" }).eq("id", id);
    if (error) return toast(t("reportFail"));
    invalidate("admin", "revs", "school", "exams", "profs", "prof"); toast(on === "1" ? t("hiddenDone") : t("unhiddenDone")); render();
  }));
  app.querySelectorAll("[data-cl]").forEach(b => (b.onclick = async () => {
    const [dcs, id] = b.dataset.cl.split("|"), c = d.claims.find(x => x.id === id); if (!c) return;
    const ok = dcs === "ok" ? await askConfirm({ title: t("cfApprove"), body: t("cfApproveBody"), ok: t("cfApproveOk"), danger: false }) : await askConfirm({ title: t("cfReject"), body: "", ok: t("cfRejectOk") });
    if (!ok) return;
    if (dcs === "ok") { const r = await sb.from("faculty_verified").upsert({ professor_id: c.professor_id, user_id: c.user_id }); if (r.error) return toast(t("reportFail")); }
    const r2 = await sb.from("faculty_claims").update({ status: dcs === "ok" ? "approved" : "rejected" }).eq("id", id);
    if (r2.error) return toast(t("reportFail"));
    invalidate("admin", "profs", "prof"); toast(dcs === "ok" ? t("approved") : t("rejectedT")); render();
  }));
  app.querySelectorAll("[data-rst]").forEach(b => (b.onclick = async () => {
    const [id, st] = b.dataset.rst.split("|");
    const { error } = await sb.from("removal_requests").update({ status: st }).eq("id", id);
    if (error) return toast(t("reportFail"));
    invalidate("admin"); render();
  }));
  setupImport(); setupProfImport();
}
/* 文部科学省の学校コードCSVから大学を取り込む */
function setupImport() {
  const fi = $("#imp-file"), run = $("#imp-run"), msg = $("#imp-msg"); let rows = [];
  fi.onchange = async () => {
    const file = fi.files[0]; if (!file) return;
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("shift_jis").decode(buf);
    rows = parseCsv(text.replace(/^﻿/, ""));
    const n = pickUnis(rows, $("#imp-short").checked).length;
    msg.textContent = n ? t("importParsed", n) : t("importNone"); run.disabled = !n;
  };
  $("#imp-short").onchange = () => { if (rows.length) { const n = pickUnis(rows, $("#imp-short").checked).length; msg.textContent = n ? t("importParsed", n) : t("importNone"); run.disabled = !n; } };
  run.onclick = async () => {
    const list = pickUnis(rows, $("#imp-short").checked); run.disabled = true;
    for (let i = 0; i < list.length; i += 200) {
      msg.textContent = t("importing", Math.min(i + 200, list.length), list.length);
      const { error } = await sb.from("universities").upsert(list.slice(i, i + 200), { onConflict: "id", ignoreDuplicates: false });
      if (error) { msg.textContent = t("reportFail") + " " + error.message; run.disabled = false; return; }
    }
    msg.textContent = t("importDone", list.length); invalidate("unis"); render();
  };
}
/* 先生の一覧（CSV）を大学ごとに一括で追加する */
async function readCsvFile(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("\uFFFD")) text = new TextDecoder("shift_jis").decode(buf);
  return parseCsv(text.replace(/^\uFEFF/, ""));
}
function setupProfImport() {
  const fi = $("#pimp-file"), run = $("#pimp-run"), msg = $("#pimp-msg"), det = $("#pimp-detail");
  let plan = [];
  $("#pimp-tpl").onclick = () => {
    const csv = "\uFEFF大学,氏名,ふりがな,英語表記,学部\n東都大学,山田 太郎,やまだ たろう,Taro Yamada,経済学部\n";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "teachers-template.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  fi.onchange = async () => {
    const file = fi.files[0]; run.disabled = true; plan = []; det.innerHTML = ""; if (!file) return;
    msg.classList.remove("ng"); msg.textContent = t("loading");
    try {
      const res = await planProfImport(await readCsvFile(file));
      if (res.error) { msg.textContent = t(res.error); msg.classList.add("ng"); return; }
      plan = res.add;
      msg.textContent = t("pimpParsed", res.add.length);
      const ex = list => list.slice(0, 5).map(esc).join("、") + (list.length > 5 ? "…" : "");
      det.innerHTML = [
        res.unknown.length ? `<div>${esc(t("pimpUnknown", res.unknown.length))}　<span class="sub">${ex(res.unknown)}</span></div>` : "",
        res.dup ? `<div>${esc(t("pimpDup", res.dup))}</div>` : "",
        res.bad.length ? `<div>${esc(t("pimpBad", res.bad.length))}　<span class="sub">${ex(res.bad)}</span></div>` : "",
        res.badFac.length ? `<div>${esc(t("pimpBadFac", res.badFac.length))}　<span class="sub">${ex(res.badFac)}</span></div>` : "",
      ].join("");
      run.disabled = !plan.length;
    } catch (e) { console.error(e); msg.textContent = t("reportFail"); msg.classList.add("ng"); }
  };
  run.onclick = async () => {
    run.disabled = true;
    for (let i = 0; i < plan.length; i += 200) {
      msg.textContent = t("pimpSaving", Math.min(i + 200, plan.length), plan.length);
      const { error } = await sb.from("professors").insert(plan.slice(i, i + 200).map(x => ({ ...x, created_by: S.MYID })));
      if (error) { msg.textContent = t("reportFail") + " " + error.message; msg.classList.add("ng"); return; }
    }
    msg.textContent = t("pimpDone", plan.length); det.innerHTML = ""; fi.value = "";
    invalidate("profs", "prof"); plan = [];
  };
}
// 「経済学部 経済学科」のような書き方から学部だけを取り出す
// アルファベットの氏名として使えるか（2文字以上で、ローマ字を含む）
const isRoman = v => [...String(v || "").trim()].length >= 2 && /[A-Za-z]/.test(v) && !/[\u3040-\u30ff\u3400-\u9fff]/.test(v);
function facultyOnly(d) { const m = String(d || "").match(/^(.*?(学部|学群|学域))/); return m ? m[1].trim() : String(d || "").trim(); }
// 学部・学群・学域のような「学部にあたる名前」かどうか
const isFaculty = d => /(学部|学群|学域|学類|教育課程|Faculty|School|College)/i.test(d) && !/(学科|専攻|コース|研究室|講座)$/.test(d);
async function planProfImport(rows) {
  const clean = v => String(v || "").trim();
  let hi = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) if (rows[i].some(c => /氏名|名前|教員名|^name$/i.test(clean(c)))) { hi = i; break; }
  if (hi < 0) return { error: "pimpNoHeader" };
  const head = rows[hi].map(clean);
  const find = (re, not) => head.findIndex(h => re.test(h) && !(not && not.test(h)));
  const ui = find(/大学|学校|university|school/i, /学部|学科/);
  const ki = find(/ふりがな|フリガナ|よみ|ヨミ|かな|カナ|kana/i);
  const ei = find(/英|english|roman|ローマ字/i);
  const ni = find(/氏名|名前|教員名|^name$/i, /ふりがな|フリガナ|よみ|ヨミ|かな|カナ|kana|英|english|roman|ローマ字/i);
  const di = find(/学部|学科|研究科|所属|部局|dept|department|faculty/i);
  if (ui < 0 || (ni < 0 && ei < 0) || di < 0) return { error: "pimpNoHeader" };
  const unis = allUnis(), byId = new Map(unis.map(u => [u.id, u]));
  const existing = {}, add = [], unknown = new Set(), bad = [], badFac = new Set(), facsOf = {}; let dup = 0;
  for (const r of rows.slice(hi + 1)) {
    if (!r.some(c => clean(c))) continue;
    const uv = clean(r[ui]);
    const u = byId.get(uv) || unis.find(x => sameUni(x, [uv]));
    if (!u) { if (uv) unknown.add(uv); continue; }
    const name = ni >= 0 ? clean(r[ni]).replace(/\s+/g, " ").slice(0, 40) : "";
    const en = ei >= 0 ? clean(r[ei]).replace(/\s+/g, " ").slice(0, 60) : "";
    const kana = ki >= 0 ? clean(r[ki]).slice(0, 40) : "";
    const dept = facultyOnly(clean(r[di])).slice(0, 60);
    if (!isRoman(en) || !dept || !isFaculty(dept)) { bad.push(name || en || uv); continue; }
    if (!existing[u.id]) { let list = peek("profs:" + u.id); if (!Array.isArray(list)) list = await L.profs(u.id); existing[u.id] = [...list]; }
    const names = [name, en].filter(Boolean);
    if (existing[u.id].some(p => sameProf(p, names))) { dup++; continue; }
    const row = { university_id: u.id, name: name || null, name_en: en || null, kana: kana || null, dept };
    add.push(row);
    existing[u.id].push({ name, en, kana });
  }
  return { add, unknown: [...unknown], bad, dup, badFac: [...badFac] };
}
function parseCsv(text) {
  const out = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter(r => r.some(x => x.trim()));
}
function pickUnis(rows, withShort) {
  if (!rows.length) return [];
  const CODE = /^[A-Z]\d{12}$/;
  const clean = v => String(v || "").replace(/^\uFEFF/, "").trim();
  // 見出しの行を探す（ファイルの先頭に説明の行があっても大丈夫なように、最初の15行から探す）
  let hi = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) if (rows[i].some(c => /学校名/.test(clean(c)))) { hi = i; break; }
  const head = hi >= 0 ? rows[hi].map(clean) : [];
  const col = (test, not) => head.findIndex(h => test.test(h) && !(not && not.test(h)));
  const ni = col(/学校名/, /ふりがな|フリガナ|かな|カナ|英|旧/);
  const pi = col(/都道府県/), ai = col(/所在地|住所/), ei = col(/廃止/);
  const prefOf = v => { v = clean(v); if (!v) return ""; const m = v.match(/^(\d{1,2})(?!\d)/); if (m) return (PREFS[Number(m[1]) - 1] || [])[0] || ""; return (PREFS.find(([j]) => v.startsWith(j) || v === j.replace(/[都道府県]$/, "")) || [])[0] || ""; };
  // 見出しが見つからないときは、中身から学校名らしい列を推測する
  const guessName = r => r.map(clean).find(c => /大学|短期大学/.test(c) && !/\d/.test(c) && !/^[A-Z]\d/.test(c) && !/[()（）]/.test(c)) || "";
  const types = withShort ? ["F1", "F2"] : ["F1"];
  const list = [];
  for (const r of rows.slice(hi + 1)) {
    const code = r.map(clean).find(c => CODE.test(c)) || "";
    if (!code || !types.includes(code.slice(0, 2))) continue;
    if (ei >= 0 && clean(r[ei])) continue;
    let name = ni >= 0 ? clean(r[ni]) : "";
    if (!name || /^[A-Z]\d/.test(name)) name = guessName(r);
    if (!name) continue;
    let pref = pi >= 0 ? prefOf(r[pi]) : "";
    if (!pref && ai >= 0) pref = prefOf(r[ai]);
    if (!pref) pref = (PREFS[Number(code.slice(2, 4)) - 1] || [])[0] || "";
    if (!pref) continue;
    list.push({ id: code, name, pref });
  }
  const seen = new Set(); return list.filter(x => (seen.has(x.id) ? false : seen.add(x.id)));
}

/* ===================================================================
   起動
   =================================================================== */
async function applySession(session) {
  S.SESSION = session; S.MYID = session ? session.user.id : null;
  if (!session) { S.AUTH = "guest"; S.ME = null; S.ISADMIN = false; S.CONSENTED = true; }
  else {
    const u = session.user, md = u.user_metadata || {};
    S.ME = { name: md.full_name || md.name || u.email || "", provider: (u.app_metadata && u.app_metadata.provider) || "email" };
    S.AUTH = "in";
    const [{ data: adm }, { data: cons }] = await Promise.all([sb.rpc("is_admin"), sb.from("consents").select("terms_version").eq("user_id", S.MYID).maybeSingle()]);
    S.ISADMIN = !!adm;
    S.CONSENTED = !!cons;
    if (!cons) {
      let pre = null; try { pre = localStorage.getItem("kohyo.agreed") || sessionStorage.getItem("kohyo.agreed"); } catch {}
      if (pre === TERMS_VERSION) { const { error } = await sb.from("consents").upsert({ user_id: S.MYID, terms_version: TERMS_VERSION }); if (!error) S.CONSENTED = true; }
    }
    try { localStorage.removeItem("kohyo.agreed"); sessionStorage.removeItem("kohyo.agreed"); } catch {}
  }
  invalidate("myver", "myrep", "myclaims", "me", "admin", "revs", "replies", "exams", "school");
  renderAuth(); render();
}
async function boot() {
  initBar(); paintStatic(); renderAuth();
  if (!configured) { render(); return; }
  render();
  const { data } = await sb.auth.getSession();
  if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash);
  await applySession(data.session);
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") { if ((session && session.user.id) !== S.MYID || ev === "SIGNED_OUT") applySession(session); }
    else if (ev === "TOKEN_REFRESHED") S.SESSION = session;
  });
}
boot();
