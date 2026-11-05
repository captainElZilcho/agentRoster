// Plain ordering and text helpers, so two runs give identical files.

/**
 * Compare two strings by UTF-16 code unit, never by locale.
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * JSON text with keys in insertion order and no spaces.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return JSON.stringify(value);
}
