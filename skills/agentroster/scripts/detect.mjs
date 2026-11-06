// The repeatable floor of the map phase. Lists the files a scan may read, then finds the common,
// obvious signs of agents and workflows (SDK imports, direct SDK calls, agent and skill files,
// MCP config, roster cards) from a pattern file. Read-only: never runs project code, never opens
// secret files, never follows links, never puts a file's text in the output.
//
// Command: detect.mjs <project-dir> [--out <file>] [--exclude <dir>]...
// Output (the working file detect.json, format "detect": "0.1"):
//   {"detect": "0.1", "ecosystems": [...], "candidates": [...], "skipped": {...}}
//   candidate: {file, line, signals, detail, ecosystems}. `line` is null for a whole-file signal.
//   `detail` is fixed text from the pattern. Lists are sorted; same input gives the same output.
//   `skipped` counts what was not read, by reason (see listFiles). `--exclude` folders count as
//   run_folder, one per skipped file.
//
// Known limits: lines are matched one at a time, so the script cannot see inside multi-line
// strings or block comments, and imports combined on one line (`import os, anthropic`) are missed.
// A call pattern (`llm-call`) counts only when its `requires` ecosystem has an import in the same
// file. The agent search covers what the floor leaves out.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { compareText } from "./lib/order.mjs";
import { isEntryPoint } from "./lib/cli.mjs";

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

const ECOSYSTEMS = ["anthropic-sdk", "openai-sdk", "claude-agent-sdk", "langgraph", "crewai", "claude-code", "mcp", "roster"];
const SIGNALS = ["llm-import", "llm-call", "claude-agent-file", "skill-file", "mcp-config", "roster-card", "prompt-file", "other"];
const MAX_BYTES = 1024 * 1024;
const SNIFF_BYTES = 8 * 1024;

/**
 * @typedef {object} Pattern
 * @property {string} ecosystem
 * @property {string} signal
 * @property {string} files A glob matched against the relative path: `**`, `*`, `?`, `{a,b}`.
 * @property {string|null} line A JavaScript regex source applied to one line, or null for a whole-file signal.
 * @property {string} detail Fixed text for the candidate.
 * @property {string|null} [requires] Ecosystem whose `llm-import` must be in the same file; needed for `llm-call`.
 */

/**
 * @typedef {object} Candidate
 * @property {string} file
 * @property {number|null} line
 * @property {string[]} signals
 * @property {string} detail
 * @property {string[]} ecosystems
 */

/**
 * @typedef {object} DetectResult
 * @property {"0.1"} detect
 * @property {string[]} ecosystems
 * @property {Candidate[]} candidates
 * @property {Record<SkipReason, number>} skipped
 */

/**
 * Read and check a pattern file. Throws an Error naming the entry that is wrong.
 * @param {string|URL} [file] Default: the shipped patterns.json.
 * @returns {Pattern[]}
 */
export function loadPatterns(file = new URL("../ecosystems/patterns.json", import.meta.url)) {
  const label = file instanceof URL ? "patterns.json" : String(file);
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`cannot read patterns file ${label} (${err.code ?? err.message})`);
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.patterns)) {
    throw new Error(`bad patterns file ${label}: "patterns" must be a list`);
  }
  doc.patterns.forEach((p, i) => {
    const bad = (why) => new Error(`bad patterns file ${label}: entry ${i}: ${why}`);
    if (!p || typeof p !== "object") throw bad("must be an object");
    if (!ECOSYSTEMS.includes(p.ecosystem)) throw bad(`ecosystem must be one of ${ECOSYSTEMS.join(", ")}`);
    if (!SIGNALS.includes(p.signal)) throw bad(`signal must be one of ${SIGNALS.join(", ")}`);
    if (typeof p.files !== "string" || p.files === "") throw bad("files must be a glob string");
    if (typeof p.detail !== "string" || p.detail === "") throw bad("detail must be a text");
    const req = p.requires ?? null;
    if (req !== null && !ECOSYSTEMS.includes(req)) throw bad("requires must be null or a known ecosystem");
    if (p.signal === "llm-call" && req === null) throw bad("requires must name an ecosystem for an llm-call pattern");
    if (req !== null && p.signal !== "llm-call") throw bad("requires is only for llm-call patterns");
    if (p.line !== null) {
      if (typeof p.line !== "string") throw bad("line must be a regex string or null");
      try { new RegExp(p.line); } catch (err) { throw bad(`line is not a valid regex (${err.message})`); }
    }
  });
  return doc.patterns;
}

/**
 * Turn a glob into a regex. `**` + `/` matches zero or more folders, `**` matches anything,
 * `*` stays inside one folder, `?` is one character, `{a,b}` is a choice.
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; out += "(?:.*/)?"; } else out += ".*";
      } else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else if (c === "{") { depth++; out += "(?:"; }
    else if (c === "}" && depth > 0) { depth--; out += ")"; }
    else if (c === "," && depth > 0) out += "|";
    else out += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/**
 * Read a listed file once, without following links. Returns its text, or why it was skipped.
 * @param {string} full
 * @param {boolean} needText False: only look for binary and size.
 * @returns {{text: string|null}|{skip: "binary"|"too_large"|"unreadable"}}
 */
