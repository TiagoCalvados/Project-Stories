import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const defaultLogPath = path.join(root, "logs", "vercel-blob-advanced-operations.jsonl");
const options = parseOptions(process.argv.slice(2));
const logPath = path.resolve(root, options.logPath || defaultLogPath);
const cutoff = options.days
  ? Date.now() - options.days * 24 * 60 * 60 * 1000
  : Number.NEGATIVE_INFINITY;

let contents;

try {
  contents = await readFile(logPath, "utf8");
} catch (error) {
  if (error.code === "ENOENT") {
    console.log(`No Blob advanced-operation log exists yet at ${logPath}`);
    process.exit(0);
  }

  throw error;
}

const records = [];
let invalidLines = 0;

for (const line of contents.split(/\r?\n/)) {
  if (!line.trim()) {
    continue;
  }

  try {
    const record = JSON.parse(line);
    const timestamp = Date.parse(record.timestamp);

    if (record.event === "vercel_blob_advanced_operation" && timestamp >= cutoff) {
      records.push(record);
    }
  } catch {
    invalidLines += 1;
  }
}

const started = records.filter((record) => record.stage === "started");
const finished = records.filter((record) => record.stage === "finished");
const succeeded = finished.filter((record) => record.status === "succeeded");
const failed = finished.filter((record) => record.status === "failed");
const unfinishedIds = new Set(started.map((record) => record.operationId));

for (const record of finished) {
  unfinishedIds.delete(record.operationId);
}

const grouped = new Map();

for (const record of started) {
  const date = record.timestamp.slice(0, 10);
  const operation = record.operation || "unknown";
  const key = `${date}\u0000${operation}`;
  const group = grouped.get(key) || {
    date,
    operation,
    attempts: 0,
    succeeded: 0,
    failed: 0,
    unfinished: 0,
  };

  group.attempts += 1;
  grouped.set(key, group);
}

for (const record of finished) {
  const startedRecord = started.find((candidate) => candidate.operationId === record.operationId);
  const date = (startedRecord?.timestamp || record.timestamp).slice(0, 10);
  const operation = record.operation || startedRecord?.operation || "unknown";
  const key = `${date}\u0000${operation}`;
  const group = grouped.get(key);

  if (!group) {
    continue;
  }

  group[record.status === "succeeded" ? "succeeded" : "failed"] += 1;
}

for (const record of started) {
  if (unfinishedIds.has(record.operationId)) {
    const key = `${record.timestamp.slice(0, 10)}\u0000${record.operation || "unknown"}`;
    grouped.get(key).unfinished += 1;
  }
}

console.log(`Blob advanced-operation log: ${logPath}`);
console.log(
  `Attempts: ${started.length}; succeeded: ${succeeded.length}; failed: ${failed.length}; unfinished: ${unfinishedIds.size}`
);

if (options.days) {
  console.log(`Window: last ${options.days} day(s)`);
}

if (invalidLines) {
  console.log(`Ignored malformed lines: ${invalidLines}`);
}

if (grouped.size) {
  console.table(
    [...grouped.values()].sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.operation.localeCompare(right.operation)
    )
  );
}

if (failed.length) {
  console.log("Recent failures:");
  console.table(
    failed.slice(-10).map((record) => ({
      timestamp: record.timestamp,
      operation: record.operation,
      pathname: record.context?.pathname,
      message: record.error?.message,
    }))
  );
}

function parseOptions(args) {
  const parsed = {
    days: 14,
    logPath: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--all") {
      parsed.days = undefined;
      continue;
    }

    if (argument === "--days") {
      const days = Number(args[index + 1]);

      if (!Number.isInteger(days) || days <= 0) {
        throw new Error("--days requires a positive whole number");
      }

      parsed.days = days;
      index += 1;
      continue;
    }

    if (argument === "--log") {
      parsed.logPath = args[index + 1];

      if (!parsed.logPath) {
        throw new Error("--log requires a path");
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  return parsed;
}
