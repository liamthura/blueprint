# Phase 2 — Registry and Preview Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repository root into a Next app that is simultaneously the component gallery and the registry host, serving items from a route handler that learns its own hostname from the request.

**Architecture:** The root becomes a Next 16 app in `src/`. `registry.json` declares items; `src/app/r/[name]/route.ts` serves them via `loadRegistryItem()` from `shadcn/registry`, rewriting this registry's own `registryDependencies` into absolute URLs built from the request origin. `template/` is a sibling directory of plain files and must be excluded from the root app's typecheck, lint and build.

**Tech Stack:** Next.js 16, React 19, TypeScript 7, Tailwind v4, Biome, Vitest, `shadcn@4.21.0` as a **runtime** dependency.

**Spec:** `docs/superpowers/specs/2026-09-12-project-blueprint-design.md` (Phase 2 section, plus "The registry is served dynamically")

## Global Constraints

- **All Phase 2 work is at the repository root.** Do not modify anything inside `template/` — it is finished and verified.
- **`template/` must be invisible to the root app.** Exclude it from `tsconfig.json`, from Biome, and from Next's compilation. A root `tsc` that walks into `template/` will fail on its separate dependency tree.
- **`shadcn@4.21.0` is a `dependency` at the root, NOT a devDependency.** The route handler imports `shadcn/registry` at runtime. This is deliberately the opposite of `template/`, where the CLI was moved to devDependencies because nothing imports it.
- **Versions** match Phase 1 exactly: `next@16.3.5`, `react@19.3.0`, `react-dom@19.3.0`, `typescript@7.0.2`, `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `@biomejs/biome@2.5.13`, `vitest@4.1.11`, `vite@8.3.0`, `@vitejs/plugin-react@6.1.1`, `cn@0.2.6`, `class-variance-authority@0.7.1`, `radix-ui@1.6.7`, `@phosphor-icons/react@2.1.10`.
- **`typecheck` is `next typegen && tsc --noEmit`.** Phase 1 proved a bare `tsc --noEmit` fails on a clean checkout; do not repeat that.
- **No Sentry, no env validation at the root.** This is an internal gallery, not a product. Keep it thin.
- **British English** in all prose and documentation.

---

### Task 1: Scaffold the root app without disturbing `template/`

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `biome.json`, `postcss.config.mjs`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/globals.css`
- Modify: nothing inside `template/`

**Interfaces:**
- Produces: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` at the repository root.

- [ ] **Step 1: Scaffold into a temp directory and move the pieces in**

`create-next-app` refuses a non-empty directory, and the root already has `docs/`, `template/` and `.github/`.

```bash
cd /tmp && rm -rf bp-root
pnpm dlx create-next-app@16.3.5 bp-root \
  --ts --tailwind --app --src-dir --turbopack \
  --import-alias "@/*" --use-pnpm --no-eslint --yes
cd /Users/khantthura/Documents/ProjectL/project-blueprint
cp -R /tmp/bp-root/src .
cp /tmp/bp-root/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs,.gitignore} .
rm -rf /tmp/bp-root
```

- [ ] **Step 2: Rewrite `package.json`**

```json
{
  "name": "project-blueprint",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "next typegen && tsc --noEmit",
    "lint": "biome check .",
    "format": "biome check --write .",
    "test": "vitest run"
  },
  "dependencies": {
    "@phosphor-icons/react": "2.1.10",
    "class-variance-authority": "0.7.1",
    "cn": "0.2.6",
    "next": "16.3.5",
    "radix-ui": "1.6.7",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "shadcn": "4.21.0"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.13",
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "24.3.0",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "tailwindcss": "4.3.3",
    "typescript": "7.0.2",
    "vite": "8.3.0",
    "vitest": "4.1.11"
  },
  "packageManager": "pnpm@10.0.0"
}
```

`shadcn` sits in `dependencies` because `src/app/r/[name]/route.ts` imports it at runtime.

- [ ] **Step 3: Exclude `template/` in `tsconfig.json`**

Add or replace the `exclude` array:

```json
  "exclude": ["node_modules", "template", ".next"]
