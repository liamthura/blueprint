import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { copyTemplate, ensureGitignore, parseArgs, writeEnv } from "./create.mjs";

test("parseArgs takes the target from the first positional", () => {
  const args = parseArgs(["my-app"]);
  assert.equal(args.target, "my-app");
  assert.equal(args.tests, true, "tests are kept unless opted out");
  assert.deepEqual(args.capabilities, []);
  assert.equal(args.yes, false);
});

test("parseArgs reads every flag", () => {
  const args = parseArgs([
    "/tmp/app",
    "--no-tests",
    "--capabilities",
    "db,auth",
    "--registry",
    "http://localhost:3000",
    "--yes",
  ]);
  assert.equal(args.target, "/tmp/app");
  assert.equal(args.tests, false);
  assert.deepEqual(args.capabilities, ["db", "auth"]);
  assert.equal(args.registry, "http://localhost:3000");
  assert.equal(args.yes, true);
});

test("parseArgs accepts a bundle name", () => {
  assert.deepEqual(parseArgs(["app", "--capabilities", "saas"]).capabilities, ["saas"]);
});

test("parseArgs rejects an unknown capability", () => {
  assert.throws(() => parseArgs(["app", "--capabilities", "nope"]), /Unknown capability: nope/);
});

test("parseArgs rejects an unknown flag", () => {
  assert.throws(() => parseArgs(["app", "--wat"]), /Unknown option: --wat/);
});

test("parseArgs leaves target undefined when none is given", () => {
  assert.equal(parseArgs([]).target, undefined);
});

test("parseArgs rejects a flag that is missing its value", () => {
  assert.throws(() => parseArgs(["app", "--registry"]), /--registry needs a value/);
  assert.throws(() => parseArgs(["app", "--capabilities", "--yes"]), /--capabilities needs a value/);
});

test("parseArgs can wire the registry without prompting", () => {
  assert.equal(parseArgs(["app"]).wireRegistry, false);
  assert.equal(parseArgs(["app", "--with-registry"]).wireRegistry, true);
});

test("parseArgs rejects a second positional argument", () => {
  assert.throws(() => parseArgs(["app", "extra"]), /Unexpected argument: extra/);
});

test("copyTemplate skips build output and installed dependencies", () => {
  const from = mkdtempSync(join(tmpdir(), "tpl-"));
  const to = join(mkdtempSync(join(tmpdir(), "out-")), "app");

  mkdirSync(join(from, "src"), { recursive: true });
  mkdirSync(join(from, "node_modules", "next"), { recursive: true });
  mkdirSync(join(from, ".next"), { recursive: true });
  writeFileSync(join(from, "src", "page.tsx"), "x");
  writeFileSync(join(from, "package.json"), "{}");
  writeFileSync(join(from, ".gitignore"), "node_modules");
  writeFileSync(join(from, "tsconfig.tsbuildinfo"), "{}");
  writeFileSync(join(from, "node_modules", "next", "index.js"), "x");
  writeFileSync(join(from, ".next", "build"), "x");

  copyTemplate(from, to);

  assert.ok(existsSync(join(to, "src", "page.tsx")));
  assert.ok(existsSync(join(to, "package.json")));
  assert.ok(existsSync(join(to, ".gitignore")), "dotfiles must survive");
  assert.ok(!existsSync(join(to, "node_modules")));
  assert.ok(!existsSync(join(to, ".next")));
  assert.ok(!existsSync(join(to, "tsconfig.tsbuildinfo")));
});

test("ensureGitignore writes one when the copy didn't bring one", () => {
  const templateDir = mkdtempSync(join(tmpdir(), "tpl-"));
  const target = mkdtempSync(join(tmpdir(), "out-"));
  // templateDir has no .gitignore, simulating npx github: stripping it out.

  ensureGitignore(templateDir, target);

  const gitignore = readFileSync(join(target, ".gitignore"), "utf8");
  assert.ok(existsSync(join(target, ".gitignore")));
  assert.match(gitignore, /\.env\*/);
});

