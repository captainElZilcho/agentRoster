// Invalid findings files, each with the one change that breaks it and the
// error it must produce. Used by tests/validate-findings.test.mjs and by the
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
 * Copy a valid fixture, apply one change, return the copy.
 * second-run: entries 0 fail, 1 concern, 2 pass (previous run is set).
 * first-run: entries 0 fail, 1 concern, 2 unknown, 3 info (roster-wide),
 * 4 pass, 5 not-applicable (first run).
 * @param {"first-run"|"second-run"} name
 * @param {(doc: any) => void} change
 */
const from = (name, change) => {
  const doc = load(name);
  change(doc);
  return doc;
};
const s = (change) => from("second-run", change);
const f = (change) => from("first-run", change);

const secondSummary = canonicalJson(load("second-run").summary);
const firstSummary = canonicalJson(load("first-run").summary);

const rule = (name, doc, path, message) => ({ name, doc, path, message, schemaOnly: false });
const schema = (name, doc, path, message) => ({ name, doc, path, message, schemaOnly: true });

const required = (name, doc, n, field, result) =>
  rule(name, doc, `/entries/${n}/${field}`, `required when result is "${result}"`);
const mustBeNull = (name, doc, n, field, result) =>
  rule(name, doc, `/entries/${n}/${field}`, `must be null when result is "${result}"`);
const needsEvidence = (name, doc, n, result) =>
  rule(name, doc, `/entries/${n}/evidence`, `needs at least one item when result is "${result}"`);

const SEVERITY_MSG = (r) => `must be critical, high, medium or low when result is "${r}"`;
const pathMsg = "must be a repo-relative path with forward slashes";

