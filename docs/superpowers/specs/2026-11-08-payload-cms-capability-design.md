# Payload CMS Capability (`cms`) & `content` Bundle — Design Spec

**Date:** 2026-11-08  
**Status:** Draft for Review  
**Target Repository:** `project-blueprint`

---

## 1. Goal & Scope

Expand `blueprint` with a full-featured, open-source headless CMS capability (`cms`) and a `content` bundle (`["db", "cms"]`) powered by **Payload CMS 3** (`@payloadcms/next`, `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`).

The integration preserves `blueprint`'s core invariants:
1. **Zero restructuring on growth:** A project created as a plain landing page can run `pnpm blueprint add cms` months later without moving existing routes or breaking layouts.
2. **Single-container deployment:** Payload runs inside the existing Next.js 16 App Router (`output: "standalone"`) and shares the `db` capability's Postgres instance (`DATABASE_URL`).
3. **Database & Auth isolation:** Payload stores its tables in a dedicated Postgres schema (`schemaName: "cms"`) and manages its own `/admin` users collection so it never collides with `src/lib/db/schema.ts` or `better-auth`'s `public.user` table when `auth` and `cms` are both installed.
4. **Editorial + Page Builder starter:** Ships out of the box with `Users`, `Media`, `Posts` (editorial articles with Lexical rich text), and `Pages` (composable layout blocks: `Hero`, `RichText`, `CallToAction`), plus a typed Local API helper (`src/lib/cms.ts`).

---

## 2. Architecture & Component Boundaries

### 2.1 App Router Route Group Isolation (`template/` & `site/registry.json`)

Payload mounts its own `<html>` and `<body>` shell at `src/app/(payload)/layout.tsx`. To prevent Next.js from nesting `<html>` inside `<html>` or leaking frontend Tailwind resets into `/admin`, the base template isolates frontend routes inside `src/app/(app)/`:

- `template/src/app/layout.tsx` moves to `template/src/app/(app)/layout.tsx` (updating the stylesheet import from `"./globals.css"` to `"../globals.css"`).
- `template/src/app/page.tsx` moves to `template/src/app/(app)/page.tsx`.
- `template/src/app/globals.css` remains at `src/app/globals.css` so `template/components.json` (`"css": "src/app/globals.css"`) and `shadcn apply` continue to work unchanged.
- `site/registry.json` (`auth` capability): updates `sign-in-page.tsx` and `sign-up-page.tsx` targets to `src/app/(app)/sign-in/page.tsx` and `src/app/(app)/sign-up/page.tsx` so authentication pages inherit the `(app)` layout.
- `template/scripts/blueprint.mjs`: adds a `findLayoutPath(dir)` helper used by `rewriteFonts` and `applyPreset` that resolves `src/app/(app)/layout.tsx` first and falls back to `src/app/layout.tsx`.

### 2.2 Capability & Bundle Definitions (`template/scripts/blueprint.mjs` & `bin/create.mjs`)

In `template/scripts/blueprint.mjs`:

```js
export const CAPABILITIES = {
  // ...existing db, auth, ai, tables, tests
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
};

export const BUNDLES = {
  saas: ["db", "auth", "tables"],
  content: ["db", "cms"],
};
```

In `bin/create.mjs`:
- Interactive project-type prompt adds option `[3] content (db + cms)` (shifting `ai` to `[4] ai`, while also accepting `"content"`, `"cms"`, `"saas"`, or `"ai"` by name).
- `writeEnv` automatically generates a 32-byte `base64url` secret for `PAYLOAD_SECRET` whenever `capabilities.includes("cms")`, matching `BETTER_AUTH_SECRET`.

### 2.3 Idempotent Config Hook (`wireCmsConfig(dir)` in `template/scripts/blueprint.mjs`)

Because `shadcn add` installs new files and dependencies without codemodding existing root config files, `addCapabilities` invokes `wireCmsConfig(dir)` whenever `resolved.includes("cms")`. `wireCmsConfig(dir)` is idempotent and performs three targeted updates:

1. **`tsconfig.json`:** Ensures `compilerOptions.paths["@payload-config"]` is set to `["./src/payload.config.ts"]`.
2. **`next.config.ts`:** Ensures `import { withPayload } from "@payloadcms/next/withPayload";` is present and wraps the default export with `withPayload(...)`.
3. **`biome.json`:** Ensures `"!src/app/(payload)"`, `"!src/payload-types.ts"`, and `"!src/migrations"` are appended to `files.includes` so Payload's auto-generated files do not fail `pnpm lint`.

---

## 3. Registry Item & Files (`site/registry/cms/` & `site/registry.json`)

### 3.1 Dependencies in `site/registry.json`

The `cms` registry item (`type: "registry:lib"`) declares:
- **`dependencies`:**
  - `payload@3.93.0`
  - `@payloadcms/next@3.93.0`
  - `@payloadcms/db-postgres@3.93.0`
  - `@payloadcms/richtext-lexical@3.93.0`
  - `@payloadcms/ui@3.93.0`
  - `graphql@16.13.0`
  - `sharp@0.34.5`
  - `@t3-oss/env-nextjs@0.13.11`
  - `zod@4.6.2`

### 3.2 File Manifest (`site/registry/cms/` → Project Targets)

