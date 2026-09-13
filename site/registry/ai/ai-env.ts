import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const aiEnv = createEnv({
  server: {
    // Optional on purpose. The CLI can prompt for a database URL and generate an
    // auth secret, but it cannot invent a third-party API key — and a required
    // value here would make `pnpm dev` and `pnpm build` fail on a fresh project
    // before you could so much as look at the landing page. The chat route checks
    // for it at request time instead, which is where its absence actually matters.
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  },
  runtimeEnv: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
