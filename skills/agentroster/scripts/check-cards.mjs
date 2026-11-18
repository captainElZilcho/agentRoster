// Checks a run's cards against its map and coverage: the same ids in all three,
// evidence for every filled value, evidence keys that name real fields, relative
// evidence paths, unknown fields left empty, and workflow steps that report to the
// workflow; with the project, that every quote is on the line it cites, and, when the project
// has an agentroster.json, that each stored answer is on its card (stale answers are noted).
// Usage: check-cards.mjs <run-dir> --project <dir>

import { lstatSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isEntryPoint } from "./lib/cli.mjs";
import { canonicalJson, compareText } from "./lib/order.mjs";
import { validateRosterFile } from "./validate-card.mjs";
import { validateCoverage } from "./validate-coverage.mjs";
import { inventoryIds } from "./check-map.mjs";
import { validateAnswers } from "./validate-answers.mjs";

const TYPE_CODES = JSON.parse(
  readFileSync(new URL("../schema/roster-card-0.2.schema.json", import.meta.url), "utf8"),
).$defs.type.enum;
const CONFIDENCE = ["high", "medium", "low"];
const ANSWERS_FILE = "agentroster.json";

/** Is the card's type set by a person: a hand card or the answers file? */
const typeByHand = (card) => (card.evidence?.type ?? []).some((i) => i?.found_by === "hand");
/** Is it set by a hand card (not the answers file)? A hand card wins over an answer. */
const typeByHandCard = (card) => (card.evidence?.type ?? []).some((i) => i?.found_by === "hand" && i.file !== ANSWERS_FILE);

/** The extension that holds data the card view needs and the core has no field for. */
export const CARD_VIEW_NS = "io.github.captainelzilcho.agentroster.card-view/v1";

/** Card fields whose filled values must carry evidence. */
const EVIDENCED_FIELDS = [
  "name", "purpose", "role", "goals", "instructions", "context", "skills",
  "tools.allow", "tools.deny", "tools.mcp", "engine.model", "runtime",
  "io.in", "io.out", "io.report",
  "guardrails.permission", "guardrails.forbidden", "guardrails.needs_approval", "guardrails.data",
  "guardrails.limits.turns", "guardrails.limits.minutes", "guardrails.limits.usd",
  "memory.scope", "memory.where", "memory.retention",
  "handoffs.from", "handoffs.to", "org.reports_to", "org.group",
];

const getPath = (obj, p) =>
  p.split(".").reduce((v, k) => (v !== null && typeof v === "object" && Object.hasOwn(v, k) ? v[k] : undefined), obj);

/** Is a value filled: not null, "", [], or an object whose values are all empty? */
function isFilled(v) {
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.values(v).some(isFilled);
  return true;
}

/** Does any evidence key cover this field (the field itself, a child or a parent)? */
const covered = (keys, field) =>
  keys.some((k) => k === field || k.startsWith(`${field}.`) || field.startsWith(`${k}.`));

/** A repo-relative path with forward slashes and no ".." segment. */
const goodPath = (file) =>
  typeof file === "string" && !file.startsWith("/") && !file.includes("\\") && !file.split("/").includes("..");

function checkEvidenceItems(id, map, errors) {
  for (const items of Object.values(map ?? {})) {
    for (const item of Array.isArray(items) ? items : []) {
      if (!goodPath(item?.file)) {
        errors.push(`card "${id}": evidence path "${item?.file}" must be relative with forward slashes`);
      }
    }
  }
}

