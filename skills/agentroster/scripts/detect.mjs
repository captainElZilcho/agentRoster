// Decides which files a scan may read. Read-only: never runs project code and
// never opens secret files. Pattern matching and candidates are added later.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { compareText } from "./lib/order.mjs";

/** @typedef {"ignored"|"dependencies"|"build_output"|"run_folder"|"secret_file"|"link"|"binary"|"too_large"|"unreadable"} SkipReason */

const DEPENDENCY_DIRS = new Set(["node_modules", ".venv", "venv", "vendor", "__pycache__"]);
const BUILD_DIRS = new Set(["dist", "build"]);
const RUN_DIRS = new Set([".agentroster"]);

/** @returns {Record<SkipReason, number>} */
function emptyCounts() {
  return {
    ignored: 0, dependencies: 0, build_output: 0, run_folder: 0,
    secret_file: 0, link: 0, binary: 0, too_large: 0, unreadable: 0,
  };
}

/**
 * Why a folder name is skipped, or null.
 * @param {string} name
 * @returns {SkipReason|null}
 */
function dirReason(name) {
  if (DEPENDENCY_DIRS.has(name)) return "dependencies";
  if (BUILD_DIRS.has(name)) return "build_output";
  if (RUN_DIRS.has(name)) return "run_folder";
  return null;
}

/**
 * True when a file name looks like a secret. These files are never opened.
 * @param {string} name
 * @returns {boolean}
 */
function isSecretName(name) {
  const lower = name.toLowerCase();
  return (
    lower === ".env" || lower.startsWith(".env.") ||
    /\.(pem|key|p12|pfx|kdbx)$/.test(lower) ||
    /^id_(rsa|ed25519|ecdsa|dsa)/.test(lower) ||
    lower === ".netrc" || lower === ".npmrc" || lower === ".pypirc" || lower === ".pgpass" ||
    lower.includes("credential") || lower.includes("secret")
  );
}

/** Folder names whose contents are secret. */
const SECRET_DIRS = new Set([".ssh"]);

/** Environment for git: no caller GIT_* variables, no system config. */
function gitEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("GIT_")) delete env[k];
  env.GIT_CONFIG_NOSYSTEM = "1";
  return env;
}

/**
 * Run git in a folder. Returns null if git is missing or fails.
 * @param {string} root
 * @param {string[]} args
 * @returns {string|null}
 */
function git(root, args) {
  try {
    return execFileSync("git", [
      "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", "core.hooksPath=/dev/null",
      "-C", root, ...args,
    ], {
      stdio: ["ignore", "pipe", "ignore"],
      env: gitEnv(),
      maxBuffer: 256 * 1024 * 1024,
    }).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Walk a folder without following links. A skipped folder counts once.
 * @param {string} root
 * @param {string} rel
 * @param {string[]} files
 * @param {Record<SkipReason, number>} skipped
 */
function walk(root, rel, files, skipped) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch (err) {
    if (rel === "") throw err;
    skipped.unreadable++;
    return;
  }
  for (const e of entries) {
    if (e.name === ".git") continue;
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) { skipped.link++; continue; }
    if (e.isDirectory()) {
      const why = SECRET_DIRS.has(e.name.toLowerCase()) ? "secret_file" : dirReason(e.name);
      if (why) skipped[why]++;
      else walk(root, childRel, files, skipped);
    } else if (e.isFile()) {
      if (isSecretName(e.name)) skipped.secret_file++;
      else files.push(childRel);
    }
  }
}

/**
 * List the files a scan may read, relative to `root`, with counts of what was skipped.
 * Uses git when `root` is inside a work tree (so ignored files stay out), else walks the folder.
 * Throws the system error (code kept) if `root` is missing or unreadable; an unreadable nested folder is
 * counted as `unreadable`. Count units: in the walk a skipped folder counts once; in git mode skip reasons
 * count per file and `ignored` counts git's `--directory` entries.
 * Callers must open listed files without following links (a link may replace a file after listing).
 * @param {string} root
 * @returns {{files: string[], skipped: Record<SkipReason, number>}}
 */
export function listFiles(root) {
  const skipped = emptyCounts();
  /** @type {string[]} */
  const files = [];
  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== null && inside.trim() === "true") {
    const split = (s) => s.split("\0").filter(Boolean);
    const listed = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
    const ignored = git(root, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory"]);
    if (listed !== null && ignored !== null) {
      skipped.ignored = split(ignored).filter((p) => !p.split("/").includes(".git")).length;
      for (const p of new Set(split(listed))) {
        const segs = p.split("/");
        if (segs.includes(".git")) continue;
        const why = segs.slice(0, -1)
          .map((n) => (SECRET_DIRS.has(n.toLowerCase()) ? "secret_file" : dirReason(n))).find(Boolean);
        if (why) { skipped[why]++; continue; }
        if (isSecretName(segs[segs.length - 1])) { skipped.secret_file++; continue; }
        // Every part of the path must be a real entry: a linked parent folder could lead outside root.
        let st = null;
        let linked = false;
        for (let i = 1; i <= segs.length && !linked; i++) {
          try { st = fs.lstatSync(path.join(root, ...segs.slice(0, i))); } catch { st = null; break; }
          if (st.isSymbolicLink()) linked = true;
        }
        if (linked) { skipped.link++; continue; }
        if (st && st.isFile()) files.push(p);
      }
      files.sort(compareText);
      return { files, skipped };
    }
  }
  walk(root, "", files, skipped);
  files.sort(compareText);
  return { files, skipped };
}
