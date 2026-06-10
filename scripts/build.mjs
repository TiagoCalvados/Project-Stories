import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditedPut,
  getBlobAdvancedOperationRunSummary,
} from "./blob-advanced-operations.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const blobManifestPath = path.join(root, "blob-manifest.json");
const allowLocalFallback = process.argv.includes("--allow-local-fallback");
const deploymentOnlySkippedHtmlFiles = new Set(["slide22may.html"]);
const deploymentOnlyRemovedLinks = new Map([
  ["tiagok.html", ["tiagok2.html"]],
]);

if (!allowLocalFallback) {
  await loadLocalEnv();
}

const token = allowLocalFallback ? undefined : process.env.BLOB_READ_WRITE_TOKEN;

const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const mimeTypes = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

if (!token && !allowLocalFallback) {
  throw new Error(
    "BLOB_READ_WRITE_TOKEN is required for deployment builds. Run `npm run build` for a local preview without Blob uploads."
  );
}

const htmlFiles = (await readdir(root))
  .filter((file) => file.toLowerCase().endsWith(".html"))
  .filter((file) => !deploymentOnlySkippedHtmlFiles.has(file.toLowerCase()))
  .sort();
const cssFiles = (await readdir(root))
  .filter((file) => file.toLowerCase().endsWith(".css"))
  .sort();

const assetCache = new Map();
const blobManifest = await loadBlobManifest();
let blobManifestDirty = false;
let blobManifestReuseCount = 0;
let blobUploadCount = 0;

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });

for (const htmlFile of htmlFiles) {
  const source = removeDeploymentOnlyLinks(await readFile(path.join(root, htmlFile), "utf8"), htmlFile);
  const rewritten = await rewriteHtmlAssets(source, htmlFile);
  await writeFile(path.join(dist, htmlFile), rewritten);
}

for (const cssFile of cssFiles) {
  await copyFile(path.join(root, cssFile), path.join(dist, cssFile));
}

if (token && blobManifestDirty) {
  if (process.env.VERCEL) {
    console.warn(
      "Blob manifest has new entries inside Vercel only. Run `npm run build:deploy` locally and commit blob-manifest.json to avoid repeated uploads."
    );
  } else {
    await saveBlobManifest(blobManifest);
  }
}

console.log(`Built ${htmlFiles.length} HTML file(s) into dist.`);
console.log(`Copied ${cssFiles.length} CSS file(s) into dist.`);
console.log(token ? "Image references point to Vercel Blob URLs." : "Local fallback copied image files into dist.");
if (token) {
  console.log(`Blob manifest reused ${blobManifestReuseCount} asset(s); uploaded ${blobUploadCount} asset(s).`);
  const auditSummary = getBlobAdvancedOperationRunSummary();
  const auditDestination = auditSummary.localLogPath || "structured Vercel build logs";
  console.log(
    `Advanced-operation audit: ${auditSummary.attempts} attempted, ${auditSummary.succeeded} succeeded, ${auditSummary.failed} failed; ${auditDestination}.`
  );
}

