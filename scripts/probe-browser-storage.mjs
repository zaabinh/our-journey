// Native capabilities on an isolated fixture origin; no application/private data.
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  {
    webkit,
    chromium,
    firefox,
  } = require("../frontend/node_modules/playwright");
const server = http.createServer((_, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><title>Fixture storage probe</title>");
});
await new Promise((resolve) => server.listen(4185, "127.0.0.1", resolve));
let browser, context;
try {
  const engine = process.argv[2] ?? "webkit",
    type = { webkit, chromium, firefox }[engine];
  if (process.argv.includes("--persistent"))
    context = await type.launchPersistentContext(
      `.qa/storage-probe-${engine}-${Date.now()}`,
      { headless: true },
    );
  else {
    browser = await type.launch();
    context = await browser.newContext();
  }
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4185");
  const results = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("OurJourney-native-probe", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("probe");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const blob = new Blob(["synthetic"], { type: "image/png" });
    const results = {
      structuredClone: typeof structuredClone,
      secure: isSecureContext,
      writes: [],
    };
    for (const [key, value] of Object.entries({
      scalar: "fixture",
      blob,
      object: { blob },
      alias: { blob, thumbnail: blob },
      bytes: await blob.arrayBuffer(),
    })) {
      results.writes.push(
        await new Promise((resolve) => {
          const tx = db.transaction("probe", "readwrite");
          let requestError;
          tx.oncomplete = () => resolve({ key, ok: true });
          tx.onabort = () =>
            resolve({
              key,
              ok: false,
              error: tx.error?.name,
              message: tx.error?.message,
              requestError,
            });
          try {
            const r = tx.objectStore("probe").put(value, key);
            r.onerror = () => {
              requestError = { name: r.error?.name, message: r.error?.message };
            };
          } catch (e) {
            requestError = { name: e.name, message: e.message };
            tx.abort();
          }
        }),
      );
    }
    db.close();
    return results;
  });
  console.log(
    JSON.stringify(
      {
        engine,
        persistent: process.argv.includes("--persistent"),
        browser: browser?.version() ?? context.browser()?.version(),
        ...results,
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await browser?.close();
  server.close();
}
