import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  appendEnvExample,
  applyPreset,
  applyVersions,
  BUNDLES,
  CAPABILITIES,
  compatKey,
  DEFAULT_PRESET,
  DEFAULT_REGISTRY,
  ICON_PACKAGES,
  mergeScripts,
  PRESET_FONTS,
  parseAddArgs,
  parseUpdateArgs,
  registryUrl,
  requireRegistry,
  resolveCapabilities,
  rewriteFonts,
  stripTests,
  swapIconPackage,
  TEST_DEPS,
  UPDATE_CHECKS,
  updatePlan,
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

test("appendEnvExample labels each capability's block with a comment", () => {
  const dir = fixture();
  appendEnvExample(dir, ["db"]);
  const text = readFileSync(join(dir, ".env.example"), "utf8");
  assert.match(text, /^# db\nDATABASE_URL=/m);
});

test("registryUrl prefers the project's own setting", () => {
  assert.equal(
    registryUrl(fixture({ blueprint: { registry: "https://x.test" } })),
    "https://x.test",
  );
  assert.equal(registryUrl(fixture()), DEFAULT_REGISTRY);
});

test("an unconfigured registry fails loudly rather than guessing a hostname", () => {
  assert.throws(() => requireRegistry(""), /No registry configured/);
  assert.throws(() => requireRegistry(undefined), /No registry configured/);
  assert.equal(requireRegistry("https://x.test/"), "https://x.test", "trailing slash trimmed");
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

const LAYOUT = `import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const fontSans = Geist({
  variable: "--font-app-sans",
  subsets: ["latin"],
});

const fontMono = Geist_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
});

const fontHeading = Instrument_Sans({
  variable: "--font-app-heading",
  subsets: ["latin"],
});
`;

function appWithLayout() {
  const dir = fixture();
  mkdirSync(join(dir, "src", "app"), { recursive: true });
  writeFileSync(join(dir, "src", "app", "layout.tsx"), LAYOUT);
  return dir;
}

test("every preset font maps to a next/font/google export", () => {
  // The map is not a mechanical transform: these three break split-capitalise-join.
  assert.equal(PRESET_FONTS["dm-sans"], "DM_Sans");
  assert.equal(PRESET_FONTS["ibm-plex-sans"], "IBM_Plex_Sans");
  assert.equal(PRESET_FONTS["jetbrains-mono"], "JetBrains_Mono");
  for (const [slug, exportName] of Object.entries(PRESET_FONTS)) {
    assert.match(exportName, /^[A-Z][A-Za-z0-9_]*$/, `${slug} -> ${exportName}`);
  }
});

test("applyPreset is a no-op on the house default", () => {
  const dir = appWithLayout();
  const before = readFileSync(join(dir, "src", "app", "layout.tsx"), "utf8");
  const result = applyPreset(dir, DEFAULT_PRESET);
  assert.equal(result.applied, false);
  assert.equal(readFileSync(join(dir, "src", "app", "layout.tsx"), "utf8"), before);
});

test("rewriteFonts repoints the exports and leaves the variable names alone", () => {
  const dir = appWithLayout();
  const changes = rewriteFonts(dir, { sans: "Inter", heading: "Playfair_Display" });
  const layout = readFileSync(join(dir, "src", "app", "layout.tsx"), "utf8");

  assert.match(layout, /const fontSans = Inter\(/);
  assert.match(layout, /const fontHeading = Playfair_Display\(/);
  assert.match(layout, /const fontMono = Geist_Mono\(/, "mono is untouched");
  assert.match(
    layout,
    /import \{ Geist_Mono, Inter, Playfair_Display \} from "next\/font\/google";/,
  );
  assert.ok(!layout.includes("Instrument_Sans"), "the replaced import is gone");

  // The CSS contract is the variable names, and they must survive verbatim.
  assert.match(layout, /--font-app-sans/);
  assert.match(layout, /--font-app-mono/);
  assert.match(layout, /--font-app-heading/);
  assert.deepEqual(changes, ["sans Geist -> Inter", "heading Instrument_Sans -> Playfair_Display"]);
});

test("rewriteFonts is a no-op when the fonts already match", () => {
  const dir = appWithLayout();
  assert.deepEqual(rewriteFonts(dir, { sans: "Geist", heading: "Instrument_Sans" }), []);
});

test("rewriteFonts reports only the slots that actually changed", () => {
  const dir = appWithLayout();
  assert.deepEqual(rewriteFonts(dir, { sans: "Inter", heading: "Instrument_Sans" }), [
    "sans Geist -> Inter",
  ]);
});

test("rewriteFonts tolerates a project whose layout it cannot parse", () => {
  const dir = fixture();
  assert.deepEqual(rewriteFonts(dir, { sans: "Inter", heading: "Inter" }), []);
  mkdirSync(join(dir, "src", "app"), { recursive: true });
  writeFileSync(join(dir, "src", "app", "layout.tsx"), "export default function L() {}\n");
  assert.deepEqual(rewriteFonts(dir, { sans: "Inter", heading: "Inter" }), []);
});

test("swapIconPackage never leaves a project with two icon libraries", () => {
  const dir = fixture();
  let pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  pkg.dependencies = {
    "@phosphor-icons/react": "2.1.10",
    "lucide-react": "^1.45.0",
    next: "16.3.5",
  };
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  const result = swapIconPackage(dir, "lucide");
  pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

  assert.equal(pkg.dependencies["lucide-react"], "1.45.0", "pinned exactly, not a caret range");
  assert.ok(!("@phosphor-icons/react" in pkg.dependencies), "the old library is gone");
  assert.equal(pkg.dependencies.next, "16.3.5", "unrelated dependencies survive");
  assert.deepEqual(result.removed, ["@phosphor-icons/react"]);
});

test("swapIconPackage is idempotent and knows every shadcn icon library", () => {
  const dir = fixture();
  swapIconPackage(dir, "tabler");
  assert.equal(swapIconPackage(dir, "tabler"), null);
  for (const library of ["lucide", "tabler", "hugeicons", "phosphor", "remix"]) {
    assert.ok(ICON_PACKAGES[library], `${library} has a package`);
  }
  assert.equal(swapIconPackage(dir, "not-a-library"), null);
});

test("parseAddArgs separates capability names from options", () => {
  assert.deepEqual(parseAddArgs(["db", "auth"]), { names: ["db", "auth"], options: {} });
  assert.deepEqual(parseAddArgs(["db", "--source", "/tmp/site"]), {
    names: ["db"],
    options: { source: "/tmp/site" },
  });
  assert.deepEqual(parseAddArgs(["--registry", "https://x.test", "ai"]), {
    names: ["ai"],
    options: { registry: "https://x.test" },
  });
});

test("parseAddArgs rejects a missing value and an unknown flag", () => {
  assert.throws(() => parseAddArgs(["db", "--source"]), /'--source <value>' argument missing/);
  assert.throws(() => parseAddArgs(["db", "--source", "--registry"]), /argument is ambiguous/);
  assert.throws(() => parseAddArgs(["db", "--wat"]), /Unknown option '--wat'/);
});

test("compatKey treats a 0.x minor as its own band", () => {
  assert.equal(compatKey("1.2.3"), compatKey("1.9.0"));
  assert.notEqual(compatKey("1.2.3"), compatKey("2.0.0"));
  assert.notEqual(compatKey("0.2.6"), compatKey("0.3.0"));
  assert.equal(compatKey("0.2.6"), compatKey("0.2.9"));
  assert.equal(compatKey("^1.2.3"), compatKey("1.4.0"));
});

test("updatePlan flags the bumps that cross a band and sorts by name", () => {
  const plan = updatePlan({
    zod: { current: "4.6.2", latest: "4.6.5" },
    cn: { current: "0.2.6", latest: "0.3.0" },
    vitest: { current: "4.1.11", latest: "5.0.1" },
    next: { current: "16.3.5", latest: "16.3.5" },
  });
  assert.deepEqual(
    plan.map((bump) => [bump.name, bump.breaking]),
    [
      ["cn", true],
      ["vitest", true],
      ["zod", false],
    ],
  );
  assert.equal(plan.at(-1).to, "4.6.5");
});

test("updatePlan tolerates an empty report", () => {
  assert.deepEqual(updatePlan({}), []);
  assert.deepEqual(updatePlan(undefined), []);
});

test("applyVersions rewrites both fields and keeps any range prefix", () => {
  const dir = mkdtempSync(join(tmpdir(), "blueprint-update-"));
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "fixture",
        dependencies: { zod: "4.6.2", next: "^16.3.5" },
        devDependencies: { vitest: "4.1.11" },
      },
      null,
      2,
    )}\n`,
  );
  applyVersions(dir, [
    { name: "zod", to: "4.6.5" },
    { name: "next", to: "16.4.0" },
    { name: "vitest", to: "5.0.1" },
    { name: "absent", to: "9.9.9" },
  ]);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  assert.deepEqual(pkg.dependencies, { zod: "4.6.5", next: "^16.4.0" });
  assert.deepEqual(pkg.devDependencies, { vitest: "5.0.1" });
  assert.equal(pkg.absent, undefined);
});

test("parseUpdateArgs reads its two flags and rejects anything else", () => {
  assert.deepEqual(parseUpdateArgs([]), { major: false, dryRun: false });
  assert.deepEqual(parseUpdateArgs(["--major", "--dry-run"]), { major: true, dryRun: true });
  assert.throws(() => parseUpdateArgs(["--latest"]), /Unknown option '--latest'/);
});

test("every update check is a script the template declares", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const check of UPDATE_CHECKS) {
    assert.ok(pkg.scripts[check], `template declares a ${check} script`);
  }
});
