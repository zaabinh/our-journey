import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const backup = process.argv[2];
if (!backup) throw Error("Provide external backup directory");
const manifest = JSON.parse(
  fs.readFileSync(path.join(backup, "manifest.json"), "utf8"),
);
const restore = ".private-data/restore-check/assets/img";
fs.mkdirSync(restore, { recursive: true });
for (const file of manifest.files) {
  const relative = file.path.replace(/^assets\/img\//, "");
  if (relative.split("/").includes("..") || path.isAbsolute(relative))
    throw Error("Unsafe manifest path");
  const target = path.join(restore, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(
    path.join(backup, "img", relative),
    target,
    fs.constants.COPYFILE_EXCL,
  );
  for (const candidate of [file.path, target]) {
    const b = fs.readFileSync(candidate);
    if (
      b.length !== file.bytes ||
      crypto.createHash("sha256").update(b).digest("hex") !== file.sha256
    )
      throw Error("Restore/source mismatch");
  }
}
console.log(
  `Restored and verified ${manifest.files.length} files; sources unchanged.`,
);
