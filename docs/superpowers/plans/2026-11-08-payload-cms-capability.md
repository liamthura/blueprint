# Payload CMS Capability (`cms`) & `content` Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cms` capability and `content` bundle (`["db", "cms"]`) to `blueprint` integrating Payload CMS 3 (`@payloadcms/next`, `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`) with editorial collections (`Users`, `Media`, `Posts`) and a block-based page builder (`Pages` with `Hero`, `RichText`, `CallToAction`).

**Architecture:** `template/` moves its frontend `layout.tsx` and `page.tsx` into `src/app/(app)/` so Payload's `src/app/(payload)/` route group can be installed at creation or later via `pnpm blueprint add cms` without restructuring existing routes. `template/scripts/blueprint.mjs` defines `CAPABILITIES.cms`, `BUNDLES.content`, and an idempotent `wireCmsConfig(dir)` helper that patches `tsconfig.json`, `next.config.ts`, and `biome.json` when `cms` is added. All Payload collections, blocks, Local API helpers, and route files live in `site/registry/cms/` and are catalogued in `site/registry.json`.

**Tech Stack:** Next.js 16.3.5 (App Router), React 19.3.0, Payload CMS 3.93.0 (`payload`, `@payloadcms/next`, `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `@payloadcms/ui`), Drizzle ORM 0.45.2 + PostgreSQL (`schemaName: "cms"`), `@t3-oss/env-nextjs`, Zod 4, Biome 2.5.14, Node `--test` & Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-payload-cms-capability-design.md`

## Global Constraints

- Exact dependency versions in `site/registry.json` for `cms`: `payload@3.93.0`, `@payloadcms/next@3.93.0`, `@payloadcms/db-postgres@3.93.0`, `@payloadcms/richtext-lexical@3.93.0`, `@payloadcms/ui@3.93.0`, `graphql@16.13.0`, `sharp@0.34.5`, `@t3-oss/env-nextjs@0.13.11`, `zod@4.6.2`.
- `template/src/app/globals.css` MUST stay at `src/app/globals.css` so `template/components.json` (`"css": "src/app/globals.css"`) and `shadcn apply` continue to work without modification; `template/src/app/(app)/layout.tsx` imports `"../globals.css"`.
- Payload's PostgreSQL adapter MUST set `schemaName: "cms"` and reuse `dbEnv.DATABASE_URL` from `@/lib/db/env` so Payload tables never collide with `public` Drizzle tables (`src/lib/db/schema.ts` or `better-auth`).
- No capability source file may import an icon package (`lucide-react`, `@phosphor-icons/react`, etc.), per `blueprint.mjs`'s icon-swap invariant.
- All code in `template/` and `site/` must pass `biome check .` (2-space indent, double quotes, semicolons, 100-char line width).

## Review Focus

1. **`wireCmsConfig(dir)` called twice on the same project** — running `pnpm blueprint add cms` twice must not wrap `next.config.ts` in `withPayload(withPayload(...))`, duplicate `"@payload-config"` in `tsconfig.json`, or duplicate ignore entries in `biome.json`.
2. **`wireCmsConfig(dir)` on a project missing `tsconfig.json`, `next.config.ts`, or `biome.json`** — must tolerate missing files gracefully without throwing `ENOENT`.
3. **`rewriteFonts(dir)` and `applyPreset(dir)` on both `src/app/(app)/layout.tsx` and legacy `src/app/layout.tsx`** — projects using the new `(app)` route group and existing tests/projects using `src/app/layout.tsx` must both have their fonts rewritten and restored cleanly.
4. **Docker / CI builds with `SKIP_ENV_VALIDATION=true` and no `PAYLOAD_SECRET` set** — `src/payload.config.ts` must not crash at build time when `SKIP_ENV_VALIDATION=true` and `process.env.PAYLOAD_SECRET` is undefined.
5. **`materialiseItem(siteRoot, "cms")` completeness** — every file entry listed under `cms` in `site/registry.json` must exist on disk in `site/registry/cms/` and inline cleanly.

---

### Task 1: App Router `(app)` Route Group & Layout Resolution

**Files:**
- Create: `template/src/app/(app)/layout.tsx`
- Create: `template/src/app/(app)/page.tsx`
- Delete: `template/src/app/layout.tsx`
- Delete: `template/src/app/page.tsx`
- Modify: `template/scripts/blueprint.mjs:352-480`
- Modify: `template/scripts/blueprint.test.mjs:172-237`
- Modify: `site/registry.json:164-174,217-225`

**Interfaces:**
- Consumes: `template/src/app/globals.css` (remains at `src/app/globals.css`).
- Produces: `findLayoutPath(dir: string): string | null` exported from `template/scripts/blueprint.mjs`, resolving `src/app/(app)/layout.tsx` first and falling back to `src/app/layout.tsx`.

- [ ] **Step 1: Write the failing test in `template/scripts/blueprint.test.mjs` for `(app)/layout.tsx` support**

Add a test in `template/scripts/blueprint.test.mjs` right after `appWithLayout()` (around line 178) verifying `findLayoutPath` and `rewriteFonts` on `src/app/(app)/layout.tsx`:

```js
function appWithGroupedLayout() {
  const dir = fixture();
  mkdirSync(join(dir, "src", "app", "(app)"), { recursive: true });
  writeFileSync(join(dir, "src", "app", "(app)", "layout.tsx"), LAYOUT);
  return dir;
}

test("rewriteFonts supports layout.tsx inside the (app) route group", () => {
  const dir = appWithGroupedLayout();
  const changes = rewriteFonts(dir, { sans: "Inter", heading: "Playfair_Display" });
  const layout = readFileSync(join(dir, "src", "app", "(app)", "layout.tsx"), "utf8");

  assert.match(layout, /const fontSans = Inter\(/);
  assert.match(layout, /const fontHeading = Playfair_Display\(/);
  assert.deepEqual(changes, ["sans Geist -> Inter", "heading Instrument_Sans -> Playfair_Display"]);
});
```

- [ ] **Step 2: Run `test:scripts` to verify the new test fails**

Run: `pnpm --dir template test:scripts`
Expected: FAIL — `rewriteFonts` returns `[]` because it only checks `src/app/layout.tsx`.

- [ ] **Step 3: Implement `findLayoutPath(dir)` in `template/scripts/blueprint.mjs`, move `template/src/app/{layout,page}.tsx` into `src/app/(app)/`, and update `site/registry.json` auth targets**

In `template/scripts/blueprint.mjs`, add `findLayoutPath(dir)` and use it in `rewriteFonts` and `applyPreset`:

```js
/**
 * Locates the frontend root layout, preferring the `(app)` route group used so
 * Payload's `(payload)` group can sit beside it without nesting `<html>` tags, and
 * falling back to `src/app/layout.tsx` for flat projects.
 */
export function findLayoutPath(dir) {
  const grouped = join(dir, "src", "app", "(app)", "layout.tsx");
  if (existsSync(grouped)) return grouped;
  const flat = join(dir, "src", "app", "layout.tsx");
  if (existsSync(flat)) return flat;
  return null;
}
```

Update `rewriteFonts(dir, { sans, heading })` in `template/scripts/blueprint.mjs`:

```js
export function rewriteFonts(dir, { sans, heading }) {
  const path = findLayoutPath(dir);
  if (!path) return [];
  // ...rest of rewriteFonts unchanged
```

And in `applyPreset(dir, code, ...)` in `template/scripts/blueprint.mjs`, replace `const layoutPath = join(dir, "src", "app", "layout.tsx");` with:

```js
  const layoutPath = findLayoutPath(dir) ?? join(dir, "src", "app", "(app)", "layout.tsx");
```

Move `template/src/app/layout.tsx` to `template/src/app/(app)/layout.tsx` with `"../globals.css"`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Sans } from "next/font/google";
import "../globals.css";
import { cn } from "@/lib/utils";

