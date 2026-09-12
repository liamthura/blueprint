# project-blueprint — design

**Date:** 2026-09-12
**Status:** approved, pending implementation plan

## Context

Fifteen projects in `~/Documents/ProjectL` share roughly 85% of a stack and
disagree on the rest. The disagreements are not interesting ones: three
projects use Phosphor icons and three use Lucide; `project-twin` pins five
Radix packages in an `overrides` block to unstick version skew; `framer-motion`
and `motion` both appear, which are the same library either side of a rename.

The costly gap is not inconsistency, though. It is that **no project has error
tracking, no project validates environment variables, and two of fifteen have
CI.** A boilerplate that fixes only the icon question would miss the point.

The second problem is drift. A template repo produces consistency on day one
and loses it by month six, because a fix made in app #4 never reaches apps
#1–3. `project-keeper`, `project-lazybee` and `project-lighthouse` each carry a
`components.json` and each has diverged.

## Goals

- One stack, reused across future projects, that stays current without a
  rewrite each time.
- A project can start as a single landing page and grow a database, auth and
  AI features without restructuring.
- Fixes made once propagate to projects already shipped.
- Every app can be self-hosted.

## Non-goals

- A monorepo. Research is consistent that Turborepo overhead is unjustified for
  single-app, solo work, and code sharing is handled by the registry instead.
- A published `create-blueprint` npm package. `degit` plus one script needs no
  release pipeline. Revisit if scaffolding frequency justifies it.
- Supporting every project shape with a bespoke preset. See "Capabilities, not
  project types".

## Key decisions

### Framework: Next.js 16

Chosen over TanStack Start, after treating Start as the serious alternative it
is. Evidence gathered 2026-09-11/12:

| Signal | TanStack Start | Next.js | Ratio |
|---|---|---|---|
| npm installs/week | 10.3M | 42.8M | 3:1 |
| GitHub stars | 15,072 | 142,244 | 9:1 |
| Sentry adapter installs/week | 378k | 7.74M | 20:1 |

The Sentry adapter ratio is the most informative: error tracking is attached to
production projects, not tutorials. Next carries Sentry on ~18% of installs,
Start on ~3.7%. Normalising for that puts Start's real production footprint
near the GitHub star ratio rather than the npm one. The npm figure is inflated
by CI and template installs — its growth curve steps 2.6M → 15.4M → 49.9M
across two months, which is not how developer adoption moves.

TanStack Start is nonetheless a real v1 (1.168.52), with first-party Sentry
support at version parity and an official better-auth integration. It was
rejected on two specific grounds, not on maturity generally:

1. **Landing pages are in scope and are where Start is weakest.** It has no
   `next/image` equivalent; image optimisation is configured through Nitro or a
   CDN.
2. **The hard hosting constraint is self-hosting, which both satisfy.** Start's
   advantage is its four first-party deploy adapters, which matters only for
   the *soft* Vercel-vs-Cloudflare uncertainty. Next self-hosts via standalone
   output, and OpenNext exists if Cloudflare is later chosen.

Accepted costs: Turbopack rather than Vite, untyped route params, and the RSC
server/client boundary — which draws 67% negative sentiment among the
developers who adopt it.

**Reversal trigger:** revisit when `@sentry/tanstackstart-react` clears ~2M
weekly (≈25% of the Next adapter), or when Start ships a first-party image
primitive. Not on stars, and not on raw npm downloads.

### Data layer: Drizzle 0.45.x + `pg`

Drizzle leads on downloads (16.3M/wk, vs kysely 13.2M and prisma 12.7M) and
migration traffic runs Prisma→Drizzle.

Pinned to the `0.45.x` stable line. `drizzle-orm@latest` is 0.45.2, published
2026-03-27, while `1.0.0-rc.5` sits on the `rc` tag — a v1 that has been in
release candidate for roughly six months. A release candidate does not belong
in a boilerplate intended to last. Track the v1 line; adopt it when `latest`
moves.

