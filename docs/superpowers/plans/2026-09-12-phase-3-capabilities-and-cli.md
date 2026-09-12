# Phase 3 — Capabilities and the Setup CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four capabilities (`db`, `auth`, `ai`, `tables`), the `saas` bundle, the in-project `blueprint` script, and the one-command `npx github:` setup CLI, so a project can be created in one command and grow capabilities for months afterwards.

**Architecture:** Capability source files live as real `.ts`/`.tsx` files under `site/registry/<name>/` and are declared inline in `site/registry.json`. They reach a project over HTTP through the Phase 2 route handler, which inlines file contents. Two CLIs share one capability table: `template/scripts/blueprint.mjs` (ships into every app, exports the table and the add/strip functions) and `bin/create.mjs` at the repository root (imports from it, runs once at project creation).

**Tech Stack:** Node 24 builtins only for both CLIs (`node:fs`, `node:child_process`, `node:readline/promises`, `node:path`, `node:url`). Drizzle ORM 0.45.2 + `pg` 8.23.0, better-auth 1.7.4, AI SDK 7 (`ai` 7.0.99, `@ai-sdk/react` 4.0.102, `@ai-sdk/openai` 4.0.66), TanStack Table 9.2.4 + TanStack Query 5.102.8.

**Spec:** `docs/superpowers/specs/2026-09-12-project-blueprint-design.md`

## Global Constraints

- Exact pinned versions, no ranges, everywhere a version lands in a `package.json` or a registry item's `dependencies`/`devDependencies`. The one deliberate exception is `pnpm dlx @better-auth/cli@latest` in the `db:auth-schema` script: it is a one-shot command a developer runs by hand *after* upgrading better-auth, and its entire job is to be newer than the committed schema. `@better-auth/cli` is at 1.4.21 against better-auth 1.7.4, so pinning it would pin the generator to a stale major.
- Exact pinned versions, no ranges, everywhere else: `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `pg@8.23.0`, `@types/pg@8.23.1`, `better-auth@1.7.4`, `@playwright/test@1.63.0`, `ai@7.0.99`, `@ai-sdk/react@4.0.102`, `@ai-sdk/openai@4.0.66`, `@tanstack/react-table@9.2.4`, `@tanstack/react-query@5.102.8`, `@t3-oss/env-nextjs@0.13.11`, `zod@4.6.2`, `shadcn@4.21.0`.
- zod 4 syntax: `z.url()`, not `z.string().url()`.
- Icon library is `phosphor` (`@phosphor-icons/react`). Never import `lucide-react`.
- Class-name helper is `cn` from the `cn` package: `import { cn } from "cn"` is wrong — the template's `src/lib/utils.ts` re-exports it, so components import `{ cn } from "@/lib/utils"`.
- `site/` and `template/` stay siblings. The only files allowed at the repository root are `.github/`, `docs/`, `bin/`, `README.md`, and a **bin-only** `package.json`. Never create a root `biome.json`, root `tsconfig.json`, or `pnpm-workspace.yaml`.
- Capability items declare **no `registryDependencies`**. Ordering lives in the capability table. (`registry:ui` items keep theirs.)
- Capability registry items reference files by `files[].path` relative to `site/`, with an explicit `target`. Never inline `content`.
- Both CLIs are zero-dependency ES modules with a `#!/usr/bin/env node` shebang and mode 0755.
- `blueprint.mjs` never passes `--overwrite` to `shadcn add`, and never deletes itself.
- Script merging never overwrites a key that already exists in the target `package.json`.
- Every new `.ts`/`.tsx`/`.mjs` file must pass `pnpm lint` in `site/` (Biome 2.5.13, `"rules": { "preset": "recommended" }`).

---

## File Structure

**Created at the repository root**
- `package.json` — bin-only manifest: `name`, `version`, `private`, `type: "module"`, `bin: "bin/create.mjs"`. No `dependencies`, no `devDependencies`, no `packageManager`, no `scripts`.
- `bin/create.mjs` — the one-command setup CLI. Argv parsing, four prompts, copy, install, capability add, test strip, next steps.
- `bin/create.test.mjs` — `node --test` coverage of argv parsing and the copy filter.

**Created in `template/`**
- `template/scripts/blueprint.mjs` — capability table, `resolveCapabilities`, `mergeScripts`, `appendEnvExample`, `addCapabilities`, `stripTests`, and the `add` CLI entry point.
- `template/scripts/blueprint.test.mjs` — `node --test` coverage of resolution, merging, idempotency and stripping.

**Modified in `template/`**
- `template/package.json` — add `blueprint` and `test:scripts` scripts.
- `template/.github/workflows/ci.yml` — make the test steps tolerate a stripped harness.

**Created in `site/registry/`** — capability sources, one directory per capability.
- `db/` — `index.ts`, `schema.ts`, `env.ts`, `drizzle.config.ts`, `docker-compose.yml`
- `auth/` — `auth.ts`, `auth-env.ts`, `auth-client.ts`, `auth-schema.ts`, `route.ts`, `auth-form.tsx`, `sign-in-page.tsx`, `sign-up-page.tsx`, `playwright.config.ts`, `sign-up.spec.ts`
- `ai/` — `ai-env.ts`, `route.ts`, `chat.tsx`
- `tables/` — `query-provider.tsx`, `data-table.tsx`
- `tests/` — `vitest.config.mts`

**Modified in `site/`**
- `site/registry.json` — five new `registry:lib` items.
- `site/tsconfig.json` — exclude `registry`.
- `site/next.config.ts` — trace `./registry/**`.
- `site/src/app/page.tsx` — split the gallery by item type.

**Modified in `.github/workflows/`**
- `template.yml` — a second job that creates a real app with every capability and builds it.

**Modified docs**
- `README.md`, `template/README.md`.

---

## Task 1: The `blueprint` script and its capability table

**Files:**
- Create: `template/scripts/blueprint.mjs`
- Create: `template/scripts/blueprint.test.mjs`
- Modify: `template/package.json`
- Modify: `template/.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (all named exports of `template/scripts/blueprint.mjs`, imported by Task 7's `bin/create.mjs`):
  - `DEFAULT_REGISTRY: string`
  - `CAPABILITIES: Record<string, { title: string, scripts: Record<string,string>, env: string[], needs: string[] }>`
  - `BUNDLES: Record<string, string[]>`
  - `TEST_DEPS: string[]`
  - `resolveCapabilities(names: string[]) => string[]` — expands bundles and prepends `needs`, deduplicated, dependency-first
  - `registryUrl(dir: string) => string`
  - `mergeScripts(dir: string, names: string[]) => string[]` — returns the script keys it added
  - `appendEnvExample(dir: string, names: string[]) => string[]` — returns the variable names it appended
  - `addCapabilities(dir: string, names: string[], opts?: { registry?: string }) => string[]` — returns the resolved capability names
  - `stripTests(dir: string) => string[]` — returns the relative paths it removed

- [ ] **Step 1: Write the failing test**

Create `template/scripts/blueprint.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
  assert.equal(registryUrl(fixture({ blueprint: { registry: "https://x.test" } })), "https://x.test");
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd template && node --test scripts/*.test.mjs`
Expected: FAIL — `Cannot find module './blueprint.mjs'`.

Pass the glob, never the bare directory. `node --test scripts/` resolves `scripts` as a *module* and dies with `Cannot find module`, on every Node 22–25 build tested.

- [ ] **Step 3: Write `template/scripts/blueprint.mjs`**

```js
#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The registry this project pulls capabilities from. Overridden per project by
 * a `blueprint.registry` field in package.json, and per invocation by --registry.
 */
