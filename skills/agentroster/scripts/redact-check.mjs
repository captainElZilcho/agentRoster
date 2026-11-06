// Blocks a run that copied a secret into its output folder. It looks for secret-shaped text
// and for values from the project's .env files. It never prints, returns or logs a matched
// value: a hit is only a file, a line number and a kind.
// Usage: redact-check.mjs <run-dir> [--project <dir>]

import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import path from "node:path";
import { isEntryPoint } from "./lib/cli.mjs";
import { compareText } from "./lib/order.mjs";

/** The shapes of well-known secrets. */
export const SECRET_SHAPES = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const MIN_ENV_LENGTH = 8;
const SKIP_FOLDERS = new Set([
  "node_modules", ".venv", "venv", "vendor", "__pycache__", "dist", "build", ".git", ".agentroster",
]);

/**
 * Find secrets in text. Returns places only, never values.
 * @param {Array<{path: string, text: string}>} files
 * @param {string[]} envValues Values from .env files; ones under 8 characters are ignored.
 * @returns {Array<{file: string, line: number, kind: "secret-shaped" | "value from .env"}>}
 */
export function findLeaks(files, envValues) {
  const values = [...new Set(envValues)].filter((v) => v.length >= MIN_ENV_LENGTH);
  const leaks = [];
  for (const file of files) {
    file.text.replace(/^﻿/, "").split(/\r?\n/).forEach((line, i) => {
      if (SECRET_SHAPES.some((re) => re.test(line))) {
        leaks.push({ file: file.path, line: i + 1, kind: "secret-shaped" });
      }
      if (values.some((v) => line.includes(v))) {
        leaks.push({ file: file.path, line: i + 1, kind: "value from .env" });
      }
    });
  }
  return leaks.sort(
    (a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.kind, b.kind),
  );
}

/**
 * Walk a folder: every regular file at any depth. Links are never followed.
 * @param {string} root
 * @param {(name: string) => boolean} skipFolder
 * @returns {string[]} Paths relative to root, with "/" separators, sorted.
 */
function walk(root, skipFolder = () => false) {
  const found = [];
  const visit = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const rel = prefix + entry.name;
      if (entry.isDirectory()) {
        if (!skipFolder(entry.name)) visit(path.join(dir, entry.name), rel + "/");
      } else if (entry.isFile()) {
        found.push(rel);
      }
    }
  };
  visit(root, "");
  return found.sort(compareText);
}

/**
 * Read the values from .env and .env.* files in a project, to compare in memory only.
 * @param {string} projectDir
 * @returns {string[]} Values of 8 characters or more.
 */
export function readEnvValues(projectDir) {
  const values = new Set();
  const names = walk(projectDir, (name) => SKIP_FOLDERS.has(name)).filter((rel) =>
    /^\.env(\..+)?$/i.test(rel.split("/").at(-1)),
  );
  for (const rel of names) {
    let text;
    try {
      text = readFileSync(path.join(projectDir, rel), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      let value = m[1];
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
        value = value.slice(1, -1);
      }
      if (value.length >= MIN_ENV_LENGTH) values.add(value);
    }
  }
  return [...values].sort(compareText);
}

// Command line

class CliError extends Error {}

const reason = (err) =>
  err?.code === "ENOENT" ? "not found" : err?.code === "EACCES" || err?.code === "EPERM" ? "no permission" : err?.code === "EISDIR" ? "is a folder" : "unreadable";

/** Is this file binary (a NUL byte in the first 8 KiB)? */
function isBinary(file) {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(8192);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).includes(0);
  } finally {
    closeSync(fd);
  }
}

/**
 * Run the command line.
 * @param {string[]} args
 * @returns {number} 0 clean, 1 a leak found, 2 something could not be read.
 */
export function runRedactCheckCli(args) {
  const usage = "usage: redact-check.mjs <run-dir> [--project <dir>]";
  let current = "";
  try {
    const rest = [...args];
    let project = null;
    const flag = rest.indexOf("--project");
    if (flag !== -1) {
      project = rest[flag + 1] ?? null;
      if (project === null) throw new CliError(usage);
      rest.splice(flag, 2);
    }
    if (rest.length !== 1) throw new CliError(usage);
    const runDir = rest[0];

    current = runDir;
    if (!lstatSync(runDir).isDirectory()) throw new CliError(`cannot read ${runDir} (is not a folder)`);
    const names = walk(runDir);
    const files = [];
    for (const rel of names) {
      current = path.join(runDir, rel);
      if (isBinary(current)) continue;
      files.push({ path: rel, text: readFileSync(current, "utf8") });
    }
    let envValues = [];
    if (project !== null) {
      current = project;
      envValues = readEnvValues(project);
    }
    const leaks = findLeaks(files, envValues);
    for (const l of leaks) console.log(`leak: ${l.file}:${l.line} (${l.kind})`);
    if (leaks.length > 0) {
      console.log(`leaks: ${leaks.length}`);
      return 1;
    }
    console.log(`clean: ${names.length} files`);
    return 0;
  } catch (err) {
    if (err instanceof CliError) console.error(err.message);
    else if (err?.code) console.error(`cannot read ${current} (${reason(err)})`);
    else console.error("error: unexpected failure");
    return 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runRedactCheckCli(process.argv.slice(2));
}