Driver is `pg` (39M/wk), not `@neondatabase/serverless` (2.8M/wk). The same
code then runs against local Docker, Neon, Supabase or a VPS, with only
`DATABASE_URL` changing. This is what makes the self-hosting requirement real
rather than aspirational.

### Auth: better-auth

Acquired by Vercel in July 2026, absorbed Auth.js, and grew from 1.2M to 3.3M
weekly downloads across the first half of 2026. Auth.js/NextAuth is in
maintenance mode — security patches only. Currently 1.7.4.

### Linting: Biome 2.5.x, replacing ESLint

10–100x faster, deployed at Vercel, Discord, Slack and the Node.js project.
The tradeoff is losing `eslint-config-next`'s Next-specific rules; accepted
because no existing project carries meaningful ESLint configuration. Biome also
supplies formatting, which no React project here currently has.

### Testing: Vitest browser mode in the floor, Playwright with `auth`

Vitest browser mode, Playwright-backed, for component tests — real browser, no
jsdom. Vitest is the community default for new projects.

Browser mode is **not** end-to-end: it does not drive a running app through a
sign-in flow across routes. So `@playwright/test` is not in the floor; it
arrives with the `auth` capability, which is the first point there is a flow
worth driving end to end. `project-lazybee` carries both packages for exactly
this reason.

### Settled house rules

**One icon library, declared in `components.json`.** `iconLibrary` is a
first-class field in the shadcn schema, and the CLI rewrites icon imports to
match it on every `add`. Supported: `lucide`, `tabler`, `hugeicons`,
`phosphor`, `remix`. So the choice is free, and an earlier draft of this spec
was wrong to justify Lucide on the grounds that anything else meant re-mapping
snippets by hand.

The template defaults to **`phosphor`**, matching the most recent existing
project (`project-lazybee`). The residual cost is small and worth naming:
Lucide is shadcn's default and runs 73M weekly downloads against Phosphor's
2.7M, so example code pasted from blogs and upstream blocks will assume Lucide
imports. The CLI covers `add`; hand-pasted code does not. Preset `b7lltUjfaE`
sets `phosphor` independently, so this is settled in one place.

**What actually matters is picking one.** `project-lighthouse` currently
carries both `lucide-react` and `@phosphor-icons/react` — that is the defect,
not which one was chosen. Changing a project's mind later is one field plus
re-running `add`.

`motion`, not `framer-motion` (same library, post-rename). The unified
`radix-ui` package, not per-component `@radix-ui/react-*` — `project-twin`
needed a five-package `overrides` block to unstick the latter. pnpm, pinned via
`packageManager`.

## Architecture

One repository, two products: a **template** cloned to start an app, and a
**registry** that apps pull from over time.

```
project-blueprint/
├── src/
│   ├── app/
│   │   ├── (gallery)/          # preview site — the component gallery
│   │   └── r/[name]/route.ts   # serves registry items, dynamically
│   ├── components/ui/          # the components
│   └── lib/, hooks/
├── registry/                   # capability items (db, auth, ai, tables)
├── registry.json               # root; composes the rest via `include`
├── template/                   # degit target — becomes each new app
│   ├── scripts/blueprint.mjs   # ships into every app
│   └── scripts/blueprint.test.mjs
└── docs/
```

`scripts/blueprint.mjs` lives inside `template/`, so every generated app
carries its own copy. Its source of truth is this repository; apps receive it
at `degit` time and do not update it afterwards.

The repository deploys to Vercel. The deployment is simultaneously the
component gallery and the registry host, and it serves registry items from a
route handler rather than from pre-built files. No separate infrastructure.

### The template

Sized for a landing page and nothing more:

- Next.js 16, React 19, TypeScript, Tailwind v4
- shadcn `cn()` plus `button`, `input`, `card` — upstream, vanilla
- Biome, Vitest (browser mode), `env.ts` using `@t3-oss/env-nextjs`
- `.github/workflows/ci.yml` — typecheck, lint, test, build
- **Sentry**

