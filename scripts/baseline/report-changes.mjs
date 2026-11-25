#!/usr/bin/env node
/**
 * Produce a readable change report (added / modified / deleted / unchanged)
 * comparing the working tree against the saved baseline.
 *
 * Always exits 0: this is a reporting tool. Use verify-baseline.mjs for gates.
 *
 * Usage:
 *   node scripts/baseline/report-changes.mjs
 *   node scripts/baseline/report-changes.mjs --json
 *   node scripts/baseline/report-changes.mjs --verbose
 */
import { existsSync } from "node:fs";
import {
  BASELINE_FILE,
  loadBaseline,
  printComparison,
  compareWithBaseline,
  hasDifferences,
} from "./lib.mjs";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const verbose = argv.includes("--verbose");

if (!existsSync(BASELINE_FILE)) {
  console.error(`ERROR: no baseline at ${BASELINE_FILE}`);
  process.exit(1);
}

const baseline = loadBaseline();
const result = compareWithBaseline(baseline);
const changed = hasDifferences(result);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        baselineCreatedAt: baseline.createdAt,
        baselineGitCommit: baseline.gitCommit,
        baselineFiles: result.totalBaseline,
        currentFiles: result.totalCurrent,
        changed,
        modified: result.modified,
        deleted: result.deleted,
        added: result.added,
        unchanged: result.unchanged,
      },
      null,
      2,
    ),
  );
} else {
  console.log("== Application change report vs. baseline ==");
  console.log(`Baseline: ${baseline.createdAt} @ ${baseline.gitCommit ?? "?"}`);
  printComparison(result, { verbose });
  console.log(
    changed
      ? "\nNOTE: differences exist. Only the explicit authorized change list is acceptable."
      : "\nNo differences: application matches the protected baseline.",
  );
}

process.exit(0);
