// Checks that the findings schema compiles in strict mode, that the shipped
// copy is identical, and that the dependency-free checker agrees with Ajv.
// Development only: Ajv is a devDependency and is never shipped in skills/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { checkSchema } from "../skills/agentroster/scripts/lib/schema-check.mjs";
import { invalidCases } from "./fixtures/findings/invalid-cases.mjs";

const publishedPath = new URL("../schema/findings-0.1.schema.json", import.meta.url);
const shippedPath = new URL("../skills/agentroster/schema/findings-0.1.schema.json", import.meta.url);
const validDir = new URL("./fixtures/findings/valid/", import.meta.url);

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
const schema = readJson(publishedPath);

test("shipped findings schema copy is byte-identical to the published schema", () => {
  assert.equal(readFileSync(shippedPath, "utf8"), readFileSync(publishedPath, "utf8"));
});

const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
ajv.addKeyword("x-error");

let ajvValidate;
test("Ajv compiles the findings schema in strict mode", () => {
  ajvValidate = ajv.compile(schema);
  assert.equal(typeof ajvValidate, "function");
});

const files = readdirSync(validDir).filter((n) => n.endsWith(".json")).sort();
test("there are exactly 3 valid findings fixtures", () => {
  assert.equal(files.length, 3);
});

for (const name of files) {
  test(`valid fixture ${name}: checker and Ajv both accept it`, () => {
    const doc = readJson(new URL(name, validDir));
    assert.deepEqual(checkSchema(schema, doc), []);
    assert.equal(ajvValidate(doc), true, JSON.stringify(ajvValidate.errors));
  });
}

test("path pattern accepts repo-relative paths and rejects the rest", () => {
  const pathSchema = { $ref: "#/$defs/path", $defs: schema.$defs };
  const ok = ["src/agent.py", ".claude/agents/x.md", "a/..b.py"];
  const bad = ["src\\agent.py", "/abs/x.py", "C:/x.py", "../x.py", "a/../b.py"];
  const v = new Ajv2020({ strict: true, allowUnionTypes: true }).addKeyword("x-error").compile({ $ref: "#/$defs/path", $defs: schema.$defs });
  for (const p of ok) { assert.equal(v(p), true, p); assert.deepEqual(checkSchema(pathSchema, p), [], p); }
  for (const p of bad) { assert.equal(v(p), false, p); assert.notDeepEqual(checkSchema(pathSchema, p), [], p); }
});

for (const c of invalidCases) {
  test(`invalid case ${c.name}: Ajv ${c.schemaOnly ? "rejects" : "accepts"} it`, () => {
    assert.equal(ajvValidate(c.doc), !c.schemaOnly, JSON.stringify(ajvValidate.errors));
  });
}

// Coverage

import { invalidCases as coverageInvalidCases } from "./fixtures/coverage/invalid-cases.mjs";

const covPublished = new URL("../schema/coverage-0.1.schema.json", import.meta.url);
const covShipped = new URL("../skills/agentroster/schema/coverage-0.1.schema.json", import.meta.url);
const covValidDir = new URL("./fixtures/coverage/valid/", import.meta.url);
const covSchema = readJson(covPublished);

test("shipped coverage schema copy is byte-identical to the published schema", () => {
  assert.equal(readFileSync(covShipped, "utf8"), readFileSync(covPublished, "utf8"));
});

let covValidate;
test("Ajv compiles the coverage schema in strict mode", () => {
  covValidate = ajv.compile(covSchema);
  assert.equal(typeof covValidate, "function");
});

const covFiles = readdirSync(covValidDir).filter((n) => n.endsWith(".json")).sort();
test("there are exactly 2 valid coverage fixtures", () => {
  assert.equal(covFiles.length, 2);
});

for (const name of covFiles) {
  test(`valid coverage fixture ${name}: checker and Ajv both accept it`, () => {
    const doc = readJson(new URL(name, covValidDir));
    assert.deepEqual(checkSchema(covSchema, doc), []);
    assert.equal(covValidate(doc), true, JSON.stringify(covValidate.errors));
  });
}

for (const c of coverageInvalidCases) {
  test(`invalid coverage case ${c.name}: Ajv ${c.schemaOnly ? "rejects" : "accepts"} it`, () => {
    assert.equal(covValidate(c.doc), !c.schemaOnly, JSON.stringify(covValidate.errors));
  });
}