Sentry is a deliberate exception to "a landing page needs nothing". It costs
`instrumentation.ts`, client/server/edge configs and `withSentryConfig` — more
than trivial, and still worth it, because it is the single thing absent from
all fifteen existing projects. Made optional, it stays absent; "later" is why
there is no error tracking today.

**The DSN is `.optional()` in the env schema and Sentry no-ops without it.**
A fresh clone therefore builds, tests and deploys with an empty `.env`, which
is what makes the "no environment variables" promise in the growth path true.

The template ships **vanilla**: no `registries` key in `components.json`, no
coupling to this repository. An app built from it keeps working if this
repository is archived.

### The registry

Three kinds of item.

**No `registry:theme` item. The shadcn preset is the theme.**

The design baseline is preset **`b7lltUjfaE`**, applied with
`pnpm dlx shadcn@latest apply b7lltUjfaE`. Decoded:

| | |
|---|---|
| style | `radix-mira` |
| baseColor | `taupe` |
| theme / chartColor | `green` / `emerald` |
| iconLibrary | `phosphor` |
| font / heading | `geist` / `instrument-sans` |
| radius | `none` |
| menuColor / menuAccent | `default-translucent` / `subtle` |

An earlier draft specified a hand-written `registry:theme` item carrying
invented oklch values. The preset supersedes it completely and covers more —
fonts and chart colours included — while staying generated rather than
maintained by hand. A hand-written theme item would only drift from it.

Consequences: the template ships the preset applied. A foreign project that
pulls a `@blueprint` component and has not applied the preset still works,
because the component references the standard shadcn variables every shadcn
project defines; it simply renders in that project's own colours. Making it
look like a blueprint project is one command, not a registry item.

**`registry:ui` — the components.** Seeded with the ones already customised
identically in more than one project: `button`, `dropdown-menu`, `dialog`, and
a `sonner` wrapper. **A component earns a place in the registry on its second
customisation, not its first.** Porting twenty upfront is speculative work.

**`registry:lib` — the capabilities.**

| Capability | Contents | Requires |
|---|---|---|
| `db` | Drizzle, `pg`, schema, migrations, `docker-compose.yml` (postgres:17) | — |
| `auth` | better-auth, route handler, sign-in/up | `db` |
| `ai` | AI SDK, streaming route, chat component | — |
| `tables` | TanStack Table, TanStack Query, data-table component | — |

One bundle: **`saas` = db + auth + tables**, which covers both SaaS and
internal dashboards — they are the same shape.

### Capabilities, not project types

An earlier draft modelled "project type" (landing / saas / dashboard / ai).
It was wrong. `preset-saas` and `preset-dashboard` both resolved to db + auth +
tables, so the categories were not distinguishable; and a day-one category
choice fights the actual pattern, which is a landing page accumulating
capabilities over months. Projects here do not have a type, they have a
trajectory.

### Registry is opt-in

Three independent levels, chosen per project:

| Level | What it gives |
|---|---|
| Template only | Next, Tailwind, Biome, Vitest, Sentry, CI, vanilla shadcn |
| \+ capabilities | The db/auth/ai/tables growth path |
| \+ registry namespace | The customised components |

Opting in is one command:

```bash
pnpm dlx shadcn@latest registry add @blueprint=<registry-url>/r/{name}.json
```

Capability items resolve `registryDependencies` to **absolute URLs**, not
namespaced names — interpolated per request, as below. `shadcn add <url>` then
works with nothing configured, so the growth path does not depend on the
optional component registry.

### The registry is served dynamically, so the hostname never gets written down

An earlier draft pre-built items to a committed `public/r/`, stamping the
hostname in at build time. That does not work: a committed artifact cannot hold
an environment-dependent value while CI also checks it for drift — the local
build writes `localhost`, the CI build writes the production URL, and the check
fails on every run.

Instead, shadcn supports serving a registry from a route handler via
`loadRegistry()` and `loadRegistryItem()`, with no pre-build step.
`src/app/r/[name]/route.ts` reads the item and interpolates
`new URL(request.url).origin` into `registryDependencies` as it responds.

