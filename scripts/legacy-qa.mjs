// Isolated localhost origin and synthetic identity only. Never serves private media.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? require(process.env.PLAYWRIGHT_MODULE)
  : require("../frontend/node_modules/playwright");
const allowed = new Set([
  "index.html",
  "album.html",
  "login_page.html",
  "signup_page.html",
  "profile.html",
  "style_home.css",
  "style_album.css",
  "style_login.css",
  "script.js",
  "auth.js",
  "assets/icon/love.png",
  "assets/icon/user.png",
  "assets/font/DancingScript-VariableFont_wght.ttf",
  "assets/font/CormorantGaramond-VariableFont_wght.ttf",
]);
const server = http.createServer((req, res) => {
  const file = req.url.slice(1) || "index.html";
  if (!allowed.has(file)) {
    res.writeHead(404).end();
    return;
  }
  let content = fs.readFileSync(file);
  if (file === "index.html")
    content = Buffer.from(
      content
        .toString()
        .replace(
          /data-text="[^"]*"/g,
          'data-text="A synthetic memory for visual testing."',
        ),
    );
  res.setHeader(
    "Content-Type",
    {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".png": "image/png",
      ".ttf": "font/ttf",
    }[path.extname(file)],
  );
  res.end(content);
});
await new Promise((resolve) => server.listen(4174, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch();
  fs.mkdirSync(".qa/legacy", { recursive: true });
  const summary = [];
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://**", (route) => route.abort());
    await page.goto("http://127.0.0.1:4174/album.html");
    await page.evaluate(async () => {
      localStorage.setItem(
        "users",
        JSON.stringify([
          { username: "fixture", email: "fixture@example.invalid" },
        ]),
      );
      localStorage.setItem(
        "session",
        JSON.stringify({ username: "fixture", token: "demo-only" }),
      );
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("PhotoGallery", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const tx = db.transaction(["metadata", "images"], "readwrite");
      tx.objectStore("metadata").put({
        id: "fixture-1",
        title: "Synthetic memory",
        date: "2026-10-01",
        location: "Demo garden",
        note: "Only synthetic data.",
        owner: "fixture",
        order: 0,
      });
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#b6465f";
      ctx.fillRect(0, 0, 640, 480);
      tx.objectStore("images").put({
        id: "fixture-1",
        images: [canvas.toDataURL()],
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
    });
    await page.reload();
    await page.getByText("Synthetic memory", { exact: true }).first().waitFor();
    await page.screenshot({
      path: `.qa/legacy/album-${width}.png`,
      fullPage: true,
    });
    summary.push({
      page: "album",
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      errors,
    });
    await page.goto("http://127.0.0.1:4174/index.html");
    await page.screenshot({
      path: `.qa/legacy/home-${width}.png`,
      fullPage: true,
    });
    summary.push({
      page: "home",
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    });
    await context.close();
  }
  fs.writeFileSync(
    ".qa/legacy/results.json",
    JSON.stringify(
      {
        browser: browser.version(),
        externalCDN: "blocked; no Swiper interaction tested",
        results: summary,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary));
} finally {
  await browser?.close();
  server.close();
}
