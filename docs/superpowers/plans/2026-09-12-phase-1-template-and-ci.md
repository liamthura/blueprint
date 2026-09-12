# Phase 1 — Template and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `template/` — the Next.js app cloned by `degit` to start every future project — plus the CI that proves it still compiles.

**Architecture:** `template/` is a self-contained Next.js 16 app with no coupling to this repository: no private registry configured, vanilla shadcn components. It carries its own CI workflow that ships into each generated app. This repository additionally gets a workflow that copies `template/` to a temp directory and builds it, because `template/` is never installed here and nothing else would catch a break.

**Tech Stack:** Next.js 16, React 19, TypeScript 7, Tailwind v4, Biome, Vitest browser mode (Playwright-backed), `@t3-oss/env-nextjs`, Sentry.

**Spec:** `docs/superpowers/specs/2026-09-12-project-blueprint-design.md` (Phase 1 section)

## Global Constraints

- **Package manager: pnpm**, pinned via `"packageManager"` in `package.json`. Never run `npm install` in this repo.
- **All work in Phase 1 happens inside `template/`**, except Task 8 which creates `.github/workflows/template.yml` at the repository root.
- **Exact version pins** (verified against npm 2026-09-12):
  - `next@16.3.5`, `react@19.3.0`, `react-dom@19.3.0`
  - `typescript@7.0.2` — see Task 1 risk gate; fallback is `5.9.3`
  - `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`
  - `@biomejs/biome@2.5.13`
  - `vitest@4.1.11`, `@vitest/browser-playwright@4.1.11`, `vite@8.3.0`, `@vitejs/plugin-react@6.1.1`, `playwright@1.63.0`
  - `@sentry/nextjs@10.74.0`
  - `@t3-oss/env-nextjs@0.13.11`, `zod@4.6.2`
  - `@testing-library/react@16.3.3`
  - `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@3.6.0`, `@phosphor-icons/react@2.1.10`, `radix-ui@1.6.7`
- **Do NOT install:** ESLint (Biome replaces it), `@playwright/test` — the test runner, which ships with the `auth` capability in Phase 3. Note `playwright` (the browser driver) IS installed in Task 4; they are different packages and only the runner is excluded. Also excluded: TanStack Query, Drizzle, better-auth, `next-themes`, `sonner`, `motion`. Phase 1 is the landing-page floor only.
- **One icon library, set via `iconLibrary` in `components.json`.** The template uses `phosphor`. The shadcn CLI rewrites icon imports to match on every `add`, so this is a one-field decision, not a lock-in. Never install two icon packages in the same project — that is the actual defect this rule prevents.
- **Radix: the unified `radix-ui` package only.** Never per-component `@radix-ui/react-*`.
- **The template must build and deploy with an empty `.env`.** Every environment variable in Phase 1 is `.optional()`. If any step makes a variable required, the step is wrong.
- **British English** in all prose, comments and documentation.
- **`<owner>`** appears in Task 9's READMEs and must be replaced with the real GitHub owner before committing.

---

### Task 1: Scaffold the template app and gate on TypeScript 7

**Files:**
- Create: `template/` (whole directory, via `create-next-app`)
- Modify: `template/package.json`
- Modify: `template/tsconfig.json`

**Interfaces:**
- Produces: a buildable Next.js app at `template/`, with `pnpm build`, `pnpm dev`, `pnpm typecheck` scripts that later tasks extend.

- [ ] **Step 1: Scaffold with create-next-app**

Run from the repository root:

```bash
pnpm dlx create-next-app@16.3.5 template \
  --ts --tailwind --app --src-dir --turbopack \
  --import-alias "@/*" --use-pnpm --no-eslint --yes
```

`--no-eslint` is deliberate and load-bearing: Biome replaces ESLint in Task 2, and removing ESLint afterwards is more work than never installing it.

- [ ] **Step 2: Pin exact versions**

Replace the `dependencies` and `devDependencies` blocks of `template/package.json` with:

```json
  "packageManager": "pnpm@10.0.0",
  "dependencies": {
    "next": "16.3.5",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "24.3.0",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "tailwindcss": "4.3.3",
    "typescript": "7.0.2"
  }
```

- [ ] **Step 3: Add the typecheck script**

In `template/package.json`, add to `"scripts"`:

