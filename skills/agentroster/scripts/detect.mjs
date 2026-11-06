// Decides which files a scan may read. Read-only: never runs project code and
// never opens secret files. Pattern matching and candidates are added later.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { compareText } from "./lib/order.mjs";

/** @typedef {"ignored"|"dependencies"|"build_output"|"run_folder"|"secret_file"|"link"|"binary"|"too_large"} SkipReason */

const DEPENDENCY_DIRS = new Set(["node_modules", ".venv", "venv", "vendor", "__pycache__"]);
const BUILD_DIRS = new Set(["dist", "build"]);
const RUN_DIRS = new Set([".agentroster"]);

/** @returns {Record<SkipReason, number>} */
function emptyCounts() {
  return {
    ignored: 0, dependencies: 0, build_output: 0, run_folder: 0,
    secret_file: 0, link: 0, binary: 0, too_large: 0,
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
    name === ".env" || name.startsWith(".env.") ||
    /\.(pem|key|p12|pfx)$/.test(name) ||
    name.startsWith("id_rsa") || name.startsWith("id_ed25519") ||
    lower.includes("credential") || lower.includes("secret")
  );
}

/**
 * Run git in a folder. Returns null if git is missing or fails.
 * @param {string} root
 * @param {string[]} args
 * @returns {string|null}
 */
function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      stdio: ["ignore", "pipe", "ignore"],
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
  const entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  for (const e of entries) {
    if (e.name === ".git") continue;
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) { skipped.link++; continue; }
    if (e.isDirectory()) {
      const why = dirReason(e.name);
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
 * Throws the system error (code kept) if the folder is missing or unreadable.
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
        const why = segs.slice(0, -1).map(dirReason).find(Boolean);
        if (why) { skipped[why]++; continue; }
        if (isSecretName(segs[segs.length - 1])) { skipped.secret_file++; continue; }
        let st;
        try { st = fs.lstatSync(path.join(root, p)); } catch { continue; }
        if (st.isSymbolicLink()) { skipped.link++; continue; }
        if (st.isFile()) files.push(p);
      }
      files.sort(compareText);
      return { files, skipped };
    }
  }
  walk(root, "", files, skipped);
  files.sort(compareText);
  return { files, skipped };
}
