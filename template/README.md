# New project

Built from [project-blueprint](https://github.com/khantthura/project-blueprint).

## Running it

```bash
pnpm install
pnpm dev
```

No environment variables are required. Copy `.env.example` to `.env` when you want error
tracking — the app runs without it.

## Scripts

| Script | Does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | Biome check |
| `pnpm format` | Biome check and write |
| `pnpm test` | Vitest, browser mode |

## Fonts

`src/app/layout.tsx` declares three font slots — `--font-app-sans`, `--font-app-mono`
and `--font-app-heading` — and `globals.css` maps Tailwind's `font-sans`, `font-mono`
and `font-heading` onto them. The variable names are deliberately font-neutral, so
changing a font means changing one `next/font/google` import and nothing else.

## Adding capabilities

```bash
pnpm blueprint add <db|auth|ai|tables|tests|saas>
```

`auth` pulls `db` with it. The script never passes `--overwrite`, so by the
time you have customised `src/lib/auth.ts`, shadcn prompts per file and your
edits survive.

The registry it pulls from is the `blueprint.registry` field in this
project's `package.json`. Change that one field to point somewhere else.

`tables` ships a `QueryProvider` but nothing mounts it for you — wrap your
tree with it in `src/app/layout.tsx` before any component calls `useQuery`.

## Adding components

Vanilla shadcn works out of the box:

```bash
pnpm dlx shadcn@latest add dialog
```

## Known deviations

- `shadcn init --base-color neutral` no longer exists in the v4 CLI (2026-09-12). The
  template is initialised with `--defaults` (which yields `baseColor: neutral`) plus
  `--base radix`, because the v4 default is Base UI components and the blueprint standardises
  on the unified `radix-ui` package.
- `cn()` is re-exported from the `cn` npm package (shadcn v4 convention) rather than defined
  over `clsx` + `tailwind-merge` in `src/lib/utils.ts`.
- `biome.json` enables the Tailwind CSS parser option (required for Tailwind v4 `@theme`) and
  disables `a11y/noSvgWithoutTitle` for scaffold SVGs under `public/`.
- `vitest.config.ts` uses workspace projects: `*.test.tsx` runs in Chromium (browser mode),
  `*.test.ts` runs in Node. Server-side modules such as `src/env.ts` cannot load in a real
  browser (`process` is undefined), so a single browser-only project cannot cover both.