// The CSS variable names are deliberately font-neutral. `blueprint preset` swaps
// which next/font/google export feeds each one; nothing downstream has to change.
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

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        fontSans.variable,
        fontMono.variable,
        fontHeading.variable,
      )}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

Move `template/src/app/page.tsx` to `template/src/app/(app)/page.tsx` (contents unchanged) and delete `template/src/app/layout.tsx` and `template/src/app/page.tsx`.

In `site/registry.json`, update `auth`'s `sign-in-page.tsx` and `sign-up-page.tsx` targets and `tables` description:

```json
        {
          "path": "registry/auth/sign-in-page.tsx",
          "type": "registry:file",
          "target": "src/app/(app)/sign-in/page.tsx"
        },
        {
          "path": "registry/auth/sign-up-page.tsx",
          "type": "registry:file",
          "target": "src/app/(app)/sign-up/page.tsx"
        },
```
and in `tables` description:
`"description": "TanStack Table with sorting, plus a TanStack Query provider for client-side fetching. Mount QueryProvider in src/app/(app)/layout.tsx before using useQuery.",`

- [ ] **Step 4: Run script tests, lint, typecheck, and build in `template/`**

Run: `pnpm --dir template test:scripts && pnpm --dir template lint && pnpm --dir template typecheck && pnpm --dir template build`
Expected: PASS on all four checks.

