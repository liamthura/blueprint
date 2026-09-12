import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  appendEnvExample,
  BUNDLES,
  CAPABILITIES,
  mergeScripts,
  registryUrl,
  resolveCapabilities,
  stripTests,
  TEST_DEPS,
} from "./blueprint.mjs";

function fixture({ scripts = {}, blueprint } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "blueprint-"));
  const pkg = {
    name: "fixture",
    scripts: { dev: "next dev", test: "vitest run", ...scripts },
    devDependencies: Object.fromEntries(TEST_DEPS.map((d) => [d, "1.0.0"])),
  };
  if (blueprint) pkg.blueprint = blueprint;
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(join(dir, ".env.example"), "SENTRY_DSN=\n");
  writeFileSync(join(dir, "vitest.config.mts"), "export default {};\n");
  mkdirSync(join(dir, "src", "components", "ui"), { recursive: true });
  writeFileSync(join(dir, "src", "env.test.ts"), "");
  writeFileSync(join(dir, "src", "components", "ui", "button.test.tsx"), "");
  writeFileSync(join(dir, "src", "components", "ui", "button.tsx"), "");
  return dir;
}

test("resolveCapabilities puts dependencies first and deduplicates", () => {
  assert.deepEqual(resolveCapabilities(["auth"]), ["db", "auth"]);
  assert.deepEqual(resolveCapabilities(["db", "auth"]), ["db", "auth"]);
  assert.deepEqual(resolveCapabilities(["auth", "db"]), ["db", "auth"]);
});

test("resolveCapabilities expands the saas bundle", () => {
  assert.deepEqual(resolveCapabilities(["saas"]), ["db", "auth", "tables"]);
  assert.deepEqual(BUNDLES.saas, ["db", "auth", "tables"]);
});

test("resolveCapabilities rejects an unknown name", () => {
  assert.throws(() => resolveCapabilities(["nope"]), /Unknown capability: nope/);
});

test("every capability declares needs that exist", () => {
  for (const [name, cap] of Object.entries(CAPABILITIES)) {
    for (const need of cap.needs) {
      assert.ok(CAPABILITIES[need], `${name} needs unknown capability ${need}`);
    }
  }
});

test("mergeScripts adds the capability scripts", () => {
  const dir = fixture();
  const added = mergeScripts(dir, ["db"]);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  assert.deepEqual(added.sort(), Object.keys(CAPABILITIES.db.scripts).sort());
  assert.equal(pkg.scripts["db:migrate"], CAPABILITIES.db.scripts["db:migrate"]);
  assert.equal(pkg.scripts.dev, "next dev", "must not disturb existing scripts");
});

test("mergeScripts never clobbers a customised script", () => {
  const dir = fixture({ scripts: { "db:migrate": "my own thing" } });
  const added = mergeScripts(dir, ["db"]);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  assert.equal(pkg.scripts["db:migrate"], "my own thing");
  assert.ok(!added.includes("db:migrate"));
});

test("mergeScripts is idempotent", () => {
  const dir = fixture();
  mergeScripts(dir, ["db"]);
  const first = readFileSync(join(dir, "package.json"), "utf8");
  assert.deepEqual(mergeScripts(dir, ["db"]), []);
  assert.equal(readFileSync(join(dir, "package.json"), "utf8"), first);
});

test("appendEnvExample appends once and never duplicates a key", () => {
  const dir = fixture();
  assert.deepEqual(appendEnvExample(dir, ["db"]), ["DATABASE_URL"]);
  assert.deepEqual(appendEnvExample(dir, ["db"]), []);
  const text = readFileSync(join(dir, ".env.example"), "utf8");
  assert.equal(text.match(/^DATABASE_URL=/gm).length, 1);
  assert.match(text, /^SENTRY_DSN=$/m, "must not disturb existing entries");
});

test("registryUrl prefers the project's own setting", () => {
  assert.equal(
    registryUrl(fixture({ blueprint: { registry: "https://x.test" } })),
    "https://x.test",
  );
  assert.match(registryUrl(fixture()), /^https:\/\//);
});

test("stripTests removes the harness and leaves the app intact", () => {
  const dir = fixture();
  const removed = stripTests(dir);
  assert.ok(removed.includes("vitest.config.mts"));
  assert.ok(removed.includes(join("src", "env.test.ts")));
  assert.ok(removed.includes(join("src", "components", "ui", "button.test.tsx")));
  assert.ok(!existsSync(join(dir, "vitest.config.mts")));
  assert.ok(existsSync(join(dir, "src", "components", "ui", "button.tsx")), "source files survive");

  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  assert.ok(!("test" in pkg.scripts));
  assert.equal(pkg.scripts.dev, "next dev");
  for (const dep of TEST_DEPS) assert.ok(!(dep in pkg.devDependencies), `${dep} should be gone`);
});

test("stripTests on an already-stripped project is a no-op", () => {
  const dir = fixture();
  stripTests(dir);
  assert.deepEqual(stripTests(dir), []);
});

test("the tests capability restores exactly what stripTests removes", () => {
  assert.equal(CAPABILITIES.tests.scripts.test, "vitest run");
});