```json
    "typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Install**

```bash
cd template && pnpm install
```

- [ ] **Step 5: RISK GATE — verify TypeScript 7 works**

```bash
cd template && pnpm typecheck && pnpm build
```

Expected: both succeed.

**If either fails with a TypeScript error that is not in your own code** (compiler crash, `next` type declarations rejected, unknown compiler option), TypeScript 7's native compiler is not yet compatible with this toolchain. Fall back:

```bash
cd template && pnpm add -D typescript@5.9.3 && pnpm typecheck && pnpm build
```

Then record the fallback in `template/README.md` under a `## Known deviations` heading, stating the date and the error observed. Do not spend more than 20 minutes trying to make 7.0.2 work — the fallback is a supported outcome, not a failure.

- [ ] **Step 6: Commit**

```bash
git add template
git commit -m "feat(template): scaffold Next.js 16 app with pinned versions"
```

---

### Task 2: Replace ESLint with Biome

**Files:**
- Create: `template/biome.json`
- Modify: `template/package.json`

**Interfaces:**
- Produces: `pnpm lint` and `pnpm format` scripts, used by CI in Task 7.

- [ ] **Step 1: Install Biome**

```bash
cd template && pnpm add -D @biomejs/biome@2.5.13
```

- [ ] **Step 2: Create `template/biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.13/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always" }
  },
  "assist": {
    "actions": { "source": { "organizeImports": "on" } }
  }
}
```

- [ ] **Step 3: Add scripts**

In `template/package.json` `"scripts"`, add and remove as shown:

```json
    "lint": "biome check .",
    "format": "biome check --write ."
```

If a `"lint": "next lint"` entry exists from the scaffold, delete it.

- [ ] **Step 4: Format the existing scaffold and verify**

```bash
cd template && pnpm format && pnpm lint
```

Expected: `pnpm lint` exits 0 with "Checked N files".

- [ ] **Step 5: Commit**

```bash
git add template
git commit -m "feat(template): replace ESLint with Biome"
```

---

### Task 3: Add shadcn with three vanilla components

**Files:**
- Create: `template/components.json`
- Create: `template/src/lib/utils.ts`
- Create: `template/src/components/ui/{button,input,card}.tsx`
- Modify: `template/package.json`

**Interfaces:**
- Produces: `cn()` from `@/lib/utils`, and `Button` from `@/components/ui/button` — used by the test in Task 4.

- [ ] **Step 1: Initialise shadcn**

```bash
cd template && pnpm dlx shadcn@4.21.0 init --yes --base-color neutral
```

- [ ] **Step 1b: Set the icon library**

Add to `template/components.json` at the top level:

```json
  "iconLibrary": "phosphor",
```

Then verify the CLI honours it — the components added in Step 3 must import
from `@phosphor-icons/react`, not `lucide-react`:

```bash
cd template && grep -r "lucide-react" src/components/ui/ && echo "WRONG — see below" || echo "correct"
```

If any component still imports `lucide-react`, the installed CLI version does
not apply `iconLibrary` on `add`. In that case remove `lucide-react`, install
`@phosphor-icons/react@2.1.10`, and fix the imports by hand — there are three
components, so this is minutes, not hours. Record it under
`## Known deviations` in `template/README.md`.

- [ ] **Step 2: Verify `components.json` has no `registries` key**

```bash
cd template && cat components.json
```

Expected: no `"registries"` field. **If one is present, delete it.** The template must ship with zero coupling to the blueprint registry — that is added per-project later, by choice.

- [ ] **Step 3: Add the three components**

```bash
cd template && pnpm dlx shadcn@4.21.0 add button input card --yes
```

- [ ] **Step 4: Verify the unified radix package**

```bash
cd template && grep -c '"@radix-ui/react-' package.json || echo "0 — correct"
```

Expected: `0 — correct`. If per-component Radix packages were installed, remove them and install `radix-ui@1.6.7` instead, updating imports in the generated components from `@radix-ui/react-slot` to `radix-ui`.

- [ ] **Step 5: Verify it still builds**

```bash
cd template && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add template
git commit -m "feat(template): add shadcn with button, input and card"
```

---

### Task 4: Vitest browser mode

**Files:**
- Create: `template/vitest.config.ts`
- Create: `template/src/components/ui/button.test.tsx`
- Modify: `template/package.json`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button` (Task 3).
- Produces: `pnpm test` script, used by CI in Task 7.

- [ ] **Step 1: Install**

```bash
cd template && pnpm add -D vitest@4.1.11 @vitest/browser-playwright@4.1.11 \
  vite@8.3.0 @vitejs/plugin-react@6.1.1 playwright@1.63.0 @testing-library/react@16.3.3
