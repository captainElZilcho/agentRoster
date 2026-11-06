import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

import { validateRosterFile } from "../skills/agentroster/scripts/validate-card.mjs";

const rosterSpecBlocks = [...read("../spec/roster-file-v0.1.md").matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));

test("examples/roster.example.json is valid", () => {
  assert.deepEqual(validateRosterFile(JSON.parse(read("../examples/roster.example.json"))), { valid: true, errors: [] });
});
test("the roster file spec's example is valid", () => {
  const doc = rosterSpecBlocks.find((d) => "roster_file" in d);
  assert.deepEqual(validateRosterFile(doc), { valid: true, errors: [] });
});

test("examples/roster.example.json cards equal the *.roster.json examples, sorted by id", () => {
  const dir = new URL("../examples/", import.meta.url);
  const singles = readdirSync(dir).filter((n) => n.endsWith(".roster.json"))
    .map((n) => JSON.parse(readFileSync(new URL(n, dir), "utf8")))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const file = JSON.parse(read("../examples/roster.example.json"));
  assert.deepEqual(file.cards, singles);
});
