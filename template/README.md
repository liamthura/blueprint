# New project

Built from [project-blueprint](https://github.com/anomalyco/project-blueprint).

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
