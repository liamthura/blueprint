import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CAPABILITIES, TEST_DEPS } from "../template/scripts/blueprint.mjs";
import {
  copyTemplate,
  ensureGitignore,
  FALLBACK_GITIGNORE,
  parseArgs,
  writeEnv,
} from "./create.mjs";

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
  assert.throws(() => parseArgs(["app", "--wat"]), /Unknown option '--wat'/);
});

test("parseArgs leaves target undefined when none is given", () => {
  assert.equal(parseArgs([]).target, undefined);
});

test("parseArgs rejects a flag that is missing its value", () => {
  assert.throws(() => parseArgs(["app", "--registry"]), /'--registry <value>' argument missing/);
  assert.throws(() => parseArgs(["app", "--capabilities", "--yes"]), /argument is ambiguous/);
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
  const target = mkdtempSync(join(tmpdir(), "out-"));

  ensureGitignore(target);

  assert.match(readFileSync(join(target, ".gitignore"), "utf8"), /\.env\*/);
});

test("ensureGitignore leaves an existing .gitignore alone", () => {
  const target = mkdtempSync(join(tmpdir(), "out-"));
  writeFileSync(join(target, ".gitignore"), "custom\n");

  ensureGitignore(target);

  assert.equal(readFileSync(join(target, ".gitignore"), "utf8"), "custom\n");
});

test("the fallback .gitignore has not drifted from the template's", () => {
  // The fallback is all an `npx github:` project ever gets — packlist strips the real
  // file from the tarball. Drift here is how such a project starts committing secrets.
  const real = join(dirname(fileURLToPath(import.meta.url)), "..", "template", ".gitignore");
  assert.equal(FALLBACK_GITIGNORE, readFileSync(real, "utf8"));
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
  assert.match(stderr, /Unknown option '--nonsense'/);
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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryItem = (name) =>
  JSON.parse(readFileSync(join(repoRoot, "site", "registry.json"), "utf8")).items.find(
    (item) => item.name === name,
  );

test("the tests capability ships the template's own vitest config, not a drifted copy", () => {
  // Two copies on purpose: Vercel's root directory is site/, so the registry item
  // cannot reference ../template. This is what stops them diverging in silence.
  const item = registryItem("tests");
  const [file] = item.files;
  assert.equal(file.target, "~/vitest.config.mts");
  assert.equal(
    readFileSync(join(repoRoot, "site", file.path), "utf8"),
    readFileSync(join(repoRoot, "template", "vitest.config.mts"), "utf8"),
  );
});

test("the tests capability reinstalls exactly the deps stripTests removes", () => {
  const shipped = registryItem("tests").devDependencies.map((spec) =>
    spec.slice(0, spec.lastIndexOf("@")),
  );
  assert.deepEqual([...shipped].sort(), [...TEST_DEPS].sort());
});

test("every capability in the CLI has a registry item to install", () => {
  for (const name of Object.keys(CAPABILITIES)) {
    assert.ok(registryItem(name), `registry.json declares an item named "${name}"`);
  }
});
