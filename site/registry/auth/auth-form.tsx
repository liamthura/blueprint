"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { signIn, signUp } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    try {
      const result =
        mode === "sign-up"
          ? await signUp.email({ email, password, name: String(form.get("name")) })
          : await signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? "Something went wrong.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto mt-24 w-full max-w-sm p-6">
      <h1 className="font-heading font-semibold text-xl">
        {mode === "sign-up" ? "Create an account" : "Sign in"}
      </h1>
      <form className="mt-6 space-y-3" onSubmit={onSubmit}>
        {mode === "sign-up" ? <Input name="name" placeholder="Name" required /> : null}
        <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}
