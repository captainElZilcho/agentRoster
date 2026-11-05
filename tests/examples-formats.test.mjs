import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFindings } from "../skills/agentroster/scripts/validate-findings.mjs";
import { validateCoverage } from "../skills/agentroster/scripts/validate-coverage.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const specBlocks = [...read("../spec/findings-and-coverage-v0.1.md").matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));
const specDoc = (key) => specBlocks.find((d) => key in d);

test("examples/findings.example.json is valid", () => {
  assert.deepEqual(validateFindings(JSON.parse(read("../examples/findings.example.json"))), { valid: true, errors: [] });
});
test("examples/coverage.example.json is valid", () => {
  assert.deepEqual(validateCoverage(JSON.parse(read("../examples/coverage.example.json"))), { valid: true, errors: [] });
});
test("the spec's findings example is valid", () => {
  assert.deepEqual(validateFindings(specDoc("findings")), { valid: true, errors: [] });
});
test("the spec's coverage example is valid", () => {
  assert.deepEqual(validateCoverage(specDoc("coverage")), { valid: true, errors: [] });
});