- [ ] **Step 5: Commit Task 1**

```bash
git add template/src/app template/scripts/blueprint.mjs template/scripts/blueprint.test.mjs site/registry.json
git commit -m "feat(template): isolate frontend routes in (app) group for CMS compatibility"
```

---

### Task 2: `cms` Capability, `content` Bundle, Config Wiring & Setup CLI

**Files:**
- Modify: `template/scripts/blueprint.mjs:95-146,294-318`
- Modify: `template/scripts/blueprint.test.mjs:49-112`
- Modify: `bin/create.mjs:173-182,223-266`
- Modify: `bin/create.test.mjs:42-48,138-165`

**Interfaces:**
- Consumes: `CAPABILITIES`, `BUNDLES`, `resolveCapabilities` in `template/scripts/blueprint.mjs`.
- Produces:
  - `CAPABILITIES.cms`: `{ title: "Payload CMS with editorial & page blocks", needs: ["db"], scripts: { "cms:types": "payload generate:types", "cms:importmap": "payload generate:importmap", "cms:migrate:create": "payload migrate:create", "cms:migrate": "payload migrate" }, env: ["PAYLOAD_SECRET="] }`
  - `BUNDLES.content`: `["db", "cms"]`
  - `wireCmsConfig(dir: string): { tsconfig: boolean, nextConfig: boolean, biome: boolean }` exported from `template/scripts/blueprint.mjs` and invoked by `addCapabilities` when `resolved.includes("cms")`.

- [ ] **Step 1: Write failing tests in `template/scripts/blueprint.test.mjs` and `bin/create.test.mjs`**

Add to `template/scripts/blueprint.test.mjs`:

```js
test("resolveCapabilities expands cms needs and the content bundle", () => {
  assert.deepEqual(resolveCapabilities(["cms"]), ["db", "cms"]);
  assert.deepEqual(resolveCapabilities(["content"]), ["db", "cms"]);
  assert.deepEqual(BUNDLES.content, ["db", "cms"]);
});

test("wireCmsConfig patches tsconfig.json, next.config.ts, and biome.json idempotently", () => {
  const dir = fixture();
  writeFileSync(
    join(dir, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, "next.config.ts"),
    `import "./src/env";\nimport { withSentryConfig } from "@sentry/nextjs/config";\nimport type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {\n  output: "standalone",\n};\n\nexport default withSentryConfig(nextConfig, {\n  silent: true,\n  telemetry: false,\n});\n`,
  );
  writeFileSync(
    join(dir, "biome.json"),
    `${JSON.stringify({ files: { includes: ["**", "!.next", "!drizzle"] } }, null, 2)}\n`,
  );

  const first = wireCmsConfig(dir);
  assert.deepEqual(first, { tsconfig: true, nextConfig: true, biome: true });

  const tsconfig = JSON.parse(readFileSync(join(dir, "tsconfig.json"), "utf8"));
  assert.deepEqual(tsconfig.compilerOptions.paths["@payload-config"], ["./src/payload.config.ts"]);

  const nextConfig = readFileSync(join(dir, "next.config.ts"), "utf8");
  assert.match(nextConfig, /import \{ withPayload \} from "@payloadcms\/next\/withPayload";/);
  assert.match(nextConfig, /export default withPayload\(\s*withSentryConfig\(/);

  const biome = JSON.parse(readFileSync(join(dir, "biome.json"), "utf8"));
  assert.ok(biome.files.includes.includes("!src/app/(payload)"));
  assert.ok(biome.files.includes.includes("!src/payload-types.ts"));
  assert.ok(biome.files.includes.includes("!src/migrations"));

  // Second call must be a complete no-op
  const second = wireCmsConfig(dir);
  assert.deepEqual(second, { tsconfig: false, nextConfig: false, biome: false });
  assert.equal(
    readFileSync(join(dir, "next.config.ts"), "utf8").match(/withPayload/g).length,
    2,
    "import + single wrapper call only",
  );
});

test("wireCmsConfig tolerates missing config files without throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "blueprint-empty-"));
  assert.deepEqual(wireCmsConfig(dir), { tsconfig: false, nextConfig: false, biome: false });
});
```

