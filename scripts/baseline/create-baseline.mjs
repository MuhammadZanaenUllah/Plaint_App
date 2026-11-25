#!/usr/bin/env node
/**
 * Create the whole-application SHA-256 baseline from the committed HEAD blobs.
 *
 * Safety:
 *  - Refuses to overwrite an existing baseline unless `--update` is passed.
 *  - `--update` additionally requires `--reason "<why>"` (explicit approval).
 *  - Any previous baseline is preserved under baseline-history/ before writing.
 *
 * Usage:
 *   node scripts/baseline/create-baseline.mjs
 *   node scripts/baseline/create-baseline.mjs --update --reason "approved change"
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASELINE_DIR,
  BASELINE_FILE,
  EXCLUSIONS,
  HISTORY_DIR,
  ROOT,
  gitMetadata,
  hashHeadBlob,
  protectionFileList,
} from "./lib.mjs";

function parseArgs(argv) {
  const args = { update: false, reason: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--update") args.update = true;
    else if (arg === "--reason") {
      args.reason = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return args;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const exists = existsSync(BASELINE_FILE);

if (exists && !args.update) {
  fail(
    "baseline already exists. Refusing to overwrite automatically.\n" +
      "  Review with: node scripts/baseline/verify-baseline.mjs\n" +
      "  To create an approved replacement: --update --reason \"<why>\"",
  );
}

if (exists && args.update && !args.reason) {
  fail("--update requires --reason \"<why>\" so the change is documented.");
}

mkdirSync(BASELINE_DIR, { recursive: true });
mkdirSync(HISTORY_DIR, { recursive: true });

if (exists) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archived = join(HISTORY_DIR, `app-baseline.${stamp}.json`);
  copyFileSync(BASELINE_FILE, archived);
  console.log(`Preserved previous baseline -> ${archived}`);
}

const files = protectionFileList();
const entries = files.map((path) => ({ path, sha256: hashHeadBlob(path) }));
entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const { commit, branch } = gitMetadata();
const manifest = {
  schemaVersion: 1,
  description:
    "Whole-application SHA-256 baseline. Source: git ls-files + HEAD blobs. " +
    "Verify with scripts/baseline/verify-baseline.mjs. Never auto-regenerate.",
  algorithm: "sha256",
  canonicalization:
    "text files: UTF-8 with CRLF normalized to LF; binary files: raw bytes",
  createdAt: new Date().toISOString(),
  gitCommit: commit,
  gitBranch: branch,
  repository: ROOT,
  fileCount: entries.length,
  exclusions: EXCLUSIONS,
  files: entries,
};

writeFileSync(BASELINE_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Baseline written: ${BASELINE_FILE}`);
console.log(`Protected tracked files: ${entries.length}`);
console.log(`Excluded scopes: ${EXCLUSIONS.map((e) => e.prefix).join(", ")}`);
console.log(`Git commit: ${commit ?? "(unavailable)"}  branch: ${branch ?? "?"}`);
