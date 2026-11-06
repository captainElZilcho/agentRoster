// Compare a run with a reviewed answer key (a "golden set"). Pure functions, read-only.
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { compareText, canonicalJson, keySortedJson } from "./lib/order.mjs";
import { isEntryPoint } from "./lib/cli.mjs";
import { validateRosterFile } from "./validate-card.mjs";
import { validateCoverage } from "./validate-coverage.mjs";

const LINE_TOLERANCE = 3;

const EXACT_FIELDS = [
  "kind", "type", "secondary", "autonomy", "memory.scope", "guardrails.permission",
  "guardrails.data", "guardrails.limits", "org.reports_to", "org.group", "handoffs.from",
  "handoffs.to", "tools.allow", "tools.deny", "tools.mcp", "skills", "engine.model",
  "engine.effort", "source.files",
];

const PRESENT_FIELDS = [
  "name", "purpose", "role", "goals", "instructions", "context", "io.in", "io.out", "io.report",
  "runtime", "guardrails.needs_approval", "guardrails.forbidden", "memory.where", "memory.retention",
];

const getPath = (obj, path) =>
  path.split(".").reduce((v, k) => (v !== null && typeof v === "object" ? v[k] : undefined), obj);

const isEmpty = (v) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Sorted, de-duplicated list (by canonical JSON) so lists compare as sets. */
function asSet(list) {
  const byKey = new Map();
  for (const item of list) byKey.set(canonicalJson(item), item);
  return [...byKey.keys()].sort(compareText).map((k) => byKey.get(k));
}

function exactValue(card, path) {
  const v = getPath(card, path);
  if (path === "skills") return Array.isArray(v) ? asSet(v.map((s) => s?.name ?? null)) : null;
  if (path === "source.files") return Array.isArray(v) ? asSet(v.map((f) => f?.path ?? null)) : null;
  if (Array.isArray(v)) return asSet(v);
  return v === undefined ? null : v;
}

const sortDiffs = (list) =>
  list.sort((a, b) => compareText(a.where, b.where) || compareText(a.field ?? "", b.field ?? ""));

const diff = (where, field, message) => ({ where, field, message });
const expectedGot = (e, g) => `expected ${JSON.stringify(e)}, got ${JSON.stringify(g)}`;

/** Evidence items under `field`, a deeper key, or a parent key (`io` counts for `io.in`). */
function evidenceFor(card, field) {
  const out = [];
  const evidence = card?.evidence;
  if (!evidence || typeof evidence !== "object") return out;
  for (const key of Object.keys(evidence).sort(compareText)) {
    if ((key === field || key.startsWith(`${field}.`) || field.startsWith(`${key}.`)) && Array.isArray(evidence[key])) {
      out.push(...evidence[key]);
    }
  }
  return out;
}

const lineStr = (l) => (l === null || l === undefined ? "*" : String(l));

function lineNear(keyLine, runLine) {
  if (keyLine === null || keyLine === undefined) return true;
  if (runLine === null || runLine === undefined) return false;
  return Math.abs(keyLine - runLine) <= LINE_TOLERANCE;
}

function matchPresent(where, field, key, run, out) {
  const keyEmpty = isEmpty(getPath(key, field));
  const runEmpty = isEmpty(getPath(run, field));
  if (keyEmpty && runEmpty) return;
  if (!keyEmpty && runEmpty) return out.push(diff(where, field, "expected a value, got empty"));
  if (keyEmpty && !runEmpty) return out.push(diff(where, field, "expected empty, got a value"));
  const keyEv = evidenceFor(key, field);
  if (keyEv.length === 0) return;
  const runEv = evidenceFor(run, field);
  const ok = runEv.some((r) =>
    keyEv.some((k) => k.file === r.file && (k.line == null ? true : r.line != null && lineNear(k.line, r.line))));
  if (!ok) out.push(diff(where, field, `no evidence near ${keyEv[0].file}:${lineStr(keyEv[0].line)}`));
}

/**
 * Compare cards by id.
 * @returns {Array<{where: string, field: string|null, message: string}>}
 */
export function matchCards(expectedCards, actualCards) {
  const out = [];
  const exp = new Map((expectedCards ?? []).map((c) => [c.id, c]));
  const act = new Map((actualCards ?? []).map((c) => [c.id, c]));
  for (const [id, key] of exp) {
    const where = `card ${id}`;
    const run = act.get(id);
    if (!run) { out.push(diff(where, null, "missing card")); continue; }
    for (const field of EXACT_FIELDS) {
      const e = exactValue(key, field);
      const g = exactValue(run, field);
      if (keySortedJson(e) !== keySortedJson(g)) out.push(diff(where, field, expectedGot(e, g)));
    }
    for (const field of PRESENT_FIELDS) matchPresent(where, field, key, run, out);
  }
  for (const id of act.keys()) if (!exp.has(id)) out.push(diff(`card ${id}`, null, "extra card"));
  return sortDiffs(out);
}

