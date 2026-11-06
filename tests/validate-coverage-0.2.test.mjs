import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validateCoverage } from "../skills/agentroster/scripts/validate-coverage.mjs";
import { invalidCases } from "./fixtures/coverage-0.2/invalid-cases.mjs";

const validDir = new URL("./fixtures/coverage-0.2/valid/", import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, validDir), "utf8"));

for (const name of readdirSync(validDir).filter((n) => n.endsWith(".json")).sort()) {
  test(`valid 0.2 fixture ${name} passes`, () => {
    assert.deepEqual(validateCoverage(load(name.replace(/\.json$/, ""))), { valid: true, errors: [] });
  });
}

for (const c of invalidCases) {
  test(`invalid 0.2 case: ${c.name}`, () => {
    const result = validateCoverage(c.doc);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.path === c.path && e.message === c.message),
      `expected ${c.path}: ${c.message}\ngot ${JSON.stringify(result.errors, null, 1)}`,
    );
  });
}

test("an unknown version is reported at /coverage and nothing else is checked", () => {
  const doc = load("typical");
  doc.coverage = "0.3";
  delete doc.summary;
  assert.deepEqual(validateCoverage(doc), {
    valid: false,
    errors: [{ path: "/coverage", message: 'must be "0.1" or "0.2"' }],
  });
});

test("a missing coverage version is reported the same way", () => {
  assert.deepEqual(validateCoverage({}).errors, [{ path: "/coverage", message: 'must be "0.1" or "0.2"' }]);
});

test("a 0.1 document with found_by on a candidate is rejected (0.1 is unchanged)", () => {
  const doc = JSON.parse(readFileSync(new URL("./fixtures/coverage/valid/typical.json", import.meta.url), "utf8"));
  doc.candidates[0].found_by = "script";
  const result = validateCoverage(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === "/candidates/0" && e.message === 'unknown field "found_by"'));
});

test("0.2 summary counts needs-checking candidates", () => {
  const doc = load("typical");
  doc.candidates[0].validation = { status: "needs-checking", rounds: 2 };
  assert.equal(validateCoverage(doc).valid, false);
  doc.summary.needs_checking += 1;
  assert.deepEqual(validateCoverage(doc), { valid: true, errors: [] });
});
