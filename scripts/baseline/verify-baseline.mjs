#!/usr/bin/env node
/**
 * Verify the current working tree against the saved SHA-256 baseline.
 *
 * Detects modified, deleted and newly-tracked files. Reads the baseline only —
 * it never rewrites or regenerates it.
 *
 * Exit code: 0 = clean, 1 = differences or error.
 *
 * Usage:
 *   node scripts/baseline/verify-baseline.mjs
 *   node scripts/baseline/verify-baseline.mjs --json
 *   node scripts/baseline/verify-baseline.mjs --verbose
 */
import { existsSync } from "node:fs";
import {
  BASELINE_FILE,
  hasDifferences,
  loadBaseline,
  printComparison,
  compareWithBaseline,
} from "./lib.mjs";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const verbose = argv.includes("--verbose");

if (!existsSync(BASELINE_FILE)) {
  console.error(
    `ERROR: no baseline at ${BASELINE_FILE}. Create one with create-baseline.mjs`,
  );
  process.exit(1);
}

const baseline = loadBaseline();
const result = compareWithBaseline(baseline);
const clean = !hasDifferences(result);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        clean,
        baselineCreatedAt: baseline.createdAt,
        baselineGitCommit: baseline.gitCommit,
        baselineFiles: result.totalBaseline,
        currentFiles: result.totalCurrent,
        modified: result.modified.map((e) => e.path),
        deleted: result.deleted.map((e) => e.path),
        added: result.added.map((e) => e.path),
        unchangedCount: result.unchanged.length,
      },
      null,
      2,
    ),
  );
} else {
  console.log("== Whole-application SHA-256 verification ==");
  console.log(`Baseline: ${baseline.createdAt} @ ${baseline.gitCommit ?? "?"}`);
  printComparison(result, { verbose });
  console.log(clean ? "\nRESULT: CLEAN (matches baseline)" : "\nRESULT: DIFFERENCES FOUND");
}

process.exit(clean ? 0 : 1);