function checkCard(card, byId, unknowns, errors) {
  const id = card.id;
  const evidence = card.evidence ?? {};
  const keys = Object.keys(evidence);

  for (const key of keys) {
    if (key === "evidence" || getPath(card, key) === undefined) {
      errors.push(`card "${id}": evidence key "${key}" is not a field on the card`);
    }
  }
  for (const field of EVIDENCED_FIELDS) {
    if (isFilled(getPath(card, field)) && !covered(keys, field)) {
      errors.push(`card "${id}": ${field} is filled but has no evidence`);
    }
  }
  checkEvidenceItems(id, evidence, errors);

  // io holds media types, as A2A's input and output modes do.
  for (const side of ["in", "out"]) {
    for (const mode of card.io?.[side] ?? []) {
      if (!/^[a-z]+\/[a-z0-9.+*-]+$/i.test(mode)) {
        errors.push(`card "${id}": io.${side} "${mode}" is not a media type like "text/plain"`);
      }
    }
  }

  // A single value with an unknown stays empty. A list keeps the items the code shows: its
  // unknown says the list may be incomplete (for example an MCP server's tools in a package).
  for (const u of unknowns.filter((x) => x.card === id)) {
    const value = getPath(card, u.field);
    if (!Array.isArray(value) && isFilled(value)) {
      errors.push(`card "${id}": ${u.field} has an unknown in coverage.json but is filled`);
    }
  }

  for (const tool of Array.isArray(card.tools?.allow) ? card.tools.allow : []) {
    if (typeof tool === "string" && tool.startsWith("mcp__")) {
      errors.push(`card "${id}": tools.allow has the MCP tool "${tool}"; put it in tools.mcp`);
    }
  }

  const ext = card.extensions?.[CARD_VIEW_NS];
  if (ext && typeof ext === "object") {
    const extEvidence = ext.evidence && typeof ext.evidence === "object" ? ext.evidence : {};
    for (const [field, value] of Object.entries(ext)) {
      if (field === "evidence" || field === "stated_only" || field === "judgement") continue;
      if (isFilled(value) && !isFilled(extEvidence[field])) {
        errors.push(`card "${id}": extensions.${CARD_VIEW_NS}.${field} is filled but has no evidence`);
      }
    }
    checkEvidenceItems(id, extEvidence, errors);
    if (ext.judgement !== undefined) checkJudgement(card, ext.judgement, errors);
    if (card.kind === "agent") {
      for (const field of ["steps", "plain_steps"]) {
        if (isFilled(ext[field])) errors.push(`card "${id}": extensions.${CARD_VIEW_NS}.${field} is for workflows only`);
      }
    }
    if (isFilled(ext.starts) && card.org?.reports_to) {
      errors.push(`card "${id}": starts is only for a top-level card; it reports to "${card.org.reports_to}"`);
    }
    const sourcePaths = new Set((card.source?.files ?? []).map((f) => f?.path));
    for (const item of Array.isArray(extEvidence.starts) ? extEvidence.starts : []) {
      if (typeof item?.file === "string" && !sourcePaths.has(item.file)) {
        errors.push(`card "${id}": ${item.file} starts it but is not in source.files`);
      }
    }
    for (const step of Array.isArray(ext.steps) ? ext.steps : []) {
      if (byId.get(step)?.org?.reports_to !== id) {
        errors.push(`card "${id}": step "${step}" does not report to it`);
      }
    }
  }
}

function checkJudgement(card, judgement, errors) {
  const at = `card "${card.id}": extensions.${CARD_VIEW_NS}.judgement`;
  const keys = judgement && typeof judgement === "object" ? Object.keys(judgement) : [""];
  if (keys.some((k) => k !== "type")) return errors.push(`${at} may only hold "type"`);
  const j = judgement.type;
  if (j === undefined) return;
  if (typeByHand(card)) return errors.push(`card "${card.id}": judgement.type is for the scan's own pick; a person decided this type`);
  if (!CONFIDENCE.includes(j?.confidence)) errors.push(`${at}.type.confidence must be high, medium or low`);
  if (j?.confidence === "high") {
    if (j.runner_up !== null) errors.push(`${at}.type.runner_up must be null when confidence is high`);
  } else if (!TYPE_CODES.includes(j?.runner_up) || j.runner_up === card.type) {
    errors.push(`${at}.type.runner_up must be another type code`);
  }
  if (typeof j?.why !== "string" || j.why.trim() === "") errors.push(`${at}.type.why must say why`);
}

/**
 * Check a run's cards against its map and coverage.
 * @param {object} roster A valid roster file.
 * @param {object} coverage A valid coverage document.
 * @param {string} mapText The text of map.md.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function checkCards(roster, coverage, mapText) {
  const errors = [];
  const cards = roster.cards ?? [];
  const byId = new Map(cards.map((c) => [c.id, c]));

  const rosterIds = new Set(byId.keys());
  const mapIds = new Set(inventoryIds(mapText));
  const coverageIds = new Set((coverage.candidates ?? []).flatMap((c) => c.cards ?? []));
  const compare = (from, fromName, to, toName) => {
    for (const id of from) if (!to.has(id)) errors.push(`id "${id}" is in ${fromName} but not in ${toName}`);
  };
  compare(rosterIds, "roster.json", mapIds, "map.md");
  compare(rosterIds, "roster.json", coverageIds, "coverage.json");
  compare(mapIds, "map.md", rosterIds, "roster.json");
  compare(coverageIds, "coverage.json", rosterIds, "roster.json");

  if (canonicalJson(roster.snapshot ?? null) !== canonicalJson(coverage.snapshot ?? null)) {
    errors.push("roster.json's snapshot differs from coverage.json's: copy it from coverage.json");
  }

  const unknowns = coverage.unknowns ?? [];
  for (const card of cards) checkCard(card, byId, unknowns, errors);

  const sorted = [...new Set(errors)].sort(compareText);
  return { valid: sorted.length === 0, errors: sorted };
}

const squash = (s) => String(s).replace(/\s+/g, " ").trim();

/** Is the quote on the line? Spaces are collapsed, a quote may be part of the line, and a
 * quote with [redacted] must match the pieces around it, in order. */
