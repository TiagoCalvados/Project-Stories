import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const defaultLogPath = path.join(root, "logs", "vercel-blob-advanced-operations.jsonl");
const localLogPath = process.env.BLOB_ADVANCED_OPERATION_LOG || defaultLogPath;
const maxAttempts = getOperationLimit();
const runId = randomUUID();
const runStartedAt = new Date().toISOString();
const runSummary = {
  attempts: 0,
  succeeded: 0,
  failed: 0,
};

let blobSdkPromise;

export async function auditedPut(pathname, body, options, context = {}) {
  return auditBlobAdvancedOperation(
    "put",
    {
      ...context,
      pathname,
      bytes: getBodySize(body),
    },
    async () => {
      const { put } = await loadBlobSdk();
      return put(pathname, body, options);
    },
    (result) => ({
      resultUrl: result?.url,
      resultPathname: result?.pathname,
    })
  );
}

export async function auditedCopy(fromUrlOrPathname, toPathname, options, context = {}) {
  return auditBlobAdvancedOperation(
    "copy",
    {
      ...context,
      fromUrlOrPathname,
      pathname: toPathname,
    },
    async () => {
      const { copy } = await loadBlobSdk();
      return copy(fromUrlOrPathname, toPathname, options);
    },
    describeBlobResult
  );
}

export async function auditedList(options = {}, context = {}) {
  return auditBlobAdvancedOperation(
    "list",
    {
      ...context,
      prefix: options.prefix,
      cursor: options.cursor,
      limit: options.limit,
      mode: options.mode,
    },
    async () => {
      const { list } = await loadBlobSdk();
      return list(options);
    },
    (result) => ({
      blobCount: result?.blobs?.length,
      folderCount: result?.folders?.length,
      hasMore: result?.hasMore,
      cursor: result?.cursor,
    })
  );
}

export async function auditedCreateMultipartUpload(pathname, options, context = {}) {
  return auditBlobAdvancedOperation(
    "multipart-create",
    { ...context, pathname },
    async () => {
      const { createMultipartUpload } = await loadBlobSdk();
      return createMultipartUpload(pathname, options);
    },
    (result) => ({
      key: result?.key,
      uploadId: result?.uploadId,
    })
  );
}

export async function auditedUploadPart(pathname, body, options, context = {}) {
  return auditBlobAdvancedOperation(
    "multipart-upload-part",
    {
      ...context,
      pathname,
      bytes: getBodySize(body),
      partNumber: options.partNumber,
      uploadId: options.uploadId,
    },
    async () => {
      const { uploadPart } = await loadBlobSdk();
      return uploadPart(pathname, body, options);
    },
    (result) => ({
      etag: result?.etag,
      partNumber: result?.partNumber,
    })
  );
}

export async function auditedCompleteMultipartUpload(pathname, parts, options, context = {}) {
  return auditBlobAdvancedOperation(
    "multipart-complete",
    {
      ...context,
      pathname,
      partCount: parts.length,
      uploadId: options.uploadId,
    },
    async () => {
      const { completeMultipartUpload } = await loadBlobSdk();
      return completeMultipartUpload(pathname, parts, options);
    },
    describeBlobResult
  );
}

export async function auditedCreateMultipartUploader(pathname, options, context = {}) {
  const uploader = await auditBlobAdvancedOperation(
    "multipart-create",
    { ...context, pathname },
    async () => {
      const { createMultipartUploader } = await loadBlobSdk();
      return createMultipartUploader(pathname, options);
    },
    (result) => ({
      key: result?.key,
      uploadId: result?.uploadId,
    })
  );

  return {
    key: uploader.key,
    uploadId: uploader.uploadId,
    uploadPart(partNumber, body) {
      return auditBlobAdvancedOperation(
        "multipart-upload-part",
        {
          ...context,
          pathname,
          bytes: getBodySize(body),
          partNumber,
          uploadId: uploader.uploadId,
        },
        () => uploader.uploadPart(partNumber, body),
        (result) => ({
          etag: result?.etag,
          partNumber: result?.partNumber,
        })
      );
    },
    complete(parts) {
      return auditBlobAdvancedOperation(
        "multipart-complete",
        {
          ...context,
          pathname,
          partCount: parts.length,
          uploadId: uploader.uploadId,
        },
        () => uploader.complete(parts),
        describeBlobResult
      );
    },
  };
}

export async function auditBlobAdvancedOperation(
  operation,
  context,
  execute,
  describeResult = () => ({})
) {
  if (runSummary.attempts >= maxAttempts) {
    throw new Error(
      `Blob advanced-operation safety limit reached (${maxAttempts} attempts in this process). Set BLOB_ADVANCED_OPERATION_LIMIT to an intentional higher value and retry.`
    );
  }

  const operationId = randomUUID();
  const startedAt = new Date();

  runSummary.attempts += 1;

  await emitAuditEvent({
    timestamp: startedAt.toISOString(),
    stage: "started",
    operation,
    operationId,
    context,
  });

  try {
    const result = await execute();
    const finishedAt = new Date();

    runSummary.succeeded += 1;
    await emitAuditEvent({
      timestamp: finishedAt.toISOString(),
      stage: "finished",
      status: "succeeded",
      operation,
      operationId,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      context,
      result: compactObject(describeResult(result)),
    });

    return result;
  } catch (error) {
    const finishedAt = new Date();

    runSummary.failed += 1;
    await emitAuditEvent({
      timestamp: finishedAt.toISOString(),
      stage: "finished",
      status: "failed",
      operation,
      operationId,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      context,
      error: compactObject({
        name: error?.name,
        message: error?.message,
        code: error?.code,
        status: error?.status,
      }),
    });

    throw error;
  }
}

export function getBlobAdvancedOperationRunSummary() {
  return {
    ...runSummary,
    runId,
    runStartedAt,
    maxAttempts,
    localLogPath: process.env.VERCEL ? undefined : localLogPath,
  };
}

async function loadBlobSdk() {
  blobSdkPromise ??= import("@vercel/blob");
  return blobSdkPromise;
}

async function emitAuditEvent(event) {
  const record = compactObject({
    event: "vercel_blob_advanced_operation",
    runId,
    runStartedAt,
    runtime: process.env.VERCEL ? "vercel-build" : "local",
    projectId: process.env.VERCEL_PROJECT_ID,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF,
    command: process.argv.slice(1),
    ...event,
  });
  const line = JSON.stringify(record);

  console.log(`[blob-advanced-operation] ${line}`);

  if (process.env.VERCEL) {
    return;
  }

  try {
    await mkdir(path.dirname(localLogPath), { recursive: true });
    await appendFile(localLogPath, `${line}\n`, "utf8");
  } catch (error) {
    console.warn(`Could not append Blob advanced-operation audit log: ${error.message}`);
  }
}

function getBodySize(body) {
  if (typeof body === "string") {
    return Buffer.byteLength(body);
  }

  if (Buffer.isBuffer(body) || ArrayBuffer.isView(body)) {
    return body.byteLength;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  return undefined;
}

function describeBlobResult(result) {
  return {
    resultUrl: result?.url,
    resultPathname: result?.pathname,
  };
}

function getOperationLimit() {
  const configured = process.env.BLOB_ADVANCED_OPERATION_LIMIT;

  if (configured === undefined) {
    return 50;
  }

  const value = Number(configured);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("BLOB_ADVANCED_OPERATION_LIMIT must be a positive whole number");
  }

  return value;
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value.map(compactObject);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, compactObject(entry)])
  );
}
