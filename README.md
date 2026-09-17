# blueprint

One stack for new web apps, so every project starts the same way and stays that
way.

**The problem it solves.** Fifteen projects, each scaffolded from scratch, each
drifting. Three of them carry their own `components.json` and have diverged. None
has error tracking, none validates environment variables, two have CI. Fixing the
button's focus ring in one project leaves the other fourteen wrong, and six months
later nobody remembers which version is correct.

**So there are two halves.** `template/` is what a new project is made of — Next,
Tailwind, Biome, Vitest, Sentry, env validation and CI, already wired together.
`site/` is the one place shared components live, so a fix made once reaches every
project instead of being copy-pasted into each.

A project starts as a landing page and grows a database, a login and AI features
over months, without being restructured for any of them.

## Start a project

```bash
npx github:liamthura/blueprint my-app
```

Three questions — name, what you're building, whether to keep the test harness
(a fourth asks for a Postgres URL if you chose something that needs one). Then it
copies the template, installs, adds the capabilities you chose, seeds `.env`, and
prints the next steps.

Non-interactive:

```bash
npx github:liamthura/blueprint my-app --capabilities saas --no-tests --yes
```

| Flag | |
|---|---|
| `--capabilities <list>` | `db`, `auth`, `ai`, `tables`, or the `saas` bundle |
| `--no-tests` | drop the Vitest harness |
| `--registry <url>` | pull capabilities from a deployed registry instead of the local checkout |
| `--database-url <url>` | Postgres URL to write into `.env`; defaults to the local Docker one |
| `--preset <code>` | a shadcn preset code from ui.shadcn.com/create; defaults to the house preset `b7lltUjfaE` |
| `--yes` (or `-y`) | skip every prompt |

### Design presets

The template already ships with preset **`b7lltUjfaE`** applied, so accepting the
default at setup changes nothing. Passing a different code re-themes the project:
`shadcn apply` handles the colours and components, and the CLI then repoints
`src/app/layout.tsx`'s fonts, swaps the icon dependency so the project never carries
two icon libraries, and reformats what shadcn rewrote.

A named style (`nova`, `vega`, `mira`, ...) works too, but only generated codes carry
font information — with a named style the fonts are left alone and the CLI says so.

Scaffolding a shadcn project *without* this CLI — no Sentry, env validation, Biome,
Vitest or CI — is:

```bash
pnpm dlx shadcn@latest init --preset b7lltUjfaE --base radix --template next
```

`--base radix` is not optional there: the preset encodes the style but not the
component library, and `init` otherwise defaults to Base UI.

## Docker

Every project ships a `Dockerfile`, a `.dockerignore` and a `compose.yaml`:

```bash
docker compose -f compose.yaml up --build              # app only
docker compose -f compose.yaml -f compose.db.yaml up --build   # app + Postgres
```

`compose.db.yaml` arrives with the `db` capability and is a layer rather than a
replacement, so adding a capability never has to rewrite YAML and either half runs
alone — `pnpm db:up` uses the db file on its own for local development.

The image is a three-stage build on `output: "standalone"`, so the runtime stage
carries the traced server bundle and no toolchain or source.

## Grow a project

```bash
pnpm blueprint add db      # month 3
pnpm blueprint add auth    # month 6
pnpm blueprint add ai      # month 9
```

Each one fetches the capability from the registry, merges the `package.json`
scripts it needs, and appends its variables to `.env.example`. Nothing is
restructured, and running it twice is a no-op.

## Keep a project current

```bash
pnpm blueprint update
```

Moves every dependency to its latest version within the same compatibility band,
then runs the project's own `lint`, `typecheck`, `test` and `build`. A failure
restores `package.json` and the lockfile and undoes the install, so the run either
leaves the project up to date and green or exactly as it was. Majors — and 0.x
minors, which break just as readily — wait for `--major`.

It reads nothing but the project it is run in, so the blueprint itself updates the
same way: run it in `template/`.

## The component registry

**What it is for:** so you only customise a component once.

Restyle the button here, and every project picks the change up with one command.
Without it you edit the button in whichever project you happen to be in, and the
others keep the old one until they have all quietly diverged.

**The trade.** A component you own stops receiving upstream shadcn's fixes —
accessibility corrections, Radix bumps, React adjustments. You have taken over
maintaining it, and nobody sends notice. So a component earns a place here only
after you have customised it the same way **twice**: evidence you want your own
version rather than a one-off tweak. Diff the owned ones against upstream
quarterly.

**Status: nothing in it is customised yet.** All four items are identical to what
plain `shadcn add` produces — the icon differences you will see are shadcn
rewriting imports to match `components.json`, not customisation. It starts being
useful the first time you genuinely change one.

Capabilities do **not** need this. They install from the checkout the setup CLI
already has, and `pnpm blueprint add` downloads the repository when you use it
later. Deploying is only about sharing components.

### Using it

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

## What is where

| Path | What it is |
|---|---|
| `template/` | What a new project is made of. The setup CLI copies this. |
| `site/registry/` | Capability source files — the db, auth, ai and tables features. |
| `site/registry.json` | The catalogue: every component and capability, and where its files land in a project. |
| `site/src/components/ui/` | The shared components. Customise them here, not in each project. |
| `site/src/app/page.tsx` | The gallery — a browsable list of the above. |
| `site/src/app/r/[name]/` | Serves an item as JSON so `shadcn add` can fetch it. |
| `bin/create.mjs` | The setup CLI, run by `npx github:`. |
| `template/scripts/blueprint.mjs` | Ships into every project as `pnpm blueprint`. |

`site/` and `template/` are siblings rather than nested: Biome 2.5 rejects a nested
root configuration, and every workaround was worse than the layout change. The only
cost is setting Vercel's root directory to `site/`.