**The registry learns its own hostname from the request.** Nothing is
configured, nothing is stamped, nothing is committed, and moving to a custom
domain requires no action at all — the next request answers from the new host.

This removes the sentinel, the stamping script, the committed build output and
the CI drift check. It is less machinery than the design it replaces.

Generated apps store their registry URL in a `blueprint.registry` field in
their own `package.json`, written once by `blueprint init`. An app that needs
to point elsewhere edits one field.

### The `blueprint` script

`scripts/blueprint.mjs`, exposed as `pnpm blueprint`. Zero dependencies —
`node:readline/promises`, `node:child_process`, `node:fs`. Roughly 100 lines.

```bash
pnpm blueprint init        # name, registry choice, optional bundle
pnpm blueprint add auth    # month 6
pnpm blueprint add ai      # month 9
```

`init` is `add` with a name prompt in front; there are no modes. Each `add`
resolves the capability URL, shells out to `shadcn add`, and merges the
capability's required `package.json` scripts.

**The script does not delete itself.** Adding a capability mid-project is the
common case, not the exception.

**It never passes `--overwrite`.** By month six `lib/auth/` will be customised;
shadcn prompts per file and those changes survive. Running `add auth` twice is
a no-op that can be walked away from.

Merging `package.json` scripts is the only capability the registry format
genuinely lacks, and is the script's actual justification. Steps 1–4 are
convenience.

#### Testing must be opt-out at setup

`blueprint init` offers a **"skip testing"** choice, and `--no-tests` skips the
prompt. Not every project earns a test harness — a throwaway landing page or a
weekend experiment should not carry Playwright browsers in CI.

This is a **strip**, not an add: the template ships tests by default, because a
default of "untested" is the wrong default, and because adding the harness back
later means recreating config rather than deleting it. Opting out removes:

- devDependencies `vitest`, `@vitest/browser-playwright`, `vite`,
  `@vitejs/plugin-react`, `playwright`, `@testing-library/react`
- `vitest.config.mts`
- `src/**/*.test.ts` and `src/**/*.test.tsx`
- the `test` script from `package.json`
- the `pnpm test` and `playwright install` steps from
  `.github/workflows/ci.yml`

The CI edit is the fiddly part and the reason this belongs in the script rather
than in the README as a manual instruction — leaving a `pnpm test` step in a
project with no test runner produces a red pipeline nobody asked for.

Re-adding later is `pnpm blueprint add tests`, which makes `tests` a capability
like any other. It is the one capability that is present by default and removed
on request, rather than absent by default and added.

## Testing and CI

**CI shipped in the template** (runs in each generated app): typecheck,
`biome check`, `vitest run`, `next build`. Vitest runs with
`passWithNoTests` — a fresh clone has three upstream components and no tests,
and CI failing on the first push would make the template feel broken.

**This repository's CI** runs two jobs:

1. Typecheck, lint, test and build the preview site, and assert every item in
   `registry.json` resolves — a request to `/r/{name}.json` returns valid JSON
   for each declared item.
2. **Build the template.** `template/` has its own `package.json` and is never
   installed here, so nothing otherwise verifies it compiles. This job copies
   it to a temp directory, installs, typechecks and builds. Without it, a
   broken template is discovered the next time a project starts, potentially
   months later.

This repository's CI is load-bearing in a way no existing project's is: every
downstream app pulls from it.

**`scripts/blueprint.test.mjs`** — one file, not a suite. Covers capability
resolution, `package.json` script merging against a fixture, and that a repeat
`add` does not clobber. Branching logic that silently produces a broken project
is worth exactly one test.

## Growth path

1. `npx degit <owner>/project-blueprint/template my-app` — landing page,
   deploys immediately, no database, no environment variables.
2. `pnpm blueprint init` — name, registry choice, optional bundle.
3. Month 3, needs data: `pnpm blueprint add db`.
4. Month 6, needs login: `pnpm blueprint add auth`.
5. Month 9, needs AI: `pnpm blueprint add ai`.

