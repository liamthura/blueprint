import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { copyTemplate, parseArgs } from "./create.mjs";

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
