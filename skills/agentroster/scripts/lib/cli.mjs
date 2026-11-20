// Shared command-line loop for the validators: read each file, run the
// validator, print the result, and return the exit code.

import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";

/**
 * Read a file only if it is a regular file, never through a link. The file may come from a
 * scanned project (agentroster.json), so a link could point anywhere.
 * @param {string} file
 * @returns {string}
 */
function readRegularFile(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (st.isDirectory()) throw Object.assign(new Error("is a folder"), { code: "EISDIR" });
    if (!st.isFile()) throw Object.assign(new Error("not a regular file"), { code: "not a regular file" });
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}
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
      text = readRegularFile(file);
    } catch (err) {
      console.error(`cannot read ${file}: ${err.code === "ELOOP" ? "is a link" : err.code ?? err.message}`);
      code = 2;
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (err) {
      console.error(`not valid JSON: ${file}`); // the parser message can quote the file's text
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