No step restructures what came before.

## Implementation phases

Three plans, not one. Each phase is independently useful and does not depend on
those after it.

**Phase 1 — template and CI.** Next, Tailwind, Biome, Vitest, Sentry, env
validation, the template-build CI job. Delivers most of what is missing from
the existing fifteen projects today, and can be used to start apps before
either later phase exists.

**Phase 2 — preview site, registry, theme.** The gallery, the dynamic route
handler, `registry.json`, and the `registry:theme` item. Components become
shareable. Seed `registry:ui` only with components already customised the same
way twice.

**Phase 3 — capabilities and the `blueprint` script.** `db`, `auth`, `ai`,
`tables`, the `saas` bundle, `blueprint.mjs` and its test. The growth path.

## Risks

**Owning the components means upstream shadcn fixes stop arriving.**
Accessibility corrections, Radix bumps and React adjustments land in upstream
`button`; `@blueprint/button` forked away months earlier and nobody sends
notice. This is the real price of a private registry and the reason most
people should not build one. It needs a quarterly diff against upstream as a
scheduled ritual, not good intentions. Mitigated partly by the
second-customisation rule, which keeps the owned surface small.

**Raw `main` has no version pinning.** Every app pulls whatever `main`
currently says. A broken `button` reaches the next `add` in any project. CI on
this repository is the only control.

**The registry is now a running service, not static files.** Serving items
from a route handler means the preview site being down takes the registry with
it. Acceptable — `shadcn add` is not in any hot path, and a failed add is
retried rather than silently wrong — but it is a live dependency where the
previous design had none.

**`cn` is days old and pre-1.0.** The template's class-name utility is
`cn@0.2.6`, published 2026-09-06. It is genuinely first-party — shadcn's own
repository, zero dependencies, 1.38M weekly downloads — and it is what the
current shadcn component style imports. But it sits in the dependency floor of
every future project at version 0.2.x. Watch for a 1.0; the fallback is the
previous `clsx` + `tailwind-merge` pair, which is a two-line change to
`src/lib/utils.ts`.

**Drizzle's stable line is stale.** `latest` has not moved since March 2026
while v1 sits in RC. If v1 ships with breaking changes, migration cost lands on
every project carrying the `db` capability.

**Next.js concentration risk.** Satisfaction fell 68% → 55%, a 2026 RCE
affected App Router apps using Server Actions, and the roadmap is
Vercel-centric. Mitigated by the portability rule below and the reversal
trigger above.

## Portability rule

No `@vercel/*` import outside a single `lib/platform.ts`. Telemetry over OTLP
rather than a proprietary exporter. Migrations run against any Postgres. This
costs nothing now and keeps the hosting decision — explicitly undecided between
Vercel and Cloudflare — cheap to reverse.

## Decisions needed before implementation

None blocking. Both items previously listed here — the registry hostname and
the repository name — turned out to be soft:

- **Hostname** is read from the incoming request (see "The registry is served
  dynamically"). Deploy first, pick a domain whenever, change it later.
- **Repository owner/name** appears only in the `degit` command in the README.
  It is not baked into any published artifact, so renaming the repository
  breaks nothing that already exists.

## Known cosmetic issues

**pnpm warns that `@sentry/cli`'s build script was ignored** on every install.
The binary is only needed to upload source maps, which requires a Sentry auth
token the template does not set, so nothing is broken. pnpm 10.0.0 and newer
pnpm releases disagree about where `onlyBuiltDependencies` belongs
(`package.json` vs `pnpm-workspace.yaml`), and neither `.npmrc` nor a bare
`pnpm-workspace.yaml` silenced it. Left alone deliberately rather than chased.

## Deferred

- Storybook. Justified eventually, but the preview site is the gallery for now.
- A published `create-blueprint` package.
- Multi-select capability prompts; one bundle plus a follow-up `add` covers it.
- TanStack Query in the template floor. It belongs to `tables` and to
  client-fetching screens, not to a landing page.
