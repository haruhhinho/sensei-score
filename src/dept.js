/* 学部名の英語表示
   「経済学部」→「Faculty of Economics」のように、組織の種類（学部・学群・研究科…）と分野の語を組み合わせて英語にする。
   辞書にない語が含まれる場合は、誤訳を避けて日本語のまま表示する。 */

// 組織の種類（長いものから順に照合）
const KINDS = [
  ["教育課程", "% Program"], ["学術院", "Faculty of %"], ["研究科", "Graduate School of %"], ["研究院", "Graduate School of %"],
  ["研究所", "Institute of %"], ["センター", "Center for %"], ["学府", "Graduate School of %"], ["学部", "Faculty of %"],
  ["学群", "School of %"], ["学域", "College of %"], ["学類", "College of %"], ["学環", "School of %"], ["学系", "Division of %"],
  ["学院", "School of %"], ["学科", "Department of %"], ["課程", "% Program"], ["機構", "Organization for %"],
];
// まとまった名前（そのまま使う）
const WHOLE = {
  教養部: "College of Liberal Arts", 国際教養: "International Liberal Studies", 総合政策: "Policy Studies", 文化構想: "Culture, Media and Society",
  社会福祉: "Social Welfare", 人文社会: "Humanities and Social Sciences", 経済経営: "Economics and Business Administration",
  理工: "Science and Engineering", 基幹理工: "Fundamental Science and Engineering", 創造理工: "Creative Science and Engineering",
  先進理工: "Advanced Science and Engineering", 情報理工: "Information Science and Technology", 法文: "Law and Letters",
  文理: "Arts and Sciences", 法務: "Law", 国際関係: "International Relations", 社会情報: "Social Informatics",
  教養教育: "Liberal Arts Education", 共通教育: "General Education", 全学教育: "General Education", 獣医: "Veterinary Medicine",
  人間社会: "Human and Social Sciences", 地球環境: "Global Environmental Studies", 生物資源: "Bioresources", 情報コミュニケーション: "Information and Communication", 現代社会: "Contemporary Social Studies", スポーツ健康科: "Sport and Health Science",
};
// 分野の語：n = 単独で使うときの英語、a = 前に付く形容詞（ある語は次の語にかかる）
const W = {
  法: { n: "Law" }, 経済: { n: "Economics" }, 経営: { n: "Business Administration" }, 商: { n: "Commerce" }, 文: { n: "Letters" },
  理: { n: "Science" }, 工: { n: "Engineering" }, 医: { n: "Medicine" }, 歯: { n: "Dentistry" }, 薬: { n: "Pharmaceutical Sciences" },
  農: { n: "Agriculture" }, 教育: { n: "Education" }, 教養: { n: "Liberal Arts" }, 外国語: { n: "Foreign Studies" }, 人文: { n: "Humanities" },
  政治: { n: "Political Science" }, 政策: { n: "Policy Studies" }, 心理: { n: "Psychology" }, 看護: { n: "Nursing" }, 保健: { n: "Health Sciences", a: "Health" },
  福祉: { n: "Welfare" }, 芸術: { n: "Arts" }, 美術: { n: "Fine Arts" }, 音楽: { n: "Music" }, 体育: { n: "Physical Education" },
  言語: { n: "Language", a: "Language" }, 観光: { n: "Tourism" }, 建築: { n: "Architecture" }, 水産: { n: "Fisheries" }, 海洋: { n: "Marine Science", a: "Marine" },
  家政: { n: "Home Economics" }, 栄養: { n: "Nutrition" }, 神: { n: "Theology" }, 仏教: { n: "Buddhist Studies" }, 会計: { n: "Accountancy" },
  メディア: { n: "Media" }, コミュニケーション: { n: "Communication" }, デザイン: { n: "Design" }, ビジネス: { n: "Business" }, マネジメント: { n: "Management" },
  情報: { n: "Informatics", a: "Information" }, 数理: { n: "Mathematical Sciences", a: "Mathematical" }, 化: { n: "Chemistry" }, 物理: { n: "Physics" },
  生物: { n: "Biology", a: "Biological" }, 文芸: { n: "Literature" }, 子ども: { n: "Child Studies", a: "Child" }, 児童: { n: "Child Studies", a: "Child" },
  保育: { n: "Childcare" }, 幼児教育: { n: "Early Childhood Education" }, 食: { n: "Food Science", a: "Food" }, 繊維: { n: "Textile Science" },
  // 次の語にかかる語（例：国際＋経営 → International Business Administration）
  国際: { n: "International Studies", a: "International", p: 1 }, グローバル: { n: "Global Studies", a: "Global", p: 1 },
  現代: { n: "Contemporary Studies", a: "Contemporary", p: 1 }, 総合: { n: "Integrated Studies", a: "Integrated", p: 1 },
  地域: { n: "Regional Studies", a: "Regional", p: 1 }, 人間: { n: "Human Studies", a: "Human", p: 1 }, 社会: { n: "Sociology", a: "Social", p: 1 },
  先端: { n: "Advanced Studies", a: "Advanced", p: 1 }, 先進: { n: "Advanced Studies", a: "Advanced", p: 1 }, 都市: { n: "Urban Studies", a: "Urban", p: 1 }, 生命: { n: "Life Sciences", a: "Life", p: 1 },
  環境: { n: "Environmental Studies", a: "Environmental", p: 1 }, 医療: { n: "Medical Sciences", a: "Medical", p: 1 }, 健康: { n: "Health Sciences", a: "Health", p: 1 },
  文化: { n: "Culture", a: "Cultural", p: 1 }, 産業: { n: "Industrial Studies", a: "Industrial", p: 1 }, 創造: { n: "Creative Studies", a: "Creative", p: 1 },
  スポーツ: { n: "Sport Sciences", a: "Sport", p: 1 }, 応用: { n: "Applied Sciences", a: "Applied", p: 1 }, 生活: { n: "Human Life Sciences", a: "Living", p: 1 },
};
const KEYS = Object.keys(W).sort((a, b) => b.length - a.length);
const list = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

