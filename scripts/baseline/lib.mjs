/**
 * Shared helpers for the whole-application SHA-256 protection workflow.
 *
 * Source of truth for the file list is Git (`git ls-files`). Hashes are taken
 * from the committed HEAD blobs so the baseline is not polluted by uncommitted
 * working-tree edits, and verification hashes the current working tree with the
 * same canonicalization so line-ending differences (Git autocrlf) never look
 * like content changes.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const ROOT = resolve(process.cwd());

/** Local baseline manifest (lives in the git-ignored Development folder). */
export const BASELINE_DIR = join(ROOT, "Development", "AppProtection");
export const BASELINE_FILE = join(BASELINE_DIR, "app-baseline.json");
export const HISTORY_DIR = join(BASELINE_DIR, "baseline-history");

/**
 * Documented exclusions. These are protection/diagnostics artifacts, never
 * application source. The manifest would otherwise hash itself, and the
 * protection tooling is meta-infrastructure that must be free to evolve.
 */
export const EXCLUSIONS = [
  {
    prefix: "Development/AppProtection/",
    reason: "SHA-256 baseline manifest and approved baseline history",
  },
  {
    prefix: "scripts/baseline/",
    reason: "Protection tooling itself (meta-infrastructure, not app code)",
  },
];

export function isExcluded(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return EXCLUSIONS.some(({ prefix }) => normalized.startsWith(prefix));
}

/** All Git-tracked file paths, repo-relative, forward-slashed, sorted. */
export function listTrackedFiles() {
  const raw = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    maxBuffer: 256 * 1024 * 1024,
  }).toString("utf8");
  return raw
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"))
    .sort();
}

/** Current source list (tracked minus documented exclusions). */
export function protectionFileList() {
  return listTrackedFiles().filter((p) => !isExcluded(p));
}

/** Binary detection: NUL byte in the first 8 KiB. */
export function looksBinary(buffer) {
  const limit = Math.min(buffer.length, 8192);
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Canonical bytes: text files always hash with LF line endings; binary files
 * hash raw. This makes the hash independent of Git's CRLF checkout state while
 * leaving images/fonts/archives untouched.
 */
export function canonicalize(buffer) {
  if (looksBinary(buffer)) return buffer;
  return Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

export function sha256(buffer) {
  return createHash("sha256").update(canonicalize(buffer)).digest("hex");
}

/** Hash a committed HEAD blob (baseline creation). */
export function hashHeadBlob(relPath) {
  const buffer = execFileSync("git", ["show", `HEAD:${relPath}`], {
    cwd: ROOT,
    maxBuffer: 256 * 1024 * 1024,
  });
  return sha256(buffer);
}

/** Hash the current working-tree file (verification). */
export function hashWorkingFile(relPath) {
  return sha256(readFileSync(join(ROOT, relPath)));
}

export function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

export function gitMetadata() {
  let commit = null;
  let branch = null;
  try {
    commit = gitOutput(["rev-parse", "HEAD"]);
  } catch {
    commit = null;
  }
  try {
    branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    branch = null;
  }
  return { commit, branch };
}

/** Human-readable, repo-relative display path. */
export function displayPath(relPath) {
  return relative(ROOT, join(ROOT, relPath)).replace(/\\/g, "/");
}

export function loadBaseline(file = BASELINE_FILE) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Compare the current working tree against a baseline manifest.
 * Never mutates the baseline.
 */
export function compareWithBaseline(baseline) {
  const baselineMap = new Map(
    baseline.files.map((entry) => [entry.path, entry.sha256]),
  );
  const currentFiles = protectionFileList();
  const currentSet = new Set(currentFiles);

  const modified = [];
  const unchanged = [];
  const deleted = [];
  const added = [];

  for (const [path, expected] of baselineMap) {
    if (!currentSet.has(path)) {
      deleted.push({ path, expected });
      continue;
    }
    let actual;
    try {
      actual = hashWorkingFile(path);
    } catch {
      deleted.push({ path, expected });
      continue;
    }
    if (actual === expected) unchanged.push({ path, sha256: actual });
    else modified.push({ path, expected, actual });
  }

  for (const path of currentFiles) {
    if (!baselineMap.has(path)) added.push({ path });
  }

  return {
    modified,
    deleted,
    added,
    unchanged,
    totalBaseline: baselineMap.size,
    totalCurrent: currentFiles.length,
  };
}

export function hasDifferences(result) {
  return (
    result.modified.length > 0 ||
    result.deleted.length > 0 ||
    result.added.length > 0
  );
}

export function printComparison(result, { verbose = false } = {}) {
  console.log(`Baseline files: ${result.totalBaseline}`);
  console.log(`Current tracked files: ${result.totalCurrent}`);
  console.log(`Unchanged: ${result.unchanged.length}`);
  console.log(`Modified:  ${result.modified.length}`);
  console.log(`Deleted:   ${result.deleted.length}`);
  console.log(`Added:     ${result.added.length}`);

  if (result.modified.length) {
    console.log("\nMODIFIED (authorized only if on the explicit change list):");
    for (const entry of result.modified) console.log(`  M ${entry.path}`);
  }
  if (result.deleted.length) {
    console.log("\nDELETED (missing from working tree):");
    for (const entry of result.deleted) console.log(`  D ${entry.path}`);
  }
  if (result.added.length) {
    console.log("\nADDED (newly tracked, not in baseline):");
    for (const entry of result.added) console.log(`  A ${entry.path}`);
  }
  if (verbose && result.unchanged.length) {
    console.log("\nUNCHANGED:");
    for (const entry of result.unchanged) console.log(`  . ${entry.path}`);
  }
}
