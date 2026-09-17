#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs as parse } from "node:util";
import {
  BUNDLES,
  CAPABILITIES,
  DEFAULT_PRESET,
  DEFAULT_REGISTRY,
  addCapabilities,
  applyPreset,
  DEFAULT_SOURCE,
  isEntryPoint,
  resolveCapabilities,
  stripTests,
} from "../template/scripts/blueprint.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Matches the credentials in the db capability's compose.db.yaml. */
const LOCAL_DATABASE_URL = "postgres://blueprint:blueprint@localhost:5432/blueprint";

/**
 * Seeds .env from .env.example and sets any values collected at setup, so the
 * project runs without the user hand-editing a file first. .env is gitignored;
 * .env.example stays the committed template.
 */
export function writeEnv(target, values) {
  const path = join(target, ".env");
  const example = join(target, ".env.example");
  let text = existsSync(path)
    ? readFileSync(path, "utf8")
    : existsSync(example)
      ? readFileSync(example, "utf8")
      : "";

  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const existing = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${value}`;
    text = existing.test(text)
      ? text.replace(existing, line)
      : `${text.endsWith("\n") || text === "" ? text : `${text}\n`}${line}\n`;
  }

  writeFileSync(path, text);
  return path;
}

/** Never copied into a new project: build output, installed deps, and local caches. */
const SKIP = new Set(["node_modules", ".next", "tsconfig.tsbuildinfo", ".turbo", ".vercel"]);

/**
 * `template/.gitignore` is dropped from the tarball by npm-packlist's always-excluded
 * defaults, so `npx github:...` never ships it and the copy arrives without one. This
 * constant is what a project gets in that case. It is a verbatim copy of
 * `template/.gitignore`; the test asserts they stay identical, because a drifted copy
 * is how an `npx`-made project ends up committing a `.pem` or a screenshot artifact.
 */
export const FALLBACK_GITIGNORE = `# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage
/.vitest-attachments
**/__screenshots__

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
!.env.example
`;

/** Writes a .gitignore into `target` if the copy from the template didn't bring one. */
export function ensureGitignore(target) {
  const path = join(target, ".gitignore");
  if (existsSync(path)) return;
  writeFileSync(path, FALLBACK_GITIGNORE);
}

export function parseArgs(argv) {
  const { values, positionals } = parse({
    args: argv,
    allowPositionals: true,
    options: {
      "no-tests": { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      registry: { type: "string" },
      preset: { type: "string" },
      "database-url": { type: "string" },
      capabilities: { type: "string" },
    },
  });

  if (positionals.length > 1) throw new Error(`Unexpected argument: ${positionals[1]}`);

  const capabilities = (values.capabilities ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  for (const name of capabilities) {
    if (!CAPABILITIES[name] && !BUNDLES[name]) throw new Error(`Unknown capability: ${name}`);
  }

  return {
    target: positionals[0],
    capabilities,
    tests: !values["no-tests"],
    registry: values.registry ?? DEFAULT_REGISTRY,
    preset: values.preset ?? DEFAULT_PRESET,
    databaseUrl: values["database-url"],
    yes: values.yes ?? false,
  };
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

    if (args.preset === DEFAULT_PRESET) {
      args.preset = await prompt(
        rl,
        `shadcn preset? Enter a code from ui.shadcn.com/create, or press enter for the house default [${DEFAULT_PRESET}]`,
        DEFAULT_PRESET,
      );
    }

    if (args.databaseUrl === undefined && resolveCapabilities(args.capabilities).includes("db")) {
      args.databaseUrl = await prompt(
        rl,
        `Postgres URL? Press enter for the local Docker one [${LOCAL_DATABASE_URL}]`,
        LOCAL_DATABASE_URL,
      );
    }

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

  const capabilities = resolveCapabilities(args.capabilities);
  const hasDb = capabilities.includes("db");
  const hasAuth = capabilities.includes("auth");

  process.stdout.write(`\nCreating ${name} in ${target}\n`);
  copyTemplate(join(repoRoot, "template"), target);
  ensureGitignore(target);

  const packagePath = join(target, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  pkg.name = name;
  pkg.blueprint = { source: DEFAULT_SOURCE, ...(args.registry ? { registry: args.registry } : {}) };
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  if (!args.tests) {
    const removed = stripTests(target);
    process.stdout.write(`Skipping tests, removed ${removed.length} files\n`);
  }

  process.stdout.write("\nInstalling dependencies\n");
  run("pnpm", ["install", "--no-frozen-lockfile"], target);

  if (args.preset !== DEFAULT_PRESET) {
    process.stdout.write(`\nApplying preset ${args.preset}\n`);
    applyPreset(target, args.preset);
    run("pnpm", ["install", "--no-frozen-lockfile"], target);
  }

  if (args.capabilities.length > 0) {
    process.stdout.write(`\nAdding capabilities: ${args.capabilities.join(", ")}\n`);
    addCapabilities(target, args.capabilities, {
      registry: args.registry,
      source: join(repoRoot, "site"),
    });
  }

  writeEnv(target, {
    DATABASE_URL: args.databaseUrl,
    // Generated per project rather than left blank: better-auth requires 32+ chars,
    // so an empty value makes `pnpm build` fail on the very first run. A secret the
    // user never has to think about beats a secret they have to be told to create.
    BETTER_AUTH_SECRET: hasAuth ? randomBytes(32).toString("base64url") : undefined,
  });

  try {
    run("git", ["init", "-b", "main"], target);
  } catch {
    process.stdout.write("git init failed, skipping — the project is fine without it\n");
  }

  process.stdout.write(`
Done.

  cd ${name}
  pnpm dev
`);

  const composeFiles = ["compose.yaml"];
  if (hasDb) composeFiles.push("compose.db.yaml");

  if (args.capabilities.length > 0) {
    process.stdout.write(`
Fill in anything still blank in .env — see .env.example for the full list.
`);
    if (hasDb) {
      process.stdout.write(`
Start the database and run the first migration:

  pnpm db:up && pnpm db:generate && pnpm db:migrate
`);
    }
  }

  process.stdout.write(`
Run it in Docker:

  docker compose${composeFiles.map((f) => ` -f ${f}`).join("")} up --build
`);

  process.stdout.write("\nAdd more later with: pnpm blueprint add <capability>\n");
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`\n${error.message}\n`);
    process.exitCode = 1;
  });
}