pnpm exec playwright install chromium
```

- [ ] **Step 2: Create `template/vitest.config.ts`**

```ts
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    passWithNoTests: true,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
```

`passWithNoTests` is required: a fresh clone has no tests of its own, and CI failing on the first push would make the template feel broken.

If `import { playwright } from "@vitest/browser-playwright"` does not resolve, check the installed package's exports with `cat node_modules/@vitest/browser-playwright/package.json` and adjust — the provider moved out of core in Vitest 4 and the exact export name is worth verifying rather than assuming.

- [ ] **Step 3: Add the test script**

In `template/package.json` `"scripts"`:

```json
    "test": "vitest run"
```

- [ ] **Step 4: Write the failing test**

Create `template/src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Button } from "./button";

it("renders its label", async () => {
  render(<Button>Save changes</Button>);
  await expect.element(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
});

it("applies the destructive variant class", () => {
  const { container } = render(<Button variant="destructive">Delete</Button>);
  expect(container.querySelector("button")?.className).toContain("destructive");
});
```

- [ ] **Step 5: Run the tests**

```bash
cd template && pnpm test
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add template
git commit -m "feat(template): add Vitest browser mode with component tests"
```

---

### Task 5: Typed environment variables

**Files:**
- Create: `template/src/env.ts`
- Create: `template/.env.example`
- Modify: `template/next.config.ts`
- Test: `template/src/env.test.ts`

**Interfaces:**
- Produces: `env` exported from `@/env`, with `env.SENTRY_DSN` and `env.NEXT_PUBLIC_SENTRY_DSN`, both `string | undefined`. Task 6 consumes both.

- [ ] **Step 1: Install**

```bash
cd template && pnpm add @t3-oss/env-nextjs@0.13.11 zod@4.6.2
```

- [ ] **Step 2: Write the failing test**

Create `template/src/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("env", () => {
  it("loads with no environment variables set", async () => {
    const { env } = await import("./env");
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });
});
```

This asserts the constraint that matters most: a fresh clone builds with an empty `.env`.

- [ ] **Step 3: Run it to confirm it fails**

```bash
cd template && pnpm vitest run src/env.test.ts
```

Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 4: Create `template/src/env.ts`**

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SENTRY_DSN: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  },
  runtimeEnv: {
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
});
```

Note `z.url()`, not `z.string().url()` — zod 4 moved formats to top level.

- [ ] **Step 5: Create `template/.env.example`**

```bash
# Every variable here is optional. The app builds and deploys with none of them set.
# Sentry: leave blank to disable error tracking entirely.
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

- [ ] **Step 6: Import env in `next.config.ts` so the build validates it**

Add as the first line of `template/next.config.ts`:

```ts
import "./src/env";
```

- [ ] **Step 7: Verify the test passes and the build works with no `.env`**

```bash
cd template && rm -f .env && pnpm test && pnpm build
```

Expected: 3 tests pass (two from Task 4, one here) and the build succeeds.

- [ ] **Step 8: Commit**

```bash
git add template
git commit -m "feat(template): validate environment variables with t3-env"
```

---

### Task 6: Sentry that no-ops without a DSN

**Files:**
- Create: `template/src/instrumentation.ts`
- Create: `template/src/instrumentation-client.ts`
- Modify: `template/next.config.ts`
- Modify: `template/package.json`

**Interfaces:**
- Consumes: `env` from `@/env` (Task 5).

- [ ] **Step 1: Install**

```bash
cd template && pnpm add @sentry/nextjs@10.74.0
```

- [ ] **Step 2: Create `template/src/instrumentation.ts`**

```ts
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";

export async function register() {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    enableLogs: true,
  });
}

export const onRequestError = Sentry.captureRequestError;
```

The early return is the whole point: with no DSN, Sentry never initialises and the app runs untouched.

- [ ] **Step 3: Create `template/src/instrumentation-client.ts`**

```ts
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";