function readListed(full, needText) {
  let fd;
  try {
    fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return { skip: "unreadable" };
    if (st.size > MAX_BYTES) return { skip: "too_large" };
    const buf = Buffer.alloc(Math.min(st.size, needText ? MAX_BYTES : SNIFF_BYTES));
    let got = 0;
    while (got < buf.length) {
      const n = fs.readSync(fd, buf, got, buf.length - got, got);
      if (n === 0) break;
      got += n;
    }
    const data = buf.subarray(0, got);
    if (data.subarray(0, SNIFF_BYTES).includes(0)) return { skip: "binary" };
    return { text: needText ? data.toString("utf8").replace(/^\uFEFF/, "") : null };
  } catch {
    return { skip: "unreadable" };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Find candidates in a project: places that look like an agent or a workflow.
 * @param {string} root
 * @param {Pattern[]} [patterns] Default: the shipped patterns.
 * @param {{exclude?: string[]}} [options] `exclude`: folders relative to `root` to skip (counted as run_folder).
 * @returns {DetectResult}
 */
export function detect(root, patterns = loadPatterns(), options = {}) {
  const { files, skipped } = listFiles(root);
  const excluded = (options.exclude ?? [])
    .map((e) => path.relative(path.resolve(root), path.resolve(root, e)).split(path.sep).join("/"))
    .filter((e) => e !== "" && e !== ".." && !e.startsWith("../") && !path.isAbsolute(e));
  const compiled = patterns.map((p) => ({ p, glob: globToRegExp(p.files), re: p.line === null ? null : new RegExp(p.line) }));
  /** @type {Map<string, {file: string, line: number|null, signals: Set<string>, details: string[], ecosystems: Set<string>}>} */
  const found = new Map();
  const add = (file, line, p) => {
    const key = `${file}\0${line}`;
    let c = found.get(key);
    if (!c) { c = { file, line, signals: new Set(), details: [], ecosystems: new Set() }; found.set(key, c); }
    c.signals.add(p.signal);
    c.ecosystems.add(p.ecosystem);
    c.details.push(p.detail);
  };
  for (const file of files) {
    if (excluded.some((e) => file === e || file.startsWith(`${e}/`))) { skipped.run_folder++; continue; }
    const hits = compiled.filter((c) => c.glob.test(file));
    const needText = hits.some((c) => c.re !== null);
    const got = readListed(path.join(root, file), needText);
    if ("skip" in got) { skipped[got.skip]++; continue; }
    for (const c of hits) if (c.re === null) add(file, null, c.p);
    if (got.text === null) continue;
    const lines = got.text.split(/\r?\n/);
    /** @type {Array<[number, Pattern]>} */
    const lineHits = [];
    for (let i = 0; i < lines.length; i++) {
      for (const c of hits) if (c.re !== null && c.re.test(lines[i])) lineHits.push([i + 1, c.p]);
    }
    const imported = new Set(lineHits.filter(([, p]) => p.signal === "llm-import").map(([, p]) => p.ecosystem));
    for (const [n, p] of lineHits) {
      if (p.signal === "llm-call" && !imported.has(p.requires)) continue;
      add(file, n, p);
    }
  }
  const candidates = [...found.values()]
    .map((c) => ({
      file: c.file, line: c.line, signals: [...c.signals].sort(compareText),
      detail: c.details.join("; "), ecosystems: [...c.ecosystems].sort(compareText),
    }))
    .sort((a, b) => compareText(a.file, b.file) || (a.line === b.line ? 0 : a.line === null ? -1 : b.line === null ? 1 : a.line - b.line));
  const ecosystems = [...new Set(candidates.flatMap((c) => c.ecosystems))].sort(compareText);
  return { detect: "0.1", ecosystems, candidates, skipped };
}

const USAGE = "usage: detect.mjs <project-dir> [--out <file>] [--exclude <dir>]...";

/** @param {{code?: string, message: string}} err */
function reason(err) {
  switch (err.code) {
    case "ENOENT": return "not found";
    case "ENOTDIR": return "not a folder";
    case "EACCES": case "EPERM": return "no permission";
    default: return err.message;
  }
}

/**
 * The command. Returns the exit code: 0 ran, 2 bad arguments or a folder that cannot be read.
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv) {
  /** @type {string[]} */ const positional = [];
  /** @type {string[]} */ const exclude = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" || a === "--exclude") {
      const v = argv[++i];
      if (v === undefined) { console.error(USAGE); return 2; }
      if (a === "--out") out = v; else exclude.push(v);
    } else if (a.startsWith("--")) { console.error(USAGE); return 2; }
    else positional.push(a);
  }
  if (positional.length !== 1) { console.error(USAGE); return 2; }
  const dir = positional[0];
  let patterns;
  try {
    patterns = loadPatterns();
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  let result;
  try {
    result = detect(dir, patterns, { exclude });
  } catch (err) {
    console.error(`cannot read ${dir} (${reason(err)})`);
    return 2;
  }
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out === null) {
    process.stdout.write(text);
  } else {
    try {
      fs.writeFileSync(out, text);
    } catch (err) {
      console.error(`cannot write ${out} (${reason(err)})`);
      return 2;
    }
  }
  return 0;
}

if (isEntryPoint(import.meta.url)) process.exitCode = main(process.argv.slice(2));
