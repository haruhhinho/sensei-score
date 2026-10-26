// 1問ずつカードで答える評価フォーム（スワイプ・タップ・キーボードに対応）
import { t, esc } from "./core.js";

const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * steps: [{ key, type: "text"|"scale"|"yesno"|"chips"|"final", label, hint, required, ... }]
 * f: 回答を入れておくオブジェクト（f.step に現在の位置を保存）
 * opts.onSubmit(ctx) : 最後のカードの送信。ctx = { setMsg, checkEl, ta, button }
 */
export function deck(root, steps, f, opts) {
  if (typeof f.step !== "number") f.step = 0;
  let keyHandler = null;

  const answered = s => f[s.key] !== undefined && f[s.key] !== null && f[s.key] !== "";
  const show = (s, v) => {
    if (v === undefined || v === null || v === "") return "—";
    if (s.type === "yesno") return v ? s.yes : s.no;
    if (s.type === "chips") return (s.options.find(o => o[0] === v) || [, v])[1];
    return String(v);
  };

  function draw(dir) {
    const i = Math.min(f.step, steps.length - 1), s = steps[i], n = steps.length;
    root.innerHTML = `
      <div class="deck">
        <div class="deck-top">
          <button type="button" class="deck-back" ${i === 0 ? "disabled" : ""}>← ${esc(t("deckBack"))}</button>
          <div class="deck-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${i + 1}"><i style="width:${((i + 1) / n) * 100}%"></i></div>
          <span class="deck-count">${i + 1} / ${n}</span>
        </div>
        <div class="deck-stack">
          ${i < n - 1 ? `<div class="dghost g2"></div><div class="dghost g1"></div>` : ""}
          <div class="dcard ${dir ? "enter-" + dir : ""}" tabindex="-1">${body(s, i)}</div>
        </div>
      </div>`;
    root.querySelector(".deck-back").onclick = () => go(i - 1, "back");
    const card = root.querySelector(".dcard");
    wire(s, card, i);
    if (!reduce()) requestAnimationFrame(() => card.classList.remove("enter-next", "enter-back"));
    const focusEl = card.querySelector("input,textarea") || card;
    focusEl.focus({ preventScroll: true });
  }

  function body(s, i) {
    const head = `<div class="dq">${esc(s.label)}${s.required ? "" : `<small>${esc(t("optional"))}</small>`}</div>${s.hint ? `<div class="dhint">${esc(s.hint)}</div>` : ""}`;
    if (s.type === "text") return `${head}
      <input class="dinput" type="text" maxlength="${s.max || 60}" value="${esc(f[s.key] || "")}" ${s.datalist && s.datalist.length ? `list="dl-${i}"` : ""}>
      ${s.datalist && s.datalist.length ? `<datalist id="dl-${i}">${s.datalist.map(c => `<option value="${esc(c)}"></option>`).join("")}</datalist>` : ""}
      <div class="dmsg" aria-live="polite"></div>
      <div class="dactions"><button type="button" class="btn solid dnext">${esc(t("deckNext"))} →</button></div>`;
    if (s.type === "scale") {
      const v = f[s.key];
      return `${head}
        <div class="dbig ${v ? "c" + v : ""}" aria-hidden="true">${v || "?"}</div>
        <div class="dlabel">${esc(v ? s.labels[v] || "" : t("deckScaleHint"))}</div>
        <div class="dtiles" role="radiogroup" aria-label="${esc(s.label)}">${[1, 2, 3, 4, 5].map(k => `<button type="button" role="radio" aria-checked="${v === k}" data-v="${k}"><b>${k}</b><span>${esc(s.labels[k] || "")}</span></button>`).join("")}</div>
        ${s.required ? "" : `<div class="dactions"><button type="button" class="btn sm dskip">${esc(t("deckSkip"))}</button></div>`}`;
    }
    if (s.type === "yesno") return `${head}
        <div class="stamp yes">${esc(s.yes)}</div><div class="stamp no">${esc(s.no)}</div>
        <div class="dswipe" aria-hidden="true"><span>← ${esc(s.no)}</span><span>${esc(s.yes)} →</span></div>
        <div class="dyn">
          <button type="button" class="dbtn no" data-v="0" aria-pressed="${f[s.key] === false}">${esc(s.no)}</button>
          <button type="button" class="dbtn yes" data-v="1" aria-pressed="${f[s.key] === true}">${esc(s.yes)}</button>
        </div>
        <div class="dactions"><button type="button" class="btn sm dskip">${esc(t("deckSkip"))}</button></div>`;
    if (s.type === "chips") return `${head}
        <div class="dchips">${s.options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${f[s.key] === v}">${esc(l)}</button>`).join("")}</div>
        <div class="dactions"><button type="button" class="btn sm dskip">${esc(t("deckSkip"))}</button></div>`;
    // final
    const sum = steps.filter(x => x.type !== "final").map((x, k) => `<button type="button" class="dsum ${answered(x) ? "" : "empty"}" data-go="${k}"><small>${esc(x.short || x.label)}</small><b>${esc(show(x, f[x.key]))}</b></button>`).join("");
    return `<div class="dq">${esc(t("deckReview"))}</div><div class="dsums">${sum}</div>
      <label class="dq small-q" for="deck-ta">${esc(s.label)}<small>${esc(s.hint || "")}</small></label>
      <textarea id="deck-ta" class="ruled" maxlength="${s.max + 50}">${esc(f[s.key] || "")}</textarea>
      <div class="cnt" id="deck-cnt"></div>
      <div id="deck-check"></div>
      <div class="dactions"><button type="button" class="btn solid dsubmit">${esc(s.submit)}</button><span class="msg" id="deck-msg"></span></div>`;
  }

  function go(to, dir) {
    if (to < 0 || to >= steps.length) return;
    f.step = to; draw(dir || "next");
  }
  function fly(card, side, then) {
    if (reduce()) return then();
    card.style.transition = "transform .28s ease-in, opacity .28s ease-in";
    card.style.transform = `translateX(${side * 130}%) rotate(${side * 16}deg)`;
    card.style.opacity = "0";
    setTimeout(then, 260);
  }
  function answer(s, i, v, card, side) {
    f[s.key] = v; f.started = true;
    fly(card, side || 1, () => go(i + 1, "next"));
  }

  function wire(s, card, i) {
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
    card.querySelectorAll(".dskip").forEach(b => (b.onclick = () => { f[s.key] = null; fly(card, -1, () => go(i + 1, "next")); }));

    if (s.type === "text") {
      const inp = card.querySelector(".dinput"), msg = card.querySelector(".dmsg");
      const next = () => {
        const v = inp.value.trim();
        if (s.required && !v) { msg.textContent = s.err || t("required"); msg.classList.add("ng"); inp.focus(); return; }
        f[s.key] = v; answer(s, i, v, card, 1);
      };
      inp.oninput = () => { f[s.key] = inp.value; f.started = true; };
      inp.onkeydown = e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); next(); } };
      card.querySelector(".dnext").onclick = next;
      return;
    }

    if (s.type === "scale") {
      const big = card.querySelector(".dbig"), lab = card.querySelector(".dlabel");
      const setLive = v => {
        big.textContent = v || "?"; big.className = "dbig" + (v ? " c" + v : "");
        lab.textContent = v ? s.labels[v] || "" : t("deckScaleHint");
        card.querySelectorAll(".dtiles button").forEach(b => b.setAttribute("aria-checked", String(+b.dataset.v === v)));
      };
      card.querySelectorAll(".dtiles button").forEach(b => (b.onclick = () => { setLive(+b.dataset.v); answer(s, i, +b.dataset.v, card, 1); }));
      // 横にドラッグすると数字が変わり、指を離すとその値で次へ
      let x0 = null, start = 3, live = null, moved = false;
      card.addEventListener("pointerdown", e => {
        if (e.target.closest("button")) return;
        x0 = e.clientX; start = f[s.key] || 3; live = null; moved = false; card.setPointerCapture(e.pointerId);
      });
      card.addEventListener("pointermove", e => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 8) moved = true;
        if (!moved) return;
        live = Math.max(1, Math.min(5, start + Math.round(dx / 45)));
        card.style.transform = `translateX(${dx * 0.15}px) rotate(${dx * 0.02}deg)`;
        setLive(live);
      });
      const end = () => {
        if (x0 === null) return;
        x0 = null; card.style.transform = "";
        if (moved && live) answer(s, i, live, card, live >= 3 ? 1 : -1);
      };
      card.addEventListener("pointerup", end); card.addEventListener("pointercancel", () => { x0 = null; card.style.transform = ""; setLive(f[s.key] || null); });
      keyHandler = e => {
        if (/^[1-5]$/.test(e.key) && !e.target.closest("input,textarea")) { setLive(+e.key); answer(s, i, +e.key, card, 1); }
      };
    }

    if (s.type === "yesno") {
      const yes = card.querySelector(".stamp.yes"), no = card.querySelector(".stamp.no");
      card.querySelectorAll(".dyn button").forEach(b => (b.onclick = () => answer(s, i, b.dataset.v === "1", card, b.dataset.v === "1" ? 1 : -1)));
      let x0 = null, dx = 0;
      card.addEventListener("pointerdown", e => {
        if (e.target.closest("button")) return;
        x0 = e.clientX; dx = 0; card.style.transition = "none"; card.setPointerCapture(e.pointerId);
      });
      card.addEventListener("pointermove", e => {
        if (x0 === null) return;
        dx = e.clientX - x0;
        card.style.transform = `translateX(${dx}px) rotate(${dx * 0.06}deg)`;
        yes.style.opacity = Math.max(0, Math.min(1, dx / 110));
        no.style.opacity = Math.max(0, Math.min(1, -dx / 110));
      });
      const end = () => {
        if (x0 === null) return;
        x0 = null; card.style.transition = "";
        if (Math.abs(dx) > 110) answer(s, i, dx > 0, card, dx > 0 ? 1 : -1);
        else { card.style.transform = ""; yes.style.opacity = 0; no.style.opacity = 0; }
      };
      card.addEventListener("pointerup", end); card.addEventListener("pointercancel", end);
      keyHandler = e => {
        if (e.target.closest("input,textarea")) return;
        if (e.key === "ArrowRight") answer(s, i, true, card, 1);
        if (e.key === "ArrowLeft") answer(s, i, false, card, -1);
      };
    }

    if (s.type === "chips") {
      card.querySelectorAll(".dchips button").forEach(b => (b.onclick = () => answer(s, i, b.dataset.v, card, 1)));
    }

    if (s.type === "final") {
      card.querySelectorAll("[data-go]").forEach(b => (b.onclick = () => go(+b.dataset.go, "back")));
      const ta = card.querySelector("#deck-ta"), cnt = card.querySelector("#deck-cnt");
      const count = () => { const k = [...ta.value].length; cnt.textContent = t("cnt", k, s.max); cnt.classList.toggle("over", k > s.max); };
      ta.oninput = () => { f[s.key] = ta.value; f.started = true; count(); }; count();
      const msg = card.querySelector("#deck-msg"), btn = card.querySelector(".dsubmit");
      const setMsg = (m, ng) => { msg.textContent = m; msg.classList.toggle("ng", !!ng); };
      btn.onclick = () => {
        const miss = steps.findIndex(x => x.required && x.type !== "final" && !answered(x));
        if (miss >= 0) { setMsg(t("deckMissing", steps[miss].short || steps[miss].label), 1); return; }
        opts.onSubmit({ setMsg, checkEl: card.querySelector("#deck-check"), ta, button: btn });
      };
    }
    if (keyHandler) {
      const h = keyHandler;
      keyHandler = e => { if (!root.isConnected) { document.removeEventListener("keydown", keyHandler); return; } h(e); };
      document.addEventListener("keydown", keyHandler);
    }
  }

  draw();
}