const setOf = (v) => asSet(Array.isArray(v) ? v : []);

/**
 * Compare coverage candidates (paired by file and nearby line) and unknowns (by card + field).
 */
export function matchCoverage(expectedCoverage, actualCoverage) {
  const out = [];
  const byPos = (a, b) => compareText(a.file, b.file) || (a.line ?? -1) - (b.line ?? -1);
  const keys = [...(expectedCoverage?.candidates ?? [])].sort(byPos);
  const unpaired = [...(actualCoverage?.candidates ?? [])].sort(byPos);
  for (const key of keys) {
    const where = `candidate ${key.file}:${lineStr(key.line)}`;
    // Greedy nearest-first pairing. It can miss a pairing in rare crowded cases; fine for 0.1.
    let best = -1;
    let bestDist = Infinity;
    unpaired.forEach((c, i) => {
      if (c.file !== key.file) return;
      let dist;
      if (key.line == null || c.line == null) dist = key.line == null && c.line == null ? 0 : Infinity;
      else dist = Math.abs(key.line - c.line);
      if (dist <= LINE_TOLERANCE && dist < bestDist) { best = i; bestDist = dist; }
    });
    if (best < 0) { out.push(diff(where, null, "missing candidate")); continue; }
    const [run] = unpaired.splice(best, 1);
    const sets = { signals: true, cards: true };
    for (const f of ["signals", "status", "outcome", "cards"]) {
      const e = sets[f] ? setOf(key[f]) : (key[f] ?? null);
      const g = sets[f] ? setOf(run[f]) : (run[f] ?? null);
      if (keySortedJson(e) !== keySortedJson(g)) out.push(diff(where, f, expectedGot(e, g)));
    }
  }
  for (const c of unpaired) out.push(diff(`candidate ${c.file}:${lineStr(c.line)}`, null, "extra candidate"));

  const uKey = (u) => `${u.card}.${u.field}`;
  const actUnknowns = new Map();
  for (const u of actualCoverage?.unknowns ?? []) {
    if (!actUnknowns.has(uKey(u))) actUnknowns.set(uKey(u), []);
    actUnknowns.get(uKey(u)).push(u);
  }
  for (const key of expectedCoverage?.unknowns ?? []) {
    const where = `unknown ${uKey(key)}`;
    const run = actUnknowns.get(uKey(key))?.shift();
    if (!run) { out.push(diff(where, null, "missing unknown")); continue; }
    if (key.reason !== run.reason) out.push(diff(where, "reason", expectedGot(key.reason ?? null, run.reason ?? null)));
  }
  for (const list of actUnknowns.values()) {
    for (const u of list) out.push(diff(`unknown ${uKey(u)}`, null, "extra unknown"));
  }
  return sortDiffs(out);
}

/**
 * Report files that contain a forbidden string. The string itself is never returned.
 */
export function findForbidden(forbiddenStrings, files) {
  const out = [];
  const needles = (forbiddenStrings ?? []).filter((s) => typeof s === "string" && s !== "");
  for (const f of files ?? []) {
    if (needles.some((s) => String(f.text ?? "").includes(s))) {
      out.push(diff(`file ${f.path}`, null, "contains a forbidden string"));
    }
  }
  return sortDiffs(out);
}

/**
 * Replace every forbidden string in `text` (raw or JSON-escaped) with "[forbidden string]".
 * Covered ranges are found in the original text, overlaps included, then merged, so no tail is left.
 */
export function scrubForbidden(text, forbiddenStrings) {
  if (typeof text !== "string") return text;
  const needles = new Set();
  for (const s of forbiddenStrings ?? []) {
    if (typeof s !== "string" || s === "") continue;
    needles.add(s);
    const escaped = JSON.stringify(s).slice(1, -1);
    if (escaped !== s) needles.add(escaped);
  }
  const ranges = [];
  for (const n of needles) {
    for (let i = text.indexOf(n); i !== -1; i = text.indexOf(n, i + 1)) ranges.push([i, i + n.length]);
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0].slice()];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  let out = "";
  let pos = 0;
  for (const [start, end] of merged) {
    out += text.slice(pos, start) + "[forbidden string]";
    pos = end;
  }
  return out + text.slice(pos);
}

const cardsOf = (roster) => (Array.isArray(roster) ? roster : roster?.cards ?? []);

/**
 * Compare a whole run with a golden set. `expect` is null or `{forbidden_strings: string[], notes: string[]}`; the listed strings must not appear.
 * With `options.only === "coverage"`, cards are not compared (rosters may be absent).
 * Throws a TypeError when `expect` is set but `forbidden_strings` is not a list.
 * @returns {{match: boolean, differences: Array<{where: string, field: string|null, message: string}>}}
 */