```

- [ ] **Step 4: Create root `biome.json` excluding `template/`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.13/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": true,
    "includes": ["**", "!template/**", "!.next/**", "!docs/**"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } },
  "css": { "parser": { "tailwindDirectives": true } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

- [ ] **Step 5: Add `template/` to the root `.gitignore` exclusions check**

Do NOT gitignore `template/` — it must stay tracked. Instead confirm the root `.gitignore` did not overwrite the template's own. Run:

```bash
git status --short template/
```

Expected: no output. **If files under `template/` show as deleted or modified, the scaffold overwrote them — restore with `git checkout -- template/` before continuing.**

- [ ] **Step 6: Install and verify the exclusion works**

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all pass, and the output mentions no file under `template/`. If `tsc` reports errors in `template/src/...`, Step 3 did not take effect.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(registry): scaffold the root preview site app"
```

---

### Task 2: The registry catalogue and the theme item

**Files:**
- Create: `registry.json`
- Create: `registry/theme.json`

**Interfaces:**
- Produces: a `registry.json` whose `items` include a `registry:theme` item named `theme`, loadable by `loadRegistryItem("theme")`.

- [ ] **Step 1: Create `registry.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "blueprint",
  "homepage": "https://github.com/khantthura/project-blueprint",
  "include": ["registry/theme.json"]
}
```

`include` keeps one file per item rather than one growing catalogue. Item names must stay unique across included files.

- [ ] **Step 2: Create `registry/theme.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "items": [
    {
      "name": "theme",
      "type": "registry:theme",
      "title": "Blueprint theme",
      "description": "Base tokens: colour, radius and typography for light and dark.",
      "cssVars": {
        "theme": {
          "font-sans": "var(--font-geist-sans)",
          "radius": "0.625rem"
        },
        "light": {
          "background": "oklch(1 0 0)",
          "foreground": "oklch(0.145 0 0)",
          "primary": "oklch(0.205 0 0)",
          "primary-foreground": "oklch(0.985 0 0)",
          "muted": "oklch(0.97 0 0)",
          "muted-foreground": "oklch(0.556 0 0)",
          "border": "oklch(0.922 0 0)",
          "ring": "oklch(0.708 0 0)"
        },
        "dark": {
          "background": "oklch(0.145 0 0)",
          "foreground": "oklch(0.985 0 0)",
          "primary": "oklch(0.985 0 0)",
          "primary-foreground": "oklch(0.205 0 0)",
          "muted": "oklch(0.269 0 0)",
          "muted-foreground": "oklch(0.708 0 0)",
          "border": "oklch(1 0 0 / 10%)",
          "ring": "oklch(0.556 0 0)"
        }
      }
    }
  ]
}
```

- [ ] **Step 3: Verify the catalogue loads**

```bash
node --input-type=module -e "
import { loadRegistry, loadRegistryItem } from 'shadcn/registry';
const reg = await loadRegistry({ cwd: process.cwd() });
console.log('items:', reg.items?.map(i => i.name));
const theme = await loadRegistryItem('theme', { cwd: process.cwd() });
console.log('theme name:', theme.name, '| normalised type:', theme.type);
"
```

Expected: `items: [ 'theme' ]` and `theme name: theme | normalised type: registry:base`.

Note the normalised type is `registry:base`, **not** the `registry:theme` you declared —
`loadRegistryItem` parses items into a common shape. Assert on `name`, never on `type`.

**If this throws**, the `include` path or the schema shape is wrong — fix before continuing. Everything downstream depends on these two calls.

- [ ] **Step 4: Commit**

```bash
git add registry.json registry
git commit -m "feat(registry): add catalogue and theme item"
```

---

### Task 3: Absolute-URL rewriting, with a test

**Files:**
- Create: `src/lib/registry.ts`
- Test: `src/lib/registry.test.ts`

**Interfaces:**
- Produces: `absolutiseDependencies(item, origin, ownNames)` returning a new item whose `registryDependencies` entries matching `ownNames` become `${origin}/r/${name}.json`, leaving everything else untouched.

This is the one piece of real logic in Phase 2, so it gets the one test.

- [ ] **Step 1: Write the failing test**