And in `bin/create.test.mjs`, update `"parseArgs accepts a bundle name"` to also assert `content` and `cms`:

```js
test("parseArgs accepts a bundle name", () => {
  assert.deepEqual(parseArgs(["app", "--capabilities", "saas"]).capabilities, ["saas"]);
  assert.deepEqual(parseArgs(["app", "--capabilities", "content"]).capabilities, ["content"]);
  assert.deepEqual(parseArgs(["app", "--capabilities", "cms"]).capabilities, ["cms"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir template test:scripts && node --test bin/create.test.mjs`
Expected: FAIL — `wireCmsConfig` is not exported and `Unknown capability: cms`.

- [ ] **Step 3: Implement `CAPABILITIES.cms`, `BUNDLES.content`, and `wireCmsConfig(dir)` in `template/scripts/blueprint.mjs`, and update `bin/create.mjs`**

In `template/scripts/blueprint.mjs`:

1. Add `cms` to `CAPABILITIES` and `content` to `BUNDLES`:
```js
  cms: {
    title: "Payload CMS with editorial & page blocks",
    needs: ["db"],
    scripts: {
      "cms:types": "payload generate:types",
      "cms:importmap": "payload generate:importmap",
      "cms:migrate:create": "payload migrate:create",
      "cms:migrate": "payload migrate",
    },
    env: ["PAYLOAD_SECRET="],
  },
```
and:
```js
export const BUNDLES = {
  saas: ["db", "auth", "tables"],
  content: ["db", "cms"],
};
```

2. Add `wireCmsConfig(dir)` and call it in `addCapabilities` when `resolved.includes("cms")`:
```js
const CMS_BIOME_IGNORES = ["!src/app/(payload)", "!src/payload-types.ts", "!src/migrations"];

/**
 * Patches tsconfig.json, next.config.ts, and biome.json for Payload CMS.
 * Every step checks whether its change is already present, so running
 * `blueprint add cms` a second time is a no-op.
 */
export function wireCmsConfig(dir) {
  let tsconfigChanged = false;
  const tsconfigPath = join(dir, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
    tsconfig.compilerOptions ??= {};
    tsconfig.compilerOptions.paths ??= {};
    if (!tsconfig.compilerOptions.paths["@payload-config"]) {
      tsconfig.compilerOptions.paths["@payload-config"] = ["./src/payload.config.ts"];
      writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
      tsconfigChanged = true;
    }
  }

  let nextConfigChanged = false;
  const nextConfigPath = join(dir, "next.config.ts");
  if (existsSync(nextConfigPath)) {
    let source = readFileSync(nextConfigPath, "utf8");
    if (!source.includes("withPayload")) {
      source = `import { withPayload } from "@payloadcms/next/withPayload";\n${source}`;
      source = source.replace(
        /export default ([\s\S]*);\s*$/,
        "export default withPayload(\n  $1,\n);\n",
      );
      writeFileSync(nextConfigPath, source);
      nextConfigChanged = true;
    }
  }

  let biomeChanged = false;
  const biomePath = join(dir, "biome.json");
  if (existsSync(biomePath)) {
    const biome = JSON.parse(readFileSync(biomePath, "utf8"));
    biome.files ??= {};
    biome.files.includes ??= ["**"];
    for (const entry of CMS_BIOME_IGNORES) {
      if (!biome.files.includes.includes(entry)) {
        biome.files.includes.push(entry);
        biomeChanged = true;
      }
    }
    if (biomeChanged) {
      writeFileSync(biomePath, `${JSON.stringify(biome, null, 2)}\n`);
    }
  }

  return { tsconfig: tsconfigChanged, nextConfig: nextConfigChanged, biome: biomeChanged };
}
```
And inside `addCapabilities(dir, names, ...)`:
```js
  mergeScripts(dir, resolved);
  appendEnvExample(dir, resolved);
  if (resolved.includes("cms")) wireCmsConfig(dir);
  return resolved;
```

