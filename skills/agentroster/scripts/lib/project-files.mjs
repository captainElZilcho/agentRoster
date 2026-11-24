// Which project files a script may read, and how: never a secret file, never through a link.

import { lstatSync } from "node:fs";
import path from "node:path";
import { readRegularFile } from "./cli.mjs";

/** Folder names whose contents are secret. */
export const SECRET_DIRS = new Set([".ssh", ".aws", ".docker"]);

/**
 * True when a file name looks like a secret. These files are never opened.
 * @param {string} name
 * @returns {boolean}
 */
export function isSecretName(name) {
  const lower = name.toLowerCase();
  return (
    lower === ".env" || lower.startsWith(".env.") || lower === ".envrc" ||
    /\.(pem|key|p12|pfx|kdbx)$/.test(lower) ||
    /^id_(rsa|ed25519|ecdsa|dsa)/.test(lower) ||
    lower === ".netrc" || lower === ".npmrc" || lower === ".pypirc" || lower === ".pgpass" ||
    /^tokens?\.json$/.test(lower) || /^service[-_]account.*\.json$/.test(lower) ||
    lower.includes("credential") || lower.includes("secret")
  );
}

/**
 * Is a path a plain relative path inside the project? A crafted git index could list "../x" or
 * "/x"; such a path is never read. One trailing "/" is allowed (git ends a folder entry with it).
 * @param {string} p
 * @returns {boolean}
 */
export function isSafeListedPath(p) {
  if (typeof p !== "string" || p === "" || p.startsWith("/") || p.includes("\\")) return false;
  const q = p.endsWith("/") ? p.slice(0, -1) : p;
  return q !== "" && q.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/**
 * Read a project file by its relative path, the way detect.mjs would: null when the path leads
 * outside the project, names a secret file or folder, passes through a link, or is not a
 * readable regular file.
 * @param {string} root
 * @param {string} rel
 * @returns {string|null}
 */
export function readProjectFile(root, rel) {
  if (!isSafeListedPath(rel) || rel.endsWith("/")) return null;
  const segs = rel.split("/");
  if (segs.slice(0, -1).some((s) => SECRET_DIRS.has(s.toLowerCase())) || isSecretName(segs[segs.length - 1])) return null;
  try {
    for (let i = 1; i < segs.length; i++) {
      if (lstatSync(path.join(root, ...segs.slice(0, i))).isSymbolicLink()) return null;
    }
    return readRegularFile(path.join(root, ...segs)); // the leaf is opened without following a link
  } catch {
    return null;
  }
}
