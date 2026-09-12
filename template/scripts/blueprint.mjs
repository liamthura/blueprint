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
/**
 * The house design baseline. The template already ships with this preset applied,
 * so choosing it at setup is a no-op — nothing is re-themed and nothing can break.
 */
export const DEFAULT_PRESET = "b7lltUjfaE";

/**
 * Every font a shadcn preset can specify, mapped to its `next/font/google` export.
 * The set is closed (shadcn's own preset type declares exactly these), and the
 * mapping is NOT a mechanical transform — `dm-sans`, `ibm-plex-sans` and
 * `jetbrains-mono` all break a split-capitalise-join rule. A font outside this map
 * means shadcn added one: `applyPreset` leaves the fonts alone and says so rather
 * than guessing an export name that would fail at build time.
 */
export const PRESET_FONTS = {
  "dm-sans": "DM_Sans",
  geist: "Geist",
  "geist-mono": "Geist_Mono",
  "ibm-plex-sans": "IBM_Plex_Sans",
  "instrument-sans": "Instrument_Sans",
  inter: "Inter",
  "jetbrains-mono": "JetBrains_Mono",
  lora: "Lora",
  merriweather: "Merriweather",
  montserrat: "Montserrat",
  oxanium: "Oxanium",
  "playfair-display": "Playfair_Display",
  roboto: "Roboto",
  "source-sans-3": "Source_Sans_3",
  "space-grotesk": "Space_Grotesk",
};

