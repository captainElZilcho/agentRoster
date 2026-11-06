// Invalid coverage 0.2 files, each with the one change that breaks it and the
// error it must produce. Used by tests/validate-coverage-0.2.test.mjs and by
// the Ajv comparison test. `schemaOnly` is true when only the JSON Schema
// catches the case; the others are schema-valid and break a rule check.

import { readFileSync } from "node:fs";
import { canonicalJson } from "../../../skills/agentroster/scripts/lib/order.mjs";

const load = (dir, name) =>
  JSON.parse(readFileSync(new URL(`../${dir}/valid/${name}.json`, import.meta.url), "utf8"));

/**
 * @typedef {{name: string, doc: unknown, path: string, message: string, schemaOnly: boolean}} InvalidCase
 */

/**
 * Copy the typical 0.2 fixture, apply one change, return the copy.
 * Candidate 2 (triage prompt) is not-understood and needs checking; the
 * others are validated.
 * @param {(doc: any) => void} change
 */
const t = (change) => {
  const doc = load("coverage-0.2", "typical");
  change(doc);
  return doc;
};

const typicalSummary = canonicalJson(load("coverage-0.2", "typical").summary);
const at = (n, field) => `/candidates/${n}/${field}`;
const schema = (name, doc, path, message) => ({ name, doc, path, message, schemaOnly: true });
const rule = (name, doc, path, message) => ({ name, doc, path, message, schemaOnly: false });

/** @type {InvalidCase[]} */
export const invalidCases = [
  schema("found-by-missing", t((d) => { delete d.candidates[0].found_by; }), "/candidates/0",
    'missing required field "found_by"'),
  schema("found-by-hand", t((d) => { d.candidates[0].found_by = "hand"; }), at(0, "found_by"),
    '"hand" is not one of script, agent'),
  schema("validation-missing", t((d) => { delete d.candidates[0].validation; }), "/candidates/0",
    'missing required field "validation"'),
  schema("rounds-zero", t((d) => { d.candidates[0].validation.rounds = 0; }), at(0, "validation/rounds"),
    "0 is below the minimum 1"),
  schema("rounds-four", t((d) => { d.candidates[0].validation.rounds = 4; }), at(0, "validation/rounds"),
    "4 is above the maximum 3"),
  schema("validation-status", t((d) => { d.candidates[0].validation.status = "done"; }), at(0, "validation/status"),
    '"done" is not one of validated, needs-checking'),
  schema("summary-no-needs-checking", t((d) => { delete d.summary.needs_checking; }), "/summary",
    'missing required field "needs_checking"'),
  rule("summary-wrong-needs-checking", t((d) => { d.summary.needs_checking = 0; }), "/summary",
    `does not match the candidates and unknowns; expected ${typicalSummary}`),
  rule("reason-null-not-read", t((d) => { d.candidates[4].reason = null; }), at(4, "reason"),
    'required when status is "not-read"'),
];
