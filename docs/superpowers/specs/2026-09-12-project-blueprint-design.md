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

### Testing: Vitest browser mode via Playwright

One toolchain for unit and end-to-end, no jsdom. Vitest is the community
default for new projects; Playwright has overtaken Cypress.

### Settled house rules

Lucide over Phosphor (every shadcn snippet ships Lucide imports). `motion`, not
`framer-motion` (same library, post-rename). The unified `radix-ui` package,
not per-component `@radix-ui/react-*` — `project-twin` needed a five-package
`overrides` block to unstick the latter. pnpm, pinned via `packageManager`.

## Architecture

One repository, two products: a **template** cloned to start an app, and a
**registry** that apps pull from over time.

```
project-blueprint/
├── src/
│   ├── app/                    # preview site — the component gallery
│   ├── components/ui/          # the components
│   └── lib/, hooks/
├── registry/                   # capability items (db, auth, ai, tables)
├── registry.json               # root; composes the rest via `include`
├── public/r/                   # built output, committed
├── template/                   # degit target — becomes each new app
│   ├── scripts/blueprint.mjs   # ships into every app
│   └── scripts/blueprint.test.mjs
└── docs/
```

`scripts/blueprint.mjs` lives inside `template/`, so every generated app
carries its own copy. Its source of truth is this repository; apps receive it
at `degit` time and do not update it afterwards.

The repository deploys to Vercel. The deployment is simultaneously the
component gallery and the registry host — `blueprint.<domain>/r/{name}.json`.
No separate infrastructure.

### The template

Sized for a landing page and nothing more:

- Next.js 16, React 19, TypeScript, Tailwind v4
- shadcn `cn()` plus `button`, `input`, `card` — upstream, vanilla
- Biome, Vitest (browser mode), `env.ts` using `@t3-oss/env-nextjs`
- `.github/workflows/ci.yml` — typecheck, lint, test, build
- **Sentry**

Sentry is a deliberate exception to "a landing page needs nothing". It is two
files and one environment variable, and it is the single thing absent from all
fifteen existing projects. Made optional, it stays absent — "later" is why
there is no error tracking today.

The template ships **vanilla**: no `registries` key in `components.json`, no
coupling to this repository. An app built from it keeps working if this
repository is archived.

### The registry

Three kinds of item.

**`registry:theme`, built first.** CSS variables for light/dark, radius, fonts.
Customising twelve components before establishing tokens produces twelve
customisations and no system.

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
pnpm dlx shadcn@latest registry add @blueprint=https://blueprint.<domain>/r/{name}.json
```

Capability items use **absolute URLs in `registryDependencies`**, not
namespaced names. `shadcn add <url>` then resolves with nothing configured, so
the growth path does not depend on the optional component registry. Cost: the
registry hostname is baked into published JSON and must be chosen before first
publish; changing it later requires a rebuild, which CI performs on every push.

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

## Testing and CI

**Template CI:** typecheck, `biome check`, `vitest run`, `next build`.

**This repository's CI** additionally runs `shadcn build` and **fails if
`public/r/` has an uncommitted diff.** Every downstream project pulls from this
output; a forgotten rebuild would silently serve stale JSON to all of them.
This repository's CI is load-bearing in a way no existing project's is.

**`scripts/blueprint.test.mjs`** — one file, not a suite. Covers capability
resolution, `package.json` script merging against a fixture, and that a repeat
`add` does not clobber. Branching logic that silently produces a broken project
is worth exactly one test.

## Growth path

1. `npx degit khantthura/project-blueprint/template my-app` — landing page,
   deploys immediately, no database, no environment variables.
2. `pnpm blueprint init` — name, registry choice, optional bundle.
3. Month 3, needs data: `pnpm blueprint add db`.
4. Month 6, needs login: `pnpm blueprint add auth`.
5. Month 9, needs AI: `pnpm blueprint add ai`.

No step restructures what came before.

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

**Registry hostname.** `blueprint.<domain>` is a parameter throughout this
spec, and it must be resolved before the first `shadcn build` is published,
because capability items bake absolute URLs into `registryDependencies`.
Changing it later means rebuilding and republishing every item. Options: a
subdomain of a domain already owned, or the default `*.vercel.app` deployment
URL (which is free but awkward to move off later).

**GitHub repository owner/name** for the `degit` path, currently written as
`khantthura/project-blueprint`.

## Deferred

- Storybook. Justified eventually, but the preview site is the gallery for now.
- A published `create-blueprint` package.
- Multi-select capability prompts; one bundle plus a follow-up `add` covers it.
- TanStack Query in the template floor. It belongs to `tables` and to
  client-fetching screens, not to a landing page.
