# Phase 2 — Registry and Preview Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repository root into a Next app that is simultaneously the component gallery and the registry host, serving items from a route handler that learns its own hostname from the request.

**Architecture:** A second Next 16 app lives in `site/`, a **sibling** of `template/`, sharing the house preset with it. `site/registry.json` declares items; `site/src/app/r/[name]/route.ts` serves them via `loadRegistryItem()` from `shadcn/registry`, rewriting this registry's own `registryDependencies` into absolute URLs built from the request origin.

**Why `site/` and not the repository root:** Biome 2.5.13 rejects a nested root configuration. A `biome.json` at the repository root cannot coexist with `template/biome.json` — `files.includes` exclusions do not prevent discovery, scoping the CLI path does not either, `"root": false` in the nested config breaks the template once it is degit'd standalone, and `biome migrate` silently disables every lint rule. Two sibling directories never nest, so the problem disappears structurally.

**Tech Stack:** Next.js 16, React 19, TypeScript 7, Tailwind v4, Biome, Vitest, `shadcn@4.21.0` as a **runtime** dependency.

**Spec:** `docs/superpowers/specs/2026-09-12-project-blueprint-design.md` (Phase 2 section, plus "The registry is served dynamically" and "No `registry:theme` item")

## Global Constraints

- **All Phase 2 work happens inside `site/`.** Do not modify anything inside `template/` — it is finished and verified — and do not create `package.json`, `biome.json` or `tsconfig.json` at the repository root. The repository root holds only `docs/`, `.github/`, `README.md`, `site/` and `template/`.
- **`site/` and `template/` are independent sibling apps**: separate `package.json`, separate `node_modules`, separate lockfiles, separate Biome configs. There is no pnpm workspace and you must not create one.
- **`shadcn@4.21.0` is a `dependency` in `site/`, NOT a devDependency.** The route handler imports `shadcn/registry` at runtime. Deliberately the opposite of `template/`, where nothing imports it.
- **Design baseline is preset `b7lltUjfaE`** — the same one `template/` uses. Never hand-write theme tokens; there is no `registry:theme` item.
- **After any `shadcn` command, run `pnpm format`.** Generated output is not Biome-formatted and will fail `pnpm lint`.
- **Versions** match Phase 1: `next@16.3.5`, `react@19.3.0`, `react-dom@19.3.0`, `typescript@7.0.2`, `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `@biomejs/biome@2.5.13`, `vitest@4.1.11`, `vite@8.3.0`, `cn@0.2.6`, `class-variance-authority@0.7.1`, `radix-ui@1.6.7`, `@phosphor-icons/react@2.1.10`.
- **`typecheck` is `next typegen && tsc --noEmit`.** Phase 1 proved a bare `tsc --noEmit` fails on a clean checkout.
- **No Sentry, no env validation at the root.** This is an internal gallery, not a product.
- **British English** throughout.

---

### Task 1: Scaffold the `site/` app

**Files:**
- Create: `site/{package.json,tsconfig.json,next.config.ts,biome.json,postcss.config.mjs,.gitignore}`, `site/src/app/{layout.tsx,page.tsx,globals.css}`

**Interfaces:**
- Produces: `pnpm dev`, `build`, `typecheck`, `lint`, `format`, `test`, all run from inside `site/`.

- [ ] **Step 1: Scaffold directly into `site/`**

```bash
cd /Users/khantthura/Documents/ProjectL/project-blueprint
pnpm dlx create-next-app@16.3.5 site \
  --ts --tailwind --app --src-dir --turbopack \
  --import-alias "@/*" --use-pnpm --no-eslint --yes