| Registry Source (`site/registry/cms/...`) | Target Path in Project | Purpose |
|---|---|---|
| `cms-env.ts` | `src/lib/cms-env.ts` | Validates `PAYLOAD_SECRET` (`z.string().min(32)`) via `@t3-oss/env-nextjs`. |
| `payload.config.ts` | `src/payload.config.ts` | Configures Payload 3 with `postgresAdapter` (`schemaName: "cms"`), `lexicalEditor()`, `sharp`, and starter collections. |
| `collections/Users.ts` | `src/collections/Users.ts` | Admin authentication collection (`slug: "users"`, `auth: true`, `role`: `admin` \| `editor`). |
| `collections/Media.ts` | `src/collections/Media.ts` | Media upload collection (`slug: "media"`, `staticDir: "media"`, required `alt` text, public read access). |
| `collections/Posts.ts` | `src/collections/Posts.ts` | Editorial collection (`slug: "posts"`, `versions: { drafts: true }`, `title`, unique `slug`, `excerpt`, `coverImage`, Lexical `content`, `publishedAt`). |
| `collections/Pages.ts` | `src/collections/Pages.ts` | Page builder collection (`slug: "pages"`, `versions: { drafts: true }`, `title`, unique `slug`, `layout` blocks field). |
| `blocks/index.ts` | `src/blocks/index.ts` | Exports `HeroBlock` (`hero`), `RichTextBlock` (`richText`), and `CallToActionBlock` (`cta`) `Block` configs. |
| `cms.ts` | `src/lib/cms.ts` | Typed Local API helpers: `getCms()`, `getPublishedPosts()`, `getPostBySlug(slug)`, and `getPageBySlug(slug)`. |
| `app/layout.tsx` | `src/app/(payload)/layout.tsx` | Payload Admin `RootLayout` and `handleServerFunctions` wrapper. |
| `app/custom.scss` | `src/app/(payload)/custom.scss` | Custom stylesheet hook for Payload Admin. |
| `app/admin/importMap.js` | `src/app/(payload)/admin/importMap.js` | Initial `importMap` export for Payload Admin components. |
| `app/admin/page.tsx` | `src/app/(payload)/admin/[[...segments]]/page.tsx` | Payload Admin catch-all page (`RootPage`, `generatePageMetadata`). |
| `app/admin/not-found.tsx` | `src/app/(payload)/admin/[[...segments]]/not-found.tsx` | Payload Admin 404 handler (`NotFoundPage`, `generatePageMetadata`). |
| `app/api/route.ts` | `src/app/(payload)/api/[...slug]/route.ts` | Payload REST API catch-all handlers (`REST_GET`, `REST_POST`, `REST_DELETE`, `REST_PATCH`, `REST_PUT`, `REST_OPTIONS`). |

---

## 4. Data Flow & Database Isolation

1. **Shared Postgres Connection, Isolated Schema:**
   - `src/payload.config.ts` imports `dbEnv` from `@/lib/db/env` and configures `postgresAdapter({ pool: { connectionString: dbEnv.DATABASE_URL }, schemaName: "cms", migrationDir: "./src/migrations" })`.
   - All Payload tables are created under the `cms` Postgres schema, leaving `public` untouched for `src/lib/db/schema.ts` and `better-auth`.
2. **In-Process Server Component Queries:**
   - Next.js Server Components call `getPublishedPosts()`, `getPostBySlug(slug)`, or `getPageBySlug(slug)` in `src/lib/cms.ts`, which invokes Payload's Local API (`getPayload({ config })`) directly in Node without HTTP overhead.
3. **Build-Time Env Validation Safety:**
   - `Dockerfile` sets `SKIP_ENV_VALIDATION=true` during `pnpm build`, and `src/lib/cms-env.ts` honours `skipValidation: !!process.env.SKIP_ENV_VALIDATION` (falling back to a placeholder secret only when `SKIP_ENV_VALIDATION` is set so `buildConfig` succeeds during static image builds).

---

## 5. Verification & Testing Strategy

1. **Script & CLI Unit Tests (`template/scripts/blueprint.test.mjs` & `bin/create.test.mjs`):**
   - `resolveCapabilities(["cms"])` resolves to `["db", "cms"]`; `resolveCapabilities(["content"])` resolves to `["db", "cms"]`.
   - `wireCmsConfig(dir)` adds `@payload-config` to `tsconfig.json`, wraps `next.config.ts` with `withPayload`, updates `biome.json` ignores, and is idempotent on repeat calls.
   - `rewriteFonts` and `applyPreset` operate on `src/app/(app)/layout.tsx` (and still support `src/app/layout.tsx`).
   - `bin/create.mjs` `parseArgs` accepts `--capabilities cms` and `--capabilities content`.
2. **Template & Site Checks:**
   - `pnpm --dir template test:scripts`, `pnpm --dir template lint`, `pnpm --dir template typecheck`, `pnpm --dir template test`, `pnpm --dir template build`.
   - `pnpm --dir site test`, `pnpm --dir site build`.
   - `node --test bin/create.test.mjs`.
3. **End-to-End Smoke Verification:**
   - Materialise the `cms` capability into a temporary copy of `template/`, install dependencies, generate `PAYLOAD_SECRET`, and verify `pnpm lint`, `pnpm typecheck`, and `pnpm build` succeed.
