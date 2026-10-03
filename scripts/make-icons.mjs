// Renders public/icon.svg into the PNGs phones need (iOS ignores SVG home-screen
// icons). Run after changing the SVG: node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8");
const executablePath = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ executablePath });

for (const [file, size, padded] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  // iOS adds its own rounded corners, so this one is a full square.
  ["apple-touch-icon.png", 180, true],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const body = padded ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<html><body style="margin:0;background:transparent">${body.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("icons written");
