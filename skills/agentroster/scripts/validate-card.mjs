// Checks one roster card against the v0.2 card schema.

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { checkSchema, formatErrors } from "./lib/schema-check.mjs";

const schema = JSON.parse(
  readFileSync(new URL("../schema/roster-card-0.2.schema.json", import.meta.url), "utf8"),
);

/**
 * Validate a roster card.
 * @param {unknown} card The parsed card.
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validateCard(card) {
  const errors = checkSchema(schema, card);
  return { valid: errors.length === 0, errors };
}

function main(files) {
  if (files.length === 0) {
    console.error("usage: validate-card.mjs <card.roster.json> [...]");
    return 2;
  }
  let code = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      console.error(`cannot read ${file}: ${err.code ?? err.message}`);
      code = 2;
      continue;
    }
    let card;
    try {
      card = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (err) {
      console.error(`not valid JSON: ${file} (${err.message})`);
      code = 2;
      continue;
    }
    const result = validateCard(card);
    if (result.valid) {
      console.log(`ok ${file}`);
    } else {
      console.log(`fail ${file}`);
      console.log(formatErrors(result.errors));
      if (code === 0) code = 1;
    }
  }
  return code;
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = main(process.argv.slice(2));
}
