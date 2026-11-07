// A small, dependency-free checker for the subset of JSON Schema 2020-12 that
// the roster card schema uses. It reports plain-language errors with JSON
// Pointer paths. A schema that uses any other keyword is refused.

/**
 * @typedef {{path: string, message: string}} SchemaError
 * @typedef {Record<string, any> | boolean} Schema
 */

const SUPPORTED = new Set([
  "$schema", "$id", "title", "description", "$comment", "$defs", "$ref",
  "type", "enum", "const", "pattern", "minLength", "minimum", "maximum",
  "exclusiveMinimum", "minItems", "maxItems", "uniqueItems", "items",
  "properties", "required", "additionalProperties", "propertyNames",
  "anyOf", "oneOf", "not", "x-error",
]);

const REF_PREFIX = "#/$defs/";
const checkedSchemas = new WeakSet();

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** @param {unknown} v @returns {string} JSON type name */
function jsonType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v === "object" ? "object" : typeof v; // boolean, number, string
}

/** Quote strings, show numbers and booleans bare, and nothing for the rest. */
function show(v) {
  return typeof v === "string" ? JSON.stringify(v) : ["number", "boolean"].includes(typeof v) ? String(v) : "";
}

const joinPath = (path, seg) => {
  const key = String(seg).replace(/~/g, "~0").replace(/\//g, "~1");
  return path === "/" ? `/${key}` : `${path}/${key}`;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Stable JSON text for comparing values regardless of key order. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObject(v)) {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Throw if the schema (or any sub schema) uses an unsupported keyword. */
function assertSupported(node, at) {
  if (typeof node === "boolean") return;
  if (!isObject(node)) throw new Error(`invalid schema at ${at}`);
  for (const key of Object.keys(node)) {
    if (!SUPPORTED.has(key)) throw new Error(`unsupported schema keyword "${key}" at ${at}`);
  }
  if (node.$ref !== undefined && !(typeof node.$ref === "string" && node.$ref.startsWith(REF_PREFIX))) {
    throw new Error(`unsupported $ref "${node.$ref}" at ${at}; only "#/$defs/<name>" is allowed`);
  }
  const each = (map, base) => {
    for (const [k, sub] of Object.entries(map)) assertSupported(sub, `${at}/${base}/${k}`);
  };
  if (node.$defs) each(node.$defs, "$defs");
  if (node.properties) each(node.properties, "properties");
  for (const key of ["items", "additionalProperties", "propertyNames", "not"]) {
    if (node[key] !== undefined) assertSupported(node[key], `${at}/${key}`);
  }
  for (const key of ["anyOf", "oneOf"]) {
    (node[key] ?? []).forEach((sub, i) => assertSupported(sub, `${at}/${key}/${i}`));
  }
}

function resolveRef(ref, root) {
  const name = ref.slice(REF_PREFIX.length);
  const target = root.$defs && Object.hasOwn(root.$defs, name) ? root.$defs[name] : undefined;
  if (target === undefined) throw new Error(`unresolved $ref "${ref}"`);
  return target;
}

/** Does the value have a JSON type that this schema's `type` allows? */
function typeMatches(type, value) {
  switch (type) {
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number";
    default: return jsonType(value) === type;
  }
}

/** The schema and the nodes its `$ref` chain leads to. */
function withRefTargets(node, root) {
  const nodes = [];
  let current = node;
  while (isObject(current)) {
    nodes.push(current);
    if (typeof current.$ref !== "string") break;
    current = resolveRef(current.$ref, root);
  }
  return nodes;
}

/** Can this branch apply to the value, judging by type and required keys only? */
function isApplicable(branch, value, root, { typeOnly = false } = {}) {
  if (typeof branch === "boolean") return true;
  for (const node of withRefTargets(branch, root)) {
    if (node.type !== undefined) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      if (!types.some((t) => typeMatches(t, value))) return false;
    }
    if (node.const !== undefined && jsonType(node.const) !== jsonType(value)) return false;
    if (Array.isArray(node.enum) && !node.enum.some((e) => jsonType(e) === jsonType(value))) return false;
    if (!typeOnly && isObject(value) && Array.isArray(node.required) && !node.required.every((k) => Object.hasOwn(value, k))) {
      return false;
    }
  }
  return true;
}

function typeError(types, value) {
  const wantsInteger = types.includes("integer");
  const kind = jsonType(value);
  const named = kind === "number" && wantsInteger && Number.isInteger(value) ? "integer" : kind;
  const shown = show(value);
  return `must be ${types.join(" or ")}, got ${named}${shown ? ` ${shown}` : ""}`;
}

function enumList(values) {
  return values.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
}

/** @returns {SchemaError[]} */
function validate(node, value, path, root) {
  if (node === true) return [];
  if (node === false) return [{ path, message: "is not allowed" }];
  const errors = [];
  const add = (message, at = path) => errors.push({ path: at, message });

  if (typeof node.$ref === "string") {
    errors.push(...validate(resolveRef(node.$ref, root), value, path, root));
  }

  if (node.type !== undefined) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (!types.some((t) => typeMatches(t, value))) {
      add(typeError(types, value));
      return annotate(node, errors, path);
    }
  }
  if (node.enum !== undefined && !node.enum.some((e) => canonical(e) === canonical(value))) {
    add(`${JSON.stringify(value)} is not one of ${enumList(node.enum)}`);
  }
  if (node.const !== undefined && canonical(node.const) !== canonical(value)) {
    add(`must be ${JSON.stringify(node.const)}`);
  }

  if (typeof value === "string") {
    if (node.pattern !== undefined && !new RegExp(node.pattern, "u").test(value)) {
      add(`${JSON.stringify(value)} does not match ${node.pattern}`);
    }
    if (node.minLength !== undefined && [...value].length < node.minLength) {
      add(node.minLength === 1 ? "must not be empty" : `must have at least ${plural(node.minLength, "character")}`);
    }
  }

  if (typeof value === "number") {
    if (node.minimum !== undefined && value < node.minimum) add(`${value} is below the minimum ${node.minimum}`);
    if (node.maximum !== undefined && value > node.maximum) add(`${value} is above the maximum ${node.maximum}`);
    if (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) {
      add(`${value} must be above ${node.exclusiveMinimum}`);
    }
  }

  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) {
      add(`must have at least ${plural(node.minItems, "item")}`);
    }
    if (node.maxItems !== undefined && value.length > node.maxItems) {
      add(`has ${plural(value.length, "item")}; at most ${node.maxItems} allowed`);
    }
    if (node.uniqueItems === true && new Set(value.map(canonical)).size !== value.length) {
      add("has duplicate items");
    }
    if (node.items !== undefined) {
      value.forEach((item, i) => errors.push(...validate(node.items, item, joinPath(path, i), root)));
    }
  }

  if (isObject(value)) {
    const props = node.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (Object.hasOwn(value, key)) errors.push(...validate(sub, value[key], joinPath(path, key), root));
    }
    for (const key of node.required ?? []) {
      if (!Object.hasOwn(value, key)) add(`missing required field "${key}"`);
    }
    if (node.additionalProperties !== undefined) {
      for (const key of Object.keys(value)) {
        if (Object.hasOwn(props, key)) continue;
        if (node.additionalProperties === false) add(`unknown field "${key}"`);
        else errors.push(...validate(node.additionalProperties, value[key], joinPath(path, key), root));
      }
    }
    if (node.propertyNames !== undefined) {
      for (const key of Object.keys(value)) {
        for (const e of validate(node.propertyNames, key, "/", root)) add(e.message, joinPath(path, key));
      }
    }
  }

  if (node.not !== undefined && validate(node.not, value, path, root).length === 0) {
    add(isObject(node.not) && typeof node.not["x-error"] === "string" ? node.not["x-error"] : "is not allowed");
  }

  const beforeBranches = errors.length;
  let branchOnly = false;
  if (node.anyOf !== undefined || node.oneOf !== undefined) {
    for (const key of ["anyOf", "oneOf"]) {
      const branches = node[key];
      if (branches === undefined) continue;
      const results = branches.map((b) => validate(b, value, path, root));
      const passing = results.filter((r) => r.length === 0).length;
      if (key === "oneOf" && passing > 1) {
        add("matches more than one allowed shape");
      } else if (passing === 0) {
        let applicable = results.filter((_, i) => isApplicable(branches[i], value, root));
        // No branch fits fully: fall back to the type alone, so an object missing a
        // required key still gets its own branch's message ("missing required field").
        if (applicable.length === 0) {
          applicable = results.filter((_, i) => isApplicable(branches[i], value, root, { typeOnly: true }));
        }
        if (applicable.length === 1) {
          errors.push(...applicable[0]);
          branchOnly = true;
        }
        else add(typeof node["x-error"] === "string" ? node["x-error"] : "does not match any allowed shape");
      }
    }
  }

  // The one applicable branch explains the failure better than the node's x-error.
  if (branchOnly && beforeBranches === 0) return errors;
  return annotate(node, errors, path);
}

/** A failing node with `x-error` reports that text alone, at its own path. */
function annotate(node, errors, path) {
  if (errors.length > 0 && typeof node["x-error"] === "string") {
    return [{ path, message: node["x-error"] }];
  }
  return errors;
}

/**
 * Check a value against a schema.
 * @param {Schema} schema
 * @param {unknown} value
 * @returns {SchemaError[]} Errors in schema order; an empty array means valid.
 * @throws {Error} If the schema uses a keyword this checker does not support.
 */
export function checkSchema(schema, value) {
  if (isObject(schema) && !checkedSchemas.has(schema)) {
    assertSupported(schema, "#");
    checkedSchemas.add(schema);
  }
  return validate(schema, value, "/", schema);
}

/**
 * Format errors as one "  <path>: <message>" line each.
 * @param {SchemaError[]} errors
 * @returns {string}
 */
export function formatErrors(errors) {
  return errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
}