3. In `bin/create.mjs`:
Update `askMissing` prompt (lines 173-181):
```js
    if (args.capabilities.length === 0) {
      const choice = await prompt(
        rl,
        "What are you building? [1] landing page  [2] saas (db + auth + tables)  [3] content (db + cms)  [4] ai —",
        "1",
      );
      if (choice === "2" || choice === "saas") args.capabilities = ["saas"];
      else if (choice === "3" || choice === "content" || choice === "cms")
        args.capabilities = ["content"];
      else if (choice === "4" || choice === "ai") args.capabilities = ["ai"];
    }
```
And in `main` (lines 223-266), add `const hasCms = capabilities.includes("cms");` and seed `PAYLOAD_SECRET`:
```js
  const capabilities = resolveCapabilities(args.capabilities);
  const hasDb = capabilities.includes("db");
  const hasAuth = capabilities.includes("auth");
  const hasCms = capabilities.includes("cms");
```
```js
  writeEnv(target, {
    DATABASE_URL: args.databaseUrl,
    // Generated per project rather than left blank: better-auth and Payload require
    // a secret, so an empty value makes `pnpm build` fail on the very first run.
    BETTER_AUTH_SECRET: hasAuth ? randomBytes(32).toString("base64url") : undefined,
    PAYLOAD_SECRET: hasCms ? randomBytes(32).toString("base64url") : undefined,
  });
```

- [ ] **Step 4: Run script tests and CLI tests to verify they pass**

Run: `pnpm --dir template test:scripts && node --test bin/create.test.mjs && pnpm --dir template lint`
Expected: PASS on all tests and lint.

- [ ] **Step 5: Commit Task 2**

```bash
git add template/scripts/blueprint.mjs template/scripts/blueprint.test.mjs bin/create.mjs bin/create.test.mjs
git commit -m "feat(cli): add cms capability, content bundle, and idempotent config wiring"
```

---

### Task 3: Payload CMS Registry Source Files, Catalogue Entry & End-to-End Verification

**Files:**
- Create: `site/registry/cms/cms-env.ts`
- Create: `site/registry/cms/payload.config.ts`
- Create: `site/registry/cms/collections/Users.ts`
- Create: `site/registry/cms/collections/Media.ts`
- Create: `site/registry/cms/collections/Posts.ts`
- Create: `site/registry/cms/collections/Pages.ts`
- Create: `site/registry/cms/blocks/index.ts`
- Create: `site/registry/cms/cms.ts`
- Create: `site/registry/cms/app/layout.tsx`
- Create: `site/registry/cms/app/custom.scss`
- Create: `site/registry/cms/app/admin/importMap.js`
- Create: `site/registry/cms/app/admin/page.tsx`
- Create: `site/registry/cms/app/admin/not-found.tsx`
- Create: `site/registry/cms/app/api/route.ts`
- Modify: `site/registry.json`
- Modify: `site/tsconfig.json`
- Modify: `template/scripts/blueprint.test.mjs`
- Modify: `README.md`
- Modify: `template/README.md`

