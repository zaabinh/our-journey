// Read-only source inspection. Details stay in ignored storage, never stdout.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
if (process.argv[2]) process.chdir(process.argv[2]);
const root = process.cwd();
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
const files = walk("assets/img");
const totals = {
  files: files.length,
  bytes: 0,
  jsonSources: 0,
  records: 0,
  imageReferences: 0,
  signatureValidImages: 0,
  invalidImages: 0,
  archiveEntries: 0,
  unsafeArchiveEntries: 0,
  duplicateImageContents: 0,
};
const seen = new Set();
function image(b) {
  // Signature validation; browser decoding is a separate check.
  if (
    !(b[0] === 255 && b[1] === 216) &&
    b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    totals.invalidImages++;
  else totals.signatureValidImages++;
  const h = hash(b);
  if (seen.has(h)) totals.duplicateImageContents++;
  seen.add(h);
}
const manifest = files.map((file) => {
  const b = fs.readFileSync(file);
  totals.bytes += b.length;
  const entry = {
    path: file.replaceAll("\\", "/"),
    bytes: b.length,
    sha256: hash(b),
    source: "repository",
    errors: [],
  };
  try {
    if (file.endsWith(".json")) {
      totals.jsonSources++;
      const data = JSON.parse(b.toString("utf8"));
      const records = Array.isArray(data) ? data : (data.data ?? data.metadata);
      entry.topLevel = Array.isArray(data) ? "array" : Object.keys(data);
      if (!Array.isArray(records)) throw Error("Unrecognized record container");
      entry.records = records.length;
      entry.images = 0;
      entry.recordFields = [...new Set(records.flatMap((r) => Object.keys(r)))];
      for (const record of records) {
        const images = record.images ?? (record.image ? [record.image] : []);
        for (const src of Array.isArray(images) ? images : [images]) {
          entry.images++;
          totals.imageReferences++;
          if (typeof src === "string" && src.startsWith("data:")) {
            const m =
              /^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
                src,
              );
            if (!m) {
              totals.invalidImages++;
              continue;
            }
            image(Buffer.from(m[1], "base64"));
          }
        }
      }
      totals.records += entry.records;
    } else if (file.endsWith(".zip")) {
      // Inspect central directory and decode entries in memory; never extract paths.
      let end = b.length - 22;
      while (
        end >= Math.max(0, b.length - 65557) &&
        b.readUInt32LE(end) !== 0x06054b50
      )
        end--;
      if (end < 0) throw Error("ZIP directory missing");
      let pos = b.readUInt32LE(end + 16);
      const count = b.readUInt16LE(end + 10);
      entry.archiveEntries = count;
      for (let i = 0; i < count; i++) {
        if (b.readUInt32LE(pos) !== 0x02014b50)
          throw Error("Invalid ZIP directory");
        const nameLen = b.readUInt16LE(pos + 28),
          extra = b.readUInt16LE(pos + 30),
          comment = b.readUInt16LE(pos + 32);
        const name = b.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
        totals.archiveEntries++;
        if (
          /^(?:[/\\]|[A-Za-z]:)/.test(name) ||
          name.split(/[/\\]/).includes("..")
        )
          totals.unsafeArchiveEntries++;
        const size = b.readUInt32LE(pos + 24),
          packed = b.readUInt32LE(pos + 20),
          method = b.readUInt16LE(pos + 10),
          offset = b.readUInt32LE(pos + 42);
        if (size > 100 * 1024 * 1024)
          throw Error("Archive entry exceeds limit");
        const start =
          offset +
          30 +
          b.readUInt16LE(offset + 26) +
          b.readUInt16LE(offset + 28);
        const payload = b.subarray(start, start + packed);
        const content =
          method === 0
            ? payload
            : method === 8
              ? zlib.inflateRawSync(payload, {
                  maxOutputLength: 100 * 1024 * 1024,
                })
              : null;
        if (!content || content.length !== size)
          throw Error("Archive decompression failed");
        if (/\.(?:png|jpe?g)$/i.test(name)) image(content);
        pos += 46 + nameLen + extra + comment;
      }
    } else image(b);
  } catch (e) {
    entry.errors.push(e.message);
  }
  return entry;
});
fs.mkdirSync(".private-data", { recursive: true });
fs.writeFileSync(
  ".private-data/manifest.json",
  JSON.stringify({ version: 2, root, totals, validation: 'JSON parsed; archives decoded in memory; image signatures only', files: manifest, imagePayloadChecksums: [...seen] }, null, 2),
);
console.log(
  JSON.stringify(
    {
      ...totals,
      sourceErrors: manifest.reduce((n, f) => n + f.errors.length, 0),
    },
    null,
    2,
  ),
);
