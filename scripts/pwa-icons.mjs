#!/usr/bin/env node
// App icons for the web app manifest and iOS (Step 9), from the logo mark on the canvas colour.
// Output: public/icons/*.png (committed). Re-run after changing the logo: node scripts/pwa-icons.mjs
// With --screenshots <url> (a running build, e.g. http://localhost:3000/en) it also captures the
// manifest screenshots of the home page (narrow 1080×1920, wide 1920×1080).
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "tokens/design-tokens.json"), "utf8"));
const canvas = tokens.color.white.$value;
const mark = readFileSync(join(root, "public/brand/mswt-mark.svg"));
const out = join(root, "public/icons");
mkdirSync(out, { recursive: true });

// size: icon size; inner: how much of it the mark may fill (maskable icons keep the mark inside
// the 80% safe circle, so it survives any mask shape).
const ICONS = [
  { file: "icon-192.png", size: 192, inner: 0.78 },
  { file: "icon-512.png", size: 512, inner: 0.78 },
  { file: "icon-maskable-512.png", size: 512, inner: 0.56 },
  { file: "apple-touch-icon.png", size: 180, inner: 0.72 },
];

for (const { file, size, inner } of ICONS) {
  const box = Math.round(size * inner);
  const logo = await sharp(mark, { density: 600 })
    .resize(box, box, { fit: "contain", background: canvas })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: canvas } })
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: canvas })
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(out, file));
  console.log(`public/icons/${file}`);
}

const i = process.argv.indexOf("--screenshots");
if (i > 0) {
  const url = process.argv[i + 1] ?? "http://localhost:3000/en";
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  for (const [file, width, height, scale] of [
    ["screenshot-narrow.png", 360, 640, 3],
    ["screenshot-wide.png", 1280, 720, 1.5],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.goto(url, { waitUntil: "networkidle" });
    const png = await page.screenshot();
    await sharp(png).png({ compressionLevel: 9, palette: true }).toFile(join(out, file));
    console.log(`public/icons/${file} (${width * scale}×${height * scale})`);
    await page.close();
  }
  await browser.close();
}
