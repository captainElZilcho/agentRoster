import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSchema, formatErrors } from "../skills/agentroster/scripts/lib/schema-check.mjs";

const one = (schema, value, path, message) =>
  assert.deepEqual(checkSchema(schema, value), [{ path, message }]);

test("type: string rejects a number and shows the value", () => {
  one({ type: "string" }, 5, "/", "must be string, got number 5");
});

test("type: null, array and string values in messages", () => {
  one({ type: "string" }, null, "/", "must be string, got null");
  one({ type: "object" }, [], "/", "must be object, got array");
  one({ type: "number" }, "x", "/", 'must be number, got string "x"');
  one({ type: "string" }, true, "/", "must be string, got boolean true");
  one({ type: "string" }, {}, "/", "must be string, got object");
});

test("type: list of types", () => {
  assert.deepEqual(checkSchema({ type: ["string", "null"] }, null), []);
  one({ type: ["string", "null"] }, 5, "/", "must be string or null, got number 5");
});

test("type: integer", () => {
  one({ type: "integer" }, 1.5, "/", "must be integer, got number 1.5");
  assert.deepEqual(checkSchema({ type: "integer" }, 2), []);
  assert.deepEqual(checkSchema({ type: "number" }, 2), []);
});

test("enum may contain null", () => {
  assert.deepEqual(checkSchema({ enum: ["a", null] }, null), []);
});

test("enum and const messages", () => {
  one({ enum: ["a", "b"] }, "x", "/", '"x" is not one of a, b');
  one({ const: "0.2" }, "0.1", "/", 'must be "0.2"');
});

test("pattern", () => {
  one({ pattern: "^[a-z]+$" }, "A", "/", '"A" does not match ^[a-z]+$');
  assert.deepEqual(checkSchema({ pattern: "^[a-z]+$" }, 5), []);
});

test("minimum, maximum, exclusiveMinimum", () => {
  one({ minimum: 0 }, -1, "/", "-1 is below the minimum 0");
  one({ maximum: 99 }, 120, "/", "120 is above the maximum 99");
  one({ exclusiveMinimum: 0 }, 0, "/", "0 must be above 0");
  assert.deepEqual(checkSchema({ minimum: 0 }, "x"), []);
});

test("minLength", () => {
  one({ minLength: 1 }, "", "/", "must not be empty");
  one({ minLength: 3 }, "ab", "/", "must have at least 3 characters");
});

test("array size and uniqueness", () => {
  one({ maxItems: 3 }, [1, 2, 3, 4], "/", "has 4 items; at most 3 allowed");
  one({ uniqueItems: true }, [1, 2, 1], "/", "has duplicate items");
  one({ uniqueItems: true }, [{ a: 1, b: 2 }, { b: 2, a: 1 }], "/", "has duplicate items");
  one({ minItems: 1 }, [], "/", "must have at least 1 item");
  one({ minItems: 2 }, [1], "/", "must have at least 2 items");
});

test("items", () => {
  one({ items: { type: "string" } }, ["a", 2], "/1", "must be string, got number 2");
});

test("required", () => {
  one({ required: ["a"] }, {}, "/", 'missing required field "a"');
  assert.deepEqual(checkSchema({ required: ["a"] }, "x"), []);
});

test("additionalProperties", () => {
  const s = { properties: { a: {} }, additionalProperties: false };
  one(s, { a: 1, b: 2 }, "/", 'unknown field "b"');
  const t = { properties: { a: {} }, additionalProperties: { type: "number" } };
  assert.deepEqual(checkSchema(t, { a: "x", b: 2 }), []);
  one(t, { a: 1, b: "no" }, "/b", 'must be number, got string "no"');
});

test("keywords apply only to their JSON type", () => {
  assert.deepEqual(checkSchema({ type: ["string", "null"], minLength: 1 }, null), []);
  assert.deepEqual(checkSchema({ properties: { a: { type: "string" } } }, [1]), []);
  assert.deepEqual(checkSchema({ items: { type: "string" } }, "x"), []);
});

test("propertyNames reports at the key", () => {
  const s = { propertyNames: { pattern: "^[a-z]+$" } };
  one(s, { ok: 1, Bad: 2 }, "/Bad", '"Bad" does not match ^[a-z]+$');
});

