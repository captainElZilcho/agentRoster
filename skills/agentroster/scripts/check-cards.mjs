// Checks a run's cards against its map and coverage: the same ids in all three,
// evidence for every filled value, evidence keys that name real fields, relative
// evidence paths, unknown fields left empty, and workflow steps that report to the
// workflow. Usage: check-cards.mjs <run-dir>

import { readFileSync } from "node:fs";
import path from "node:path";
import { isEntryPoint } from "./lib/cli.mjs";
import { compareText } from "./lib/order.mjs";
import { validateRosterFile } from "./validate-card.mjs";
import { validateCoverage } from "./validate-coverage.mjs";
import { inventoryIds } from "./check-map.mjs";

/** The extension that holds data the card view needs and the core has no field for. */
export const CARD_VIEW_NS = "io.github.captainelzilcho.agentroster.card-view/v1";

/** Card fields whose filled values must carry evidence. */
const EVIDENCED_FIELDS = [
  "purpose", "role", "goals", "instructions", "context", "skills",
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

  // A single value with an unknown stays empty. A list keeps the items the code shows: its
  // unknown says the list may be incomplete (for example an MCP server's tools in a package).
  for (const u of unknowns.filter((x) => x.card === id)) {
    const value = getPath(card, u.field);
    if (!Array.isArray(value) && isFilled(value)) {
      errors.push(`card "${id}": ${u.field} has an unknown in coverage.json but is filled`);
    }
  }

  const ext = card.extensions?.[CARD_VIEW_NS];
  if (ext && typeof ext === "object") {
    const extEvidence = ext.evidence && typeof ext.evidence === "object" ? ext.evidence : {};
    for (const [field, value] of Object.entries(ext)) {
      if (field === "evidence" || field === "stated_only") continue;
      if (isFilled(value) && !isFilled(extEvidence[field])) {
        errors.push(`card "${id}": extensions.${CARD_VIEW_NS}.${field} is filled but has no evidence`);
      }
    }
    checkEvidenceItems(id, extEvidence, errors);
    for (const step of Array.isArray(ext.steps) ? ext.steps : []) {
      if (byId.get(step)?.org?.reports_to !== id) {
        errors.push(`card "${id}": step "${step}" does not report to it`);
      }
    }
  }
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

  const unknowns = coverage.unknowns ?? [];
  for (const card of cards) checkCard(card, byId, unknowns, errors);

  const sorted = [...new Set(errors)].sort(compareText);
  return { valid: sorted.length === 0, errors: sorted };
}

// Command line

const USAGE = "usage: check-cards.mjs <run-dir>";
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

/** @returns {number} Exit code: 0 ok, 1 problems, 2 a file can't be used. */
export function runCheckCardsCli(args) {
  try {
    if (args.length !== 1) throw new CliError(USAGE);
    const dir = args[0];
    const roster = readJson(path.join(dir, "roster.json"));
    const coverage = readJson(path.join(dir, "coverage.json"));
    const mapText = readText(path.join(dir, "map.md"));
    if (!validateRosterFile(roster).valid) throw new CliError("invalid roster.json: run validate-card.mjs for details");
    if (!validateCoverage(coverage).valid) throw new CliError("invalid coverage.json: run validate-coverage.mjs for details");
    const result = checkCards(roster, coverage, mapText);
    if (result.valid) {
      console.log(`ok ${dir}`);
      return 0;
    }
    for (const e of result.errors) console.log(e);
    return 1;
  } catch (err) {
    console.error(err instanceof CliError ? err.message : "error: unexpected failure");
    return 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runCheckCardsCli(process.argv.slice(2));
}
