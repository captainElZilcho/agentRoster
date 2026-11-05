// Checks that the dependency-free schema checker agrees with Ajv, and that
// the shipped schema copy is identical to the published schema.
// Development only: Ajv is a devDependency and is never shipped in skills/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { validateCard } from "../skills/agentroster/scripts/validate-card.mjs";
import { invalidCases } from "./fixtures/cards/invalid-cases.mjs";

const publishedPath = new URL("../schema/roster-card-0.2.schema.json", import.meta.url);
const shippedPath = new URL("../skills/agentroster/schema/roster-card-0.2.schema.json", import.meta.url);

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));

const listCards = (dirUrl) =>
  readdirSync(dirUrl)
    .filter((name) => name.endsWith(".roster.json"))
    .sort()
    .map((name) => ({
      name,
      card: readJson(new URL(name, dirUrl)),
    }));

const examples = listCards(new URL("../examples/", import.meta.url));
const validFixtures = listCards(new URL("./fixtures/cards/valid/", import.meta.url));

// Guard against an empty or moved folder passing silently.
assert.equal(examples.length, 3, "expected 3 example roster cards");
assert.equal(validFixtures.length, 2, "expected 2 valid fixture roster cards");

const schema = readJson(publishedPath);

const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
ajv.addKeyword("x-error");
const ajvValidate = ajv.compile(schema);

test("shipped schema copy is byte-identical to the published schema", () => {
  const published = readFileSync(publishedPath, "utf8");
  const shipped = readFileSync(shippedPath, "utf8");
  assert.equal(shipped, published, "skills/agentroster/schema/roster-card-0.2.schema.json differs from schema/roster-card-0.2.schema.json");
});

test("Ajv compiles the schema in strict mode", () => {
  assert.equal(typeof ajvValidate, "function");
});

for (const { name, card } of examples) {
  test(`example ${name}: checker agrees with Ajv`, () => {
    assert.equal(
      validateCard(card).valid,
      ajvValidate(card),
      `verdict mismatch for ${name}`,
    );
  });
}

for (const { name, card } of validFixtures) {
  test(`valid fixture ${name}: checker agrees with Ajv`, () => {
    assert.equal(
      validateCard(card).valid,
      ajvValidate(card),
      `verdict mismatch for ${name}`,
    );
  });
}

for (const { name, card } of invalidCases.map((c) => ({ name: c.name, card: c.card }))) {
  test(`invalid case ${name}: checker agrees with Ajv`, () => {
    assert.equal(
      validateCard(card).valid,
      ajvValidate(card),
      `verdict mismatch for invalid case ${name}`,
    );
  });
}