```

`site/` does not exist yet, so `create-next-app` runs cleanly — no temp directory, no
copying. This is simpler than the root-scaffold approach it replaces.

- [ ] **Step 2: Confirm nothing outside `site/` changed**

```bash
git status --short -- . ':!site'
```

Expected: no output. **If anything under `template/` or the repository root appears, stop and report it.**

- [ ] **Step 3: Replace `site/package.json`**

```json
{
  "name": "blueprint-site",
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

- [ ] **Step 4: Create `site/biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.13/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true, "includes": ["**", "!.next"] },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": { "enabled": true, "rules": { "preset": "recommended" } },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } },
  "css": { "parser": { "tailwindDirectives": true } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

Use `"preset": "recommended"`, not `"recommended": true` — the latter is deprecated in
Biome 2.5.13 and emits an info on every run. `"!.next"` rather than `"!.next/**"`, which
trips `lint/suspicious/useBiomeIgnoreFolder`. Do **not** reach for `biome migrate` to
resolve either: it rewrites `recommended: true` into `preset: "none"`, which is a valid
value meaning *no rules at all*, silently disabling every check.

No `!template/**` exclusion is needed — `template/` is a sibling, not a child, so Biome
running inside `site/` never sees it. Keep `rules.recommended: true`; if any tool
suggests `biome migrate`, do **not** run it: it rewrites this to `preset: "none"`, which
silently disables every lint rule.

- [ ] **Step 5: Install and verify**

```bash
cd site && pnpm install && pnpm typecheck && pnpm lint && pnpm build
```

Expected: all three pass. `pnpm lint` in particular must report no configuration error —
if it mentions a "nested root configuration", a stray `biome.json` was created at the
repository root and must be deleted.

- [ ] **Step 6: Confirm `template/` still passes on its own**

```bash
cd ../template && pnpm lint
```

Expected: passes. This proves the two apps are genuinely independent.

- [ ] **Step 7: Commit**

```bash
cd /Users/khantthura/Documents/ProjectL/project-blueprint
git add -A
git commit -m "feat(site): scaffold the preview site app"
```

---

### Task 2: Apply the house preset and add the components

**Files:**
- Create: `site/components.json`, `site/src/components/ui/{button,dialog,dropdown-menu,sonner}.tsx`, `site/src/lib/utils.ts`
- Modify: `site/src/app/globals.css`, `site/src/app/layout.tsx`, `site/package.json`

**All commands in this task run from inside `site/`.**

**Interfaces:**
- Produces: `Button` from `@/components/ui/button`, used by the gallery in Task 6.

- [ ] **Step 1: Initialise with the preset**

```bash
pnpm dlx shadcn@4.21.0 init --preset b7lltUjfaE --base radix --yes
```

**`--base radix` is required.** The preset code encodes the *style* (`mira`) but not the
component library, and `init` defaults to `base` — producing `base-mira` with
`@base-ui/react` instead of `radix-mira` with `radix-ui`. `template/` is on Radix because
it was initialised before the preset existed and `shadcn apply` preserved its base; a
fresh `init --preset` does not.

This is the same baseline `template/` uses — `radix-mira`, `taupe`, green theme, phosphor icons, geist with instrument-sans headings, zero radius.

- [ ] **Step 2: Add the four components**

```bash
pnpm dlx shadcn@4.21.0 add button dialog dropdown-menu sonner --yes
```

These are the ones already customised the same way in more than one existing project. Resist adding more: the rule is that a component earns a place on its *second* customisation, not its first.

This also installs `sonner` and `next-themes`, which are not in Task 1's pinned list. That is expected at the root — the gallery must render what it publishes. It does not change `template/`, whose floor still excludes both.

- [ ] **Step 3: Confirm the preset took, and that no Lucide leaked in**

```bash
node -p "const c=require('./components.json'); [c.style, c.tailwind.baseColor, c.iconLibrary, c.menuColor].join(' | ')"
grep -rn "lucide" src/components/ui/ && echo "WRONG — iconLibrary not applied" || echo "icons correct"
```

Expected: `radix-mira | taupe | phosphor | default-translucent`, then `icons correct`.

- [ ] **Step 4: Format, and drop the empty registries key**

```bash
pnpm format
node -e "
const fs=require('fs');const p='components.json';
const c=JSON.parse(fs.readFileSync(p));
if(JSON.stringify(c.registries)==='{}'){delete c.registries;fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');console.log('removed empty registries key');}
else console.log('registries:',c.registries);
"
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all pass. The preset writes unformatted code and an empty `"registries": {}`; both bit Phase 1 and will bite here identically.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(registry): apply preset b7lltUjfaE and add components"
```

---

### Task 3: The registry catalogue

**Files:**
- Create: `site/registry.json` (one file — see below)

**All paths are relative to `site/`.**

**Interfaces:**
- Produces: four items — `button`, `dialog`, `dropdown-menu`, `sonner` — loadable by `loadRegistryItem(name)`.

- [ ] **Step 1: Create `site/registry.json` with the items inline**

An earlier draft split this into `registry.json` plus an included `registry/ui.json`.
That does not work: shadcn 4.21.0 requires every `include` target's basename to be
literally `registry.json`, and relocating to `registry/ui/registry.json` then breaks
`files.path`, which resolves relative to the included file rather than the cwd. Four
items do not need splitting anyway — `include` was solving a file-organisation problem
this registry does not have yet. One file, inline items:

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "blueprint",
  "homepage": "https://github.com/khantthura/project-blueprint",
  "items": [
    {
      "name": "button",
      "type": "registry:ui",
      "title": "Button",
      "description": "Button with the blueprint defaults.",
      "dependencies": ["class-variance-authority", "cn", "radix-ui"],
      "files": [{ "path": "src/components/ui/button.tsx", "type": "registry:ui" }]
    },
    {
      "name": "dialog",
      "type": "registry:ui",
      "title": "Dialog",
      "description": "Dialog with the blueprint defaults.",
      "registryDependencies": ["button"],
      "dependencies": ["cn", "radix-ui", "@phosphor-icons/react"],
      "files": [{ "path": "src/components/ui/dialog.tsx", "type": "registry:ui" }]
    },
    {
      "name": "dropdown-menu",
      "type": "registry:ui",
      "title": "Dropdown menu",
      "description": "Dropdown menu with the blueprint defaults.",
      "dependencies": ["cn", "radix-ui", "@phosphor-icons/react"],
      "files": [{ "path": "src/components/ui/dropdown-menu.tsx", "type": "registry:ui" }]
    },
    {
      "name": "sonner",
      "type": "registry:ui",
      "title": "Sonner",
      "description": "Toast wrapper with the blueprint defaults.",
      "dependencies": ["sonner", "next-themes", "@phosphor-icons/react"],
      "files": [{ "path": "src/components/ui/sonner.tsx", "type": "registry:ui" }]
    }
  ]
}
```

No item declares a `registryDependencies` on a theme, because there is no theme item — the preset is the theme. A consumer who has not applied the preset still gets a working component; it simply renders in their own colours.

**`dialog` declares `registryDependencies: ["button"]`** because `dialog.tsx` contains
`import { Button } from "@/components/ui/button"`. Without it, a consumer installing
`@blueprint/dialog` into a project without a button component gets an unresolvable
import. This is the only cross-reference among the four — verified by grepping
`@/components/ui/` across all of them — and it is what Task 4's URL rewriting operates on.

- [ ] **Step 2: Verify both loaders work**

```bash
node --input-type=module -e "
import { loadRegistry, loadRegistryItem } from 'shadcn/registry';
const reg = await loadRegistry({ cwd: process.cwd() });
console.log('items:', reg.items.map(i => i.name).join(', '));
const d = await loadRegistryItem('dialog', { cwd: process.cwd() });
console.log('dialog:', d.name, '| type:', d.type, '| deps:', JSON.stringify(d.registryDependencies));
console.log('dialog files:', JSON.stringify(d.files?.map(f => f.path)));
"
```

Expected, exactly:

```
items: button, dialog, dropdown-menu, sonner
dialog: dialog | type: registry:ui | deps: ["button"]
dialog files: ["src/components/ui/dialog.tsx"]
```

The `dialog` line is the one that matters: it confirms the cross-component dependency
survives loading, which Task 5 then rewrites into an absolute URL.

If the script throws, a `files.path` is wrong and everything in Tasks 4-7 depends on
these two calls working.

- [ ] **Step 3: Commit**

```bash
git add registry.json
git commit -m "feat(registry): add the catalogue"
```

---

### Task 4: Absolute-URL rewriting, with tests

**Files:**
- Create: `site/src/lib/registry.ts`, `site/src/lib/registry.test.ts`, `site/vitest.config.mts`

**All commands in this task run from inside `site/`.**

**Interfaces:**
- Produces: `absolutiseDependencies(item, origin, ownNames)` — returns a new item whose `registryDependencies` entries matching `ownNames` become `${origin}/r/${name}.json`, leaving everything else untouched.

This is the only real logic in Phase 2, so it gets the only test. It **is** exercised end
to end: `dialog` declares `registryDependencies: ["button"]`, so `/r/dialog.json` must
serve `button` as an absolute URL on the requesting host. Task 5 Step 2 checks exactly
that.

- [ ] **Step 1: Create `vitest.config.mts`**

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

No browser mode here, unlike `template/` — the gallery is verified by building it, not by rendering components in isolation. That keeps Playwright out of this app entirely.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { absolutiseDependencies } from "./registry";

const own = new Set(["db", "auth", "button"]);

describe("absolutiseDependencies", () => {
  it("rewrites dependencies belonging to this registry", () => {
    const out = absolutiseDependencies(
      { name: "auth", registryDependencies: ["db"] },
      "https://blueprint.example.com",
      own,
    );
    expect(out.registryDependencies).toEqual(["https://blueprint.example.com/r/db.json"]);
  });

  it("leaves upstream shadcn names alone", () => {
    const out = absolutiseDependencies(
      { name: "data-table", registryDependencies: ["table", "input"] },
      "https://blueprint.example.com",
      own,
    );
    expect(out.registryDependencies).toEqual(["table", "input"]);
  });

  it("leaves entries that are already URLs alone", () => {
    const url = "https://ui.shadcn.com/r/button.json";
    const out = absolutiseDependencies({ name: "x", registryDependencies: [url] }, "https://x.dev", own);
    expect(out.registryDependencies).toEqual([url]);
  });

  it("handles an item with no dependencies", () => {
    const out = absolutiseDependencies({ name: "sonner" }, "https://x.dev", own);
    expect(out.registryDependencies).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const input = { name: "auth", registryDependencies: ["db"] };
    absolutiseDependencies(input, "https://x.dev", own);
    expect(input.registryDependencies).toEqual(["db"]);
  });
});
```

- [ ] **Step 3: Run them to confirm they fail**

```bash
pnpm vitest run src/lib/registry.test.ts
```

Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 4: Create `src/lib/registry.ts`**

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

- [ ] **Step 5: Run the tests**

```bash
pnpm test
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib vitest.config.mts
git commit -m "feat(registry): rewrite own dependencies to absolute URLs"
```

---

### Task 5: The registry route handler

**Files:**
- Create: `site/src/app/r/[name]/route.ts`

**Interfaces:**
- Consumes: `absolutiseDependencies` from `@/lib/registry` (Task 4); `loadRegistry`, `loadRegistryItem`, `RegistryItemNotFoundError` from `shadcn/registry`.
- Produces: `GET /r/{name}.json` returning an item; `GET /r/registry.json` returning the catalogue.

- [ ] **Step 1: Create `src/app/r/[name]/route.ts`**

```ts
import { loadRegistry, loadRegistryItem, RegistryItemNotFoundError } from "shadcn/registry";
import { absolutiseDependencies } from "@/lib/registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const itemName = name.replace(/\.json$/, "");
  const origin = new URL(request.url).origin;

  try {
    const registry = await loadRegistry({ cwd: process.cwd() });

    if (itemName === "registry") {
      return Response.json(registry);
    }

    const item = await loadRegistryItem(itemName, { cwd: process.cwd() });
    const ownNames = new Set(registry.items.map((i) => i.name));
    return Response.json(absolutiseDependencies(item, origin, ownNames));
  } catch (error) {
    if (error instanceof RegistryItemNotFoundError) {
      return Response.json({ error: `Unknown registry item: ${itemName}` }, { status: 404 });
    }
    console.error(`Failed to serve registry item "${itemName}"`, error);
    return Response.json({ error: "Failed to load registry item" }, { status: 500 });
  }
}
```

`force-dynamic` is required. Without it Next may prerender the route at build time, freezing whatever origin was in scope — which defeats the entire hostname design.

- [ ] **Step 2: Verify against the dev server**

```bash
pnpm dev &
sleep 6
for n in button dialog dropdown-menu sonner registry; do
  printf "%-16s %s\n" "$n" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/r/$n.json)"
done
printf "%-16s %s\n" "missing" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/r/nope.json)"
echo "--- dialog's button dependency must be an absolute URL on this host ---"
curl -s http://localhost:3000/r/dialog.json \
  | grep -o "http://localhost:3000/r/button.json" || echo "REWRITE FAILED"
kill %1
```

Expected: five `200`s, `missing 404`, and the rewritten absolute URL printed. **The
rewrite line is the end-to-end proof of Task 4's logic** — if it prints `REWRITE FAILED`,
either `absolutiseDependencies` or its wiring in the handler is wrong. **A `500` for `missing` means the error branch is wrong** — the point of catching `RegistryItemNotFoundError` is that an unknown name is a client error, not a server fault.

- [ ] **Step 3: Commit**

```bash
git add src/app/r
git commit -m "feat(registry): serve items from a dynamic route handler"
```

---

### Task 6: The gallery

**Files:**
- Modify: `site/src/app/page.tsx`

The scaffold's `src/app/layout.tsx` stays as the preset left it — it already carries the geist and instrument-sans font variables.

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
import { loadRegistry } from "shadcn/registry";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function Gallery() {
  const registry = await loadRegistry({ cwd: process.cwd() });
  const items = registry.items;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading font-semibold text-3xl tracking-tight">blueprint</h1>
      <p className="mt-2 text-muted-foreground">
        {items.length} items. Add one to a project with the command beneath it.
      </p>

      <ul className="mt-10 space-y-4">
        {items.map((item) => (
          <li key={item.name} className="rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-medium">{item.title ?? item.name}</h2>
              <code className="text-muted-foreground text-xs">{item.name}</code>
            </div>
            {item.description ? (
              <p className="mt-1 text-muted-foreground text-sm">{item.description}</p>
            ) : null}
            <code className="mt-3 block overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
              pnpm dlx shadcn@latest add @blueprint/{item.name}
            </code>
          </li>
        ))}
      </ul>

      <section className="mt-16 border-t pt-8">
        <h2 className="font-heading font-medium text-xl">Button</h2>
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

The list is generated from `registry.json`, so a new item appears without editing this file. The Button section is hand-written deliberately — visual states are what a gallery is for and cannot be derived from a catalogue.

- [ ] **Step 2: Verify**

```bash
pnpm dev &
sleep 6
echo "items rendered: $(curl -s http://localhost:3000 | grep -c 'shadcn@latest add')"
kill %1
pnpm format && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: `items rendered: 4`, then all checks pass.

- [ ] **Step 3: Commit**

```bash
git add src/app
git commit -m "feat(gallery): list registry items and show button states"
```

---

### Task 7: CI for the registry, and deployment

**Files:**
- Create: `.github/workflows/registry.yml` (repository root)
- Modify: `README.md` (repository root)

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
          cache-dependency-path: site/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
        working-directory: site
      - run: pnpm typecheck
        working-directory: site
      - run: pnpm lint
        working-directory: site
      - run: pnpm test
        working-directory: site
      - run: pnpm build
        working-directory: site

      - name: Every declared item must resolve when served
        working-directory: site
        run: |
          pnpm start &
          for i in $(seq 1 30); do
            curl -sf http://localhost:3000/r/registry.json >/dev/null && break
            sleep 1
          done
          names=$(curl -sf http://localhost:3000/r/registry.json \
            | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
                console.log(JSON.parse(s).items.map(i=>i.name).join(' '))})")
          echo "checking: $names"
          for n in $names; do
            code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000/r/$n.json")
            echo "  $n -> $code"
            [ "$code" = "200" ] || exit 1
          done
```

This is the job that matters. Every app you own pulls from this endpoint, so an item that parses locally but 500s when served is the failure worth catching before it reaches them.

- [ ] **Step 2: Reproduce it locally**

```bash
pnpm build && pnpm start &
sleep 6
for n in button dialog dropdown-menu sonner; do
  printf "%-16s %s\n" "$n" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/r/$n.json)"
done
kill %1
```

Expected: four `200`s.

- [ ] **Step 3: Update the root `README.md`**

Replace the "What is here" table with:

````markdown
## Using the registry

The deployment is both the component gallery and the registry host.

Pull one item with no configuration:

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

## Design baseline

Every blueprint project uses shadcn preset `b7lltUjfaE` — `radix-mira` style,
`taupe` base, green theme, phosphor icons, geist with instrument-sans headings,
zero radius. Apply it to any existing project with:

```bash
pnpm dlx shadcn@latest apply b7lltUjfaE
```

| Path | What |
|---|---|
| `site/` | The gallery and registry host (deployed) |
| `site/src/app/r/[name]` | Serves registry items |
| `site/registry.json` | The catalogue |
| `template/` | The app cloned by `degit` |
| `docs/superpowers/` | Specs and plans |
````

- [ ] **Step 4: Deploy**

```bash
cd site && pnpm dlx vercel@latest --yes
```

Set the Vercel project's **root directory to `site/`**. That is the only cost of the
sibling layout, and it is a one-time project setting.

Then verify against the real deployment:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<deployment>/r/button.json
curl -s https://<deployment>/r/registry.json | head -5
```

Expected: `200`, and the catalogue listing four items. This confirms `force-dynamic` and `process.cwd()` behave on Vercel — `loadRegistry` reads `registry.json` from disk at request time, so a deployment that tree-shakes those files away would fail here and nowhere earlier.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci: verify every registry item resolves when served"
```

---

## Done when

- `cd site && pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes.
- `cd template && pnpm lint && pnpm build` still passes — the two apps are independent.
- No `package.json`, `biome.json` or `tsconfig.json` exists at the repository root.
- No Biome "nested root configuration" error from either app.
- Every item in `registry.json` returns `200` from `/r/{name}.json` on the deployed site.
- `/r/nope.json` returns `404`, not `500`.
- `/r/dialog.json` lists its `button` dependency as an absolute URL on the deployment's own hostname.
- `site/components.json` reports `radix-mira | taupe | phosphor | default-translucent` and has no `registries` key.
- `shadcn` is in `dependencies` in `site/` and in `devDependencies` in `template/`.
