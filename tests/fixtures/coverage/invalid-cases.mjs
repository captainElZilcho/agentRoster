// Invalid coverage files, each with the one change that breaks it and the
// error it must produce. Used by tests/validate-coverage.test.mjs and by the
// Ajv comparison test. `schemaOnly` is true when only the JSON Schema catches
// the case; the others are schema-valid and break a rule check.

import { readFileSync } from "node:fs";
import { canonicalJson } from "../../../skills/agentroster/scripts/lib/order.mjs";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./valid/${name}.json`, import.meta.url), "utf8"));

/**
 * @typedef {{name: string, doc: unknown, path: string, message: string, schemaOnly: boolean}} InvalidCase
 */

/**
 * Copy the typical fixture, apply one change, return the copy.
 * Candidates: 0 change-gate (read, cards), 1 fleet-scout (read, cards),
 * 2 triage prompt (not-understood, pending), 3 helper.py line 2 (read, no-agent),
 * 4 legacy.py line 7 (not-read, pending), 5 orchestrator.py line 3 (read, cards).
 * Unknowns: 0 change-gate guardrails.forbidden, 1 ops-orchestrator instructions.
 * @param {(doc: any) => void} change
 */
const t = (change) => {
  const doc = load("typical");
  change(doc);
  return doc;
};

const typicalSummary = canonicalJson(load("typical").summary);
const pathMsg = "must be a repo-relative path with forward slashes";

const rule = (name, doc, path, message) => ({ name, doc, path, message, schemaOnly: false });
const schema = (name, doc, path, message) => ({ name, doc, path, message, schemaOnly: true });
const at = (n, field) => `/candidates/${n}/${field}`;

/** @type {InvalidCase[]} */
export const invalidCases = [
  // reason by status
  rule("not-read-no-reason", t((d) => { d.candidates[4].reason = null; }), at(4, "reason"),
    'required when status is "not-read"'),
  rule("not-understood-no-reason", t((d) => { d.candidates[2].reason = null; }), at(2, "reason"),
    'required when status is "not-understood"'),
  rule("read-with-reason", t((d) => { d.candidates[0].reason = "Looked odd."; }), at(0, "reason"),
    'must be null when status is "read"'),

  // outcome by status
  rule("not-read-not-pending", t((d) => { d.candidates[4].outcome = "no-agent"; }), at(4, "outcome"),
    'must be "pending" when status is "not-read"'),
  rule("not-understood-not-pending", t((d) => { d.candidates[2].outcome = "no-agent"; }), at(2, "outcome"),
    'must be "pending" when status is "not-understood"'),
  rule("read-pending", t((d) => { d.candidates[0].outcome = "pending"; }), at(0, "outcome"),
    'cannot be "pending" when status is "read"'),

  // cards by outcome
  rule("cards-outcome-no-cards", t((d) => { d.candidates[0].cards = []; }), at(0, "cards"),
    'needs at least one card id when outcome is "cards"'),
  rule("no-agent-with-cards", t((d) => { d.candidates[3].cards = ["fleet-scout"]; }), at(3, "cards"),
    'must be empty when outcome is "no-agent"'),
  rule("pending-with-cards", t((d) => { d.candidates[4].cards = ["fleet-scout"]; }), at(4, "cards"),
    'must be empty when outcome is "pending"'),

  // note by outcome
  rule("no-agent-no-note", t((d) => { d.candidates[3].note = null; }), at(3, "note"),
    'required when outcome is "no-agent"'),
  rule("cards-with-note", t((d) => { d.candidates[0].note = "Extra."; }), at(0, "note"),
    'must be null when outcome is "cards"'),
  rule("pending-with-note", t((d) => { d.candidates[2].note = "Extra."; }), at(2, "note"),
    'must be null when outcome is "pending"'),

  // duplicates and order
  rule("duplicate-candidate-whole-file", t((d) => { d.candidates.splice(1, 0, structuredClone(d.candidates[0])); }),
    "/candidates/1", 'duplicate candidate ".claude/agents/change-gate.md:*"'),
  rule("duplicate-candidate-line", t((d) => { d.candidates.splice(4, 0, structuredClone(d.candidates[3])); }),
    "/candidates/4", 'duplicate candidate "scripts/helper.py:2"'),
  rule("candidates-out-of-order-file", t((d) => { d.candidates.splice(0, 2, d.candidates[1], d.candidates[0]); }),
    "/candidates/1",
    'out of order: ".claude/agents/change-gate.md:*" must come before ".claude/agents/fleet-scout.md:*"'),
  rule("candidates-out-of-order-line", t((d) => {
    const whole = structuredClone(d.candidates[3]);
    whole.line = null;
    d.candidates.splice(4, 0, whole);
  }), "/candidates/4", 'out of order: "scripts/helper.py:*" must come before "scripts/helper.py:2"'),
  rule("duplicate-unknown", t((d) => { d.unknowns.splice(1, 0, structuredClone(d.unknowns[0])); }),
    "/unknowns/1", 'duplicate unknown "change-gate.guardrails.forbidden"'),
  rule("unknowns-out-of-order", t((d) => { d.unknowns.reverse(); }), "/unknowns/1",
    'out of order: "change-gate.guardrails.forbidden" must come before "ops-orchestrator.instructions"'),

  // summary
  rule("summary-wrong-read", t((d) => { d.summary.read = 5; }), "/summary",
    `does not match the candidates and unknowns; expected ${typicalSummary}`),
  rule("summary-wrong-cards", t((d) => { d.summary.cards = 4; }), "/summary",
    `does not match the candidates and unknowns; expected ${typicalSummary}`),
  rule("summary-wrong-unknowns", t((d) => { d.summary.unknowns = 0; }), "/summary",
    `does not match the candidates and unknowns; expected ${typicalSummary}`),

  // schema
  // Since coverage 0.2 the validator picks the schema by version, so an unknown version gets this message.
  schema("coverage-version", t((d) => { d.coverage = "1"; }), "/coverage", 'must be "0.1" or "0.2"'),
  schema("status-skipped", t((d) => { d.candidates[0].status = "skipped"; }), at(0, "status"),
    '"skipped" is not one of read, not-read, not-understood'),
  schema("signals-empty", t((d) => { d.candidates[0].signals = []; }), at(0, "signals"),
    "must have at least 1 item"),
  schema("signals-duplicate", t((d) => { d.candidates[0].signals = ["other", "other"]; }), at(0, "signals"),
    "has duplicate items"),
  schema("unknown-reason-unparseable", t((d) => { d.unknowns[0].reason = "unparseable"; }), "/unknowns/0/reason",
    '"unparseable" is not one of loaded-from-database, loaded-from-url, loaded-from-env, outside-repo, unparsable, unsupported-framework, other'),
  schema("unknown-field-slash", t((d) => { d.unknowns[0].field = "guardrails/forbidden"; }), "/unknowns/0/field",
    'must be a field path like "guardrails.forbidden" or "goals.0"'),
  schema("unknown-no-evidence", t((d) => { d.unknowns[0].evidence = []; }), "/unknowns/0/evidence",
    "must have at least 1 item"),
  schema("candidate-windows-path", t((d) => { d.candidates[0].file = "src\\app.py"; }), at(0, "file"), pathMsg),
  schema("evidence-absolute-path", t((d) => { d.unknowns[0].evidence[0].file = "/abs/x.py"; }),
    "/unknowns/0/evidence/0/file", pathMsg),
  schema("summary-negative", t((d) => { d.summary.read = -1; }), "/summary/read", "-1 is below the minimum 0"),
  schema("packs-bad-version", t((d) => { d.snapshot.packs[0].version = "1"; }), "/snapshot/packs/0/version",
    'must be a version like "0.1"'),
  schema("reason-none", t((d) => { d.candidates[2].reason = "none"; }), at(2, "reason"),
    'use null for an empty value, not the text "none"'),
  schema("unknown-field-colour", t((d) => { d.candidates[0].colour = "blue"; }), "/candidates/0",
    'unknown field "colour"'),
];
