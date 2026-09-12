# project-blueprint

A template and component registry for new web apps.

## Starting a project

```bash
npx degit anomalyco/project-blueprint/template my-app
cd my-app && pnpm install && pnpm dev
```

That gives a landing page with Biome, Vitest, Sentry, typed environment variables and CI. No
database, no auth, no coupling to this repository.

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
