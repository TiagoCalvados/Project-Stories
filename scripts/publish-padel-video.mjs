import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditedList, auditedCreateMultipartUploader } from "./blob-advanced-operations.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const relativePath = "Tiago/padel/web/tiago-padel-game.mp4";
const maximumStoredBytes = 800_000_000;
const maximumVideoBytes = 190_000_000;
const dryRun = process.argv.includes("--dry-run");
if (process.argv.slice(2).some(argument => argument !== "--dry-run")) {
  throw new Error("Only --dry-run is supported.");
}
try { process.loadEnvFile(path.join(root, ".env.local")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required.");

const video = await readFile(path.join(root, relativePath));
if (video.length > maximumVideoBytes) throw new Error("Padel export exceeds its 190 MB upload budget.");
const hash = createHash("sha256").update(video).digest("hex").slice(0, 16);
const pathname = `project-stories/assets/${hash}/tiago-padel-game.mp4`;
const blobs = [];
let cursor;
do {
  const page = await auditedList({ token, limit: 1000, ...(cursor ? { cursor } : {}) },
    { reason: "padel-storage-budget-preflight" });
  blobs.push(...page.blobs);
  cursor = page.hasMore ? page.cursor : undefined;
  if (page.hasMore && !cursor) throw new Error("Incomplete Blob inventory; refusing upload.");
} while (cursor);

const storedBytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
const existing = blobs.find(blob => blob.pathname === pathname);
if (existing && existing.size !== video.length) throw new Error("Existing Padel export has an unexpected size.");
const projectedBytes = storedBytes + (existing ? 0 : video.length);
if (projectedBytes > maximumStoredBytes) {
  throw new Error(`Upload refused: ${projectedBytes} projected bytes exceed the ${maximumStoredBytes} byte safety budget. No files were deleted.`);
}
const report = { checkedAt: new Date().toISOString(), storedBytes, blobCount: blobs.length,
  videoBytes: video.length, projectedBytes, maximumStoredBytes, pathname, dryRun };
console.log(JSON.stringify(report, null, 2));
if (dryRun) process.exit(0);

let published = existing;
if (!published) {
  const uploader = await auditedCreateMultipartUploader(pathname, {
    token, access: "public", addRandomSuffix: false, allowOverwrite: false,
    contentType: "video/mp4", cacheControlMaxAge: 31536000,
  }, { reason: "publish-single-storage-budgeted-padel-export", assetPath: relativePath, contentHash: hash });
  const parts = [];
  const partBytes = 8 * 1024 * 1024;
  for (let offset = 0, partNumber = 1; offset < video.length; offset += partBytes, partNumber++) {
    const part = await uploader.uploadPart(partNumber, video.subarray(offset, offset + partBytes));
    parts.push(part);
  }
  published = await uploader.complete(parts);
}

const manifestPath = path.join(root, "blob-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.assets[relativePath] = { hash, url: published.url };
manifest.assets = Object.fromEntries(Object.entries(manifest.assets).sort(([left], [right]) => left.localeCompare(right)));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const logDirectory = path.join(root, "logs");
await mkdir(logDirectory, { recursive: true });
await writeFile(path.join(logDirectory, "padel-publish-report.json"),
  `${JSON.stringify({ ...report, finishedAt: new Date().toISOString(), url: published.url }, null, 2)}\n`);
console.log(`Padel video published; projected total storage ${(projectedBytes / 1e6).toFixed(1)} MB. Manifest saved locally.`);