function stemEn(stem) {
  if (WHOLE[stem]) return WHOLE[stem];
  // 「社会科（学）」「人間科（学）」→ Social Sciences / Human Sciences
  if (/科$/.test(stem) && stem.length > 1) {
    const s = stem.slice(0, -1); if (WHOLE[s]) return WHOLE[s];
    const tk = tokens(s); if (!tk) return null;
    return tk.map(w => w.a || w.n).join(" ") + " Sciences";
  }
  const tk = tokens(stem); if (!tk) return null;
  const out = []; let pre = [];
  tk.forEach((w, i) => {
    if (w.p && i < tk.length - 1) { pre.push(w.a); return; }
    out.push([...pre, w.n].join(" ")); pre = [];
  });
  return list(out);
}
function tokens(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    if (s[i] === "・") { i++; continue; }
    if (WHOLE[s.slice(i)] && i > 0) { out.push({ n: WHOLE[s.slice(i)] }); break; }
    const k = KEYS.find(k => s.startsWith(k, i)); if (!k) return null;
    out.push(W[k]); i += k.length;
  }
  return out.length ? out : null;
}
export function deptEn(d) {
  const j = String(d || "").replace(/[\s　]+/g, "");
  if (!j || !/[぀-ヿ㐀-鿿]/.test(j)) return d || "";
  if (WHOLE[j]) return WHOLE[j];
  const kind = KINDS.find(([k]) => j.endsWith(k) && j.length > k.length);
  if (!kind) return d;
  let stem = j.slice(0, -kind[0].length);
  stem = stem.replace(/(.)系$/, "$1");
  if (kind[0] !== "学科" && /学$/.test(stem) && stem.length > 1) stem = stem.slice(0, -1); // 経済学研究科 → 経済
  const en = stemEn(stem);
  return en ? kind[1].replace("%", en) : d;
}