**Interfaces:**
- Consumes: `dbEnv` from `@/lib/db/env` (`DATABASE_URL`), `materialiseItem(registryRoot, name)` in `template/scripts/blueprint.mjs`.
- Produces:
  - `cmsEnv` in `src/lib/cms-env.ts`
  - Default Payload config export in `src/payload.config.ts`
  - Collections `Users`, `Media`, `Posts`, `Pages` in `src/collections/*.ts`
  - Blocks `HeroBlock`, `RichTextBlock`, `CallToActionBlock`, `pageBlocks` in `src/blocks/index.ts`
  - Local API helpers `getCms()`, `getPublishedPosts()`, `getPostBySlug(slug)`, `getPageBySlug(slug)` in `src/lib/cms.ts`
  - Registry item `"cms"` in `site/registry.json`

- [ ] **Step 1: Write failing test in `template/scripts/blueprint.test.mjs` verifying `materialiseItem` for every capability including `cms`**

Add to `template/scripts/blueprint.test.mjs` (importing `materialiseItem` from `./blueprint.mjs`):

```js
test("every capability in CAPABILITIES can be materialised from site/registry.json", () => {
  const siteRoot = fileURLToPath(new URL("../../site", import.meta.url));
  for (const name of Object.keys(CAPABILITIES)) {
    const outPath = materialiseItem(siteRoot, name);
    const inlined = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(inlined.name, name);
    assert.ok(inlined.files.length > 0, `${name} has files`);
    for (const file of inlined.files) {
      assert.ok(typeof file.content === "string" && file.content.length > 0, `${file.path} has content`);
    }
  }
});
```

- [ ] **Step 2: Run `test:scripts` to verify it fails on missing `"cms"` registry item**

Run: `pnpm --dir template test:scripts`
Expected: FAIL with `No registry item named "cms"`.

- [ ] **Step 3: Create the 14 Payload CMS capability files under `site/registry/cms/` and register `"cms"` in `site/registry.json`**

Create `site/registry/cms/cms-env.ts`:

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const cmsEnv = createEnv({
  server: {
    PAYLOAD_SECRET: z.string().min(32, "Generate one with: openssl rand -base64 32"),
  },
  runtimeEnv: {
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
```

Create `site/registry/cms/collections/Users.ts`:

```ts
import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "email",
  },
  fields: [
    {
      name: "name",
      type: "text",
    },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "editor",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
      ],
    },
  ],
};
```

Create `site/registry/cms/collections/Media.ts`:

```ts
import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true,
  },
  upload: {
    staticDir: "media",
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
    },
  ],
};
```

Create `site/registry/cms/collections/Posts.ts`:

```ts
import type { CollectionConfig } from "payload";

export const Posts: CollectionConfig = {
  slug: "posts",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "_status", "publishedAt"],
  },
  versions: {
    drafts: true,
  },
  access: {
    read: ({ req }) => {
      if (req.user) return true;
      return { _status: { equals: "published" } };
    },
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "excerpt",
      type: "textarea",
    },
    {
      name: "coverImage",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "content",
      type: "richText",
      required: true,
    },
    {
      name: "publishedAt",
      type: "date",
      admin: {
        position: "sidebar",
      },
    },
  ],
};
```

Create `site/registry/cms/blocks/index.ts`:

```ts
import type { Block } from "payload";

export const HeroBlock: Block = {
  slug: "hero",
  interfaceName: "HeroBlock",
  fields: [
    {
      name: "heading",
      type: "text",
      required: true,
    },
    {
      name: "subheading",
      type: "textarea",
    },
    {
      name: "ctaLabel",
      type: "text",
    },
    {
      name: "ctaHref",
      type: "text",
    },
    {
      name: "backgroundImage",
      type: "upload",
      relationTo: "media",
    },
  ],
};

export const RichTextBlock: Block = {
  slug: "richText",
  interfaceName: "RichTextBlock",
  fields: [
    {
      name: "content",
      type: "richText",
      required: true,
    },
  ],
};

export const CallToActionBlock: Block = {
  slug: "cta",
  interfaceName: "CallToActionBlock",
  fields: [
    {
      name: "heading",
      type: "text",
      required: true,
    },
    {
      name: "body",
      type: "textarea",
    },
    {
      name: "primaryLabel",
      type: "text",
      required: true,
    },
    {
      name: "primaryHref",
      type: "text",
      required: true,
    },
    {
      name: "secondaryLabel",
      type: "text",
    },
    {
      name: "secondaryHref",
      type: "text",
    },
  ],
};

