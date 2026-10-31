// Aggregate-only verification against the Phase 0 private manifest.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const manifest = JSON.parse(
  fs.readFileSync(".private-data/manifest.json", "utf8"),
);
let sources = 0,
  restored = 0,
  backups = 0;
for (const file of manifest.files) {
  const relative = file.path.replace(/^assets\/img\//, "");
  const verify = (candidate) => {
    const bytes = fs.readFileSync(candidate);
    if (
      bytes.length !== file.bytes ||
      crypto.createHash("sha256").update(bytes).digest("hex") !== file.sha256
    )
      throw Error("Data fingerprint mismatch; details withheld");
  };
  verify(file.path);
  sources++;
  verify(path.join(".private-data/restore-check/assets/img", relative));
  restored++;
  if (process.argv[2]) {
    verify(path.join(process.argv[2], "img", relative));
    backups++;
  }
}
console.log(
  JSON.stringify({
    sources,
    restored,
    externalBackup: backups || "NOT CHECKED",
    unchanged: true,
  }),
);