async function rewriteHtmlAssets(source, htmlFile) {
  const replacements = [];
  const attributePattern = /\b(src|href|content)=(["'])([^"']+)\2/g;
  let match;

  while ((match = attributePattern.exec(source)) !== null) {
    const [fullMatch, name, quote, value] = match;
    const asset = resolveLocalImage(value, htmlFile);

    if (!asset) {
      continue;
    }

    const targetUrl = await publishAsset(asset.filePath, asset.relativePath, value);
    replacements.push({
      start: match.index,
      end: match.index + fullMatch.length,
      value: `${name}=${quote}${targetUrl}${quote}`,
    });
  }

  let output = source;
  for (const replacement of replacements.reverse()) {
    output = `${output.slice(0, replacement.start)}${replacement.value}${output.slice(replacement.end)}`;
  }

  return output;
}

function removeDeploymentOnlyLinks(source, htmlFile) {
  const targets = deploymentOnlyRemovedLinks.get(htmlFile.toLowerCase());

  if (!targets) {
    return source;
  }

  let output = source;

  for (const target of targets) {
    const linkPattern = new RegExp(
      `\\r?\\n\\s*<a\\b[^>]*\\bhref=(["'])${escapeRegExp(target)}\\1[^>]*>[^<]*<\\/a>`,
      "g"
    );
    output = output.replace(linkPattern, "");
  }

  return output;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveLocalImage(value, htmlFile) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) {
    return undefined;
  }

  const [pathname] = value.split(/[?#]/);
  const extension = path.extname(pathname).toLowerCase();

  if (!imageExtensions.has(extension)) {
    return undefined;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }

  const baseDirectory = path.posix.dirname(htmlFile.replaceAll(path.sep, "/"));
  const posixPath = decoded.startsWith("/")
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(baseDirectory, decoded));

  if (posixPath.startsWith("../") || posixPath === "..") {
    return undefined;
  }

  const filePath = path.join(root, ...posixPath.split("/"));

  return {
    filePath,
    relativePath: posixPath,
  };
}

async function publishAsset(filePath, relativePath, originalValue) {
  if (assetCache.has(relativePath)) {
    return assetCache.get(relativePath);
  }

  const buffer = await readFile(filePath);
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const extension = path.extname(relativePath).toLowerCase();
  const safeName = sanitizePathSegment(path.basename(relativePath));

  let publicUrl;

  if (token) {
    const manifestEntry = blobManifest.assets[relativePath];

    if (manifestEntry?.hash === hash && manifestEntry.url) {
      publicUrl = manifestEntry.url;
      blobManifestReuseCount += 1;
    } else {
      if (process.env.VERCEL) {
        throw new Error(
          `Refusing unlogged Vercel Blob upload for "${relativePath}". Run \`npm run build:deploy\` locally, then commit blob-manifest.json before deploying.`
        );
      }

      const blob = await auditedPut(
        `project-stories/assets/${hash}/${safeName}`,
        buffer,
        {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 31536000,
          contentType: mimeTypes.get(extension) || "application/octet-stream",
          token,
        },
        {
          assetPath: relativePath,
          contentHash: hash,
          reason: manifestEntry ? "content-hash-changed" : "manifest-entry-missing",
          previousContentHash: manifestEntry?.hash,
        }
      );

      publicUrl = blob.url;
      blobManifest.assets[relativePath] = { hash, url: publicUrl };
      blobManifestDirty = true;
      blobUploadCount += 1;
    }
  } else {
    publicUrl = originalValue;
    const target = path.join(dist, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(filePath, target);
  }

  assetCache.set(relativePath, publicUrl);
  return publicUrl;
}

function sanitizePathSegment(segment) {
  const extension = path.extname(segment);
  const name = path.basename(segment, extension);
  const safeName = name
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${safeName || "asset"}${extension.toLowerCase()}`;
}

async function loadBlobManifest() {
  try {
    const manifest = JSON.parse(await readFile(blobManifestPath, "utf8"));

    return {
      version: manifest.version || 1,
      assets: manifest.assets && typeof manifest.assets === "object" ? manifest.assets : {},
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    version: 1,
    assets: {},
  };
}

async function saveBlobManifest(manifest) {
  const sortedAssets = Object.fromEntries(
    Object.entries(manifest.assets).sort(([left], [right]) => left.localeCompare(right))
  );

  await writeFile(
    blobManifestPath,
    `${JSON.stringify({ version: manifest.version || 1, assets: sortedAssets }, null, 2)}\n`
  );
}

async function loadLocalEnv() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return;
  }

  try {
    const localEnv = await readFile(path.join(root, ".env.local"), "utf8");

    for (const line of localEnv.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");

      if (separator === -1) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();

      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