export const pageBlocks: Block[] = [HeroBlock, RichTextBlock, CallToActionBlock];
```

Create `site/registry/cms/collections/Pages.ts`:

```ts
import type { CollectionConfig } from "payload";
import { pageBlocks } from "../blocks";

export const Pages: CollectionConfig = {
  slug: "pages",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "_status", "updatedAt"],
  },
  versions: {
    drafts: true,
  },
  access: {
    read: ({ req }) => {
      if (req.user) return true;
      return { _status: { equals: "published" } };
    },
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "layout",
      type: "blocks",
      required: true,
      blocks: pageBlocks,
    },
  ],
};
```

Create `site/registry/cms/payload.config.ts`:

```ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";
import { Media } from "./collections/Media";
import { Pages } from "./collections/Pages";
import { Posts } from "./collections/Posts";
import { Users } from "./collections/Users";
import { cmsEnv } from "./lib/cms-env";
import { dbEnv } from "./lib/db/env";

const filename = fileURLToPath(import.meta.url);
const dirnamePath = dirname(filename);

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: resolve(dirnamePath),
    },
  },
  collections: [Users, Media, Posts, Pages],
  editor: lexicalEditor(),
  secret: cmsEnv.PAYLOAD_SECRET ?? "build-time-placeholder-secret-32-chars",
  typescript: {
    outputFile: resolve(dirnamePath, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString: dbEnv.DATABASE_URL,
    },
    schemaName: "cms",
    migrationDir: resolve(dirnamePath, "migrations"),
  }),
  sharp,
});
```

Create `site/registry/cms/cms.ts`:

```ts
import config from "@payload-config";
import { getPayload } from "payload";

export async function getCms() {
  return getPayload({ config });
}

export async function getPublishedPosts(limit = 20) {
  const payload = await getCms();
  const result = await payload.find({
    collection: "posts",
    where: {
      _status: { equals: "published" },
    },
    sort: "-publishedAt",
    limit,
  });
  return result.docs;
}

export async function getPostBySlug(slug: string) {
  const payload = await getCms();
  const result = await payload.find({
    collection: "posts",
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }],
    },
    limit: 1,
  });
  return result.docs[0] ?? null;
}

export async function getPageBySlug(slug: string) {
  const payload = await getCms();
  const result = await payload.find({
    collection: "pages",
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }],
    },
    limit: 1,
  });
  return result.docs[0] ?? null;
}
```

Create `site/registry/cms/app/custom.scss`:

```scss
/* Custom styles for the Payload Admin UI. */
```

Create `site/registry/cms/app/admin/importMap.js`:

```js
export const importMap = {};
```

Create `site/registry/cms/app/layout.tsx`:

```tsx
/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import config from "@payload-config";
import "@payloadcms/next/css";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import type { ServerFunctionClient } from "payload";
import type React from "react";
import { importMap } from "./admin/importMap.js";
import "./custom.scss";

type Args = {
  children: React.ReactNode;
};

const serverFunction: ServerFunctionClient = async (args) => {
  "use server";
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  });
};

export default function Layout({ children }: Args) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  );
}
```

Create `site/registry/cms/app/admin/page.tsx`:

```tsx
/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import config from "@payload-config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import type { Metadata } from "next";
import { importMap } from "./importMap.js";