Create `src/lib/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { absolutiseDependencies } from "./registry";

const own = new Set(["theme", "db", "auth"]);

describe("absolutiseDependencies", () => {
  it("rewrites dependencies that belong to this registry", () => {
    const out = absolutiseDependencies(
      { name: "auth", registryDependencies: ["db"] },
      "https://blueprint.example.com",
      own,
    );
    expect(out.registryDependencies).toEqual(["https://blueprint.example.com/r/db.json"]);
  });

  it("leaves upstream shadcn names alone", () => {
    const out = absolutiseDependencies(
      { name: "data-table", registryDependencies: ["table", "button"] },
      "https://blueprint.example.com",
      own,
    );
    expect(out.registryDependencies).toEqual(["table", "button"]);
  });

  it("leaves entries that are already URLs alone", () => {
    const url = "https://ui.shadcn.com/r/button.json";
    const out = absolutiseDependencies(
      { name: "x", registryDependencies: [url] },
      "https://blueprint.example.com",
      own,
    );
    expect(out.registryDependencies).toEqual([url]);
  });

  it("handles an item with no dependencies", () => {
    const out = absolutiseDependencies({ name: "theme" }, "https://x.dev", own);
    expect(out.registryDependencies).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const input = { name: "auth", registryDependencies: ["db"] };
    absolutiseDependencies(input, "https://x.dev", own);
    expect(input.registryDependencies).toEqual(["db"]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm vitest run src/lib/registry.test.ts
```

Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 3: Create `src/lib/registry.ts`**

```ts
export type RegistryItemLike = {
  name: string;
  registryDependencies?: string[];
  [key: string]: unknown;
};

/**
 * Rewrites this registry's own dependency names into absolute URLs, so an item
 * resolves for a consumer who has not registered the @blueprint namespace.
 * Upstream shadcn names and entries that are already URLs are left untouched.
 */
export function absolutiseDependencies<T extends RegistryItemLike>(
  item: T,
  origin: string,
  ownNames: Set<string>,
): T {
  if (!item.registryDependencies) return { ...item };

  return {
    ...item,
    registryDependencies: item.registryDependencies.map((dep) =>
      ownNames.has(dep) ? `${origin}/r/${dep}.json` : dep,
    ),
  };
}
```

- [ ] **Step 4: Create `vitest.config.mts`**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    passWithNoTests: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

The root app has no browser tests — the gallery is checked by building it, not by rendering components in isolation. So no Playwright and no browser mode here, unlike `template/`.

- [ ] **Step 5: Run the tests**

```bash
pnpm test
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib vitest.config.mts
git commit -m "feat(registry): rewrite own dependencies to absolute URLs"
```

---

### Task 4: The registry route handler

**Files:**
- Create: `src/app/r/[name]/route.ts`

**Interfaces:**
- Consumes: `absolutiseDependencies` from `@/lib/registry` (Task 3); `loadRegistry`, `loadRegistryItem`, `RegistryItemNotFoundError` from `shadcn/registry`.
- Produces: `GET /r/{name}.json` returning a registry item, and `GET /r/registry.json` returning the catalogue.

- [ ] **Step 1: Create `src/app/r/[name]/route.ts`**

```ts
import { loadRegistry, loadRegistryItem, RegistryItemNotFoundError } from "shadcn/registry";
import { absolutiseDependencies } from "@/lib/registry";

export const dynamic = "force-dynamic";

async function ownItemNames(): Promise<Set<string>> {
  const registry = await loadRegistry({ cwd: process.cwd() });
  return new Set((registry.items ?? []).map((item) => item.name));
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const itemName = name.replace(/\.json$/, "");
  const origin = new URL(request.url).origin;

  if (itemName === "registry") {
    const registry = await loadRegistry({ cwd: process.cwd() });
    return Response.json(registry);
  }

  try {
    const [item, names] = await Promise.all([
      loadRegistryItem(itemName, { cwd: process.cwd() }),
      ownItemNames(),
    ]);
    return Response.json(absolutiseDependencies(item, origin, names));
  } catch (error) {
    if (error instanceof RegistryItemNotFoundError) {
      return Response.json({ error: `Unknown registry item: ${itemName}` }, { status: 404 });
    }
    console.error(`Failed to serve registry item "${itemName}"`, error);
    return Response.json({ error: "Failed to load registry item" }, { status: 500 });
  }
}
```

`force-dynamic` is required. Without it Next may prerender the route at build time, which would freeze whatever origin happened to be in scope — defeating the whole point of reading the hostname from the request.

- [ ] **Step 2: Start the dev server and verify the item resolves**

```bash
pnpm dev &
sleep 6
curl -s http://localhost:3000/r/theme.json | head -20
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/r/does-not-exist.json
curl -s http://localhost:3000/r/registry.json | head -10
kill %1
```

Expected: the theme item as JSON; `404` for the unknown item; the catalogue listing `theme`.

- [ ] **Step 3: Verify the origin is genuinely read from the request**

```bash
pnpm dev &
sleep 6
curl -s -H "Host: example.test" http://127.0.0.1:3000/r/theme.json | grep -o "example.test" || echo "no own dependencies to rewrite — expected for theme"
kill %1
```

