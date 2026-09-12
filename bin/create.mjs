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

/**
 * `template/.gitignore` is dropped from the tarball by npm-packlist's always-excluded
 * defaults, so `npx github:...` never ships it. This is the fallback for when the
 * source file isn't readable in the repo clone either.
 */
const FALLBACK_GITIGNORE = `/node_modules
/.next/
/build
/out/
.env*
!.env.example
*.tsbuildinfo
next-env.d.ts
.DS_Store
/coverage
.vercel
`;

/** Writes a .gitignore into `target` if the copy from `templateDir` didn't bring one. */
export function ensureGitignore(templateDir, target) {
  const path = join(target, ".gitignore");
  if (existsSync(path)) return;
  const source = join(templateDir, ".gitignore");
  const content = existsSync(source) ? readFileSync(source, "utf8") : FALLBACK_GITIGNORE;
  writeFileSync(path, content);
}

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
      args.capabilities = value(argv, ++i, arg)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
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

    if (!args.wireRegistry) {
      const registry = await prompt(rl, "Wire the @blueprint component registry? [y/N]", "n");
      args.wireRegistry = registry.toLowerCase().startsWith("y");
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

  process.stdout.write(`\nCreating ${name} in ${target}\n`);
  copyTemplate(join(repoRoot, "template"), target);
  ensureGitignore(join(repoRoot, "template"), target);

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
  run("pnpm", ["install", "--no-frozen-lockfile"], target);

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
