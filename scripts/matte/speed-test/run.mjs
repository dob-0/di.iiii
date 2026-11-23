import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const dir = fileURLToPath(new URL(".", import.meta.url));
const clip = process.env.MATTE_CLIP || process.argv[2];
if (!clip) { console.error("usage: DI_TEST_CDP=... node run.mjs <clip1080.webm>  (or MATTE_CLIP=...)"); process.exit(2); }
const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP);
const ctx = browser.contexts()[0] || await browser.newContext();
const page = await ctx.newPage();
try {
  const fs = await import("node:fs");
  const types = { html: "text/html", webm: "video/webm" };
  await page.route("http://matte.localhost/**", (route) => {
    const name = new URL(route.request().url()).pathname.slice(1) || "index.html";
    route.fulfill({ status: 200, contentType: types[name.split(".").pop()] || "application/octet-stream", body: fs.readFileSync(name === "clip1080.webm" ? clip : dir + name) });
  });
  await page.goto("http://matte.localhost/index.html");
  await page.waitForFunction(() => ["done", "error"].includes(window.__result?.status), null, { timeout: 120000 });
  const r = await page.evaluate(() => window.__result);
  await page.screenshot({ path: process.env.MATTE_SHOT || "matte-shot.png" });
  console.log(JSON.stringify(r));
} finally { await page.close(); await browser.close(); }