function quoteOnLine(quote, line) {
  const text = squash(line);
  let at = 0;
  for (const piece of squash(quote).split("[redacted]").map((s) => s.trim()).filter(Boolean)) {
    const found = text.indexOf(piece, at);
    if (found < 0) return false;
    at = found + piece.length;
  }
  return true;
}

/**
 * Check that each evidence quote is on the line it cites in the project: card evidence, the
 * card-view extension's evidence and the coverage unknowns' evidence.
 * @param {object} roster A valid roster file.
 * @param {object} coverage A valid coverage document.
 * @param {(file: string) => string|null} readFile Reads a project file by its relative path; null if missing.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function checkQuotes(roster, coverage, readFile) {
  const errors = [];
  const files = new Map();
  const linesOf = (file) => {
    if (!files.has(file)) {
      const text = readFile(file);
      files.set(file, text === null ? null : text.replace(/^\uFEFF/, "").split(/\r?\n/));
    }
    return files.get(file);
  };
  const check = (where, item) => {
    if (!goodPath(item?.file)) return; // reported by the path check; never read
    const lines = linesOf(item.file);
    if (lines === null) return errors.push(`${where}: ${item.file} is not in the project`);
    if (item.line === null || item.line === undefined) return;
    if (item.line > lines.length) return errors.push(`${where}: ${item.file}:${item.line} is past the end of the file`);
    if (!quoteOnLine(item.quote ?? "", lines[item.line - 1])) {
      errors.push(`${where}: ${item.file}:${item.line} does not contain "${item.quote}"`);
    }
  };
  for (const card of roster.cards ?? []) {
    for (const [key, items] of Object.entries(card.evidence ?? {})) {
      for (const item of Array.isArray(items) ? items : []) check(`card "${card.id}": ${key} evidence`, item);
    }
    const ext = card.extensions?.[CARD_VIEW_NS]?.evidence ?? {};
    for (const [key, items] of Object.entries(ext)) {
      for (const item of Array.isArray(items) ? items : []) check(`card "${card.id}": card view ${key} evidence`, item);
    }
  }
  for (const u of coverage.unknowns ?? []) {
    for (const item of u.evidence ?? []) check(`unknown "${u.card}" ${u.field}: evidence`, item);
  }
  const sorted = [...new Set(errors)].sort(compareText);
  return { valid: sorted.length === 0, errors: sorted };
}

/**
 * Check that each stored answer is on its card: the type as written, with the answers file's
 * line that holds its "value" as the first type evidence (found_by "hand"). The file may be laid
 * out any way; checkQuotes proves the quote is on the cited line. A card whose type comes from a
 * hand card is skipped (the hand card wins); an answer for a card not in the roster is left to
 * staleAnswers.
 * @param {object} roster A valid roster file.
 * @param {object} answers A valid answers file.
 * @param {string} answersText The answers file's text.
 * @returns {{errors: string[]}}
 */
export function checkAnswers(roster, answers, answersText) {
  const errors = [];
  const lines = String(answersText).replace(/^\uFEFF/, "").split(/\r?\n/);
  const byId = new Map((roster.cards ?? []).map((c) => [c.id, c]));
  // a.value is a type code (the schema checked it), so it is safe inside the pattern.
  const isAnswerItem = (item, a) =>
    item?.file === ANSWERS_FILE && item?.found_by === "hand" && Number.isInteger(item?.line) &&
    new RegExp(`"value"\\s*:\\s*"${a.value}"`).test(lines[item.line - 1] ?? "");
  for (const a of answers.answers) {
    const card = byId.get(a.card);
    if (!card) continue;
    const items = card.evidence?.type ?? [];
    if (typeByHandCard(card)) {
      // The hand card wins; the card still records the answer it overrides.
      if (!items.some((i) => isAnswerItem(i, a))) {
        errors.push(`card "${a.card}": a hand card sets this type; also list the ${ANSWERS_FILE} line that holds its "value" in type evidence`);
      }
      continue;
    }
    if (card.type !== a.value) errors.push(`card "${a.card}": type is "${card.type}" but ${ANSWERS_FILE} says "${a.value}"`);
    if (!isAnswerItem(items[0], a)) {
      errors.push(`card "${a.card}": type evidence must start with the ${ANSWERS_FILE} line that holds its "value"`);
    }
  }
  return { errors };
}

