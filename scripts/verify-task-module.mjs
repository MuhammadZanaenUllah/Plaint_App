import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcDir = join(root, "src");
const hashFile = join(
  root,
  "Development",
  "TaskModuleDocuments",
  "Phase0",
  "protected-files.sha256",
);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
  return files;
}

const sourceFiles = walk(srcDir);
let failed = false;

console.log("== Forbidden endpoint call scan ==");
const forbiddenCall = /(?:apiGet|apiPost|apiDelete|apiUpload)(?:WithStatus)?\s*\(\s*[`"'](\/(?:tasks\/(?:statusupdate|updateleadsource|reschedule-reopened|migrate-)[^`"']*|modules\/all[^`"']*))/g;
const getTaskById = /apiGet(?:WithStatus)?\s*\(\s*[`"']\/tasks\/\$\{(?!view)/g;
let forbiddenHits = 0;
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const regex of [forbiddenCall, getTaskById]) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      forbiddenHits += 1;
      console.log(`  FOUND ${relative(root, file)}: ${match[0]}`);
    }
  }
}
if (forbiddenHits === 0) console.log("  CLEAN");
else failed = true;

console.log("== Protected Chat hash check ==");
const entries = readFileSync(hashFile, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.trim().startsWith("#"))
  .map((line) => {
    const [expected, ...rest] = line.trim().split(/\s+/);
    return { expected: expected.toUpperCase(), file: rest.join(" ") };
  });

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

let mismatches = 0;
let normalizedMatches = 0;
for (const entry of entries) {
  try {
    const raw = readFileSync(join(root, entry.file));
    const rawHash = sha256(raw);
    // The Phase 0 hashes were generated on a Windows CRLF worktree. Git may
    // check the same blob out as LF, which changes the raw SHA256 without
    // changing file content. Accept either the raw or CRLF-normalized hash.
    const crlf = Buffer.from(
      raw.toString("utf8").replace(/\r?\n/g, "\r\n"),
      "utf8",
    );
    const crlfHash = sha256(crlf);
    if (rawHash === entry.expected) continue;
    if (crlfHash === entry.expected) {
      normalizedMatches += 1;
      continue;
    }
    mismatches += 1;
    console.log(`  MISMATCH ${entry.file}`);
  } catch {
    mismatches += 1;
    console.log(`  MISSING  ${entry.file}`);
  }
}
console.log(
  `  ${entries.length - mismatches}/${entries.length} match` +
    (normalizedMatches > 0
      ? ` (${normalizedMatches} via CRLF normalization)`
      : ""),
);
if (mismatches > 0) failed = true;

console.log("== No protected-file working-tree changes ==");
const protectedFiles = new Set(entries.map((entry) => entry.file.replace(/\\/g, "/")));
const changed = execFileSync("git", ["diff", "--name-only", "HEAD"], {
  cwd: root,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);
const touchedProtected = changed.filter((file) =>
  protectedFiles.has(file.replace(/\\/g, "/")),
);
if (touchedProtected.length === 0) console.log("  CLEAN");
else {
  touchedProtected.forEach((file) => console.log(`  CHANGED ${file}`));
  failed = true;
}

process.exit(failed ? 1 : 0);