`theme` has no `registryDependencies`, so "no own dependencies to rewrite" is the correct result here. The rewriting itself is covered by the unit tests in Task 3 and exercised for real in Phase 3, when `auth` depends on `db`.

- [ ] **Step 4: Commit**

```bash
git add src/app/r
git commit -m "feat(registry): serve items from a dynamic route handler"
```

---

### Task 5: Seed the registry with components

**Files:**
- Create: `src/components/ui/{button,dialog,dropdown-menu,sonner}.tsx`
- Create: `registry/ui.json`
- Modify: `registry.json`
- Modify: `components.json` (root, created by this task)

**Interfaces:**
- Produces: registry items `button`, `dialog`, `dropdown-menu`, `sonner`.

- [ ] **Step 1: Initialise shadcn at the root and add the components**

```bash
pnpm dlx shadcn@4.21.0 init --yes --base-color neutral
pnpm dlx shadcn@4.21.0 add button dialog dropdown-menu sonner --yes
```

This adds packages beyond the pinned list in Task 1 — `sonner` and `next-themes`
arrive with the sonner component. That is expected at the root: the gallery has
to render what it publishes. It does **not** change `template/`, whose floor
still excludes both.

- [ ] **Step 2: Set the icon library to match the template**

Add to the root `components.json`:

```json
  "iconLibrary": "phosphor",
```

Then confirm:

```bash
grep -rn "lucide" src/components/ui/ && echo "WRONG — rerun add after setting iconLibrary" || echo "correct"
```

- [ ] **Step 3: Create `registry/ui.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "items": [
    {
      "name": "button",
      "type": "registry:ui",
      "title": "Button",
      "description": "Button, with the blueprint defaults.",
      "registryDependencies": ["theme"],
      "dependencies": ["class-variance-authority", "cn", "radix-ui"],
      "files": [{ "path": "src/components/ui/button.tsx", "type": "registry:ui" }]
    },
    {
      "name": "dialog",
      "type": "registry:ui",
      "title": "Dialog",
      "description": "Dialog, with the blueprint defaults.",
      "registryDependencies": ["theme"],
      "dependencies": ["radix-ui", "@phosphor-icons/react"],
      "files": [{ "path": "src/components/ui/dialog.tsx", "type": "registry:ui" }]
    },
    {
      "name": "dropdown-menu",
      "type": "registry:ui",
      "title": "Dropdown menu",
      "description": "Dropdown menu, with the blueprint defaults.",
      "registryDependencies": ["theme"],
      "dependencies": ["radix-ui", "@phosphor-icons/react"],
      "files": [{ "path": "src/components/ui/dropdown-menu.tsx", "type": "registry:ui" }]
    },
    {
      "name": "sonner",
      "type": "registry:ui",
      "title": "Sonner",
      "description": "Toast wrapper with the blueprint defaults.",
      "registryDependencies": ["theme"],
      "dependencies": ["sonner", "next-themes"],
      "files": [{ "path": "src/components/ui/sonner.tsx", "type": "registry:ui" }]
    }
  ]
}
```

Each declares `registryDependencies: ["theme"]` — the tokens arrive automatically with any component, which is the point of building the theme first.

- [ ] **Step 4: Include it in `registry.json`**

```json
  "include": ["registry/theme.json", "registry/ui.json"]
```

- [ ] **Step 5: Verify every item resolves and rewrites its theme dependency**

```bash
pnpm dev &
sleep 6
for n in theme button dialog dropdown-menu sonner; do
  printf "%-16s %s\n" "$n" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/r/$n.json)"
done
echo "--- button's theme dependency should now be an absolute URL ---"
curl -s http://localhost:3000/r/button.json | grep -o "http://localhost:3000/r/theme.json" || echo "REWRITE FAILED"
kill %1
```