export const DEFAULT_REGISTRY = "https://project-blueprint.vercel.app";

/**
 * Everything a capability needs beyond its files, which the registry format
 * cannot express: the package.json scripts it requires, the environment
 * variables it reads, and the capabilities it is useless without.
 */
export const CAPABILITIES = {
  db: {
    title: "Postgres with Drizzle",
    needs: [],
    scripts: {
      "db:up": "docker compose up -d",
      "db:generate": "drizzle-kit generate",
      "db:migrate": "drizzle-kit migrate",
      "db:studio": "drizzle-kit studio",
    },
    env: ["DATABASE_URL=postgres://blueprint:blueprint@localhost:5432/blueprint"],
  },
  auth: {
    title: "Email and password sign-in",
    needs: ["db"],
    scripts: {
      "db:auth-schema": "pnpm dlx @better-auth/cli@latest generate --output src/lib/db/auth-schema.ts",
      "test:e2e": "playwright test",
    },
    env: ["BETTER_AUTH_SECRET=", "BETTER_AUTH_URL=http://localhost:3000"],
  },
  ai: {
    title: "Streaming chat",
    needs: [],
    scripts: {},
    env: ["OPENAI_API_KEY=", "OPENAI_MODEL=gpt-4o-mini"],
  },
  tables: {
    title: "Sortable data tables",
    needs: [],
    scripts: {},
    env: [],
  },
  tests: {
    title: "Vitest browser-mode harness",
    needs: [],
    scripts: { test: "vitest run" },
    env: [],
  },
};

export const BUNDLES = {
  saas: ["db", "auth", "tables"],
};

/** Removed by stripTests, restored by the `tests` capability. */
export const TEST_DEPS = [
  "vitest",
  "@vitest/browser-playwright",
  "vite",
  "@vitejs/plugin-react",
  "playwright",
  "@testing-library/react",
];

const TEST_FILES = ["vitest.config.mts"];
const TEST_GLOBS = [
  "src/*.test.ts",
  "src/*.test.tsx",
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
];

/**
 * Expands bundles and dependencies into the exact order `shadcn add` should
 * receive. Capability items carry no registryDependencies of their own: read
 * from a local file a bare name would resolve against the consumer's working
 * directory, so the graph lives here instead.
 */
export function resolveCapabilities(names) {
  const ordered = [];
  const visit = (name) => {
    const capability = CAPABILITIES[name];
    if (!capability) throw new Error(`Unknown capability: ${name}`);
    for (const need of capability.needs) visit(need);
    if (!ordered.includes(name)) ordered.push(name);
  };
  for (const name of names) {
    for (const member of BUNDLES[name] ?? [name]) visit(member);
  }
  return ordered;
}

