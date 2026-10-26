// 先生ごとの「授業タイプ」と、SNSで共有できる画像カード
import { t, S } from "./core.js";

// レビューの数字から授業タイプを決める（AIを使わないので無料・即時）
export function classType(s) {
  if (!s || !s.n) return null;
  const q = s.q, d = s.d, again = s.again;
  let k;
  if (q >= 4.5 && (again == null || again >= 80)) k = "god";
  else if (q >= 4 && d >= 3.8) k = "toughGreat";
  else if (q >= 4 && d <= 2.5) k = "funEasy";
  else if (q >= 4) k = "solid";
  else if (q <= 2.5 && d >= 3.8) k = "brace";
  else if (d <= 2.2) k = "easyCredit";
  else if (q <= 2.5) k = "split";
  else k = "balanced";
  const att = s.rs ? s.rs.filter(r => r.att != null) : [];
  const attHeavy = att.length >= 2 && att.filter(r => r.att).length / att.length >= 0.6;
  const T = t("ctypes");
  return { key: k, label: T[k][0], desc: T[k][1], att: attHeavy };
}

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function fitText(g, text, maxW, size, weight, family) {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; s -= 4; } while (g.measureText(text).width > maxW && s > 20);
  return s + 4;
}

// 1080×1350（縦長）の画像を作る
export async function makeShareCard({ name, alt, uni, dept, s, type }) {
  const fam = `"Barlow Semi Condensed","Zen Kaku Gothic New","Hiragino Sans","Yu Gothic",sans-serif`;
  try { await Promise.all([document.fonts.load(`900 80px "Zen Kaku Gothic New"`, name), document.fonts.load(`800 80px "Barlow Semi Condensed"`, "0123456789.")]); } catch {}
  const W = 1080, H = 1350, P = 80;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const good = "#00B140", mid = "#FFA800", bad = "#FF1F3D", ink = "#000", sub = "#666", rule = "#DDD";
  const col = v => (v == null ? sub : v >= 4 ? good : v >= 3 ? mid : bad);
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  // 下の3色の帯（サイトのフッターと同じ）
  [good, mid, bad].forEach((cl, i) => { g.fillStyle = cl; g.fillRect((W / 3) * i, H - 22, W / 3 + 1, 22); });
  g.fillStyle = ink; g.textBaseline = "alphabetic";
  g.font = `900 40px ${fam}`; g.fillText(t("brand"), P, P + 30);
  g.font = `500 28px ${fam}`; g.fillStyle = sub; g.textAlign = "right";
  g.fillText(new Date().toLocaleDateString(S.LANG === "en" ? "en-US" : "ja-JP"), W - P, P + 30); g.textAlign = "left";
  g.fillStyle = ink; g.fillRect(P, P + 56, W - P * 2, 4);

  // 名前・大学
  const nameSize = fitText(g, name, W - P * 2, 104, 900, fam);
  g.font = `900 ${nameSize}px ${fam}`; g.fillText(name, P, P + 200);
  let y = P + 200;
  if (alt) { g.font = `500 34px ${fam}`; g.fillStyle = sub; y += 54; g.fillText(alt, P, y); }
  g.fillStyle = ink; g.font = `700 36px ${fam}`; y += 62;
  g.fillText(`${uni}${dept ? "　" + dept : ""}`, P, y);

  // 大きな点数
  y += 230;
  g.font = `800 230px ${fam}`; g.fillStyle = col(s.n ? s.q : null);
  const qs = s.n ? s.q.toFixed(1) : "—"; g.fillText(qs, P - 6, y);
  const qw = g.measureText(qs).width;
  g.fillStyle = sub; g.font = `700 60px ${fam}`; g.fillText("/ 5", P + qw + 10, y);
  g.font = `500 30px ${fam}`; g.fillText(t("basis", s.n), P, y + 52);

  // 授業タイプ
  if (type) {
    const ty = y + 160;
    g.font = `900 52px ${fam}`;
    const label = type.label + (type.att ? `・${t("attHeavy")}` : "");
    const lw = Math.min(W - P * 2, g.measureText(label).width + 56);
    g.fillStyle = ink; g.fillRect(P, ty - 64, lw, 88);
    g.fillStyle = "#fff"; g.fillText(label, P + 28, ty - 2, lw - 56);
    g.fillStyle = sub; g.font = `500 30px ${fam}`; g.fillText(type.desc, P, ty + 64, W - P * 2);
    y = ty + 64;
  }

  // また受講したい・難易度
  y += 70;
  g.fillStyle = rule; g.fillRect(P, y, W - P * 2, 2);
  const cells = [[s.n && s.again != null ? s.again + "%" : "—", t("again")], [s.n ? s.d.toFixed(1) : "—", t("diff5")]];
  cells.forEach(([v, l], i) => {
    const x = P + i * ((W - P * 2) / 2);
    g.fillStyle = ink; g.font = `800 84px ${fam}`; g.fillText(v, x, y + 110);
    g.fillStyle = sub; g.font = `500 28px ${fam}`; g.fillText(l, x, y + 152);
  });

  // 分布の小さな棒
  if (s.n && s.dist) {
    const by = y + 200, bw = W - P * 2, max = Math.max(...[1, 2, 3, 4, 5].map(k => s.dist[k]), 1);
    [5, 4, 3, 2, 1].forEach((k, i) => {
      const yy = by + i * 34;
      g.fillStyle = sub; g.font = `700 24px ${fam}`; g.fillText(String(k), P, yy + 20);
      g.fillStyle = "#F2F2F2"; g.fillRect(P + 40, yy + 2, bw - 40, 22);
      g.fillStyle = ink; g.fillRect(P + 40, yy + 2, ((bw - 40) * s.dist[k]) / max, 22);
    });
  }
  g.fillStyle = sub; g.font = `600 28px ${fam}`; g.textAlign = "right";
  g.fillText(location.host, W - P, H - 52); g.textAlign = "left";
  return c;
}