type Args = {
  params: Promise<{
    segments: string[];
  }>;
  searchParams: Promise<{
    [key: string]: string | string[];
  }>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

export default function Page({ params, searchParams }: Args) {
  return <RootPage config={config} params={params} searchParams={searchParams} importMap={importMap} />;
}
```

Create `site/registry/cms/app/admin/not-found.tsx`:

```tsx
/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import config from "@payload-config";
import { generatePageMetadata, NotFoundPage } from "@payloadcms/next/views";
import type { Metadata } from "next";
import { importMap } from "./importMap.js";

type Args = {
  params: Promise<{
    segments: string[];
  }>;
  searchParams: Promise<{
    [key: string]: string | string[];
  }>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

export default function NotFound({ params, searchParams }: Args) {
  return (
    <NotFoundPage config={config} params={params} searchParams={searchParams} importMap={importMap} />
  );
}
```

Create `site/registry/cms/app/api/route.ts`:

```ts
/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import config from "@payload-config";
import "@payloadcms/next/css";
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";

export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
```

In `site/registry.json`, add the `"cms"` item to `items`:

```json
    {
      "name": "cms",
      "type": "registry:lib",
      "title": "Headless CMS",
      "description": "Payload CMS 3 in the Next.js App Router on the db capability's Postgres instance, with Users, Media, Posts, and block-based Pages.",
      "dependencies": [
        "payload@3.93.0",
        "@payloadcms/next@3.93.0",
        "@payloadcms/db-postgres@3.93.0",
        "@payloadcms/richtext-lexical@3.93.0",
        "@payloadcms/ui@3.93.0",
        "graphql@16.13.0",
        "sharp@0.34.5",
        "@t3-oss/env-nextjs@0.13.11",
        "zod@4.6.2"
      ],
      "files": [
        {
          "path": "registry/cms/cms-env.ts",
          "type": "registry:lib",
          "target": "src/lib/cms-env.ts"
        },
        {
          "path": "registry/cms/payload.config.ts",
          "type": "registry:file",
          "target": "src/payload.config.ts"
        },
        {
          "path": "registry/cms/collections/Users.ts",
          "type": "registry:file",
          "target": "src/collections/Users.ts"
        },
        {
          "path": "registry/cms/collections/Media.ts",
          "type": "registry:file",
          "target": "src/collections/Media.ts"
        },
        {
          "path": "registry/cms/collections/Posts.ts",
          "type": "registry:file",
          "target": "src/collections/Posts.ts"
        },
        {
          "path": "registry/cms/collections/Pages.ts",
          "type": "registry:file",
          "target": "src/collections/Pages.ts"
        },
        {
          "path": "registry/cms/blocks/index.ts",
          "type": "registry:file",
          "target": "src/blocks/index.ts"
        },
        {
          "path": "registry/cms/cms.ts",
          "type": "registry:lib",
          "target": "src/lib/cms.ts"
        },
        {
          "path": "registry/cms/app/layout.tsx",
          "type": "registry:file",
          "target": "src/app/(payload)/layout.tsx"
        },
        {
          "path": "registry/cms/app/custom.scss",
          "type": "registry:file",
          "target": "src/app/(payload)/custom.scss"
        },
        {
          "path": "registry/cms/app/admin/importMap.js",
          "type": "registry:file",
          "target": "src/app/(payload)/admin/importMap.js"
        },
        {
          "path": "registry/cms/app/admin/page.tsx",
          "type": "registry:file",
          "target": "src/app/(payload)/admin/[[...segments]]/page.tsx"
        },
        {
          "path": "registry/cms/app/admin/not-found.tsx",
          "type": "registry:file",
          "target": "src/app/(payload)/admin/[[...segments]]/not-found.tsx"
        },
        {
          "path": "registry/cms/app/api/route.ts",
          "type": "registry:file",
          "target": "src/app/(payload)/api/[...slug]/route.ts"
        }
      ]
    },
```

Check `site/tsconfig.json` `exclude` array: just as `site/tsconfig.json` excludes `registry` (or if it includes `**/*.ts`, make sure `registry` is excluded in `site/tsconfig.json` so `site` doesn't try to typecheck un-installed capability dependencies).

Update `README.md` and `template/README.md` to document `cms`, `content`, and `src/app/(app)/layout.tsx`.

- [ ] **Step 4: Run all tests, linters, typechecks, and builds across `template/`, `site/`, and `bin/`**

Run:
`pnpm --dir template test:scripts && pnpm --dir template lint && pnpm --dir template typecheck && pnpm --dir template test && pnpm --dir template build && pnpm --dir site test && pnpm --dir site build && node --test bin/create.test.mjs`
Expected: PASS on every command.

- [ ] **Step 5: Commit Task 3**

```bash
git add site/registry/cms site/registry.json site/tsconfig.json template/scripts/blueprint.test.mjs README.md template/README.md
git commit -m "feat(cms): add Payload CMS 3 capability and content bundle to registry"
```
