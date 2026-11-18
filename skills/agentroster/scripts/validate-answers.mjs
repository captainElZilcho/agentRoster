// Checks an agentroster.json answers file: the schema first, then the rules the schema
// cannot express (one answer per card and field, answers sorted by card, then field).

import { readFileSync } from "node:fs";
import { checkSchema } from "./lib/schema-check.mjs";
import { runValidatorCli, isEntryPoint } from "./lib/cli.mjs";
import { compareText } from "./lib/order.mjs";

const schema = JSON.parse(readFileSync(new URL("../schema/answers-file-0.1.schema.json", import.meta.url), "utf8"));

/**
 * Validate a parsed answers file.
 * @param {unknown} doc
 * @returns {{valid: boolean, errors: {path: string, message: string}[]}}
 */
export function validateAnswers(doc) {
  const errors = checkSchema(schema, doc);
  if (errors.length > 0) return { valid: false, errors };
  const seen = new Set();
  for (const a of doc.answers) {
    const key = `${a.card}.${a.field}`;
    if (seen.has(key)) errors.push({ path: "/answers", message: `two answers for ${key}` });
    seen.add(key);
  }
  const sorted = doc.answers.every(
    (a, i) => i === 0 || (compareText(doc.answers[i - 1].card, a.card) || compareText(doc.answers[i - 1].field, a.field)) <= 0,
  );
  if (!sorted) errors.push({ path: "/answers", message: "answers must be sorted by card, then field" });
  return { valid: errors.length === 0, errors };
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runValidatorCli(process.argv.slice(2), validateAnswers, "usage: validate-answers.mjs <agentroster.json> [...]");
}