/**
 * List stored answers that may no longer fit: their card is gone, or the line the pick was based
 * on is no longer anywhere in its file. Stale answers still apply; this only reports them.
 * @param {object} roster A valid roster file.
 * @param {object} answers A valid answers file.
 * @param {(file: string) => string|null} readFile Reads a project file by its relative path; null if missing.
 * @returns {string[]}
 */
export function staleAnswers(roster, answers, readFile) {
  const byId = new Map((roster.cards ?? []).map((c) => [c.id, c]));
  const out = [];
  for (const a of answers.answers) {
    const at = `answer "${a.card}" ${a.field}`;
    if (!byId.has(a.card)) {
      out.push(`${at}: no such card any more`);
      continue;
    }
    if (typeByHandCard(byId.get(a.card))) {
      out.push(`${at}: a hand card sets this type`);
      continue;
    }
    if (!a.based_on) continue;
    const text = goodPath(a.based_on.file) ? readFile(a.based_on.file) : null;
    if (text === null || !text.split(/\r?\n/).some((l) => quoteOnLine(a.based_on.quote, l))) {
      out.push(`${at}: the code behind this answer changed`);
    }
  }
  return out;
}

// Command line

const USAGE = "usage: check-cards.mjs <run-dir> --project <dir>";
class CliError extends Error {}

const reason = (err) => {
  switch (err?.code) {
    case "ENOENT": return "not found";
    case "EACCES":
    case "EPERM": return "no permission";
    case "EISDIR": return "is a folder";
    default: return "unreadable";
  }
};

function readText(file) {
  try {
    return readFileSync(file, "utf8").replace(/^﻿/, "");
  } catch (err) {
    throw new CliError(`cannot read ${file} (${reason(err)})`);
  }
}

function readJson(file) {
  const text = readText(file);
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(`cannot read ${file} (not valid JSON)`);
  }
}

/** The project's agentroster.json text, or null when there is none. A link, a folder or an
 * unreadable file is an error, never "no file" (redact-check blocks a linked one too). */
function readAnswersText(project) {
  const file = path.join(project, ANSWERS_FILE);
  let st;
  try {
    st = lstatSync(file);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new CliError(`cannot read ${ANSWERS_FILE} (${reason(err)})`);
  }
  if (st.isSymbolicLink()) throw new CliError(`cannot read ${ANSWERS_FILE} (is a link)`);
  if (st.isDirectory()) throw new CliError(`cannot read ${ANSWERS_FILE} (is a folder)`);
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    throw new CliError(`cannot read ${ANSWERS_FILE} (${reason(err)})`);
  }
}

/** @returns {number} Exit code: 0 ok, 1 problems, 2 a file can't be used. */
export function runCheckCardsCli(args) {
  try {
    if (args.length !== 3 || args[1] !== "--project") throw new CliError(USAGE);
    const [dir, , project] = args;
    let isDir = false;
    try {
      isDir = statSync(project).isDirectory();
    } catch (err) {
      throw new CliError(`cannot read project folder ${project} (${reason(err)})`);
    }
    if (!isDir) throw new CliError(`cannot read project folder ${project} (not a folder)`);
    const roster = readJson(path.join(dir, "roster.json"));
    const coverage = readJson(path.join(dir, "coverage.json"));
    const mapText = readText(path.join(dir, "map.md"));
    if (!validateRosterFile(roster).valid) throw new CliError("invalid roster.json: run validate-card.mjs for details");
    if (!validateCoverage(coverage).valid) throw new CliError("invalid coverage.json: run validate-coverage.mjs for details");
    const readFile = (file) => {
      try {
        return readFileSync(path.join(project, file), "utf8");
      } catch {
        return null;
      }
    };
    const errors = [...checkCards(roster, coverage, mapText).errors, ...checkQuotes(roster, coverage, readFile).errors];
    const answersText = readAnswersText(project);
    let notes = [];
    if (answersText !== null) {
      let answers;
      try {
        answers = JSON.parse(answersText.replace(/^\uFEFF/, ""));
      } catch {
        answers = null;
      }
      if (answers === null || !validateAnswers(answers).valid) {
        throw new CliError(`invalid ${ANSWERS_FILE}: run validate-answers.mjs for details`);
      }
      errors.push(...checkAnswers(roster, answers, answersText).errors);
      notes = staleAnswers(roster, answers, readFile);
    }
    const result = { valid: errors.length === 0, errors: [...new Set(errors)].sort(compareText) };
    if (result.valid) console.log(`ok ${dir}`);
    else for (const e of result.errors) console.log(e);
    for (const n of notes) console.log(`note: ${n}`);
    return result.valid ? 0 : 1;
  } catch (err) {
    console.error(err instanceof CliError ? err.message : "error: unexpected failure");
    return 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runCheckCardsCli(process.argv.slice(2));
}
