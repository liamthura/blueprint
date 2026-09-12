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
      "db:auth-schema":
        "pnpm dlx @better-auth/cli@latest generate --output src/lib/db/auth-schema.ts",
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
const TEST_GLOBS = ["src/*.test.ts", "src/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"];

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
