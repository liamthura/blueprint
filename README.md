# project-blueprint

A template and component registry for new web apps.

## Start a project

```bash
npx github:khantthura/project-blueprint my-app
```

Four questions — name, what you're building, whether to wire the component
registry, whether to keep the test harness — then it copies the template,
installs, pulls the capabilities you chose, and prints the next steps.

Non-interactive:

```bash
npx github:khantthura/project-blueprint my-app --capabilities saas --no-tests --yes
```

| Flag | |
|---|---|
| `--capabilities <list>` | `db`, `auth`, `ai`, `tables`, or the `saas` bundle |
| `--no-tests` | drop the Vitest harness |
| `--registry <url>` | point at a different deployment |
| `--with-registry` | wire the `@blueprint` namespace without prompting |
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

## Grow a project

```bash
pnpm blueprint add db      # month 3
pnpm blueprint add auth    # month 6
pnpm blueprint add ai      # month 9
```

Each one fetches the capability from the registry, merges the `package.json`
scripts it needs, and appends its variables to `.env.example`. Nothing is
restructured, and running it twice is a no-op.

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
| `template/` | The app copied by the setup CLI |
| `docs/superpowers/` | Specs and plans |