test("ensureGitignore leaves an existing .gitignore alone", () => {
  const templateDir = mkdtempSync(join(tmpdir(), "tpl-"));
  const target = mkdtempSync(join(tmpdir(), "out-"));
  writeFileSync(join(target, ".gitignore"), "custom\n");

  ensureGitignore(templateDir, target);

  assert.equal(readFileSync(join(target, ".gitignore"), "utf8"), "custom\n");
});

test("ensureGitignore prefers the template's own .gitignore when it's readable", () => {
  const templateDir = mkdtempSync(join(tmpdir(), "tpl-"));
  const target = mkdtempSync(join(tmpdir(), "out-"));
  writeFileSync(join(templateDir, ".gitignore"), "/node_modules\n.env*\n!.env.example\n");

  ensureGitignore(templateDir, target);

  assert.equal(
    readFileSync(join(target, ".gitignore"), "utf8"),
    "/node_modules\n.env*\n!.env.example\n",
  );
});


test("the CLI still runs when invoked through a bin symlink", () => {
  // npm installs a `bin` as a symlink, so under npx argv[1] is node_modules/.bin/<name>
  // while import.meta.url is the real file. An entry guard that compares them without
  // resolving the symlink makes the whole CLI a silent no-op: exit 0, no output, no
  // project. Every other test here invokes the module by path, which never catches it.
  const real = join(dirname(fileURLToPath(import.meta.url)), "create.mjs");
  const link = join(mkdtempSync(join(tmpdir(), "bin-")), "blueprint");
  symlinkSync(real, link);

  const result = (argv) => {
    try {
      return { stderr: execFileSync(process.execPath, [link, ...argv], { encoding: "utf8" }) };
    } catch (error) {
      return { stderr: error.stderr ?? "", status: error.status };
    }
  };

  const { stderr, status } = result(["--nonsense"]);
  assert.equal(status, 1, "must reach main() and fail, not exit 0 doing nothing");
  assert.match(stderr, /Unknown option: --nonsense/);
});


test("writeEnv seeds .env from .env.example and sets collected values", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-"));
  writeFileSync(join(dir, ".env.example"), "SENTRY_DSN=\n# db\nDATABASE_URL=postgres://placeholder\n");

  writeEnv(dir, { DATABASE_URL: "postgres://real@host/db" });
  const text = readFileSync(join(dir, ".env"), "utf8");

  assert.match(text, /^DATABASE_URL=postgres:\/\/real@host\/db$/m, "replaces, not appends");
  assert.equal(text.match(/^DATABASE_URL=/gm).length, 1, "exactly one entry");
  assert.match(text, /^SENTRY_DSN=$/m, "other keys survive");
  assert.ok(!existsSync(join(dir, ".env.local")));
});

test("writeEnv appends a key the example never mentioned, and skips empty values", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-"));
  writeFileSync(join(dir, ".env.example"), "SENTRY_DSN=\n");

  writeEnv(dir, { DATABASE_URL: "postgres://x", OPENAI_API_KEY: undefined });
  const text = readFileSync(join(dir, ".env"), "utf8");

  assert.match(text, /^DATABASE_URL=postgres:\/\/x$/m);
  assert.ok(!text.includes("OPENAI_API_KEY"), "an unanswered value must not write a blank line");
});

test("writeEnv never clobbers an .env that already exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-"));
  writeFileSync(join(dir, ".env.example"), "SENTRY_DSN=\n");
  writeFileSync(join(dir, ".env"), "SENTRY_DSN=https://mine\nKEEP=yes\n");

  writeEnv(dir, { DATABASE_URL: "postgres://x" });
  const text = readFileSync(join(dir, ".env"), "utf8");

  assert.match(text, /^SENTRY_DSN=https:\/\/mine$/m, "existing values survive");
  assert.match(text, /^KEEP=yes$/m);
  assert.match(text, /^DATABASE_URL=postgres:\/\/x$/m);
});
