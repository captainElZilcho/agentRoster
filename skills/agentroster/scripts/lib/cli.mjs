// Shared command-line loop for the validators: read each file, run the
// validator, print the result, and return the exit code.

import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";

/** Largest file a script reads whole (a run file or an answers file is far smaller). */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

/**
 * Read a file only if it is a regular file, never through a link, and no larger than
 * MAX_FILE_BYTES. The file may come from a scanned project (agentroster.json), so a link could
 * point anywhere. Errors keep a short `code`: ELOOP (a link), EISDIR, "not a regular file",
 * "too large", or the system code.
 * @param {string} file
 * @returns {string}
 */
export function readRegularFile(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (st.isDirectory()) throw Object.assign(new Error("is a folder"), { code: "EISDIR" });
    if (!st.isFile()) throw Object.assign(new Error("not a regular file"), { code: "not a regular file" });
    const tooLarge = () => Object.assign(new Error("too large"), { code: "too large" });
    if (st.size > MAX_FILE_BYTES) throw tooLarge();
    const buf = readFileSync(fd);
    if (buf.length > MAX_FILE_BYTES) throw tooLarge(); // grew after the size check
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/**
 * Text safe to print on a terminal: control characters, line breaks and bidi overrides (which
 * could clear the screen, forge a line or reorder text) are shown as \u escapes.
 * @param {unknown} s
 * @returns {string}
 */
export function printable(s) {
  return String(s).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
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
      console.error(`cannot read ${printable(file)}: ${err.code === "ELOOP" ? "is a link" : err.code ?? err.message}`);
      code = 2;
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (err) {
      console.error(`not valid JSON: ${printable(file)}`); // the parser message can quote the file's text
      code = 2;
      continue;
    }
    const result = validate(doc);
    if (result.valid) {
      console.log(`ok ${printable(file)}`);
    } else {
      console.log(`fail ${printable(file)}`);
      console.log(formatErrors(result.errors).split("\n").map(printable).join("\n"));
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