/** The npm package behind each icon library shadcn's `iconLibrary` field can name. */
export const ICON_PACKAGES = {
  lucide: "lucide-react@1.45.0",
  tabler: "@tabler/icons-react@3.46.0",
  hugeicons: "hugeicons-react@0.4.0",
  phosphor: "@phosphor-icons/react@2.1.10",
  remix: "@remixicon/react@4.9.0",
};

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
    const lines = CAPABILITIES[name].env.filter((line) => {
      const key = line.slice(0, line.indexOf("="));
      return !new RegExp(`^${key}=`, "m").test(text);
    });
    if (lines.length === 0) continue;
    if (!text.endsWith("\n")) text += "\n";
    text += `# ${name}\n`;
    for (const line of lines) {
      text += `${line}\n`;
      added.push(line.slice(0, line.indexOf("=")));
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
 * Reads the fonts out of `shadcn preset decode`.
 *
 * Returns null when the preset cannot be decoded. `shadcn apply` accepts a named
 * style (`nova`, `vega`, ...) as well as a generated code, but `preset decode`
 * only understands codes — so a named style is a normal outcome here, not an error.
 */
export function decodePreset(dir, code) {
  let out;
  try {
    out = execFileSync("pnpm", ["exec", "shadcn", "preset", "decode", code], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  const field = (name) => out.match(new RegExp(`^\\s*${name}\\s+(\\S+)`, "m"))?.[1];
  return {
    font: field("font")?.replace(/\*$/, ""),
    fontHeading: field("fontHeading")?.replace(/\*$/, ""),
  };
}

/** The icon library a project is currently configured for, per components.json. */
export function currentIconLibrary(dir) {
  const path = join(dir, "components.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")).iconLibrary ?? null;
}

/**
 * Points layout.tsx's three font slots at different next/font/google exports.
 * Only the export names change — the CSS variable names are font-neutral, so
 * globals.css and every consumer of `font-sans` stay untouched.
 */
export function rewriteFonts(dir, { sans, heading }) {
  const path = join(dir, "src", "app", "layout.tsx");
  if (!existsSync(path)) return [];

  const source = readFileSync(path, "utf8");
  const current = {
    sans: source.match(/const fontSans = (\w+)\(/)?.[1],
    heading: source.match(/const fontHeading = (\w+)\(/)?.[1],
  };
  const mono = source.match(/const fontMono = (\w+)\(/)?.[1];
  if (!current.sans || !current.heading || !mono) return [];

  const wanted = { sans: sans ?? current.sans, heading: heading ?? current.heading };
  if (wanted.sans === current.sans && wanted.heading === current.heading) return [];

  const imports = [...new Set([wanted.sans, mono, wanted.heading])].sort().join(", ");
  const next = source
    .replace(
      /import \{[^}]*\} from "next\/font\/google";/,
      `import { ${imports} } from "next/font/google";`,
    )
    .replace(/const fontSans = \w+\(/, `const fontSans = ${wanted.sans}(`)
    .replace(/const fontHeading = \w+\(/, `const fontHeading = ${wanted.heading}(`);

  writeFileSync(path, next);
  return [
    current.sans === wanted.sans ? null : `sans ${current.sans} -> ${wanted.sans}`,
    current.heading === wanted.heading ? null : `heading ${current.heading} -> ${wanted.heading}`,
  ].filter(Boolean);
}

/** Swaps the icon dependency, so a project never carries two icon libraries. */
export function swapIconPackage(dir, iconLibrary) {
  const wanted = ICON_PACKAGES[iconLibrary];
  if (!wanted) return null;

  const name = wanted.slice(0, wanted.lastIndexOf("@"));
  const version = wanted.slice(wanted.lastIndexOf("@") + 1);
  const pkg = readPackage(dir);
  pkg.dependencies ??= {};

  const stale = Object.values(ICON_PACKAGES)
    .map((spec) => spec.slice(0, spec.lastIndexOf("@")))
    .filter((other) => other !== name && other in pkg.dependencies);

  if (pkg.dependencies[name] === version && stale.length === 0) return null;

  for (const other of stale) delete pkg.dependencies[other];
  pkg.dependencies[name] = version;
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort());
  writePackage(dir, pkg);
  return { added: name, removed: stale };
}

/**
 * Re-themes a project to a different shadcn preset.
 *
 * `shadcn apply` does most of it, but three of its font and icon behaviours are
 * wrong for this template:
 *
 *  - It rewrites globals.css's font slots to `var(--font-sans)`, a self-reference.
 *    A custom property that references itself is a cycle, so the value resolves to
 *    nothing and every font silently falls back.
 *  - It rewrites layout.tsx's `cn()` call to append font variables it expects to
 *    find, under the names upstream's own scaffold uses. Against this template it
 *    emits a dangling comma and references undeclared identifiers — a syntax error
 *    that fails `tsc` outright.
 *  - It installs the preset's icon package at a caret range and leaves the old one
 *    behind, which is precisely the two-icon-libraries defect this project exists
 *    to avoid.
 *
 * So the division is: `apply` owns the theme CSS and the components, and this
 * function owns the fonts and the icon dependency. layout.tsx and the font slots
 * are snapshotted and restored, then repointed deliberately.
 * Call this BEFORE adding capabilities — `shadcn add` rewrites icon imports to match
 * components.json, so capabilities pulled afterwards get the right icons for free.
 */
export function applyPreset(dir, code, { log = (line) => process.stdout.write(line) } = {}) {
  if (code === DEFAULT_PRESET) return { applied: false, reason: "already the default preset" };

  const cssPath = join(dir, "src", "app", "globals.css");
  const layoutPath = join(dir, "src", "app", "layout.tsx");
  const cssBefore = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : null;
  const layoutBefore = existsSync(layoutPath) ? readFileSync(layoutPath, "utf8") : null;

  execFileSync("pnpm", ["exec", "shadcn", "apply", code, "-y"], { cwd: dir, stdio: "inherit" });

  if (layoutBefore !== null && readFileSync(layoutPath, "utf8") !== layoutBefore) {
    writeFileSync(layoutPath, layoutBefore);
  }

  if (cssBefore) {
    const slots = cssBefore.match(/^\s*--font-(?:sans|mono|heading):.*$/gm) ?? [];
    let css = readFileSync(cssPath, "utf8");
    for (const slot of slots) {
      const name = slot.match(/--font-(sans|mono|heading):/)[1];
      css = css.replace(new RegExp(`^\\s*--font-${name}:.*$`, "m"), slot);
    }
    if (css !== readFileSync(cssPath, "utf8")) writeFileSync(cssPath, css);
  }

  const decoded = decodePreset(dir, code);
  const unknown = decoded
    ? [decoded.font, decoded.fontHeading].filter((f) => f && !PRESET_FONTS[f])
    : [];

  let fonts = [];
  if (!decoded) {
    log(`\n  fonts: unchanged — "${code}" is a named style, and only generated preset\n`);
    log("         codes carry font information. Set fonts in src/app/layout.tsx.\n");
  } else if (unknown.length > 0) {
    log(`\n  fonts: unchanged — shadcn named ${unknown.join(" and ")}, which this script has\n`);
    log("         no next/font/google export for. Set them in src/app/layout.tsx.\n");
  } else {
    fonts = rewriteFonts(dir, {
      sans: PRESET_FONTS[decoded.font],
      heading: PRESET_FONTS[decoded.fontHeading],
    });
    for (const change of fonts) log(`  font: ${change}\n`);
  }

  // components.json is authoritative here: `apply` has just written it, so it
  // reflects what actually happened rather than what the code asked for.
  const icons = swapIconPackage(dir, currentIconLibrary(dir));
  if (icons?.removed.length) log(`  icons: ${icons.removed.join(", ")} -> ${icons.added}\n`);

  // `apply` rewrites the ui components in upstream's own formatting, which does not
  // match this template's Biome config — without this the re-themed project fails
  // `pnpm lint` on files the user never wrote. Never fatal: a formatting problem
  // must not take down a setup that has otherwise succeeded.
  try {
    execFileSync("pnpm", ["exec", "biome", "check", "--write", "."], {
      cwd: dir,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    log("  note: `pnpm format` left some issues — run `pnpm lint` to see them\n");
  }

  return { applied: true, fonts, icons, decoded };
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
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`\n${error.message}\n`);
    process.exitCode = 1;
  }
}
