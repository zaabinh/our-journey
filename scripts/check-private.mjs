import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, "..");
const safeAssets = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/safe-assets.json"), "utf8"),
);
const safeImagePaths = {
  "assets/icon/love.png": safeAssets["brand/love.png"],
  "assets/icon/user.png": safeAssets["brand/user.png"],
  ...Object.fromEntries(Object.entries(safeAssets).map(([p, hash]) => [`frontend/public/${p}`, hash])),
};
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const imagePath = p => /\.(?:png|jpe?g|webp|gif|avif|heic|heif|tiff?|bmp|ico|svg)$/i.test(p);
const approvedImage = (p, bytes) => safeImagePaths[p] === hash(bytes);
const git = (args) =>
  execFileSync(
    "git",
    ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...args],
    { cwd: root, encoding: "utf8" },
  );
const privatePath = (p) =>
  /(^|\/)(?:\.private-data|exports|backups|\.qa)(\/|$)/i.test(p) ||
  /^assets\/img\//i.test(p) ||
  /(?:recovery|photo_gallery_data).*\.json$/i.test(p) ||
  /\.(?:zip|env)$/i.test(p) ||
  (/(^|\/)\.env(?:\.|$)/.test(p) && !p.endsWith(".env.example"));
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory()
            ? walk(path.join(dir, e.name))
            : [path.join(dir, e.name)],
        )
    : [];
const mode = process.argv[2];
const errors = [];
const staged = git([
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMR",
  "-z",
])
  .split("\0")
  .filter(Boolean);
for (const p of staged) {
  if (privatePath(p)) {
    errors.push("Private path staged");
    continue;
  }
  const b = execFileSync(
    "git",
    ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "show", `:${p}`],
    { cwd: root, maxBuffer: 400 * 1024 * 1024 },
  );
  if (/data:image\/[\w.+-]+;base64,/i.test(b.toString()))
    errors.push("Embedded image staged");
  if (imagePath(p) && !approvedImage(p, b)) errors.push("Unapproved image staged (including renamed media)");
}
if (mode === "--tracked") {
  const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const n = tracked.filter(privatePath).length;
  if (n)
    errors.push(
      `${n} private paths remain tracked; browser-export blocker must be resolved before release`,
    );
  let unapproved = 0;
  for (const p of tracked.filter(p => imagePath(p) && !privatePath(p))) {
    const bytes = execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "show", `:${p}`], { cwd: root });
    if (!approvedImage(p, bytes)) unapproved++;
  }
  if (unapproved) errors.push(`${unapproved} unapproved image paths remain tracked`);
}
for (const file of walk(path.join(root, "frontend/public"))) {
  const relative = path
    .relative(path.join(root, "frontend/public"), file)
    .replaceAll("\\", "/");
  if (
    safeAssets[relative] !==
    createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  )
    errors.push("Unapproved public asset/content");
}
for (const file of [
  ...walk(path.join(root, "frontend/src")),
  ...(mode === "--build" ? walk(path.join(root, "frontend/dist")) : []),
]) {
  const b = fs.readFileSync(file);
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (imagePath(file) && (relative.startsWith("frontend/src/") || !new Set(Object.values(safeAssets)).has(hash(b)))) errors.push("Unapproved image in frontend source/build");
  if (
    /data:image\/[\w.+-]+;base64,/i.test(b.toString()) ||
    /(?:\.private-data|assets\/img|photo_gallery_data|photo_gallery_recovery)/i.test(
      b.toString(),
    )
  )
    errors.push("Private data reference in frontend");
}
// Exact content match catches accidentally copied originals, including renamed files.
const manifest = path.join(root, ".private-data/manifest.json");
if (mode === "--build" && fs.existsSync(manifest)) {
  const inventory = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const privateHashes = new Set([...inventory.files.map(f => f.sha256), ...(inventory.imagePayloadChecksums ?? [])]);
  for (const file of walk(path.join(root, "frontend/dist"))) {
    if (
      privateHashes.has(
        createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      )
    )
      errors.push("Private payload in build");
  }
}
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Privacy checks PASS (${staged.length} staged files; ${mode ?? "source/public"}). Tracked legacy audit requires --tracked.`,
  );