export function matchGolden(expected, actual, options = {}) {
  const expect = expected?.expect ?? null;
  if (expect !== null && !Array.isArray(expect.forbidden_strings)) {
    throw new TypeError("expect.forbidden_strings must be a list");
  }
  const forbidden = expect?.forbidden_strings ?? [];
  const scrub = (text) => scrubForbidden(text, forbidden);
  const fromRun = [
    ...(options?.only === "coverage" ? [] : matchCards(cardsOf(expected?.roster), cardsOf(actual?.roster))),
    ...matchCoverage(expected?.coverage, actual?.coverage),
  ].map((d) => ({ where: scrub(d.where), field: scrub(d.field), message: scrub(d.message) }));
  const differences = sortDiffs([...fromRun, ...findForbidden(forbidden, actual?.files ?? [])]);
  return { match: differences.length === 0, differences };
}

// Command line: match-golden.mjs [--only coverage] <expected-dir> <run-dir>

const USAGE = "usage: match-golden.mjs [--only coverage] <expected-dir> <run-dir>";

class CliError extends Error {}

const reason = (err) =>
  err?.code === "ENOENT" ? "not found" : err?.code === "EACCES" || err?.code === "EPERM" ? "no permission" : (err?.code ?? "error");
const cannotRead = (file, err) => new CliError(`cannot read ${file} (${reason(err)})`);

const readText = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    throw cannotRead(file, err);
  }
};

function readJson(file) {
  try {
    return JSON.parse(readText(file).replace(/^\uFEFF/, ""));
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError(`not valid JSON: ${file}`);
  }
}

function readExpect(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw cannotRead(file, err);
  }
  let doc;
  try {
    doc = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new CliError(`not valid JSON: ${file}`);
  }
  const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!doc || typeof doc !== "object" || !strings(doc.forbidden_strings) || !strings(doc.notes)) {
    throw new CliError("expect.json: must have forbidden_strings and notes lists");
  }
  return doc;
}

/** Every regular file under `dir` (symlinks and other entries skipped), read as UTF-8. */
function readFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    let names;
    try {
      names = readdirSync(abs).sort(compareText);
    } catch (err) {
      throw cannotRead(abs, err);
    }
    for (const name of names) {
      const full = path.join(abs, name);
      const shown = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = lstatSync(full);
      } catch (err) {
        throw cannotRead(full, err);
      }
      if (st.isDirectory()) walk(full, shown);
      else if (st.isFile()) out.push({ path: shown, text: readText(full) });
    }
  };
  walk(dir, "");
  return out;
}

function load(side, dir, onlyCoverage) {
  const roster = onlyCoverage ? null : readJson(path.join(dir, "roster.json"));
  const coverage = readJson(path.join(dir, "coverage.json"));
  if (!onlyCoverage && !validateRosterFile(roster).valid) {
    throw new CliError(`invalid ${side} roster.json: run validate-card / validate-coverage for details`);
  }
  if (!validateCoverage(coverage).valid) {
    throw new CliError(`invalid ${side} coverage.json: run validate-card / validate-coverage for details`);
  }
  return { roster, coverage };
}

/** @returns {number} Exit code: 0 match, 1 differences, 2 error. */
export function runMatchCli(args) {
  try {
    const onlyCoverage = args[0] === "--only";
    if (onlyCoverage && args[1] !== "coverage") throw new CliError(USAGE);
    const [expectedDir, runDir, ...extra] = onlyCoverage ? args.slice(2) : args;
    if (!expectedDir || !runDir || extra.length > 0) {
      throw new CliError(USAGE);
    }
    const expected = { ...load("expected", expectedDir, onlyCoverage), expect: readExpect(path.join(expectedDir, "expect.json")) };
    const actual = { ...load("run", runDir, onlyCoverage), files: readFiles(runDir) };
    // roster.json and coverage.json may be symlinks (skipped by readFiles); scan what was actually read.
    for (const name of onlyCoverage ? ["coverage.json"] : ["roster.json", "coverage.json"]) {
      if (!actual.files.some((f) => f.path === name)) actual.files.push({ path: name, text: readText(path.join(runDir, name)) });
    }
    const result = matchGolden(expected, actual, { only: onlyCoverage ? "coverage" : undefined });
    for (const d of result.differences) {
      console.log(d.field === null ? `${d.where}: ${d.message}` : `${d.where}: ${d.field}: ${d.message}`);
    }
    if (result.match) {
      const n = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
      const cards = onlyCoverage ? "" : `${n(cardsOf(expected.roster).length, "card")}, `;
      console.log(`match: ${cards}${n(expected.coverage.candidates.length, "candidate")}, ${n(expected.coverage.unknowns.length, "unknown")}`);
      return 0;
    }
    console.log(`differences: ${result.differences.length}`);
    return 1;
  } catch (err) {
    console.error(err instanceof CliError ? err.message : `error: ${err?.code ?? err?.message ?? "unexpected failure"}`.split("\n")[0]);
    return 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runMatchCli(process.argv.slice(2));
}
