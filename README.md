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
| `--yes` (or `-y`) | skip every prompt |

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