if (env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 4: Wrap the Next config**

Edit `template/next.config.ts` so it ends with:

```ts
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  telemetry: false,
});
```

Keep `import "./src/env";` as the first line from Task 5.

- [ ] **Step 5: Verify the build passes with no DSN**

```bash
cd template && rm -f .env && pnpm build
```

Expected: build succeeds with no Sentry authentication warnings that fail the build. Warnings about a missing auth token are acceptable; errors are not.

- [ ] **Step 6: Commit**

```bash
git add template
git commit -m "feat(template): add Sentry, disabled when no DSN is set"
```

---

### Task 7: CI that ships inside the template

**Files:**
- Create: `template/.github/workflows/ci.yml`

- [ ] **Step 1: Create `template/.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 2: Verify every referenced script exists**

```bash
cd template && for s in typecheck lint test build; do
  node -e "process.exit(require('./package.json').scripts['$s'] ? 0 : 1)" \
    && echo "$s OK" || echo "$s MISSING"
done
```

Expected: four `OK` lines. Fix any `MISSING` before continuing.

- [ ] **Step 3: Run the same sequence locally**

```bash
cd template && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: all four pass. This is exactly what CI will run.

- [ ] **Step 4: Commit**

```bash
git add template
git commit -m "feat(template): add CI workflow"
```

---

### Task 8: CI in this repository that builds the template

**Files:**
- Create: `.github/workflows/template.yml` (repository root, NOT inside `template/`)

**Interfaces:**
- Consumes: `template/package.json` scripts from Tasks 1–7.

- [ ] **Step 1: Create `.github/workflows/template.yml`**

```yaml
name: Template builds

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-template:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Copy template to a clean directory
        run: cp -R template "${RUNNER_TEMP}/app"
      - name: Install
        working-directory: ${{ runner.temp }}/app
        run: pnpm install --no-frozen-lockfile
      - name: Install browsers
        working-directory: ${{ runner.temp }}/app
        run: pnpm exec playwright install --with-deps chromium
      - name: Typecheck, lint, test, build
        working-directory: ${{ runner.temp }}/app
        run: pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

The copy step is the point of this job. `template/` is never installed in this repository, so without building it in isolation a broken template would only surface the next time a project is started — potentially months later.

- [ ] **Step 2: Reproduce the job locally**

```bash
rm -rf /tmp/blueprint-check && cp -R template /tmp/blueprint-check
cd /tmp/blueprint-check && pnpm install --no-frozen-lockfile \
  && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: all pass. This proves `template/` is genuinely self-contained — if it silently depended on anything in the parent repository, it fails here.

- [ ] **Step 3: Clean up**

```bash
rm -rf /tmp/blueprint-check
```

- [ ] **Step 4: Commit**

```bash
git add .github
git commit -m "ci: build the template in isolation"
```

---

### Task 9: Landing page and README

**Files:**
- Modify: `template/src/app/page.tsx`
- Create: `template/README.md`
- Create: `README.md` (repository root)

- [ ] **Step 1: Replace `template/src/app/page.tsx`**

```tsx
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="font-semibold text-4xl tracking-tight">New project</h1>
      <p className="text-muted-foreground">
        Built from project-blueprint. Add capabilities as you need them — nothing
        here assumes a database, a login, or an API.
      </p>
      <div>
        <Button>Get started</Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create `template/README.md`**

```markdown
# New project

Built from [project-blueprint](https://github.com/<owner>/project-blueprint).

## Running it

```bash
pnpm install
pnpm dev
```

No environment variables are required. Copy `.env.example` to `.env` when you
want error tracking — the app runs without it.

## Scripts

| Script | Does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | Biome check |
| `pnpm format` | Biome check and write |
| `pnpm test` | Vitest, browser mode |

## Adding components

Vanilla shadcn works out of the box:

```bash
pnpm dlx shadcn@latest add dialog
```
```

- [ ] **Step 3: Create the repository root `README.md`**

```markdown
# project-blueprint

A template and component registry for new web apps.

## Starting a project

```bash
npx degit <owner>/project-blueprint/template my-app
cd my-app && pnpm install && pnpm dev
```

That gives a landing page with Biome, Vitest, Sentry, typed environment
variables and CI. No database, no auth, no coupling to this repository.

## What is here

| Path | What |
|---|---|
| `template/` | The app cloned by `degit` |
| `docs/superpowers/specs/` | Design decisions and their evidence |
| `docs/superpowers/plans/` | Implementation plans |

Phases 2 (registry and preview site) and 3 (capabilities and the `blueprint`
script) are not built yet — see the spec.
```

Replace `<owner>` with the actual GitHub owner in both files.

- [ ] **Step 4: Verify**

```bash
cd template && pnpm lint && pnpm test && pnpm build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add landing page and READMEs"
```

---

## Done when

- `cp -R template /tmp/x && cd /tmp/x && pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes from a clean checkout.
- The build succeeds with no `.env` file present.
- `template/components.json` contains no `registries` key.
- No ESLint, `@playwright/test`, Drizzle, better-auth or TanStack packages appear in `template/package.json`.
