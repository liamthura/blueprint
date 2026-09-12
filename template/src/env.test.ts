import { describe, expect, it } from "vitest";

describe("env", () => {
  it("loads with no environment variables set", async () => {
    const { env } = await import("./env");
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });
});