Expected: five `200`s, and the rewrite line prints the absolute URL. **If the rewrite fails, Task 3 or Task 4 is wrong** — this is the first end-to-end proof that the dependency rewriting works.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(registry): seed button, dialog, dropdown-menu and sonner"
```

---

### Task 6: The gallery

**Files:**
- Modify: `src/app/page.tsx`

The scaffold's `src/app/layout.tsx` is left as generated — the gallery is an
internal tool and does not need custom metadata or fonts.

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
import { loadRegistry } from "shadcn/registry";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function Gallery() {
  const registry = await loadRegistry({ cwd: process.cwd() });
  const items = registry.items ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-semibold text-3xl tracking-tight">blueprint</h1>
      <p className="mt-2 text-muted-foreground">
        {items.length} items. Add one to a project with the command beneath it.
      </p>

      <ul className="mt-10 space-y-6">
        {items.map((item) => (
          <li key={item.name} className="rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-medium">{item.title ?? item.name}</h2>
              <span className="text-muted-foreground text-xs">{item.type}</span>
            </div>
            {item.description ? (
              <p className="mt-1 text-muted-foreground text-sm">{item.description}</p>
            ) : null}
            <code className="mt-3 block overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
              pnpm dlx shadcn@latest add {item.name}
            </code>
          </li>
        ))}
      </ul>

      <section className="mt-16 border-t pt-8">
        <h2 className="font-medium">Button</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>
    </main>
  );
}
```

The list is generated from `registry.json`, so a new item appears in the gallery without touching this file. The Button section is hand-written on purpose — visual states are what a gallery is for, and they cannot be derived from the catalogue.

- [ ] **Step 2: Verify**

```bash
pnpm dev &
sleep 6
curl -s http://localhost:3000 | grep -c "shadcn@latest add" || echo "gallery did not render items"
kill %1
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: a count of 5, then all four checks pass.

- [ ] **Step 3: Commit**

```bash
git add src/app
git commit -m "feat(gallery): list registry items and show button states"
```

---

### Task 7: CI for the registry, and Vercel deployment

**Files:**
- Create: `.github/workflows/registry.yml`
- Modify: `README.md`

- [ ] **Step 1: Create `.github/workflows/registry.yml`**

```yaml
name: Registry

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
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build

      - name: Every declared item must resolve
        run: |
          pnpm start &
          for i in $(seq 1 30); do
            curl -sf http://localhost:3000/r/registry.json >/dev/null && break
            sleep 1
          done
          names=$(curl -sf http://localhost:3000/r/registry.json | node -e "
            let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
              const r=JSON.parse(s);console.log((r.items||[]).map(i=>i.name).join(' '));
            })")
          echo "checking: $names"
          for n in $names; do
            code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000/r/$n.json")
            echo "  $n -> $code"
            [ "$code" = "200" ] || exit 1
          done
```

This is the job that matters. Every app you own pulls from this endpoint, so an item that parses locally but 500s when served is the failure worth catching before it reaches them.

- [ ] **Step 2: Verify the same sequence locally**

```bash
pnpm build && pnpm start &
sleep 6
for n in theme button dialog dropdown-menu sonner; do
  printf "%-16s %s\n" "$n" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/r/$n.json)"
done
kill %1
```

Expected: five `200`s.

- [ ] **Step 3: Update the root `README.md`**

Replace the "What is here" table and add a registry section:

```markdown
## Using the registry

The deployment is both the component gallery and the registry host.

Pull a single item with no configuration:

```bash
pnpm dlx shadcn@latest add https://<your-deployment>/r/button.json
```

Or register the namespace once per project and use short names:

```bash
pnpm dlx shadcn@latest registry add @blueprint=https://<your-deployment>/r/{name}.json
pnpm dlx shadcn@latest add @blueprint/button
```

The registry reads its own hostname from the request, so moving to a custom
domain needs no change here.

| Path | What |
|---|---|
| `src/app/page.tsx` | The component gallery |
| `src/app/r/[name]` | Serves registry items |
| `registry.json`, `registry/` | The catalogue |
| `template/` | The app cloned by `degit` |
| `docs/superpowers/` | Specs and plans |
```

- [ ] **Step 4: Deploy to Vercel**

```bash
pnpm dlx vercel@latest --yes
```

Then verify against the real deployment:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<deployment>/r/theme.json
curl -s https://<deployment>/r/button.json | grep -o "https://[^\"]*\/r\/theme.json"
```

Expected: `200`, and the theme dependency printed as an absolute URL **on the deployment's own hostname** — the proof that origin detection works in production, not just on localhost.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci: verify every registry item resolves when served"
```

---

## Done when

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes at the repository root.
- `template/` is untouched: `git status --short template/` is empty, and no root command reports a file inside it.
- Every item in `registry.json` returns `200` from `/r/{name}.json` on the deployed site.
- `/r/button.json` lists its `theme` dependency as an absolute URL on the deployment's hostname.
- `/r/does-not-exist.json` returns `404`, not `500`.
- `shadcn` is in `dependencies` at the root and in `devDependencies` in `template/`.
