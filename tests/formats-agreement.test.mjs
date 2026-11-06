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
  const ok = ["src/agent.py", ".claude/agents/x.md", "a/..b.py", "src/a:b.py"];
  const bad = ["src\\agent.py", "/abs/x.py", "C:/x.py", "../x.py", "a/../b.py", "~/Documents/x.py", "file:///x", "https://x/y"];
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

// Coverage 0.2

import { invalidCases as coverage02InvalidCases } from "./fixtures/coverage-0.2/invalid-cases.mjs";

const cov2Published = new URL("../schema/coverage-0.2.schema.json", import.meta.url);
const cov2Shipped = new URL("../skills/agentroster/schema/coverage-0.2.schema.json", import.meta.url);
const cov2ValidDir = new URL("./fixtures/coverage-0.2/valid/", import.meta.url);
const cov2Schema = readJson(cov2Published);

test("shipped coverage 0.2 schema copy is byte-identical to the published schema", () => {
  assert.equal(readFileSync(cov2Shipped, "utf8"), readFileSync(cov2Published, "utf8"));
});

let cov2Validate;
test("Ajv compiles the coverage 0.2 schema in strict mode", () => {
  cov2Validate = ajv.compile(cov2Schema);
  assert.equal(typeof cov2Validate, "function");
});

for (const name of readdirSync(cov2ValidDir).filter((n) => n.endsWith(".json")).sort()) {
  test(`valid coverage 0.2 fixture ${name}: checker and Ajv both accept it`, () => {
    const doc = readJson(new URL(name, cov2ValidDir));
    assert.deepEqual(checkSchema(cov2Schema, doc), []);
    assert.equal(cov2Validate(doc), true, JSON.stringify(cov2Validate.errors));
  });
}

for (const c of coverage02InvalidCases) {
  test(`invalid coverage 0.2 case ${c.name}: Ajv ${c.schemaOnly ? "rejects" : "accepts"} it`, () => {
    assert.equal(cov2Validate(c.doc), !c.schemaOnly, JSON.stringify(cov2Validate.errors));
  });
}

// Roster file (envelope only: the card checks run in the validator)

import { invalidCases as rosterInvalidCases } from "./fixtures/roster-file/invalid-cases.mjs";

const rfPublished = new URL("../schema/roster-file-0.1.schema.json", import.meta.url);
const rfShipped = new URL("../skills/agentroster/schema/roster-file-0.1.schema.json", import.meta.url);
const rfValidDir = new URL("./fixtures/roster-file/valid/", import.meta.url);
const rfSchema = readJson(rfPublished);

test("shipped roster file schema copy is byte-identical to the published schema", () => {
  assert.equal(readFileSync(rfShipped, "utf8"), readFileSync(rfPublished, "utf8"));
});

let rfValidate;
test("Ajv compiles the roster file schema in strict mode", () => {
  rfValidate = ajv.compile(rfSchema);
  assert.equal(typeof rfValidate, "function");
});

for (const name of readdirSync(rfValidDir).filter((n) => n.endsWith(".json")).sort()) {
  test(`valid roster file fixture ${name}: checker and Ajv both accept it`, () => {
    const doc = readJson(new URL(name, rfValidDir));
    assert.deepEqual(checkSchema(rfSchema, doc), []);
    assert.equal(rfValidate(doc), true, JSON.stringify(rfValidate.errors));
  });
}

for (const c of rosterInvalidCases) {
  test(`invalid roster file case ${c.name}: Ajv ${c.schemaOnly ? "rejects" : "accepts"} it`, () => {
    assert.equal(rfValidate(c.doc), !c.schemaOnly, JSON.stringify(rfValidate.errors));
  });
}
