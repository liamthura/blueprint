import { Button } from "@/components/ui/button";

/**
 * Marketing page for the tool itself.
 *
 * Deliberately built from `Button` and semantic tokens only: no Card, no Input,
 * no literal colours, no fixed radii. That is what lets the same file render under
 * any shadcn preset, which is the claim the Presets section makes. It also drops
 * into a generated project unchanged, since template/ and site/ expose the same
 * tokens.
 *
 * Every claim here is checkable: capability titles and scripts come from
 * CAPABILITIES in template/scripts/blueprint.mjs, the checks from UPDATE_CHECKS,
 * and the stack from template/package.json.
 */

const stack = [
  {
    title: "Next and React",
    body: "Next 16 with React 19, Tailwind 4, Biome for lint and format, and TypeScript on strict.",
  },
  {
    title: "Environment validation",
    body: "Zod parses your environment at module scope, so a capability's missing DATABASE_URL fails the build rather than the first request that needs it.",
  },
  {
    title: "Error tracking",
    body: "Sentry is wired for the server, the browser and router transitions. Leave SENTRY_DSN blank and it stays off.",
  },
  {
    title: "Tests",
    body: "Vitest with browser mode through Playwright for components, and a node:test suite for the CLI scripts.",
  },
  {
    title: "Docker",
    body: "A three stage build on Next's standalone output. The runtime image carries no toolchain and runs as a non-root user.",
  },
  {
    title: "CI",
    body: "A GitHub Actions workflow that typechecks, lints, tests and builds on every push to main and every pull request.",
  },
];

const capabilities = [
  {
    name: "db",
    title: "Postgres with Drizzle",
    body: "Drizzle ORM over node-postgres, a local database in Docker, and migrations.",
  },
  {
    name: "auth",
    title: "Email and password sign-in",
    body: "better-auth on the db capability's Drizzle instance, with sign-in and sign-up pages and a Playwright spec.",
  },
  {
    name: "ai",
    title: "Streaming chat",
    body: "A chat route and client component on the AI SDK, against any OpenAI-compatible endpoint.",
  },
  {
    name: "tables",
    title: "Sortable data tables",
    body: "TanStack Table with sorting, plus a TanStack Query provider for client-side fetching.",
  },
];

const presets = [
  {
    code: "b7lltUjfaE",
    title: "House default",
    body: "Mira, taupe and green, Geist over Instrument Sans.",
  },
  {
    code: "b4tVKL2ujw",
    title: "Editorial",
    body: "Sera, stone and amber, Lora over Playfair Display, large radius.",
  },
  {
    code: "b6W1Xwp2L3",
    title: "Terminal",
    body: "Lyra, zinc and violet, JetBrains Mono over Space Grotesk, no radius.",
  },
  {
    code: "b6qvaAlnCi",
    title: "Corporate",
    body: "Nova, gray and blue, IBM Plex Sans over Montserrat, medium radius.",
  },
];

function Command({ children }: { children: string }) {
  return (
    <code className="block overflow-x-auto rounded-md border bg-muted px-4 py-3 font-mono text-sm">
      {children}
    </code>
  );
}

export default function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto max-w-5xl px-6 pt-24 pb-16">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
          blueprint
        </p>
        <h1 className="mt-6 max-w-2xl font-heading font-semibold text-5xl tracking-tight">
          Every project starts the same way.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          One command gives you Next, Tailwind, Biome, Vitest, Sentry, environment validation,
          Docker and CI, already wired together. Add a database or a login months later.
        </p>
        <div className="mt-8 max-w-xl">
          <Command>npx github:liamthura/blueprint my-app</Command>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg">Start a project</Button>
          <Button size="lg" variant="outline">
            Read the README
          </Button>
        </div>
        <p className="mt-5 text-muted-foreground text-sm">
          Four questions: the name, what you are building, a design preset, and whether to keep the
          test harness. A fifth asks for a Postgres URL if you chose something that needs one.
        </p>
      </header>

      <section className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="font-heading font-medium text-2xl tracking-tight">
            What a new project has
          </h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            The parts every project needs and nobody wants to wire up again.
          </p>
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {stack.map((item) => (
              <div key={item.title}>
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-1.5 text-muted-foreground text-sm">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="font-heading font-medium text-2xl tracking-tight">Capabilities</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            A feature a project grows into months after it started, without being restructured for
            it. Each one brings its own files, dependencies, scripts and environment variables.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <div
                key={capability.name}
                className="rounded-lg border bg-card p-5 text-card-foreground"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-medium">{capability.title}</h3>
                  <code className="font-mono text-muted-foreground text-xs">{capability.name}</code>
                </div>
                <p className="mt-2 text-muted-foreground text-sm">{capability.body}</p>
                <code className="mt-4 block rounded-md bg-muted px-3 py-2 font-mono text-xs">
                  pnpm blueprint add {capability.name}
                </code>
              </div>
            ))}
          </div>
          <p className="mt-6 text-muted-foreground text-sm">
            The <code className="font-mono">saas</code> bundle installs db, auth and tables in one
            flag, in dependency order.
          </p>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="font-heading font-medium text-2xl tracking-tight">
                Updates that roll back
              </h2>
              <p className="mt-2 text-muted-foreground">
                Moving dependencies forward is one install. Knowing whether the bump broke anything
                is the part people skip.
              </p>
              <div className="mt-6">
                <Command>pnpm blueprint update</Command>
              </div>
              <p className="mt-4 text-muted-foreground text-sm">
                It runs lint, typecheck, tests and build, slowest last, skipping any script your
                project does not declare. If one fails it restores package.json and the lockfile and
                reinstalls, so a failed update leaves nothing behind.
              </p>
              <p className="mt-3 text-muted-foreground text-sm">
                Bumps that cross a compatibility band are held back until you ask for them with{" "}
                <code className="font-mono">--major</code>, because those are the ones that need
                release notes rather than a command.
              </p>
            </div>
            <div>
              <h2 className="font-heading font-medium text-2xl tracking-tight">
                One stack, any look
              </h2>
              <p className="mt-2 text-muted-foreground">
                Pass a preset code from ui.shadcn.com/create. shadcn handles the colours and the
                components, then the CLI repoints the fonts in layout.tsx and swaps the icon
                dependency so a project never carries two.
              </p>
              <div className="mt-6">
                <Command>npx github:liamthura/blueprint my-app --preset b4tVKL2ujw</Command>
              </div>
              <ul className="mt-6 space-y-3">
                {presets.map((preset) => (
                  <li key={preset.code} className="flex items-baseline gap-3">
                    <code className="font-mono text-xs">{preset.code}</code>
                    <span className="text-sm">
                      <span className="font-medium">{preset.title}.</span>{" "}
                      <span className="text-muted-foreground">{preset.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="max-w-lg font-heading font-semibold text-3xl tracking-tight">
            Start the next one on the same stack.
          </h2>
          <div className="mt-8 max-w-xl">
            <Command>npx github:liamthura/blueprint my-app</Command>
          </div>
          <div className="mt-6">
            <Button size="lg">Start a project</Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-muted-foreground text-sm">
          <p>MIT licensed.</p>
          <p className="font-mono text-xs">github.com/liamthura/blueprint</p>
        </div>
      </footer>
    </div>
  );
}