test("paths escape ~ and /", () => {
  one({ properties: { "a/b~c": { type: "string" } } }, { "a/b~c": 1 }, "/a~1b~0c", "must be string, got number 1");
});

test("$ref resolves local definitions", () => {
  const s = { $defs: { x: { type: "string" } }, properties: { a: { $ref: "#/$defs/x" } } };
  one(s, { a: 1 }, "/a", "must be string, got number 1");
  assert.deepEqual(checkSchema(s, { a: "ok" }), []);
});

test("a non-local $ref throws", () => {
  assert.throws(() => checkSchema({ $ref: "other.json#/x" }, 1), /\$ref/);
});

test("not uses the sub schema's x-error", () => {
  one({ not: { enum: ["none"], "x-error": "use null" } }, "none", "/", "use null");
  one({ not: { enum: ["none"] } }, "none", "/", "is not allowed");
  assert.deepEqual(checkSchema({ not: { enum: ["none"] } }, "other"), []);
});

test("x-error replaces inner errors at the node's path", () => {
  const s = {
    properties: { a: { type: "object", required: ["x", "y"], "x-error": "a is wrong" } },
  };
  one(s, { a: {} }, "/a", "a is wrong");
  assert.deepEqual(checkSchema(s, { a: { x: 1, y: 2 } }), []);
});

test("x-error is an annotation only", () => {
  assert.deepEqual(checkSchema({ type: "string", "x-error": "nope" }, "ok"), []);
});

test("anyOf reports the single applicable branch", () => {
  const s = {
    anyOf: [
      { type: "string", minLength: 1 },
      { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    ],
  };
  assert.deepEqual(checkSchema(s, "x"), []);
  one(s, "", "/", "must not be empty");
  one(s, { id: 5 }, "/id", "must be string, got number 5");
});

test("anyOf with several applicable branches uses x-error or the default", () => {
  const branches = [
    { type: "object", required: ["a"] },
    { type: "object", required: ["b"] },
  ];
  one({ anyOf: branches }, {}, "/", "does not match any allowed shape");
  one({ anyOf: branches, "x-error": "give a or b" }, {}, "/", "give a or b");
  one({ anyOf: branches }, 5, "/", "does not match any allowed shape");
});

test("branch choice looks at $ref targets, const, enum and whole numbers", () => {
  const s = {
    $defs: { obj: { type: "object", required: ["k"], properties: { k: { type: "string" } } } },
    anyOf: [{ $ref: "#/$defs/obj" }, { const: "none" }, { type: "integer" }],
  };
  one(s, { k: 1 }, "/k", "must be string, got number 1");
  assert.deepEqual(checkSchema(s, 3), []);
  one(s, 1.5, "/", "does not match any allowed shape");
});

test("oneOf", () => {
  const s = { oneOf: [{ type: "string" }, { minLength: 1 }] };
  one(s, "a", "/", "matches more than one allowed shape");
  assert.deepEqual(checkSchema({ oneOf: [{ type: "string" }, { type: "number" }] }, 1), []);
  one({ oneOf: [{ type: "string" }, { type: "number" }] }, null, "/", "does not match any allowed shape");
});

test("all errors are collected in schema order", () => {
  const s = {
    properties: { a: { type: "string" }, b: { type: "number" } },
    required: ["c"],
  };
  assert.deepEqual(checkSchema(s, { a: 1, b: "x" }), [
    { path: "/a", message: "must be string, got number 1" },
    { path: "/b", message: 'must be number, got string "x"' },
    { path: "/", message: 'missing required field "c"' },
  ]);
});

test("an unsupported keyword throws, even in a branch the value never reaches", () => {
  assert.throws(
    () => checkSchema({ type: "string", format: "date" }, "x"),
    { message: 'unsupported schema keyword "format" at #' },
  );
  assert.throws(
    () => checkSchema({ properties: { a: { pattern: "x", format: "date" } } }, {}),
    { message: 'unsupported schema keyword "format" at #/properties/a' },
  );
});

test("formatErrors", () => {
  const text = formatErrors([
    { path: "/a", message: "one" },
    { path: "/", message: "two" },
  ]);
  assert.equal(text, "  /a: one\n  /: two");
  assert.equal(formatErrors([]), "");
});
