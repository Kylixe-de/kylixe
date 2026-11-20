// Builds the deployable site into _site/: copies the repository and adds one real page per
// category and product (kylixe.com/vasen/, kylixe.com/vasen/spiralvase/) with its own title,
// description and canonical link, plus sitemap.xml and robots.txt.
// Runs in GitHub Actions on every push (see .github/workflows/pages.yml). No dependencies.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd(), OUT = path.join(ROOT, "_site");
const SKIP = new Set(["_site", ".git", ".github", "tools", "node_modules"]);
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { return d; } };
const domain = (() => { try { return fs.readFileSync(path.join(ROOT, "CNAME"), "utf8").trim() || "kylixe.com"; } catch (e) { return "kylixe.com"; } })();
const BASE = "https://" + domain;
const site = read("data/site.json", {}), cats = read("data/categories.json", []), prods = read("data/products.json", []);

// same rules as the shop page (slug(), CATLIST, PRODUCTS)
const slug = (v, i) => String(v || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item-" + i;
const RES = new Set(["admin", "data", "images", "fonts", "videos", "tools", "katalog", "impressum", "datenschutz", "agb", "widerruf", "versand", "404"]);
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };

fs.rmSync(OUT, { recursive: true, force: true });
const copy = (src, dst) => {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (src === ROOT && (SKIP.has(e.name) || e.name.startsWith("."))) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); } else fs.copyFileSync(s, d);
  }
};
fs.mkdirSync(OUT, { recursive: true });
copy(ROOT, OUT);

const tpl = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<\/head>/i, '<meta name="kylixe-pretty" content="1"></head>');
const t0 = (site.seo_title && site.seo_title.de) || "Kylixe";
const d0 = (site.seo_desc && site.seo_desc.de) || "";
function page(rel, title, desc, image) {
  const url = BASE + rel;
  let h = /<base href=/i.test(tpl) ? tpl : tpl.replace(/<head>/i, '<head><base href="/">');
  h = h.replace(/<title>[^<]*<\/title>/i, "<title>" + esc(title) + "</title>");
  h = h.replace(/<meta name="description" content="[^"]*">/i, '<meta name="description" content="' + esc(desc) + '">');
  h = h.replace(/<meta property="og:title" content="[^"]*">/i, '<meta property="og:title" content="' + esc(title) + '">');
  h = h.replace(/<meta property="og:description" content="[^"]*">/i, '<meta property="og:description" content="' + esc(desc) + '">');
  h = h.replace(/<meta property="og:url" content="[^"]*">/i, '<meta property="og:url" content="' + url + '">');
  h = h.replace(/<\/head>/i, '<link rel="canonical" href="' + url + '">' + (image ? '<meta property="og:image" content="' + esc(BASE + "/" + String(image).replace(/^\.?\/+/, "")) + '">' : "") + "<meta name=\"kylixe-page-title\" content=\"" + esc(title) + "\"></head>");
  const dir = path.join(OUT, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), h);
  return url;
}

const urls = [BASE + "/"];
// root page gets a canonical too
fs.writeFileSync(path.join(OUT, "index.html"), tpl.replace(/<\/head>/i, '<link rel="canonical" href="' + BASE + '/"></head>'));

const statics = [["katalog", "Katalog", "Alle Designobjekte von Kylixe im Überblick."], ["impressum", "Impressum", ""], ["datenschutz", "Datenschutz", ""], ["agb", "AGB", ""], ["widerruf", "Widerrufsbelehrung", ""], ["versand", "Versand & Rückgabe", ""]];
for (const [s, name, d] of statics) urls.push(page("/" + s + "/", name + " – Kylixe", d || d0, null));

const catList = cats.filter((c) => c && c.id && c.active !== false).map((c, i) => ({ id: slug(c.id, i), c }));
const used = new Set(), cpath = {};
for (const x of catList) {
  const s = slug(x.c.url_slug || x.c.name_de || x.c.name_en || x.id, 0);
  let k = s, j = 2; while (used.has(k) || RES.has(k)) k = s + "-" + j++;
  used.add(k); cpath[x.id] = k;
  const name = x.c.name_de || x.c.name_en || x.id;
  const desc = clip(x.c.text_de || (name + " aus hochwertiger Design-Keramik von Kylixe – einzigartige Stücke für dein Zuhause."), 160);
  urls.push(page("/" + k + "/", name + " – Kylixe", desc, x.c.image && !/\.svg$/i.test(x.c.image) ? x.c.image : null));
}
if (!site.products_hidden) {
  const plist = prods.filter((e) => e && e.active !== false && (e.name_en || e.name_de)).map((e, i) => ({ id: slug(e.id || e.name_en || e.name_de, i), e }));
  const pu = new Set();
  for (const x of plist) {
    const c = cpath[slug(x.e.category, 0)]; if (!c) continue;
    const s = slug(x.e.url_slug || x.e.name_de || x.e.name_en || x.id, 0);
    let k = s, j = 2; while (pu.has(c + "/" + k)) k = s + "-" + j++;
    pu.add(c + "/" + k);
    const name = x.e.name_de || x.e.name_en;
    const img = (x.e.images || []).find((m) => m && m.src);
    urls.push(page("/" + c + "/" + k + "/", name + " – Kylixe", clip(x.e.desc_de || x.e.desc_en || d0, 160), img && img.src));
  }
}
// unknown paths show the shop instead of GitHub's 404 page
fs.writeFileSync(path.join(OUT, "404.html"), (/<base href=/i.test(tpl) ? tpl : tpl.replace(/<head>/i, '<head><base href="/">')).replace(/<\/head>/i, '<meta name="robots" content="noindex"></head>'));
fs.writeFileSync(path.join(OUT, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map((u) => "  <url><loc>" + u + "</loc></url>").join("\n") + "\n</urlset>\n");
fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /admin/\nAllow: /\nSitemap: " + BASE + "/sitemap.xml\n");
console.log("built", urls.length, "pages");