function readPackage(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

function writePackage(dir, pkg) {
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

export function registryUrl(dir) {
  return readPackage(dir).blueprint?.registry ?? DEFAULT_REGISTRY;
}

/** Adds each capability's scripts, never overwriting one the project already has. */
export function mergeScripts(dir, names) {
  const pkg = readPackage(dir);
  pkg.scripts ??= {};
  const added = [];
  for (const name of names) {
    for (const [key, value] of Object.entries(CAPABILITIES[name].scripts)) {
      if (key in pkg.scripts) continue;
      pkg.scripts[key] = value;
      added.push(key);
    }
  }
  if (added.length > 0) writePackage(dir, pkg);
  return added;
}

/** Appends each capability's variables to .env.example, keyed on the name. */
export function appendEnvExample(dir, names) {
  const path = join(dir, ".env.example");
  if (!existsSync(path)) return [];
  let text = readFileSync(path, "utf8");
  const added = [];
  for (const name of names) {
    for (const line of CAPABILITIES[name].env) {
      const key = line.slice(0, line.indexOf("="));
      if (new RegExp(`^${key}=`, "m").test(text)) continue;
      if (!text.endsWith("\n")) text += "\n";
      text += `${line}\n`;
      added.push(key);
    }
  }
  if (added.length > 0) writeFileSync(path, text);
  return added;
}

/**
 * Fetches each capability from the registry and wires up what the registry
 * format cannot carry. Never passes --overwrite: by the time a second
 * capability lands, the first one's files are customised, and shadcn's
 * per-file prompt is what keeps those edits.
 */
export function addCapabilities(dir, names, { registry = registryUrl(dir) } = {}) {
  const resolved = resolveCapabilities(names);
  const urls = resolved.map((name) => `${registry.replace(/\/$/, "")}/r/${name}.json`);
  execFileSync("pnpm", ["exec", "shadcn", "add", "-y", ...urls], { cwd: dir, stdio: "inherit" });
  mergeScripts(dir, resolved);
  appendEnvExample(dir, resolved);
  return resolved;
}

/**
 * Removes the test harness. A strip rather than an opt-in add, because a
 * default of "untested" is the wrong default. `blueprint add tests` reverses it.
 */
export function stripTests(dir) {
  const removed = [];
  const targets = [
    ...TEST_FILES,
    ...TEST_GLOBS.flatMap((pattern) => globSync(pattern, { cwd: dir })),
  ];
  for (const relative of targets) {
    const path = join(dir, relative);
    if (!existsSync(path)) continue;
    rmSync(path);
    removed.push(relative);
  }

  const pkg = readPackage(dir);
  let changed = false;
  if (pkg.scripts?.test) {
    delete pkg.scripts.test;
    changed = true;
  }
  for (const dep of TEST_DEPS) {
    if (!pkg.devDependencies?.[dep]) continue;
    delete pkg.devDependencies[dep];
    changed = true;
  }
  if (changed) writePackage(dir, pkg);

  return removed;
}

function usage() {
  const capabilities = Object.entries(CAPABILITIES)
    .map(([name, { title }]) => `  ${name.padEnd(8)} ${title}`)
    .join("\n");
  const bundles = Object.entries(BUNDLES)
    .map(([name, members]) => `  ${name.padEnd(8)} ${members.join(" + ")}`)
    .join("\n");
  return `usage: pnpm blueprint add <capability...>\n\ncapabilities:\n${capabilities}\n\nbundles:\n${bundles}\n`;
}

function main(argv) {
  const [command, ...names] = argv;
  if (command !== "add" || names.length === 0) {
    process.stderr.write(usage());
    process.exitCode = 1;
    return;
  }
  const added = addCapabilities(process.cwd(), names);
  process.stdout.write(`\nAdded: ${added.join(", ")}\n`);
  process.stdout.write("Check .env.example for any new variables, then restart the dev server.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd template && chmod +x scripts/blueprint.mjs && node --test scripts/*.test.mjs`
Expected: PASS, 12 tests, no warnings.

- [ ] **Step 5: Wire the script into the template's `package.json`**

Add these two entries to the `scripts` object in `template/package.json`, in alphabetical position:

```json
    "blueprint": "node scripts/blueprint.mjs",
    "test:scripts": "node --test scripts/*.test.mjs",
```

`test:scripts` is deliberately separate from `test`. `vitest.config.mts` includes only `src/**/*.test.ts{,x}`, so `scripts/blueprint.test.mjs` is invisible to Vitest — and the script survives the test strip, so its test must survive too.

- [ ] **Step 6: Make the template's CI tolerate a stripped harness**

In `template/.github/workflows/ci.yml`, replace the browser-install and test steps:

```yaml
      - run: pnpm exec playwright install --with-deps chromium
        if: hashFiles('vitest.config.mts') != ''
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:scripts
      - run: pnpm run --if-present test
      - run: pnpm build
```

`pnpm run --if-present test` exits 0 in silence when the script is absent, and `hashFiles` returns an empty string when the config is gone. The spec's earlier design had `blueprint.mjs` rewrite this YAML in both directions; a workflow that tolerates both states needs no rewriting at all.

- [ ] **Step 7: Verify the whole template still passes**

Run: `cd template && pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm test:scripts`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add template/scripts template/package.json template/.github/workflows/ci.yml
git commit -m "feat(blueprint): capability table, add and strip, with tests"
```

---

## Task 2: The `db` capability

**Files:**
- Create: `site/registry/db/index.ts`, `site/registry/db/schema.ts`, `site/registry/db/env.ts`, `site/registry/db/drizzle.config.ts`, `site/registry/db/docker-compose.yml`
- Modify: `site/registry.json`

**Interfaces:**
- Consumes: the `db` entry of `CAPABILITIES` from Task 1 — scripts `db:up`, `db:generate`, `db:migrate`, `db:studio`; env `DATABASE_URL`.
- Produces: in the generated app, `src/lib/db/index.ts` exporting `db` (a `NodePgDatabase` with the schema attached) and `src/lib/db/schema.ts` exporting `post`. Task 3's `auth.ts` imports `{ db } from "@/lib/db"`.

- [ ] **Step 1: Create `site/registry/db/env.ts`**

Each capability validates its own environment. The template's `src/env.ts` is not edited by any capability — there is no merge story for a TypeScript file, and separate `createEnv` calls compose without one.

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const dbEnv = createEnv({
  server: {
    DATABASE_URL: z.url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
  },
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 2: Create `site/registry/db/schema.ts`**

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** An example table. Delete it once you have one of your own. */
export const post = pgTable("post", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Create `site/registry/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { dbEnv } from "./env";
import * as schema from "./schema";

const pool = new Pool({ connectionString: dbEnv.DATABASE_URL });

export const db = drizzle(pool, { schema });
```

- [ ] **Step 4: Create `site/registry/db/drizzle.config.ts`**

drizzle-kit runs outside Next, so it cannot use `dbEnv`. It loads `.env` itself; the explicit check turns a missing variable into a sentence rather than a stack trace.

```ts
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/*schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
```

The `*schema.ts` glob is load-bearing: it matches both `schema.ts` from this capability and `auth-schema.ts` from Task 3, so one `db:generate` covers both.

- [ ] **Step 5: Create `site/registry/db/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_USER: blueprint
      POSTGRES_PASSWORD: blueprint
      POSTGRES_DB: blueprint
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U blueprint"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres-data:
```

The credentials match the `DATABASE_URL` default in `CAPABILITIES.db.env`, so `pnpm db:up && pnpm db:migrate` works with no editing.

- [ ] **Step 6: Declare the item in `site/registry.json`**

Append to the `items` array:

```json
    {
      "name": "db",
      "type": "registry:lib",
      "title": "Database",
      "description": "Drizzle ORM on Postgres through node-postgres, with a local Docker database and migrations.",
      "dependencies": ["drizzle-orm@0.45.2", "pg@8.23.0", "@t3-oss/env-nextjs@0.13.11", "zod@4.6.2"],
      "devDependencies": ["drizzle-kit@0.31.10", "@types/pg@8.23.1"],
      "files": [
        { "path": "registry/db/index.ts", "type": "registry:lib", "target": "src/lib/db/index.ts" },
        { "path": "registry/db/schema.ts", "type": "registry:lib", "target": "src/lib/db/schema.ts" },
        { "path": "registry/db/env.ts", "type": "registry:lib", "target": "src/lib/db/env.ts" },
        { "path": "registry/db/drizzle.config.ts", "type": "registry:file", "target": "drizzle.config.ts" },
        { "path": "registry/db/docker-compose.yml", "type": "registry:file", "target": "docker-compose.yml" }
      ]
    }
```

- [ ] **Step 7: Verify the item resolves when served**

Run:

```bash
cd site && pnpm build && (pnpm start &) && sleep 5 && \
  curl -sf http://localhost:3000/r/db.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const i=JSON.parse(s);console.log(i.name, i.files.length, i.files.map(f=>f.target).join(' '));console.log('inlined:', i.files.every(f=>typeof f.content==='string'&&f.content.length>0))})"
```

Expected: `db 5 src/lib/db/index.ts src/lib/db/schema.ts src/lib/db/env.ts drizzle.config.ts docker-compose.yml` then `inlined: true`. The second line is the one that matters — `loadRegistryItem` reading the file off disk is the entire reason these are real `.ts` files rather than JSON strings.

Kill the server afterwards: `pkill -f "next start"`.

- [ ] **Step 8: Commit**

```bash
git add site/registry/db site/registry.json
git commit -m "feat(registry): db capability — drizzle, pg, migrations, docker"
```

---

## Task 3: The `auth` capability

**Files:**
- Modify: `site/tsconfig.json`, `site/next.config.ts` (moved here from Task 6 — Task 2 proved the site cannot build until `registry/` leaves the typecheck, and every verification step below depends on a building site)
- Create: `site/registry/auth/auth.ts`, `auth-env.ts`, `auth-client.ts`, `auth-schema.ts`, `route.ts`, `auth-form.tsx`, `sign-in-page.tsx`, `sign-up-page.tsx`, `playwright.config.ts`, `sign-up.spec.ts`
- Modify: `site/registry.json`

**Interfaces:**
- Consumes: `db` from Task 2 (`import { db } from "@/lib/db"`), and the `auth` entry of `CAPABILITIES` — scripts `db:auth-schema`, `test:e2e`; env `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
- Produces: `src/lib/auth.ts` exporting `auth`, `src/lib/auth-client.ts` exporting `authClient`, `signIn`, `signUp`, `signOut`, `useSession`.

- [ ] **Step 1: Exclude the capability sources from the site's typecheck**

Capability files import from `@/lib/db`, `@/lib/auth` and packages the site does not install; they are payloads, not site code. Biome still lints and formats them, because it needs no module resolution. Their types are proved by Task 8, which compiles them inside a real generated app — the only place those imports actually resolve.

In `site/tsconfig.json`, change the `exclude` array:

```json
  "exclude": ["node_modules", "registry"]
```

- [ ] **Step 2: Include the capability sources in the runtime trace**

`loadRegistryItem` reads these files with `readFile` at request time, from inside a dependency, so Next's tracer cannot see them. Without this the route handler 500s on Vercel while passing locally — the same defect Phase 2's final review caught for `src/components/ui/**`.

In `site/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./registry.json", "./src/components/ui/**", "./registry/**"],
    "/r/[name]": ["./registry.json", "./src/components/ui/**", "./registry/**"],
  },
};

export default nextConfig;
```

- [ ] **Step 3: Create `site/registry/auth/auth-env.ts`**

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const authEnv = createEnv({
  server: {
    BETTER_AUTH_SECRET: z.string().min(32, "Generate one with: openssl rand -base64 32"),
    BETTER_AUTH_URL: z.url(),
  },
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  },
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 4: Create `site/registry/auth/auth-schema.ts`**

better-auth's four core tables, hand-written against 1.7.4. `pnpm db:auth-schema` regenerates this file after a better-auth upgrade; it is committed rather than generated on install so a fresh project typechecks and migrates without an extra step.

```ts
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 5: Create `site/registry/auth/auth.ts`**

Passing `schema` explicitly is what keeps `auth` decoupled from `db`: the user's own `src/lib/db/schema.ts` is never edited by this capability.

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/auth-schema";
import { authEnv } from "./auth-env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: authEnv.BETTER_AUTH_SECRET,
  baseURL: authEnv.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
});
```

- [ ] **Step 6: Create `site/registry/auth/auth-client.ts`**

```ts
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
```

- [ ] **Step 7: Create `site/registry/auth/route.ts`**

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 8: Create `site/registry/auth/auth-form.tsx`**

One component with a `mode`, so the two pages are thin. Two near-identical page files would be the duplication a reviewer should reject.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const result =
      mode === "sign-up"
        ? await signUp.email({ email, password, name: String(form.get("name")) })
        : await signIn.email({ email, password });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="mx-auto mt-24 w-full max-w-sm p-6">
      <h1 className="font-heading font-semibold text-xl">
        {mode === "sign-up" ? "Create an account" : "Sign in"}
      </h1>
      <form className="mt-6 space-y-3" onSubmit={onSubmit}>
        {mode === "sign-up" ? <Input name="name" placeholder="Name" required /> : null}
        <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 9: Create the two pages**

`site/registry/auth/sign-in-page.tsx`:

```tsx
import { AuthForm } from "@/components/auth-form";

export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
```

`site/registry/auth/sign-up-page.tsx`:

```tsx
import { AuthForm } from "@/components/auth-form";

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
```

- [ ] **Step 10: Create the Playwright config and one end-to-end test**

Browser-mode component tests cannot drive a sign-up across routes; this is the first flow in the stack that needs a running app, which is exactly why `@playwright/test` arrives here rather than in the template floor.

`site/registry/auth/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

`site/registry/auth/sign-up.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

// Requires a running database: pnpm db:up && pnpm db:migrate
test("a new account can be created and lands signed in", async ({ page }) => {
  const email = `test-${Date.now()}@example.test`;

  await page.goto("/sign-up");
  await page.getByPlaceholder("Name").fill("Test Person");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/");
});
```

- [ ] **Step 11: Declare the item in `site/registry.json`**

```json
    {
      "name": "auth",
      "type": "registry:lib",
      "title": "Authentication",
      "description": "better-auth with email and password, on the db capability's Drizzle instance.",
      "dependencies": ["better-auth@1.7.4", "@t3-oss/env-nextjs@0.13.11", "zod@4.6.2"],
      "devDependencies": ["@playwright/test@1.63.0"],
      "files": [
        { "path": "registry/auth/auth.ts", "type": "registry:lib", "target": "src/lib/auth.ts" },
        { "path": "registry/auth/auth-env.ts", "type": "registry:lib", "target": "src/lib/auth-env.ts" },
        { "path": "registry/auth/auth-client.ts", "type": "registry:lib", "target": "src/lib/auth-client.ts" },
        { "path": "registry/auth/auth-schema.ts", "type": "registry:lib", "target": "src/lib/db/auth-schema.ts" },
        { "path": "registry/auth/route.ts", "type": "registry:file", "target": "src/app/api/auth/[...all]/route.ts" },
        { "path": "registry/auth/auth-form.tsx", "type": "registry:component", "target": "src/components/auth-form.tsx" },
        { "path": "registry/auth/sign-in-page.tsx", "type": "registry:file", "target": "src/app/sign-in/page.tsx" },
        { "path": "registry/auth/sign-up-page.tsx", "type": "registry:file", "target": "src/app/sign-up/page.tsx" },
        { "path": "registry/auth/playwright.config.ts", "type": "registry:file", "target": "playwright.config.ts" },
        { "path": "registry/auth/sign-up.spec.ts", "type": "registry:file", "target": "e2e/sign-up.spec.ts" }
      ]
    }
```

Note there is **no `registryDependencies: ["db"]`** here, by the Global Constraints. `resolveCapabilities(["auth"])` returns `["db", "auth"]`, and both URLs go to `shadcn add` in that order.

- [ ] **Step 12: Verify the item resolves and the targets are right**

Run:

```bash
cd site && pnpm build && (pnpm start &) && sleep 5 && \
  curl -sf http://localhost:3000/r/auth.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const i=JSON.parse(s);console.log(i.files.map(f=>f.target).join('\n'));console.log('registryDependencies:', i.registryDependencies ?? 'none');console.log('inlined:', i.files.every(f=>f.content?.length>0))})"
```

Expected: the ten targets above, `registryDependencies: none`, `inlined: true`.

Kill the server: `pkill -f "next start"`.

- [ ] **Step 13: Commit**

```bash
git add site/tsconfig.json site/next.config.ts site/registry/auth site/registry.json
git commit -m "feat(registry): auth capability — better-auth, schema, sign-in flow, e2e"
```

---

## Task 4: The `ai` capability

**Files:**
- Create: `site/registry/ai/ai-env.ts`, `site/registry/ai/route.ts`, `site/registry/ai/chat.tsx`
- Modify: `site/registry.json`

**Interfaces:**
- Consumes: the `ai` entry of `CAPABILITIES` — no scripts; env `OPENAI_API_KEY`.
- Produces: `src/app/api/chat/route.ts` and `src/components/chat.tsx` exporting `Chat`.

- [ ] **Step 1: Create `site/registry/ai/ai-env.ts`**

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const aiEnv = createEnv({
  server: {
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  },
  runtimeEnv: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  },
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 2: Create `site/registry/ai/route.ts`**

`createOpenAI` rather than the bare `openai` export, so the key comes from the validated env rather than from an ambient `process.env` read — and so the portability rule holds: no Vercel AI Gateway model string, no `@vercel/*` import.

```ts
import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { aiEnv } from "@/lib/ai-env";

const openai = createOpenAI({ apiKey: aiEnv.OPENAI_API_KEY });

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: openai(aiEnv.OPENAI_MODEL),
    instructions: "You are a helpful assistant.",
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
```

- [ ] **Step 3: Create `site/registry/ai/chat.tsx`**

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;
    sendMessage({ parts: [{ type: "text", text: input }] });
    setInput("");
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 p-4">
      <ol className="flex-1 space-y-4 overflow-y-auto">
        {messages.map((message) => (
          <li
            key={message.id}
            className={message.role === "user" ? "text-right" : "text-left"}
          >
            <div className="inline-block max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm">
              {message.parts.map((part, index) =>
                part.type === "text" ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: message parts have no stable id
                  <span key={index}>{part.text}</span>
                ) : null,
              )}
            </div>
          </li>
        ))}
      </ol>

      <form className="flex gap-2" onSubmit={onSubmit}>
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something"
          disabled={status === "streaming"}
        />
        <Button type="submit" size="icon" disabled={status === "streaming"}>
          <PaperPlaneRightIcon />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Declare the item in `site/registry.json`**

```json
    {
      "name": "ai",
      "type": "registry:lib",
      "title": "AI chat",
      "description": "A streaming chat route and client component on the AI SDK, against any OpenAI-compatible endpoint.",
      "dependencies": [
        "ai@7.0.99",
        "@ai-sdk/react@4.0.102",
        "@ai-sdk/openai@4.0.66",
        "@t3-oss/env-nextjs@0.13.11",
        "zod@4.6.2"
      ],
      "files": [
        { "path": "registry/ai/ai-env.ts", "type": "registry:lib", "target": "src/lib/ai-env.ts" },
        { "path": "registry/ai/route.ts", "type": "registry:file", "target": "src/app/api/chat/route.ts" },
        { "path": "registry/ai/chat.tsx", "type": "registry:component", "target": "src/components/chat.tsx" }
      ]
    }
```

This item declares **no `registryDependencies`**, and neither do `auth` or `tables`, even though all three import `button`, `card` and `input`. Naming `button` here would be actively wrong: the route handler rewrites this registry's own item names to absolute URLs, so `shadcn add ai.json` would pull the *blueprint* button into a project that deliberately opted out of the component registry. Capabilities rely on the components the template already ships and drag nothing extra in. The registry stays opt-in.

- [ ] **Step 5: Verify the item resolves**

Run:

```bash
cd site && pnpm build && (pnpm start &) && sleep 5 && \
  curl -sf http://localhost:3000/r/ai.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const i=JSON.parse(s);console.log(i.files.map(f=>f.target).join(' '));console.log('deps:', i.registryDependencies?.join(' ') ?? 'none')})"
```

Expected: the three targets, and `deps: none`. A capability that lists registry dependencies has coupled itself to the optional component registry — that is the defect this check exists to catch.

Kill the server: `pkill -f "next start"`.

- [ ] **Step 6: Commit**

```bash
git add site/registry/ai site/registry.json
git commit -m "feat(registry): ai capability — streaming chat route and component"
```

---

## Task 5: The `tables` and `tests` capabilities

**Files:**
- Create: `site/registry/tables/query-provider.tsx`, `site/registry/tables/data-table.tsx`, `site/registry/tests/vitest.config.mts`
- Modify: `site/registry.json`

**Interfaces:**
- Consumes: the `tables` and `tests` entries of `CAPABILITIES` from Task 1 — `tests` restores the `test` script and `TEST_DEPS`.
- Produces: `src/components/query-provider.tsx` exporting `QueryProvider`, `src/components/data-table.tsx` exporting `DataTable` and the `DataTableColumns<TData>` type alias.

TanStack Table 9.2.4 is five weeks old (9.0.0 shipped 2026-08-04 after two years of pre-releases) and is the maintained line — 8.21.3 has not moved since April 2025. Its API differs from v8: features are registered explicitly with `tableFeatures()`, the hook is `useTable`, and rendering goes through `table.FlexRender` rather than a free `flexRender`. Write the code below exactly as given.

- [ ] **Step 1: Create `site/registry/tables/query-provider.tsx`**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Create `site/registry/tables/data-table.tsx`**

```tsx
"use client";

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

export type DataTableColumns<TData extends object> = Array<ColumnDef<typeof features, TData>>;

export function DataTable<TData extends object>({
  columns,
  data,
  className,
}: {
  columns: DataTableColumns<TData>;
  data: TData[];
  className?: string;
}) {
  const table = useTable({ features, columns, data });

  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)}>
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-3 py-2 text-left font-medium">
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 disabled:cursor-default"
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                      {header.column.getIsSorted() === "asc" ? <CaretUpIcon /> : null}
                      {header.column.getIsSorted() === "desc" ? <CaretDownIcon /> : null}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `site/registry/tests/vitest.config.mts`**

This must be byte-identical to `template/vitest.config.mts`, so that `blueprint add tests` restores precisely what `stripTests` removed. Copy it:

```bash
cp template/vitest.config.mts site/registry/tests/vitest.config.mts
```

Then verify: `diff template/vitest.config.mts site/registry/tests/vitest.config.mts` — expected: no output.

- [ ] **Step 4: Declare both items in `site/registry.json`**

```json
    {
      "name": "tables",
      "type": "registry:lib",
      "title": "Data tables",
      "description": "TanStack Table with sorting, plus a TanStack Query provider for client-side fetching.",
      "dependencies": ["@tanstack/react-table@9.2.4", "@tanstack/react-query@5.102.8", "@phosphor-icons/react@2.1.10"],
      "files": [
        { "path": "registry/tables/query-provider.tsx", "type": "registry:component", "target": "src/components/query-provider.tsx" },
        { "path": "registry/tables/data-table.tsx", "type": "registry:component", "target": "src/components/data-table.tsx" }
      ]
    },
    {
      "name": "tests",
      "type": "registry:lib",
      "title": "Test harness",
      "description": "Restores the Vitest browser-mode harness to a project created with --no-tests.",
      "devDependencies": [
        "vitest@4.1.11",
        "@vitest/browser-playwright@4.1.11",
        "vite@8.3.0",
        "@vitejs/plugin-react@6.1.1",
        "playwright@1.63.0",
        "@testing-library/react@16.3.3"
      ],
      "files": [
        { "path": "registry/tests/vitest.config.mts", "type": "registry:file", "target": "vitest.config.mts" }
      ]
    }
```

The `devDependencies` list must match `TEST_DEPS` in `template/scripts/blueprint.mjs` exactly, name for name — that pairing is what makes the strip reversible.

- [ ] **Step 5: Verify the round trip is exact**

Run:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const reg = JSON.parse(readFileSync('./site/registry.json', 'utf8'));
const tests = reg.items.find(i => i.name === 'tests');
const declared = tests.devDependencies.map(d => d.slice(0, d.lastIndexOf('@'))).sort();
const { TEST_DEPS } = await import('./template/scripts/blueprint.mjs');
const expected = [...TEST_DEPS].sort();
console.log('declared:', declared.join(' '));
console.log('TEST_DEPS:', expected.join(' '));
console.log('match:', JSON.stringify(declared) === JSON.stringify(expected));
"
```

Expected: `match: true`.

- [ ] **Step 6: Commit**

```bash
git add site/registry/tables site/registry/tests site/registry.json
git commit -m "feat(registry): tables and tests capabilities"
```

---

## Task 6: Wire the capabilities into the site

**Files:**
- Modify: `site/src/app/page.tsx`

The `tsconfig.json` and `next.config.ts` edits this task used to own moved into Task 3: every capability task after the first needs a site that builds before it can verify its own item.

**Interfaces:**
- Consumes: the five `registry:lib` items declared in Tasks 2–5.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Split the gallery by item type**

The gallery currently renders every item as a component card with a `@blueprint/<name>` install line. Capabilities are not added that way — they come through `pnpm blueprint add`. In `site/src/app/page.tsx`, replace the single `items` binding and the single `<ul>`:

```tsx
  const components = items.filter((item) => item.type === "registry:ui");
  const capabilities = items.filter((item) => item.type === "registry:lib");
```

Change the intro paragraph to:

```tsx
      <p className="mt-2 text-muted-foreground">
        {components.length} components and {capabilities.length} capabilities.
      </p>
```

Keep the existing `<ul className="mt-10 space-y-4">` exactly as it is but map over `components` instead of `items`. Then add this section immediately after that list and before the Button section:

```tsx
      <section className="mt-16 border-t pt-8">
        <h2 className="font-heading font-medium text-xl">Capabilities</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Added to a project with the in-project script, which also merges the package.json
          scripts and environment variables each one needs.
        </p>
        <ul className="mt-6 space-y-4">
          {capabilities.map((item) => (
            <li key={item.name} className="rounded-lg border p-4">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-medium">{item.title ?? item.name}</h3>
                <code className="text-muted-foreground text-xs">{item.name}</code>
              </div>
              {item.description ? (
                <p className="mt-1 text-muted-foreground text-sm">{item.description}</p>
              ) : null}
              <code className="mt-3 block overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                pnpm blueprint add {item.name}
              </code>
            </li>
          ))}
        </ul>
      </section>
```

- [ ] **Step 2: Verify the site still passes and the gallery renders both lists**

Run:

```bash
cd site && pnpm typecheck && pnpm lint && pnpm test && pnpm build && (pnpm start &) && sleep 5 && \
  curl -s http://localhost:3000/ | grep -o '<li ' | wc -l
```

Expected: typecheck/lint/test/build all PASS, and the count is **9** — four `registry:ui` cards plus five capability cards. Count `<li ` elements, not name strings: the page is one minified line, so `grep -c` would report 1, and component names appear in both the markup and the RSC payload.

- [ ] **Step 3: Verify the trace actually caught the capability sources**

Run:

```bash
cd site && grep -c 'registry/db/index.ts' .next/server/app/r/\[name\]/route.js.nft.json
```

Expected: `1` or more. A `0` means `outputFileTracingIncludes` did not take, and every capability request would 500 in production while passing here.

Kill the server: `pkill -f "next start"`.

- [ ] **Step 4: Commit**

```bash
git add site/src/app/page.tsx
git commit -m "feat(site): serve and list capabilities alongside components"
```

---

## Task 7: The one-command setup CLI

**Files:**
- Create: `package.json` (repository root)
- Create: `bin/create.mjs`
- Create: `bin/create.test.mjs`

**Interfaces:**
- Consumes: `BUNDLES`, `CAPABILITIES`, `DEFAULT_REGISTRY`, `addCapabilities`, `stripTests` from `template/scripts/blueprint.mjs` (Task 1), and the capability items from Tasks 2–5.
- Produces: `parseArgs(argv) => { target, capabilities, tests, registry, yes }` and `copyTemplate(from, to)`, both exported for the test; the default entry point is the CLI itself.

- [ ] **Step 1: Write the failing test**

Create `bin/create.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test bin/*.test.mjs`
Expected: FAIL — `Cannot find module './create.mjs'`.

- [ ] **Step 3: Create the bin-only root `package.json`**

The spec bans configuration at the repository root; this manifest is the one named exception. It is safe because only `pnpm-workspace.yaml` creates a workspace and only a root `biome.json` triggers Biome's nested-configuration failure. Keep it to exactly these keys — adding `dependencies`, `scripts` or `packageManager` would start reintroducing the problem.

```json
{
  "name": "project-blueprint",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "One command to start a project on the blueprint stack.",
  "bin": "bin/create.mjs",
  "license": "MIT"
}
```

The string form of `bin` names the command after the package, which is what makes `npx github:<owner>/project-blueprint my-app` resolve a single unambiguous binary.

- [ ] **Step 4: Write `bin/create.mjs`**

```js
#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BUNDLES,
  CAPABILITIES,
  DEFAULT_REGISTRY,
  addCapabilities,
  stripTests,
} from "../template/scripts/blueprint.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Never copied into a new project: build output, installed deps, and local caches. */
const SKIP = new Set(["node_modules", ".next", "tsconfig.tsbuildinfo", ".turbo", ".vercel"]);

function value(argv, index, flag) {
  const found = argv[index];
  if (found === undefined || found.startsWith("-")) throw new Error(`${flag} needs a value`);
  return found;
}

export function parseArgs(argv) {
  const args = {
    target: undefined,
    capabilities: [],
    tests: true,
    registry: DEFAULT_REGISTRY,
    wireRegistry: false,
    yes: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-tests") args.tests = false;
    else if (arg === "--yes" || arg === "-y") args.yes = true;
    else if (arg === "--registry") args.registry = value(argv, ++i, arg);
    else if (arg === "--with-registry") args.wireRegistry = true;
    else if (arg === "--capabilities") {
      args.capabilities = value(argv, ++i, arg).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (args.target === undefined) args.target = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }

  for (const name of args.capabilities) {
    if (!CAPABILITIES[name] && !BUNDLES[name]) throw new Error(`Unknown capability: ${name}`);
  }

  return args;
}

export function copyTemplate(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (source) => !SKIP.has(basename(source)),
  });
}

async function prompt(rl, question, fallback) {
  const answer = (await rl.question(`${question} `)).trim();
  return answer === "" ? fallback : answer;
}

async function askMissing(args) {
  if (args.yes) return args;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (args.target === undefined) {
      args.target = await prompt(rl, "Project name?", "my-app");
    }

    if (args.capabilities.length === 0) {
      const choice = await prompt(
        rl,
        "What are you building? [1] landing page  [2] saas (db + auth + tables)  [3] ai —",
        "1",
      );
      if (choice === "2" || choice === "saas") args.capabilities = ["saas"];
      else if (choice === "3" || choice === "ai") args.capabilities = ["ai"];
    }

    const registry = await prompt(rl, "Wire the @blueprint component registry? [y/N]", "n");
    args.wireRegistry = registry.toLowerCase().startsWith("y");

    if (args.tests) {
      const keep = await prompt(rl, "Keep the test harness? [Y/n]", "y");
      args.tests = !keep.toLowerCase().startsWith("n");
    }
  } finally {
    rl.close();
  }

  return args;
}

function run(command, commandArgs, cwd) {
  execFileSync(command, commandArgs, { cwd, stdio: "inherit" });
}

async function main(argv) {
  const args = await askMissing(parseArgs(argv));
  const target = resolve(process.cwd(), args.target ?? "my-app");
  const name = basename(target);

  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`${target} already exists and is not empty.`);
  }

  process.stdout.write(`\nCreating ${name} in ${target}\n`);
  copyTemplate(join(repoRoot, "template"), target);

  const packagePath = join(target, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  pkg.name = name;
  pkg.blueprint = { registry: args.registry };
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  if (!args.tests) {
    const removed = stripTests(target);
    process.stdout.write(`Skipping tests, removed ${removed.length} files\n`);
  }

  process.stdout.write("\nInstalling dependencies\n");
  run("pnpm", ["install"], target);

  if (args.capabilities.length > 0) {
    process.stdout.write(`\nAdding capabilities: ${args.capabilities.join(", ")}\n`);
    addCapabilities(target, args.capabilities, { registry: args.registry });
  }

  if (args.wireRegistry) {
    run("pnpm", ["exec", "shadcn", "registry", "add", `@blueprint=${args.registry}/r/{name}.json`], target);
  }

  try {
    run("git", ["init", "-b", "main"], target);
  } catch {
    process.stdout.write("git init failed, skipping — the project is fine without it\n");
  }

  process.stdout.write(`
Done.

  cd ${name}
  cp .env.example .env
  pnpm dev
`);

  if (args.capabilities.length > 0) {
    process.stdout.write(`
Your capabilities need some environment variables — see .env.example.
With the db capability: pnpm db:up && pnpm db:generate && pnpm db:migrate
`);
  }

  process.stdout.write("\nAdd more later with: pnpm blueprint add <capability>\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`\n${error.message}\n`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `chmod +x bin/create.mjs && node --test bin/*.test.mjs`
Expected: PASS, 9 tests, no warnings.

- [ ] **Step 6: Verify the two CLIs agree on one capability table**

The whole reason `bin/create.mjs` imports from `template/scripts/blueprint.mjs` is to avoid two copies drifting apart.

Run:

```bash
node --input-type=module -e "
const create = await import('./bin/create.mjs');
const bp = await import('./template/scripts/blueprint.mjs');
const args = create.parseArgs(['app', '--capabilities', 'saas']);
console.log('parsed:', args.capabilities.join(','));
console.log('resolves to:', bp.resolveCapabilities(args.capabilities).join(','));
console.log('default registry shared:', args.registry === bp.DEFAULT_REGISTRY);
"
```

Expected: `parsed: saas`, `resolves to: db,auth,tables`, `default registry shared: true`.

- [ ] **Step 7: Commit**

```bash
git add package.json bin
git commit -m "feat(cli): one command to start a project"
```

---

## Task 8: End-to-end CI for the capabilities

**Files:**
- Modify: `.github/workflows/template.yml`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: nothing consumed by a later task.

This job is the only thing in the repository that proves a capability's TypeScript actually compiles, that its `target` paths land where the imports expect, and that the scripts and environment variables get merged. Task 6 deliberately excluded `site/registry/` from the site's own typecheck; this is where that debt is paid.

- [ ] **Step 1: Add the job**

Append to `.github/workflows/template.yml`, as a sibling of `build-template`:

```yaml
  build-with-capabilities:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgres://blueprint:blueprint@localhost:5432/blueprint
      BETTER_AUTH_SECRET: ci-secret-that-is-long-enough-to-pass-validation
      BETTER_AUTH_URL: http://localhost:3000
      OPENAI_API_KEY: sk-ci-not-a-real-key
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: 10.0.0
      - uses: actions/setup-node@v5
        with:
          node-version: 24

      - name: Build and serve the registry
        working-directory: site
        shell: bash
        run: |
          pnpm install --frozen-lockfile
          pnpm build
          pnpm start &
          for i in $(seq 1 30); do
            curl -sf http://localhost:3000/r/registry.json >/dev/null && exit 0
            sleep 1
          done
          echo "registry never came up"
          exit 1

      - name: Create an app with every capability
        run: |
          node bin/create.mjs "${RUNNER_TEMP}/app" \
            --capabilities db,auth,ai,tables \
            --registry http://localhost:3000 \
            --no-tests --yes

      - name: The capabilities must have been wired in
        working-directory: ${{ runner.temp }}/app
        shell: bash
        run: |
          for f in src/lib/db/index.ts src/lib/auth.ts src/lib/db/auth-schema.ts \
                   src/app/api/auth/\[...all\]/route.ts src/app/api/chat/route.ts \
                   src/components/data-table.tsx drizzle.config.ts docker-compose.yml; do
            test -f "$f" || { echo "missing: $f"; exit 1; }
          done
          node -e "
            const p = require('./package.json');
            for (const s of ['db:up','db:migrate','db:studio','test:e2e']) {
              if (!p.scripts[s]) { console.error('missing script: ' + s); process.exit(1); }
            }
            if (p.scripts.test) { console.error('--no-tests left the test script behind'); process.exit(1); }
          "
          grep -q '^DATABASE_URL=' .env.example
          grep -q '^BETTER_AUTH_SECRET=' .env.example
          grep -q '^OPENAI_API_KEY=' .env.example

      - name: Typecheck, lint and build the generated app
        working-directory: ${{ runner.temp }}/app
        run: pnpm typecheck && pnpm lint && pnpm build

      - name: Adding a capability twice must not break the project
        working-directory: ${{ runner.temp }}/app
        run: pnpm blueprint add db && pnpm typecheck
```

`--no-tests` here is deliberate: it exercises `stripTests` and keeps the job from downloading Playwright browsers. The kept-tests path is already covered by the `build-template` job above, which installs and runs the harness against an untouched template.

The environment variables are dummies with realistic shapes — `next build` imports the route handlers, which construct `dbEnv`, `authEnv` and `aiEnv` at module scope, so a build with none of them set would fail on validation rather than on anything this job is trying to prove.

- [ ] **Step 2: Rehearse the job locally**

Run, from the repository root:

```bash
cd site && pnpm build && (pnpm start &) && sleep 8 && cd .. && \
rm -rf /tmp/bp-app && \
DATABASE_URL=postgres://blueprint:blueprint@localhost:5432/blueprint \
BETTER_AUTH_SECRET=ci-secret-that-is-long-enough-to-pass-validation \
BETTER_AUTH_URL=http://localhost:3000 \
OPENAI_API_KEY=sk-ci-not-a-real-key \
node bin/create.mjs /tmp/bp-app --capabilities db,auth,ai,tables --registry http://localhost:3000 --no-tests --yes
```

Expected: the CLI completes without error and prints the next steps.

Then:

```bash
cd /tmp/bp-app && \
DATABASE_URL=postgres://blueprint:blueprint@localhost:5432/blueprint \
BETTER_AUTH_SECRET=ci-secret-that-is-long-enough-to-pass-validation \
BETTER_AUTH_URL=http://localhost:3000 \
OPENAI_API_KEY=sk-ci-not-a-real-key \
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all PASS. This is the first moment in Phase 3 that any capability's types are checked — treat a failure here as a defect in Tasks 2–5, fix it there, and rerun.

Kill the server: `pkill -f "next start"`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/template.yml
git commit -m "ci: build a real app with every capability"
```

---

## Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `template/README.md`

**Interfaces:**
- Consumes: the finished CLI and capabilities.
- Produces: nothing.

- [ ] **Step 1: Rewrite the repository `README.md` around the one command**

The README currently documents a `degit` clone. Replace the getting-started section with:

````markdown
## Start a project

```bash
npx github:khantthura/project-blueprint my-app
```

Four questions — name, what you're building, whether to wire the component
registry, whether to keep the test harness — then it copies the template,
installs, pulls the capabilities you chose, and prints the next steps.

Non-interactive:

```bash
npx github:khantthura/project-blueprint my-app --capabilities saas --no-tests --yes
```

| Flag | |
|---|---|
| `--capabilities <list>` | `db`, `auth`, `ai`, `tables`, or the `saas` bundle |
| `--no-tests` | drop the Vitest harness |
| `--registry <url>` | point at a different deployment |
| `--with-registry` | wire the `@blueprint` namespace without prompting |
| `--yes` | skip every prompt |

## Grow a project

```bash
pnpm blueprint add db      # month 3
pnpm blueprint add auth    # month 6
pnpm blueprint add ai      # month 9
```

Each one fetches the capability from the registry, merges the `package.json`
scripts it needs, and appends its variables to `.env.example`. Nothing is
restructured, and running it twice is a no-op.
````

Keep the existing sections on the registry and the preview site. Fix any remaining `degit` reference.

- [ ] **Step 2: Document the script in `template/README.md`**

Add, after the existing scripts table:

````markdown
## Adding capabilities

```bash
pnpm blueprint add <db|auth|ai|tables|tests|saas>
```

`auth` pulls `db` with it. The script never passes `--overwrite`, so by the
time you have customised `src/lib/auth.ts`, shadcn prompts per file and your
edits survive.

The registry it pulls from is the `blueprint.registry` field in this
project's `package.json`. Change that one field to point somewhere else.
````

- [ ] **Step 3: Fix the two stale lines in the spec**

The spec discusses `degit` in three places as the *rejected* earlier design; leave those — they are the record of why the CLI exists. Two lines state it as current behaviour and are now wrong:

`docs/superpowers/specs/2026-09-12-project-blueprint-design.md`, in "Architecture":

```
`scripts/blueprint.mjs` lives inside `template/`, so every generated app
carries its own copy. Its source of truth is this repository; apps receive it
when the setup CLI copies the template, and do not update it afterwards.
```

And in "Decisions needed before implementation":

```
- **Repository owner/name** appears in the `npx github:` command in the README
  and in the CLI's default registry URL. Neither is baked into a published
  artifact, so renaming the repository breaks nothing that already exists.
```

- [ ] **Step 4: Verify no stale instructions survive in the READMEs**

Run:

```bash
grep -n "degit\|blueprint init" README.md template/README.md || echo "clean"
```

Expected: `clean`. The greps are scoped to the two READMEs deliberately — the spec's `degit` mentions are historical and must survive.

- [ ] **Step 5: Commit**

```bash
git add README.md template/README.md docs/superpowers/specs/
git commit -m "docs: one command to start, one command to grow"
```

---

## Risks carried into this phase

- **`npx github:` bin resolution is unverified.** Standard npm behaviour, but untested against a real remote. The first push should confirm it before anything else is built on it.
- **`DEFAULT_REGISTRY` is a prediction.** `https://project-blueprint.vercel.app` is the URL Vercel gives a project of that name, but the deployment does not exist yet. One constant in `template/scripts/blueprint.mjs` to correct after the first deploy; `--registry` overrides it meanwhile.
- **The repository owner is a guess.** `khantthura` appears in `site/registry.json` and now in `README.md`. If it is wrong, three strings change.
- **`@better-auth/cli` lags the library** — 1.4.21 against better-auth 1.7.4. `auth-schema.ts` is therefore committed by hand rather than generated at install time; `pnpm db:auth-schema` is the regeneration path and should be checked against the library's own docs after a better-auth upgrade rather than trusted blindly.
- **TanStack Table 9.2.4 is five weeks old.** The v9 API is a rewrite of v8's. It is the maintained line — v8 has not shipped since April 2025 — but expect churn. The fallback is a rewrite of one file, `data-table.tsx`, against 8.21.3.
- **Capability sources are not typechecked in `site/`.** By design, but it means Task 8's CI job is the only gate on them. If that job is skipped or broken, a capability that does not compile can reach `main`.
