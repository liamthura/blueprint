import { headers } from "next/headers";
import { loadRegistry } from "shadcn/registry";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function Gallery() {
  const registry = await loadRegistry({ cwd: process.cwd() });
  const items = registry.items;

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading font-semibold text-3xl tracking-tight">blueprint</h1>
      <p className="mt-2 text-muted-foreground">
        {items.length} items. Add one to a project with the command beneath it.
      </p>

      <ul className="mt-10 space-y-4">
        {items.map((item) => (
          <li key={item.name} className="rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-medium">{item.title ?? item.name}</h2>
              <code className="text-muted-foreground text-xs">{item.name}</code>
            </div>
            {item.description ? (
              <p className="mt-1 text-muted-foreground text-sm">{item.description}</p>
            ) : null}
            <code className="mt-3 block overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
              pnpm dlx shadcn@latest add {origin}/r/{item.name}.json
            </code>
            <code className="mt-1 block overflow-x-auto rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              or, with @blueprint registered: pnpm dlx shadcn@latest add @blueprint/{item.name}
            </code>
          </li>
        ))}
      </ul>

      <section className="mt-16 border-t pt-8">
        <h2 className="font-heading font-medium text-xl">Button</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>
    </main>
  );
}