/** @type {InvalidCase[]} */
export const invalidCases = [
  // Required by result
  required("fail-no-what", s((d) => { d.entries[0].what = null; }), 0, "what", "fail"),
  required("fail-no-why", s((d) => { d.entries[0].why = null; }), 0, "why", "fail"),
  required("fail-no-impact", s((d) => { d.entries[0].impact = null; }), 0, "impact", "fail"),
  required("concern-no-what", s((d) => { d.entries[1].what = null; }), 1, "what", "concern"),
  required("concern-no-why", s((d) => { d.entries[1].why = null; }), 1, "why", "concern"),
  required("concern-no-impact", s((d) => { d.entries[1].impact = null; }), 1, "impact", "concern"),
  required("unknown-no-what", f((d) => { d.entries[2].what = null; }), 2, "what", "unknown"),
  required("unknown-no-why", f((d) => { d.entries[2].why = null; }), 2, "why", "unknown"),
  required("unknown-no-decide", f((d) => { d.entries[2].decide = null; }), 2, "decide", "unknown"),
  required("info-no-what", f((d) => { d.entries[3].what = null; }), 3, "what", "info"),
  required("info-no-why", f((d) => { d.entries[3].why = null; }), 3, "why", "info"),
  required("pass-no-what", f((d) => { d.entries[4].what = null; }), 4, "what", "pass"),
  required("not-applicable-no-what", f((d) => { d.entries[5].what = null; }), 5, "what", "not-applicable"),

  // Must be null by result
  mustBeNull("unknown-with-fix", f((d) => { d.entries[2].fix = "Do the thing."; }), 2, "fix", "unknown"),
  mustBeNull("unknown-with-severity", f((d) => { d.entries[2].severity = "low"; }), 2, "severity", "unknown"),
  mustBeNull("info-with-fix", f((d) => { d.entries[3].fix = "Do the thing."; }), 3, "fix", "info"),
  mustBeNull("info-with-impact", f((d) => { d.entries[3].impact = "It breaks."; }), 3, "impact", "info"),
  mustBeNull("info-with-decide", f((d) => {
    d.entries[3].decide = { question: "Which?", options: ["a", "b"] };
  }), 3, "decide", "info"),
  mustBeNull("pass-with-severity", f((d) => { d.entries[4].severity = "low"; }), 4, "severity", "pass"),
  mustBeNull("pass-with-impact", f((d) => { d.entries[4].impact = "It breaks."; }), 4, "impact", "pass"),
  mustBeNull("pass-with-fix", f((d) => { d.entries[4].fix = "Do the thing."; }), 4, "fix", "pass"),
  mustBeNull("pass-with-decide", f((d) => {
    d.entries[4].decide = { question: "Which?", options: ["a", "b"] };
  }), 4, "decide", "pass"),
  mustBeNull("not-applicable-with-severity", f((d) => { d.entries[5].severity = "low"; }), 5, "severity", "not-applicable"),
  mustBeNull("not-applicable-with-impact", f((d) => { d.entries[5].impact = "It breaks."; }), 5, "impact", "not-applicable"),
  mustBeNull("not-applicable-with-fix", f((d) => { d.entries[5].fix = "Do the thing."; }), 5, "fix", "not-applicable"),
  mustBeNull("not-applicable-with-decide", f((d) => {
    d.entries[5].decide = { question: "Which?", options: ["a", "b"] };
  }), 5, "decide", "not-applicable"),

  // Evidence needed
  needsEvidence("fail-no-evidence", s((d) => { d.entries[0].evidence = []; }), 0, "fail"),
  needsEvidence("concern-no-evidence", s((d) => { d.entries[1].evidence = []; }), 1, "concern"),
  needsEvidence("unknown-no-evidence", f((d) => { d.entries[2].evidence = []; }), 2, "unknown"),
  needsEvidence("pass-no-evidence", f((d) => { d.entries[4].evidence = []; }), 4, "pass"),

  // fail or concern with neither fix nor decide
  rule("fail-no-fix-or-decide", f((d) => { d.entries[0].fix = null; }), "/entries/0",
    'needs a fix or a decide when result is "fail"'),
  rule("concern-no-fix-or-decide", f((d) => { d.entries[1].fix = null; }), "/entries/1",
    'needs a fix or a decide when result is "concern"'),

  // Severity
  rule("fail-severity-info", s((d) => { d.entries[0].severity = "info"; }), "/entries/0/severity", SEVERITY_MSG("fail")),
  rule("fail-severity-null", s((d) => { d.entries[0].severity = null; }), "/entries/0/severity", SEVERITY_MSG("fail")),
  rule("concern-severity-null", s((d) => { d.entries[1].severity = null; }), "/entries/1/severity", SEVERITY_MSG("concern")),
  rule("info-severity-low", f((d) => { d.entries[3].severity = "low"; }), "/entries/3/severity",
    'must be "info" when result is "info"'),
  rule("info-severity-null", f((d) => { d.entries[3].severity = null; }), "/entries/3/severity",
    'must be "info" when result is "info"'),

  // kind and card
  rule("kind-with-null-card", f((d) => { d.entries[3].kind = "agent"; }), "/entries/3/kind",
    "must be null when card is null"),
  rule("no-kind-with-card", f((d) => { d.entries[0].kind = null; }), "/entries/0/kind",
    "required when card is set"),

  // id
  rule("id-card-mismatch", f((d) => { d.entries[0].id = "least-agency.turn-limit:other-agent"; }), "/entries/0/id",
    'must be "least-agency.turn-limit:fleet-scout" to match pack, check and card'),
  rule("id-check-mismatch", f((d) => { d.entries[0].id = "least-agency.other-check:fleet-scout"; }), "/entries/0/id",
    'must be "least-agency.turn-limit:fleet-scout" to match pack, check and card'),
  rule("id-roster-wide-mismatch", f((d) => { d.entries[3].id = "orchestration.agent-count:fleet"; }), "/entries/3/id",
    'must start with "orchestration.agent-count:roster:"'),
  rule("id-duplicate", s((d) => { d.entries.splice(1, 0, structuredClone(d.entries[0])); }), "/entries/1/id",
    'duplicate id "least-agency.turn-limit:fleet-scout"'),

  // pack
  rule("pack-not-listed", s((d) => { d.entries[0].pack = "least-agency@0.2"; }), "/entries/0/pack",
    '"least-agency@0.2" is not listed in snapshot.packs'),

  // validation rounds
  rule("rule-with-rounds", s((d) => { d.entries[0].validation.rounds = 1; }), "/entries/0/validation/rounds",
    'must be 0 when method is "rule"'),
  rule("judgement-with-zero-rounds", s((d) => { d.entries[1].validation.rounds = 0; }), "/entries/1/validation/rounds",
    'must be 1 to 3 when method is "judgement"'),

  // change
  rule("first-run-with-change", f((d) => { d.entries[0].change = "new"; }), "/entries/0/change",
    "must be null on a first run (snapshot.previous is null)"),
  rule("fail-change-null", s((d) => { d.entries[0].change = null; }), "/entries/0/change",
    'must be "new" or "still-open" when result is "fail"'),
  rule("concern-change-fixed", s((d) => { d.entries[1].change = "fixed"; }), "/entries/1/change",
    'must be "new" or "still-open" when result is "concern"'),
  rule("pass-change-new", s((d) => { d.entries[2].change = "new"; }), "/entries/2/change",
    'must be "fixed" or null when result is "pass"'),
  rule("info-change-new", f((d) => { d.snapshot.previous = "run-2026-11-04-1"; d.entries[3].change = "new"; }),
    "/entries/3/change", 'must be null when result is "info"'),
  rule("not-applicable-change-new", f((d) => { d.snapshot.previous = "run-2026-11-04-1"; d.entries[5].change = "new"; }),
    "/entries/5/change", 'must be null when result is "not-applicable"'),

  // order
  rule("order-fail-after-concern", s((d) => { d.entries.splice(0, 2, d.entries[1], d.entries[0]); }), "/entries/1",
    'out of order: "least-agency.turn-limit:fleet-scout" must come before "completeness.role-defined:change-gate"'),
  rule("order-pass-before-concern", s((d) => { d.entries.reverse(); }), "/entries/1",
    'out of order: "completeness.role-defined:change-gate" must come before "completeness.goals-defined:ops-orchestrator"'),
  rule("order-card-not-sorted", f((d) => { d.entries.splice(4, 2, d.entries[5], d.entries[4]); }), "/entries/5",
    'out of order: "completeness.role-defined:change-gate" must come before "least-agency.turn-limit:change-gate"'),

  // summary
  rule("summary-wrong-count", s((d) => { d.summary[0].counts.fail = 1; }), "/summary",
    `does not match the entries; expected ${secondSummary}`),
  rule("summary-wrong-worst", s((d) => { d.summary[0].worst = "low"; }), "/summary",
    `does not match the entries; expected ${secondSummary}`),
  rule("summary-wrong-needs-checking", s((d) => { d.summary[1].needs_checking = 1; }), "/summary",
    `does not match the entries; expected ${secondSummary}`),
  rule("summary-item-order", f((d) => { d.summary.reverse(); }), "/summary",
    `does not match the entries; expected ${firstSummary}`),
  rule("summary-missing-item", f((d) => { d.summary.pop(); }), "/summary",
    `does not match the entries; expected ${firstSummary}`),

  // Schema cases
  schema("findings-version", s((d) => { d.findings = "0.2"; }), "/findings", 'must be the string "0.1"'),
  schema("result-warn", s((d) => { d.entries[0].result = "warn"; }), "/entries/0/result",
    '"warn" is not one of pass, concern, fail, unknown, info, not-applicable'),
  schema("severity-urgent", s((d) => { d.entries[0].severity = "urgent"; }), "/entries/0/severity",
    '"urgent" is not one of critical, high, medium, low, info, null'),
  schema("pack-without-version", s((d) => { d.entries[0].pack = "least-agency"; }), "/entries/0/pack",
    'must be a pack like "least-agency@0.1"'),
  schema("snapshot-id", s((d) => { d.snapshot.id = "run-1"; }), "/snapshot/id",
    'must be a run id like "run-2026-11-05-1"'),
  schema("snapshot-project-path", s((d) => { d.snapshot.project = "home/me/app"; }), "/snapshot/project",
    "must be a project name, not a path"),
  ...["src\\agent.py", "/abs/x.py", "C:/x.py", "../x.py", "a/../b.py"].map((file, i) =>
    schema(`evidence-file-${i}`, s((d) => { d.entries[0].evidence[0].file = file; }),
      "/entries/0/evidence/0/file", pathMsg)),
  schema("what-none", s((d) => { d.entries[0].what = "none"; }), "/entries/0/what",
    'use null for an empty value, not the text "none"'),
  schema("decide-one-option", f((d) => { d.entries[2].decide.options = ["only one"]; }), "/entries/2/decide/options",
    "must have at least 2 items"),
  schema("missing-enforcement", s((d) => { delete d.entries[0].enforcement; }), "/entries/0",
    'missing required field "enforcement"'),
  schema("unknown-field", s((d) => { d.entries[0].colour = "blue"; }), "/entries/0", 'unknown field "colour"'),
];
