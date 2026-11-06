import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { listFiles } from "../skills/agentroster/scripts/detect.mjs";

let gitOk = true;
try {
  execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
  gitOk = false;
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentroster-"));
}
function put(root, rel, text = "x\n") {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
function git(root, ...args) {
  execFileSync("git", ["-C", root, "-c", "user.email=t@example.invalid", "-c", "user.name=t", ...args], {
    stdio: "ignore",
  });
}
function plain(root) {
  put(root, "a.py");
  put(root, "node_modules/x.js");
  put(root, "dist/y.js");
  put(root, ".env", "FAKE=1\n");
  put(root, "keys/server.pem", "FAKE\n");
  put(root, "my-secrets.json", "{}");
  put(root, ".agentroster/run-1/map.md");
}
function cleanup(...dirs) {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
}

test("plain folder: skips dependencies, build output, secrets, run folder", () => {
  const root = tmp();
  try {
    plain(root);
    const r = listFiles(root);
    assert.deepEqual(r.files, ["a.py"]);
    assert.deepEqual(r.skipped, {
      ignored: 0, dependencies: 1, build_output: 1, run_folder: 1,
      secret_file: 3, link: 0, binary: 0, too_large: 0, unreadable: 0,
    });
    assert.deepEqual(Object.keys(r.skipped), [
      "ignored", "dependencies", "build_output", "run_folder", "secret_file", "link", "binary", "too_large", "unreadable",
    ]);
  } finally { cleanup(root); }
});

test("git repo: ignored file counts as ignored only", { skip: !gitOk }, () => {
  const root = tmp();
  try {
    plain(root);
    put(root, ".gitignore", "ignored.txt\n");
    put(root, "ignored.txt");
    git(root, "init", "-q");
    const r = listFiles(root);
    assert.ok(!r.files.includes("ignored.txt"));
    assert.equal(r.skipped.ignored, 1);
    assert.deepEqual(r.files, [".gitignore", "a.py"]);
    assert.equal(r.skipped.dependencies, 1);
    assert.equal(r.skipped.secret_file, 3);
  } finally { cleanup(root); }
});

test("git repo: a committed .env is still skipped", { skip: !gitOk }, () => {
  const root = tmp();
  try {
    put(root, "a.py");
    put(root, ".env", "FAKE=1\n");
    put(root, ".gitignore", ".env\n");
    git(root, "init", "-q");
    git(root, "add", "-f", ".env", "a.py", ".gitignore");
    git(root, "commit", "-q", "-m", "x");
    const r = listFiles(root);
    assert.deepEqual(r.files, [".gitignore", "a.py"]);
    assert.equal(r.skipped.secret_file, 1);
    assert.equal(r.skipped.ignored, 0);
  } finally { cleanup(root); }
});

test("links are never followed", () => {
  const root = tmp();
  const outside = tmp();
  try {
    put(outside, "o.txt");
    put(root, "a.py");
    fs.symlinkSync(path.join(outside, "o.txt"), path.join(root, "out-link"));
    fs.symlinkSync(path.join(root, "loop"), path.join(root, "loop"));
    const r = listFiles(root);
    assert.deepEqual(r.files, ["a.py"]);
    assert.equal(r.skipped.link, 2);
  } finally { cleanup(root, outside); }
});

test("git repo: links are skipped too", { skip: !gitOk }, () => {
  const root = tmp();
  const outside = tmp();
  try {
    put(outside, "o.txt");
    put(root, "a.py");
    fs.symlinkSync(path.join(outside, "o.txt"), path.join(root, "out-link"));
    git(root, "init", "-q");
    const r = listFiles(root);
    assert.deepEqual(r.files, ["a.py"]);
    assert.equal(r.skipped.link, 1);
  } finally { cleanup(root, outside); }
});

test("scope folder inside a git repo lists only its own files", { skip: !gitOk }, () => {
  const root = tmp();
  try {
    put(root, "repo/top.py");
    put(root, "repo/sub/inner.py");
    git(path.join(root, "repo"), "init", "-q");
    const r = listFiles(path.join(root, "repo", "sub"));
    assert.deepEqual(r.files, ["inner.py"]);
  } finally { cleanup(root); }
});

test("no git on PATH: same files as the git listing", { skip: !gitOk }, () => {
  const root = tmp();
  const saved = process.env.PATH;
  try {
    plain(root);
    put(root, "sub/b.py");
    git(root, "init", "-q");
    const withGit = listFiles(root);
    process.env.PATH = "";
    const walked = listFiles(root);
    process.env.PATH = saved;
    assert.deepEqual(walked.files, withGit.files);
    assert.deepEqual(walked.files, ["a.py", "sub/b.py"]);
    assert.equal(walked.skipped.ignored, 0);
  } finally { process.env.PATH = saved; cleanup(root); }
});

test("missing folder throws with its code", () => {
  const root = tmp();
  cleanup(root);
  assert.throws(() => listFiles(root), (e) => e.code === "ENOENT");
});

test("output is identical across two calls", () => {
  const root = tmp();
  try {
    plain(root);
    put(root, "z/b.py");
    put(root, "B.py");
    assert.deepEqual(listFiles(root), listFiles(root));
    assert.deepEqual(listFiles(root).files, ["B.py", "a.py", "z/b.py"]);
  } finally { cleanup(root); }
});

test("secret names match in any case, at any depth", () => {
  const root = tmp();
  try {
    put(root, "a.py");
    put(root, ".ENV");
    put(root, "Prod.PEM");
    put(root, "ID_RSA");
    put(root, "config/.env.local");
    const r = listFiles(root);
    assert.deepEqual(r.files, ["a.py"]);
    assert.equal(r.skipped.secret_file, 4);
  } finally { cleanup(root); }
});

test("caller GIT_DIR cannot redirect git", { skip: !gitOk }, () => {
  const root = tmp();
  const other = tmp();
  const saved = process.env.GIT_DIR;
  try {
    put(root, "a.py");
    put(other, "other.py");
    git(root, "init", "-q");
    git(other, "init", "-q");
    process.env.GIT_DIR = path.join(other, ".git");
    assert.deepEqual(listFiles(root).files, ["a.py"]);
  } finally {
    if (saved === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = saved;
    cleanup(root, other);
  }
});

test("git repo: a tracked path under a folder now replaced by a link is not listed", { skip: !gitOk }, () => {
  const root = tmp();
  const outside = tmp();
  try {
    put(root, "a/b.py");
    put(root, "ok.py");
    git(root, "init", "-q");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "x");
    put(outside, "b.py");
    fs.rmSync(path.join(root, "a"), { recursive: true });
    fs.symlinkSync(outside, path.join(root, "a"));
    const r = listFiles(root);
    assert.deepEqual(r.files, ["ok.py"]);
    // git lists the link itself and the tracked path under it; both count as links
    assert.equal(r.skipped.link, 2);
  } finally { cleanup(root, outside); }
});

test("unreadable nested folder is skipped and counted", { skip: process.getuid?.() === 0 }, () => {
  const root = tmp();
  try {
    put(root, "a.py");
    put(root, "locked/x.py");
    fs.chmodSync(path.join(root, "locked"), 0o000);
    const r = listFiles(root);
    assert.deepEqual(r.files, ["a.py"]);
    assert.equal(r.skipped.unreadable, 1);
    fs.chmodSync(path.join(root, "locked"), 0o755);
  } finally {
    try { fs.chmodSync(path.join(root, "locked"), 0o755); } catch {}
    cleanup(root);
  }
});

test("git repo: names with spaces and non-ASCII are listed exactly", { skip: !gitOk }, () => {
  const root = tmp();
  try {
    put(root, "my agent é.py");
    put(root, "dir name/ü.py");
    git(root, "init", "-q");
    assert.deepEqual(listFiles(root).files, ["dir name/ü.py", "my agent é.py"]);
  } finally { cleanup(root); }
});

test("more secret names: .npmrc and .ssh folder", () => {
  const root = tmp();
  try {
    put(root, "a.py");
    put(root, ".NPMRC");
    put(root, ".ssh/config");
    put(root, "id_ecdsa");
    const r = listFiles(root);
    assert.deepEqual(r.files, ["a.py"]);
    assert.equal(r.skipped.secret_file, 3);
  } finally { cleanup(root); }
});

test("git repo: .ssh folder files count per file as secret_file", { skip: !gitOk }, () => {
  const root = tmp();
  try {
    put(root, "a.py");
    put(root, ".ssh/config");
    put(root, ".ssh/known");
    git(root, "init", "-q");
    const r = listFiles(root);
    assert.deepEqual(r.files, ["a.py"]);
    assert.equal(r.skipped.secret_file, 2);
  } finally { cleanup(root); }
});
