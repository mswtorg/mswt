// Builds the admin guide PDFs from docs/admin-guide/modules/*.md: one PDF per module plus one
// with everything, in docs/admin-guide/pdf/. Screenshots come from `npm run guide:screens`.
// Usage: npm run guide:pdf
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "../..");
const guide = join(root, "docs/admin-guide");
const out = join(guide, "pdf");
const tokens = readFileSync(join(root, "design/tokens.css"), "utf8");
const token = (name) => tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1] ?? "";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Files go into the page as data: URLs (a page set with setContent can't load file:// URLs). */
const data = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");

/** The small Markdown subset the guides use: headings, paragraphs, lists, tables, quotes, images. */
function toHtml(md) {
  const html = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^(#{1,3}) (.*)/))) html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    else if ((m = line.match(/^Who can use it: (.*)/)))
      html.push(`<p class="who"><span>Who can use it</span> ${inline(m[1])}</p>`);
    else if ((m = line.match(/^!\[(.*)\]\((.*)\)$/)))
      html.push(
        `<figure><img src="${data(join(guide, m[2]), "image/jpeg")}" alt="${esc(m[1])}"><figcaption>${inline(m[1])}</figcaption></figure>`,
      );
    else if (line.startsWith("> ")) html.push(`<aside>${inline(line.slice(2))}</aside>`);
    else if (line.startsWith("| ")) {
      const rows = [];
      while (lines[i]?.startsWith("| "))
        rows.push(
          lines[i++]
            .slice(2, -2)
            .split(" | ")
            .map((c) => c.trim()),
        );
      i--;
      const [head, , ...body] = rows;
      html.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
          body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
          "</tbody></table>",
      );
    } else if (/^(- |\d+\. )/.test(line)) {
      const tag = line.startsWith("- ") ? "ul" : "ol";
      const items = [];
      while (lines[i] && /^(\s*- |\d+\. )/.test(lines[i])) {
        const nested = lines[i].match(/^\s+- (.*)/);
        if (nested) items[items.length - 1] += `<li class="sub">${inline(nested[1])}</li>`;
        else items.push(inline(lines[i].replace(/^(- |\d+\. )/, "")));
        i++;
      }
      i--;
      html.push(
        `<${tag}>${items.map((it) => it.replace(/^(.*?)((<li class="sub">.*)?)$/, (_, a, b) => `<li>${a}${b ? `<ul>${b}</ul>` : ""}</li>`)).join("")}</${tag}>`,
      );
    } else html.push(`<p>${inline(line)}</p>`);
  }
  return html.join("\n");
}

const fontFace = [400, 500, 600, 700]
  .map(
    (w) =>
      `@font-face{font-family:Poppins;font-weight:${w};src:url(${data(join(root, `public/fonts/poppins/poppins-latin-${w}.woff2`), "font/woff2")}) format("woff2")}`,
  )
  .join("");

const css = `${fontFace}
@page{size:A4;margin:16mm 16mm 18mm}
*{box-sizing:border-box}
body{font-family:Poppins,sans-serif;font-size:10pt;line-height:1.55;color:${token("color-brand-slate")};margin:0}
.cover{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${token("color-brand-green")};padding-bottom:6mm;margin-bottom:6mm}
.cover img{height:15mm}.cover span{font-size:8.5pt;color:#5b636b;text-align:right}
h1{font-size:21pt;line-height:1.2;color:${token("color-brand-ink")};margin:0 0 3mm;font-weight:600}
h2{font-size:13pt;color:${token("color-link-default")};margin:7mm 0 2mm;font-weight:600;break-after:avoid}
h3{font-size:11pt;margin:5mm 0 2mm}
p{margin:0 0 2.5mm}ul,ol{margin:0 0 3mm;padding-left:6mm}li{margin-bottom:1.2mm}li ul{margin:1mm 0 0}
.who{display:inline-block;background:#e9f4ec;border-radius:4px;padding:1.5mm 3mm;margin-bottom:4mm}
.who span{font-weight:600;color:${token("color-link-default")};margin-right:2mm}
figure{margin:3mm 0 5mm;break-inside:avoid}
figure img{display:block;max-width:100%;max-height:150mm;margin:0 auto;border:1px solid ${token("color-border-decorative")};border-radius:4px}
figcaption{font-size:8.5pt;color:#5b636b;text-align:center;margin-top:1.5mm}
aside{border-left:4px solid ${token("color-brand-green")};background:#f3f8f4;padding:2.5mm 4mm;margin:3mm 0 4mm;break-inside:avoid}
table{border-collapse:collapse;width:100%;font-size:8.5pt;margin:2mm 0 4mm;break-inside:avoid}
th,td{border:1px solid ${token("color-border-decorative")};padding:1.5mm 2mm;text-align:left;vertical-align:top}
th{background:#f3f8f4;font-weight:600}
code{font-size:9pt;background:#f1f2f3;padding:0 1mm;border-radius:2px}
.module{break-before:page}.module:first-of-type{break-before:auto}`;

const logo = data(join(root, "public/brand/mswt-logo-horizontal.svg"), "image/svg+xml");
const header = `<div class="cover"><img src="${logo}" alt="MS Welfare Trust"><span>Admin guide<br>mswelfaretrust.org/admin</span></div>`;
const page = (body, title) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;

const footer = `<div style="font-family:sans-serif;font-size:7pt;color:#5b636b;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>MS Welfare Trust · Admin guide</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

const modules = readdirSync(join(guide, "modules"))
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => {
    const md = readFileSync(join(guide, "modules", f), "utf8");
    return { name: f.replace(/\.md$/, ""), title: md.match(/^# (.*)/m)[1], html: toHtml(md) };
  });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const tab = await browser.newPage();
async function print(html, title, file) {
  await tab.setContent(page(html, title), { waitUntil: "load" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.pdf({
    path: join(out, file),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: footer,
    margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" },
  });
  console.log(`  ${file}`);
}
for (const m of modules) await print(header + m.html, m.title, `${m.name}.pdf`);
const contents = `<h1>MS Welfare Trust admin guide</h1><p>All modules in one file.</p><ol>${modules.map((m) => `<li>${esc(m.title)}</li>`).join("")}</ol>`;
await print(
  header + contents + modules.map((m) => `<section class="module">${m.html}</section>`).join(""),
  "MS Welfare Trust admin guide",
  "mswt-admin-guide-complete.pdf",
);
await browser.close();
console.log(`Wrote ${modules.length + 1} PDFs to docs/admin-guide/pdf/`);
