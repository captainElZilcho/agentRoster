import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validateCoverage } from "../skills/agentroster/scripts/validate-coverage.mjs";
import { invalidCases } from "./fixtures/coverage/invalid-cases.mjs";

const validDir = new URL("./fixtures/coverage/valid/", import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, validDir), "utf8"));

for (const name of readdirSync(validDir).filter((n) => n.endsWith(".json")).sort()) {
  test(`valid fixture ${name} passes`, () => {
    assert.deepEqual(validateCoverage(load(name.replace(/\.json$/, ""))), { valid: true, errors: [] });
  });
}

for (const c of invalidCases) {
  test(`invalid case: ${c.name}`, () => {
    const result = validateCoverage(c.doc);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.path === c.path && e.message === c.message),
      `expected ${c.path}: ${c.message}\ngot ${JSON.stringify(result.errors, null, 1)}`,
    );
  });
}

test("rule cases report only their own rule", () => {
  const result = validateCoverage(invalidCases.find((c) => c.name === "read-with-reason").doc);
  assert.deepEqual(result.errors, [{ path: "/candidates/0/reason", message: 'must be null when status is "read"' }]);
});

test("several errors in one candidate are all reported", () => {
  const doc = invalidCases.find((c) => c.name === "read-with-reason").doc;
  doc.candidates[0].note = "Extra.";
  assert.deepEqual(validateCoverage(doc).errors.map((e) => e.path), ["/candidates/0/reason", "/candidates/0/note"]);
});

test("schema errors stop the rule checks", () => {
  const result = validateCoverage(invalidCases.find((c) => c.name === "status-skipped").doc);
  assert.deepEqual(result.errors.map((e) => e.path), ["/candidates/0/status"]);
});

test("never throws on any JSON value", () => {
  for (const v of [[], null, "x", 1, true, {}, { candidates: "x" }, { candidates: [null] },
    { candidates: [[]], unknowns: 3, summary: 3, snapshot: [] },
    { coverage: "0.1", snapshot: null, summary: {}, candidates: [], unknowns: [] }]) {
    const r = validateCoverage(v);
    assert.equal(r.valid, false);
    assert.ok(r.errors.length > 0);
  }
});

test("summary key order does not matter, but values do", () => {
  const doc = load("typical");
  const s = doc.summary;
  doc.summary = { unknowns: s.unknowns, no_agent: s.no_agent, cards: s.cards, not_understood: s.not_understood,
    not_read: s.not_read, read: s.read, candidates: s.candidates };
  assert.deepEqual(validateCoverage(doc), { valid: true, errors: [] });
  doc.summary.cards += 1;
  assert.equal(validateCoverage(doc).valid, false);
});

test("summary counts distinct card ids across candidates", () => {
  const doc = load("typical");
  const extra = structuredClone(doc.candidates[1]);
  extra.file = ".claude/agents/fleet-scout.old.md";
  doc.candidates.splice(2, 0, extra);
  doc.summary.candidates += 1;
  doc.summary.read += 1;
  assert.deepEqual(validateCoverage(doc), { valid: true, errors: [] });
});
