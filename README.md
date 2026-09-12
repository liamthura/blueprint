# project-blueprint

A template and component registry for new web apps.

## Starting a project

```bash
npx degit anomalyco/project-blueprint/template my-app
cd my-app && pnpm install && pnpm dev
```

That gives a landing page with Biome, Vitest, Sentry, typed environment variables and CI. No
database, no auth, no coupling to this repository.

## What is here

| Path | What |
|---|---|
| `template/` | The app cloned by `degit` |
| `docs/superpowers/specs/` | Design decisions and their evidence |
| `docs/superpowers/plans/` | Implementation plans |

Phases 2 (registry and preview site) and 3 (capabilities and the `blueprint` script) are not
built yet — see the spec.
