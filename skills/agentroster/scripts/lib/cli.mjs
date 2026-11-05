// Shared command-line loop for the validators: read each file, run the
// validator, print the result, and return the exit code.

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { formatErrors } from "./schema-check.mjs";

/**
 * Validate each file and print one result per file.
 * @param {string[]} files Paths from the command line.
 * @param {(doc: unknown) => {valid: boolean, errors: Array<{path: string, message: string}>}} validate
 * @param {string} usage Printed to stderr when no files are given.
 * @returns {number} Exit code: 0 all valid, 1 some invalid, 2 a file could not be read or parsed.
 */
export function runValidatorCli(files, validate, usage) {
  if (files.length === 0) {
    console.error(usage);
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
    let doc;
    try {
      doc = JSON.parse(text.replace(/^﻿/, ""));
    } catch (err) {
      console.error(`not valid JSON: ${file} (${err.message})`);
      code = 2;
      continue;
    }
    const result = validate(doc);
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

/**
 * Is the module at `metaUrl` the script node was started with (also through a symlink)?
 * @param {string} metaUrl The module's import.meta.url.
 * @returns {boolean}
 */
export function isEntryPoint(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}
