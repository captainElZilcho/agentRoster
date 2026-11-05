// Checks one roster card against the v0.2 card schema.

import { readFileSync } from "node:fs";
import { checkSchema } from "./lib/schema-check.mjs";
import { runValidatorCli, isEntryPoint } from "./lib/cli.mjs";

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

if (isEntryPoint(import.meta.url)) {
  process.exitCode = runValidatorCli(
    process.argv.slice(2),
    validateCard,
    "usage: validate-card.mjs <card.roster.json> [...]",
  );
}
