import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="font-semibold text-4xl tracking-tight">New project</h1>
      <p className="text-muted-foreground">
        Built from blueprint. Add capabilities as you need them — nothing here assumes a database, a
        login, or an API.
      </p>
      <div>
        <Button>Get started</Button>
      </div>
    </main>
  );
}
