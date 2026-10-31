import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const workspace = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
const qa = path.join(workspace, ".qa"); fs.mkdirSync(qa, { recursive: true });
function fixture(run) {
  const root = fs.mkdtempSync(path.join(qa, "privacy-fixture-"));
  const git = args => execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "-C", root, ...args], { stdio: "pipe" });
  const write = (name, value) => { const p = path.join(root, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, value); };
  try {
    fs.mkdirSync(path.join(root, "scripts")); for (const name of ["check-private.mjs", "safe-assets.json"]) fs.copyFileSync(path.join(workspace, "scripts", name), path.join(root, "scripts", name));
    git(["init", "--quiet"]);
    const check = (...args) => spawnSync(process.execPath, [path.join(root, "scripts/check-private.mjs"), ...args], { cwd: root, encoding: "utf8" });
    run({ write, stage: name => git(["add", "--", name]), check });
  } finally {
    const target = fs.realpathSync(root), parent = fs.realpathSync(qa);
    if (!parent.startsWith(workspace + path.sep) || !target.startsWith(parent + path.sep)) throw Error("Refusing cleanup outside fixture directory");
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
test("ordinary configuration JSON is allowed", () => fixture(({ write, stage, check }) => { write("settings.json", '{"theme":"warm"}'); stage("settings.json"); assert.equal(check().status, 0); }));
test("known UI icon is allowed by path and SHA-256", () => fixture(({ write, stage, check }) => { write("frontend/public/brand/love.png", fs.readFileSync(path.join(workspace, "frontend/public/brand/love.png"))); stage("frontend/public/brand/love.png"); assert.equal(check().status, 0); }));
test("private data path is rejected", () => fixture(({ write, stage, check }) => { write(".private-data/synthetic.json", "[]"); stage(".private-data/synthetic.json"); const r = check(); assert.equal(r.status, 1); assert.match(r.stderr, /Private path staged/); }));
test("embedded image JSON is rejected", () => fixture(({ write, stage, check }) => { write("ordinary-name.json", JSON.stringify({ images: ["data:" + "image/png;base64,AAAA"] })); stage("ordinary-name.json"); assert.equal(check().status, 1); }));
test("renaming an image does not bypass the allowlist", () => fixture(({ write, stage, check }) => { write("docs/renamed.png", Buffer.from([1, 2, 3])); stage("docs/renamed.png"); const r = check(); assert.equal(r.status, 1); assert.match(r.stderr, /Unapproved image staged/); assert.match(check("--tracked").stderr, /unapproved image paths remain tracked/); }));
test("data archives are rejected", () => fixture(({ write, stage, check }) => { write("snapshot.zip", "synthetic archive"); stage("snapshot.zip"); assert.equal(check().status, 1); }));
